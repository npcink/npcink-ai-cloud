"""add provider account spend budget claims"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260923_0084"
down_revision = "20260912_0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "provider_budget_counters",
        sa.Column("scope_key", sa.String(length=255), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("account_class", sa.String(length=32), nullable=False),
        sa.Column("period_kind", sa.String(length=16), nullable=False),
        sa.Column("period_start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("limit_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("reserved_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("warning_emitted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("scope_key"),
    )
    op.create_index("ix_provider_budget_counters_provider_id", "provider_budget_counters", ["provider_id"])
    op.create_index("ix_provider_budget_counters_account_class", "provider_budget_counters", ["account_class"])
    op.create_index("ix_provider_budget_counters_period_kind", "provider_budget_counters", ["period_kind"])
    op.create_index("ix_provider_budget_counters_period_start_at", "provider_budget_counters", ["period_start_at"])
    op.create_index("ix_provider_budget_counters_period_end_at", "provider_budget_counters", ["period_end_at"])

    op.create_table(
        "provider_budget_claims",
        sa.Column("claim_id", sa.String(length=191), nullable=False),
        sa.Column("dispatch_key", sa.String(length=255), nullable=False),
        sa.Column("scope_key", sa.String(length=255), nullable=False),
        sa.Column("run_id", sa.String(length=191), nullable=False),
        sa.Column("account_id", sa.String(length=191), nullable=True),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("account_class", sa.String(length=32), nullable=False),
        sa.Column("period_kind", sa.String(length=16), nullable=False),
        sa.Column("reserved_cost_usd", sa.Float(), nullable=False),
        sa.Column("actual_cost_usd", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="claimed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("claim_id"),
        sa.UniqueConstraint("dispatch_key", name="uq_provider_budget_claims_dispatch"),
    )
    op.create_index("ix_provider_budget_claims_dispatch_key", "provider_budget_claims", ["dispatch_key"])
    op.create_index("ix_provider_budget_claims_scope_key", "provider_budget_claims", ["scope_key"])
    op.create_index("ix_provider_budget_claims_run_id", "provider_budget_claims", ["run_id"])
    op.create_index("ix_provider_budget_claims_account_id", "provider_budget_claims", ["account_id"])
    op.create_index("ix_provider_budget_claims_provider_id", "provider_budget_claims", ["provider_id"])
    op.create_index("ix_provider_budget_claims_account_class", "provider_budget_claims", ["account_class"])
    op.create_index("ix_provider_budget_claims_period_kind", "provider_budget_claims", ["period_kind"])
    op.create_index("ix_provider_budget_claims_status", "provider_budget_claims", ["status"])
    op.create_index("ix_provider_budget_claims_created_at", "provider_budget_claims", ["created_at"])
    op.create_index("ix_provider_budget_claims_reconciled_at", "provider_budget_claims", ["reconciled_at"])


def downgrade() -> None:
    op.drop_index("ix_provider_budget_claims_reconciled_at", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_created_at", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_status", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_period_kind", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_account_class", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_provider_id", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_account_id", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_run_id", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_scope_key", table_name="provider_budget_claims")
    op.drop_index("ix_provider_budget_claims_dispatch_key", table_name="provider_budget_claims")
    op.drop_table("provider_budget_claims")
    op.drop_index("ix_provider_budget_counters_period_end_at", table_name="provider_budget_counters")
    op.drop_index("ix_provider_budget_counters_period_start_at", table_name="provider_budget_counters")
    op.drop_index("ix_provider_budget_counters_period_kind", table_name="provider_budget_counters")
    op.drop_index("ix_provider_budget_counters_account_class", table_name="provider_budget_counters")
    op.drop_index("ix_provider_budget_counters_provider_id", table_name="provider_budget_counters")
    op.drop_table("provider_budget_counters")
