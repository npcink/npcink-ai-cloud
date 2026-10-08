"""Index each authorized Portal activity subject before merging recent rows."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261008_0087"
down_revision = "20261008_0086"
branch_labels = None
depends_on = None


def _create(*, concurrently: bool) -> None:
    op.create_index(
        "ix_service_audit_events_site_recent", "service_audit_events",
        ["site_id", "created_at", "id"], postgresql_concurrently=concurrently,
    )
    op.create_index(
        "ix_service_audit_events_account_recent", "service_audit_events",
        ["account_id", "created_at", "id"], postgresql_concurrently=concurrently,
        postgresql_where=sa.text("site_id IS NULL"), sqlite_where=sa.text("site_id IS NULL"),
    )


def _drop(*, concurrently: bool) -> None:
    for name in ("ix_service_audit_events_account_recent", "ix_service_audit_events_site_recent"):
        op.drop_index(name, table_name="service_audit_events", postgresql_concurrently=concurrently)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            _create(concurrently=True)
    else:
        _create(concurrently=False)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            _drop(concurrently=True)
    else:
        _drop(concurrently=False)
