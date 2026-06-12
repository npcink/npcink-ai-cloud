"""add payment order and refund ledger"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260612_0042"
down_revision = "20260612_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_orders",
        sa.Column("order_id", sa.String(length=191), nullable=False),
        sa.Column("account_id", sa.String(length=191), nullable=False),
        sa.Column("site_id", sa.String(length=191), nullable=True),
        sa.Column("subscription_id", sa.String(length=191), nullable=True),
        sa.Column("plan_id", sa.String(length=191), nullable=False),
        sa.Column("plan_version_id", sa.String(length=191), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("external_order_no", sa.String(length=191), nullable=False),
        sa.Column("provider_trade_no", sa.String(length=191), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=191), nullable=False),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("refund_window_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=191), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.account_id"]),
        sa.PrimaryKeyConstraint("order_id"),
        sa.UniqueConstraint("provider", "external_order_no", name="uq_payment_orders_provider_ext"),
        sa.UniqueConstraint("idempotency_key", name="uq_payment_orders_idempotency"),
    )
    op.create_index("ix_payment_orders_account_id", "payment_orders", ["account_id"])
    op.create_index("ix_payment_orders_site_id", "payment_orders", ["site_id"])
    op.create_index("ix_payment_orders_subscription_id", "payment_orders", ["subscription_id"])
    op.create_index("ix_payment_orders_plan_id", "payment_orders", ["plan_id"])
    op.create_index("ix_payment_orders_plan_version_id", "payment_orders", ["plan_version_id"])
    op.create_index("ix_payment_orders_provider", "payment_orders", ["provider"])
    op.create_index("ix_payment_orders_external_order_no", "payment_orders", ["external_order_no"])
    op.create_index("ix_payment_orders_provider_trade_no", "payment_orders", ["provider_trade_no"])
    op.create_index("ix_payment_orders_status", "payment_orders", ["status"])
    op.create_index(
        "ix_payment_orders_refund_window_end_at",
        "payment_orders",
        ["refund_window_end_at"],
    )
    op.create_index("ix_payment_orders_paid_at", "payment_orders", ["paid_at"])
    op.create_index("ix_payment_orders_canceled_at", "payment_orders", ["canceled_at"])
    op.create_index("ix_payment_orders_refunded_at", "payment_orders", ["refunded_at"])
    op.create_index("ix_payment_orders_idempotency_key", "payment_orders", ["idempotency_key"])

    op.create_table(
        "payment_refunds",
        sa.Column("refund_id", sa.String(length=191), nullable=False),
        sa.Column("order_id", sa.String(length=191), nullable=False),
        sa.Column("account_id", sa.String(length=191), nullable=False),
        sa.Column("subscription_id", sa.String(length=191), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("external_refund_no", sa.String(length=191), nullable=False),
        sa.Column("provider_refund_no", sa.String(length=191), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("succeeded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=191), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["payment_orders.order_id"]),
        sa.PrimaryKeyConstraint("refund_id"),
        sa.UniqueConstraint(
            "provider",
            "external_refund_no",
            name="uq_payment_refunds_provider_ext",
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_payment_refunds_idempotency"),
    )
    op.create_index("ix_payment_refunds_order_id", "payment_refunds", ["order_id"])
    op.create_index("ix_payment_refunds_account_id", "payment_refunds", ["account_id"])
    op.create_index("ix_payment_refunds_subscription_id", "payment_refunds", ["subscription_id"])
    op.create_index("ix_payment_refunds_provider", "payment_refunds", ["provider"])
    op.create_index(
        "ix_payment_refunds_external_refund_no",
        "payment_refunds",
        ["external_refund_no"],
    )
    op.create_index(
        "ix_payment_refunds_provider_refund_no",
        "payment_refunds",
        ["provider_refund_no"],
    )
    op.create_index("ix_payment_refunds_status", "payment_refunds", ["status"])
    op.create_index("ix_payment_refunds_requested_at", "payment_refunds", ["requested_at"])
    op.create_index("ix_payment_refunds_succeeded_at", "payment_refunds", ["succeeded_at"])
    op.create_index("ix_payment_refunds_failed_at", "payment_refunds", ["failed_at"])
    op.create_index("ix_payment_refunds_idempotency_key", "payment_refunds", ["idempotency_key"])

    op.create_table(
        "payment_events",
        sa.Column("event_id", sa.String(length=191), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_kind", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("order_id", sa.String(length=191), nullable=True),
        sa.Column("refund_id", sa.String(length=191), nullable=True),
        sa.Column("provider_event_id", sa.String(length=191), nullable=True),
        sa.Column("idempotency_key", sa.String(length=191), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id"),
        sa.UniqueConstraint(
            "provider",
            "provider_event_id",
            name="uq_payment_events_provider_event",
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_payment_events_idempotency"),
    )
    op.create_index("ix_payment_events_provider", "payment_events", ["provider"])
    op.create_index("ix_payment_events_event_kind", "payment_events", ["event_kind"])
    op.create_index("ix_payment_events_status", "payment_events", ["status"])
    op.create_index("ix_payment_events_order_id", "payment_events", ["order_id"])
    op.create_index("ix_payment_events_refund_id", "payment_events", ["refund_id"])
    op.create_index("ix_payment_events_provider_event_id", "payment_events", ["provider_event_id"])
    op.create_index("ix_payment_events_idempotency_key", "payment_events", ["idempotency_key"])
    op.create_index("ix_payment_events_processed_at", "payment_events", ["processed_at"])
    op.create_index("ix_payment_events_created_at", "payment_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_payment_events_created_at", table_name="payment_events")
    op.drop_index("ix_payment_events_processed_at", table_name="payment_events")
    op.drop_index("ix_payment_events_idempotency_key", table_name="payment_events")
    op.drop_index("ix_payment_events_provider_event_id", table_name="payment_events")
    op.drop_index("ix_payment_events_refund_id", table_name="payment_events")
    op.drop_index("ix_payment_events_order_id", table_name="payment_events")
    op.drop_index("ix_payment_events_status", table_name="payment_events")
    op.drop_index("ix_payment_events_event_kind", table_name="payment_events")
    op.drop_index("ix_payment_events_provider", table_name="payment_events")
    op.drop_table("payment_events")

    op.drop_index("ix_payment_refunds_idempotency_key", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_failed_at", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_succeeded_at", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_requested_at", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_status", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_provider_refund_no", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_external_refund_no", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_provider", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_subscription_id", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_account_id", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_order_id", table_name="payment_refunds")
    op.drop_table("payment_refunds")

    op.drop_index("ix_payment_orders_idempotency_key", table_name="payment_orders")
    op.drop_index("ix_payment_orders_refunded_at", table_name="payment_orders")
    op.drop_index("ix_payment_orders_canceled_at", table_name="payment_orders")
    op.drop_index("ix_payment_orders_paid_at", table_name="payment_orders")
    op.drop_index("ix_payment_orders_refund_window_end_at", table_name="payment_orders")
    op.drop_index("ix_payment_orders_status", table_name="payment_orders")
    op.drop_index("ix_payment_orders_provider_trade_no", table_name="payment_orders")
    op.drop_index("ix_payment_orders_external_order_no", table_name="payment_orders")
    op.drop_index("ix_payment_orders_provider", table_name="payment_orders")
    op.drop_index("ix_payment_orders_plan_version_id", table_name="payment_orders")
    op.drop_index("ix_payment_orders_plan_id", table_name="payment_orders")
    op.drop_index("ix_payment_orders_subscription_id", table_name="payment_orders")
    op.drop_index("ix_payment_orders_site_id", table_name="payment_orders")
    op.drop_index("ix_payment_orders_account_id", table_name="payment_orders")
    op.drop_table("payment_orders")
