"""Index bounded Portal activity in chronological order without sorting history."""

from __future__ import annotations

from alembic import op

revision = "20261008_0085"
down_revision = "20260923_0084"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_service_audit_events_recent"


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # Large runtime audit tables must remain writable during index creation.
        with op.get_context().autocommit_block():
            op.create_index(
                INDEX_NAME, "service_audit_events", ["created_at", "id"],
                postgresql_concurrently=True,
            )
    else:
        op.create_index(INDEX_NAME, "service_audit_events", ["created_at", "id"])


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.drop_index(
                INDEX_NAME, table_name="service_audit_events", postgresql_concurrently=True
            )
    else:
        op.drop_index(INDEX_NAME, table_name="service_audit_events")
