"""Bounded manual customer service notification dispatches.

Revision ID: 20261103_0092
Revises: 20261024_0091
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261103_0092"
down_revision = "20261024_0091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_notification_dispatches",
        sa.Column("dispatch_id", sa.String(64), primary_key=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_href", sa.String(1024), nullable=False),
        sa.Column("audience", sa.String(32), nullable=False),
        sa.Column("actor_kind", sa.String(32), nullable=False),
        sa.Column("actor_ref", sa.String(191), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("recipients_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('preview', 'sent')", name="ck_notification_dispatch_status"),
    )
    op.create_index(
        "ix_notification_dispatch_created",
        "customer_notification_dispatches",
        ["created_at", "dispatch_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_dispatch_created", table_name="customer_notification_dispatches")
    op.drop_table("customer_notification_dispatches")
