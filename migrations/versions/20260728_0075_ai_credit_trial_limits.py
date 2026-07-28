"""align trial credit-limit fields with the canonical AI credit meter

Revision ID: 20260728_0075
Revises: 20260728_0074
Create Date: 2026-07-28 02:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260728_0075"
down_revision = "20260728_0074"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _rename_integer_column(table_name: str, old_name: str, new_name: str) -> None:
    columns = _column_names(table_name)
    if new_name in columns:
        return
    if old_name not in columns:
        raise RuntimeError(
            f"{table_name}.{old_name} is required for AI credit migration"
        )
    op.alter_column(
        table_name,
        old_name,
        new_column_name=new_name,
        existing_type=sa.Integer(),
        existing_nullable=False,
    )


def upgrade() -> None:
    _rename_integer_column("plan_offers", "trial_credit_limit", "trial_ai_credit_limit")
    _rename_integer_column("trial_claims", "credit_limit", "ai_credit_limit")


def downgrade() -> None:
    _rename_integer_column("trial_claims", "ai_credit_limit", "credit_limit")
    _rename_integer_column("plan_offers", "trial_ai_credit_limit", "trial_credit_limit")
