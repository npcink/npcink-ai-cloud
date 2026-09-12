"""add composite indexes for bounded statistics windows

Revision ID: 20260912_0083
Revises: 20260828_0082
Create Date: 2026-09-12 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "20260912_0083"
down_revision = "20260828_0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_run_records_site_started_at",
        "run_records",
        ["site_id", "started_at"],
    )
    op.create_index(
        "ix_provider_call_records_created_at_run_id",
        "provider_call_records",
        ["created_at", "run_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_provider_call_records_created_at_run_id", table_name="provider_call_records")
    op.drop_index("ix_run_records_site_started_at", table_name="run_records")
