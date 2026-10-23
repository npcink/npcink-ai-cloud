"""portal_notifications 站内收件箱

Revision ID: 20261023_0089
Revises: 20261017_0088
Create Date: 2026-10-23 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261023_0089"
down_revision = "20261017_0088"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if _has_table("portal_notifications"):
        return
    op.create_table(
        "portal_notifications",
        sa.Column("notification_id", sa.String(length=191), nullable=False),
        sa.Column("account_id", sa.String(length=191), nullable=False),
        sa.Column("principal_id", sa.String(length=191), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link_href", sa.String(length=1024), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_portal_notifications_account",
        ),
        sa.ForeignKeyConstraint(
            ["principal_id"],
            ["principals.principal_id"],
            name="fk_portal_notifications_principal",
        ),
        sa.PrimaryKeyConstraint("notification_id"),
    )
    op.create_index(
        "ix_portal_notifications_account_created",
        "portal_notifications",
        ["account_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_portal_notifications_account_unread",
        "portal_notifications",
        ["account_id", "is_read", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    if not _has_table("portal_notifications"):
        return
    op.drop_index(
        "ix_portal_notifications_account_unread",
        table_name="portal_notifications",
    )
    op.drop_index(
        "ix_portal_notifications_account_created",
        table_name="portal_notifications",
    )
    op.drop_table("portal_notifications")
