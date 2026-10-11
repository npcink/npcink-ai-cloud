"""Index each authorized Portal activity subject before merging recent rows."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261008_0087"
down_revision = "20261008_0086"
branch_labels = None
depends_on = None


def _reuse_valid_index(name: str, columns: list[str], *, account_only: bool = False) -> bool:
    bind = op.get_bind()
    existing = next(
        (index for index in sa.inspect(bind).get_indexes("service_audit_events")
         if index["name"] == name),
        None,
    )
    if existing is None:
        return False
    valid = bind.scalar(
        sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
        {"name": name},
    )
    options = existing.get("dialect_options", {})
    predicate = str(options.get("postgresql_where") or "").strip("() ")
    expected_predicate = "site_id IS NULL" if account_only else ""
    if (not valid or existing["column_names"] != columns or existing["unique"]
            or predicate != expected_predicate
            or options.get("postgresql_using", "btree") != "btree"):
        raise RuntimeError(
            f"{name} is invalid or has an unexpected definition; inspect and repair "
            "this exact index before retrying the uncompleted migration"
        )
    return True


def _create(*, concurrently: bool) -> None:
    site_name = "ix_service_audit_events_site_recent"
    site_columns = ["site_id", "created_at", "id"]
    if not concurrently or not _reuse_valid_index(site_name, site_columns):
        op.create_index(
            site_name, "service_audit_events", site_columns,
            postgresql_concurrently=concurrently,
        )
    account_name = "ix_service_audit_events_account_recent"
    account_columns = ["account_id", "created_at", "id"]
    if not concurrently or not _reuse_valid_index(
        account_name, account_columns, account_only=True,
    ):
        op.create_index(
            account_name, "service_audit_events", account_columns,
            postgresql_concurrently=concurrently,
            postgresql_where=sa.text("site_id IS NULL"),
            sqlite_where=sa.text("site_id IS NULL"),
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
