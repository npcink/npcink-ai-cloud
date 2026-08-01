"""add support request waiting-state projection

Revision ID: 20260801_0078
Revises: 20260731_0077
Create Date: 2026-08-01 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260801_0078"
down_revision = "20260731_0077"
branch_labels = None
depends_on = None

_TABLE = "support_requests"
_CONSTRAINT = "ck_support_requests_waiting_on"
_DATETIME_COLUMNS = (
    "first_operator_response_at",
    "last_customer_activity_at",
    "last_operator_public_activity_at",
    "waiting_since",
)


def _create_waiting_on_constraint() -> None:
    expression = "waiting_on IN ('operator', 'customer', 'none')"
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(_TABLE, recreate="always") as batch:
            batch.create_check_constraint(_CONSTRAINT, expression)
        return
    op.create_check_constraint(_CONSTRAINT, _TABLE, expression)


def _drop_waiting_on_constraint() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(_TABLE, recreate="always") as batch:
            batch.drop_constraint(_CONSTRAINT, type_="check")
        return
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")


def upgrade() -> None:
    for column_name in _DATETIME_COLUMNS:
        op.add_column(
            _TABLE,
            sa.Column(column_name, sa.DateTime(timezone=True), nullable=True),
        )
    op.add_column(
        _TABLE,
        sa.Column(
            "waiting_on",
            sa.String(length=32),
            nullable=False,
            server_default="operator",
        ),
    )

    op.execute(
        sa.text(
            "UPDATE support_requests SET "
            "first_operator_response_at = ("
            "SELECT MIN(activity_at) FROM ("
            "SELECT created_at AS activity_at FROM support_request_messages "
            "WHERE support_request_messages.request_id = support_requests.request_id "
            "AND author_kind = 'operator' AND visibility = 'public' "
            "UNION ALL "
            "SELECT created_at AS activity_at FROM support_request_attachments "
            "WHERE support_request_attachments.request_id = support_requests.request_id "
            "AND uploader_kind = 'operator' AND visibility = 'public'"
            ") AS operator_activity"
            "), "
            "last_customer_activity_at = COALESCE(("
            "SELECT MAX(activity_at) FROM ("
            "SELECT created_at AS activity_at FROM support_request_messages "
            "WHERE support_request_messages.request_id = support_requests.request_id "
            "AND author_kind = 'customer' AND visibility = 'public' "
            "UNION ALL "
            "SELECT created_at AS activity_at FROM support_request_attachments "
            "WHERE support_request_attachments.request_id = support_requests.request_id "
            "AND uploader_kind = 'customer' AND visibility = 'public'"
            ") AS customer_activity"
            "), created_at), "
            "last_operator_public_activity_at = ("
            "SELECT MAX(activity_at) FROM ("
            "SELECT created_at AS activity_at FROM support_request_messages "
            "WHERE support_request_messages.request_id = support_requests.request_id "
            "AND author_kind = 'operator' AND visibility = 'public' "
            "UNION ALL "
            "SELECT created_at AS activity_at FROM support_request_attachments "
            "WHERE support_request_attachments.request_id = support_requests.request_id "
            "AND uploader_kind = 'operator' AND visibility = 'public'"
            ") AS operator_activity"
            ")"
        )
    )
    op.execute(
        sa.text(
            "UPDATE support_requests SET "
            "waiting_on = CASE "
            "WHEN status IN ('resolved', 'closed') THEN 'none' "
            "WHEN last_operator_public_activity_at IS NOT NULL "
            "AND last_operator_public_activity_at > last_customer_activity_at "
            "THEN 'customer' ELSE 'operator' END, "
            "waiting_since = CASE "
            "WHEN status IN ('resolved', 'closed') THEN NULL "
            "WHEN last_operator_public_activity_at IS NOT NULL "
            "AND last_operator_public_activity_at > last_customer_activity_at "
            "THEN last_operator_public_activity_at "
            "ELSE COALESCE(last_customer_activity_at, created_at) END"
        )
    )

    _create_waiting_on_constraint()
    for column_name in (*_DATETIME_COLUMNS, "waiting_on"):
        op.create_index(f"ix_support_requests_{column_name}", _TABLE, [column_name])


def downgrade() -> None:
    for column_name in reversed((*_DATETIME_COLUMNS, "waiting_on")):
        op.drop_index(f"ix_support_requests_{column_name}", table_name=_TABLE)
    _drop_waiting_on_constraint()
    op.drop_column(_TABLE, "waiting_on")
    for column_name in reversed(_DATETIME_COLUMNS):
        op.drop_column(_TABLE, column_name)
