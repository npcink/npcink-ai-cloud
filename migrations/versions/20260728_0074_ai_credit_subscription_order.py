"""align subscription-order credit amount with the canonical AI credit meter

Revision ID: 20260728_0074
Revises: 20260728_0073
Create Date: 2026-07-28 02:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260728_0074"
down_revision = "20260728_0073"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _rename_subscription_order_credit_amount(old_name: str, new_name: str) -> None:
    columns = _column_names("subscription_orders")
    if new_name in columns:
        return
    if old_name not in columns:
        raise RuntimeError(
            f"subscription_orders.{old_name} is required for AI credit migration"
        )
    op.alter_column(
        "subscription_orders",
        old_name,
        new_column_name=new_name,
        existing_type=sa.Numeric(precision=12, scale=2),
        existing_nullable=False,
    )


def upgrade() -> None:
    _rename_subscription_order_credit_amount("credit_amount", "ai_credit_amount")


def downgrade() -> None:
    _rename_subscription_order_credit_amount("ai_credit_amount", "credit_amount")
