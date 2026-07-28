"""make AI credits the canonical commercial meter field

Revision ID: 20260728_0073
Revises: 20260727_0072
Create Date: 2026-07-28 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260728_0073"
down_revision = "20260727_0072"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _rename_float_column(table_name: str, old_name: str, new_name: str) -> None:
    columns = _column_names(table_name)
    if new_name in columns:
        return
    if old_name not in columns:
        raise RuntimeError(f"{table_name}.{old_name} is required for AI credit migration")
    op.alter_column(
        table_name,
        old_name,
        new_column_name=new_name,
        existing_type=sa.Float(),
        existing_nullable=False,
    )


def _set_ledger_unit_default(*, existing_default: str, new_default: str) -> None:
    alter_kwargs = {
        "existing_type": sa.String(length=32),
        "existing_nullable": False,
        "existing_server_default": existing_default,
        "server_default": new_default,
    }
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("credit_ledger_entries", recreate="always") as batch_op:
            batch_op.alter_column("unit", **alter_kwargs)
        return
    op.alter_column("credit_ledger_entries", "unit", **alter_kwargs)


def upgrade() -> None:
    _rename_float_column("credit_ledger_entries", "credit_delta", "ai_credit_delta")
    _rename_float_column("paid_credit_grants", "original_credits", "original_ai_credits")
    _rename_float_column("paid_credit_grants", "remaining_credits", "remaining_ai_credits")
    _rename_float_column("paid_credit_grants", "refunded_credits", "refunded_ai_credits")
    op.execute(
        "UPDATE credit_ledger_entries SET unit = 'ai_credits' WHERE unit = 'credit'"
    )
    _set_ledger_unit_default(existing_default="credit", new_default="ai_credits")


def downgrade() -> None:
    op.execute(
        "UPDATE credit_ledger_entries SET unit = 'credit' WHERE unit = 'ai_credits'"
    )
    _set_ledger_unit_default(existing_default="ai_credits", new_default="credit")
    _rename_float_column("paid_credit_grants", "refunded_ai_credits", "refunded_credits")
    _rename_float_column("paid_credit_grants", "remaining_ai_credits", "remaining_credits")
    _rename_float_column("paid_credit_grants", "original_ai_credits", "original_credits")
    _rename_float_column("credit_ledger_entries", "ai_credit_delta", "credit_delta")
