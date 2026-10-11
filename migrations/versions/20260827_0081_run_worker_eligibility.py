"""add durable worker eligibility time

Revision ID: 20260827_0081
Revises: 20260826_0080
Create Date: 2026-08-27 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260827_0081"
down_revision = "20260826_0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "run_records",
        sa.Column("worker_eligible_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_run_records_worker_eligible_at",
        "run_records",
        ["worker_eligible_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_run_records_worker_eligible_at", table_name="run_records")
    op.drop_column("run_records", "worker_eligible_at")
