"""add per-route model capability evidence

Revision ID: 20260826_0080
Revises: 20260817_0079
Create Date: 2026-08-26 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260826_0080"
down_revision = "20260817_0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_capability_evidence",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("instance_id", sa.String(length=191), nullable=False),
        sa.Column("capability", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("route_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=191), nullable=False),
        sa.Column("revision", sa.String(length=191), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=96), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["instance_id"], ["catalog_instances.instance_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "instance_id",
            "capability",
            "route_fingerprint",
            name="uq_catalog_capability_evidence_route",
        ),
    )
    for name, column in (
        ("ix_catalog_capability_evidence_instance_id", "instance_id"),
        ("ix_catalog_capability_evidence_capability", "capability"),
        ("ix_catalog_capability_evidence_state", "state"),
    ):
        op.create_index(name, "catalog_capability_evidence", [column])


def downgrade() -> None:
    op.drop_table("catalog_capability_evidence")
