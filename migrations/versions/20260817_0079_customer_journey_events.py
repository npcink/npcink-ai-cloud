"""add metadata-only customer journey events

Revision ID: 20260817_0079
Revises: 20260801_0078
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260817_0079"
down_revision = "20260801_0078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_journey_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dedupe_key", sa.String(length=64), nullable=False),
        sa.Column("site_id", sa.String(length=191), nullable=False),
        sa.Column("key_id", sa.String(length=191), nullable=True),
        sa.Column("event_id", sa.String(length=96), nullable=False),
        sa.Column("cohort_id", sa.String(length=64), nullable=True),
        sa.Column("session_hash", sa.String(length=64), nullable=False),
        sa.Column("surface", sa.String(length=32), nullable=False),
        sa.Column("journey", sa.String(length=64), nullable=False),
        sa.Column("step", sa.String(length=32), nullable=False),
        sa.Column("error_category", sa.String(length=32), nullable=True),
        sa.Column("error_code", sa.String(length=96), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("run_id", sa.String(length=191), nullable=True),
        sa.Column("browser_family", sa.String(length=32), nullable=True),
        sa.Column("viewport_class", sa.String(length=16), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.site_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_customer_journey_events_dedupe"),
    )
    for index_name, columns in (
        ("ix_customer_journey_events_site_id", ["site_id"]),
        ("ix_customer_journey_events_key_id", ["key_id"]),
        ("ix_customer_journey_events_event_id", ["event_id"]),
        ("ix_customer_journey_events_cohort_id", ["cohort_id"]),
        ("ix_customer_journey_events_session_hash", ["session_hash"]),
        ("ix_customer_journey_events_surface", ["surface"]),
        ("ix_customer_journey_events_journey", ["journey"]),
        ("ix_customer_journey_events_step", ["step"]),
        ("ix_customer_journey_events_error_category", ["error_category"]),
        ("ix_customer_journey_events_error_code", ["error_code"]),
        ("ix_customer_journey_events_run_id", ["run_id"]),
        ("ix_customer_journey_events_browser_family", ["browser_family"]),
        ("ix_customer_journey_events_viewport_class", ["viewport_class"]),
        ("ix_customer_journey_events_occurred_at", ["occurred_at"]),
        ("ix_customer_journey_events_received_at", ["received_at"]),
    ):
        op.create_index(index_name, "customer_journey_events", columns)


def downgrade() -> None:
    op.drop_table("customer_journey_events")
