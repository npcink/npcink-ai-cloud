"""Index scoped latest-health reads without blocking PostgreSQL writes."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261017_0088"
down_revision = "20261008_0087"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_health_snapshots_instance_measured_id"
COLUMNS = ["instance_id", "measured_at", "id"]


def _reuse_valid_index() -> bool:
    bind = op.get_bind()
    existing = next(
        (
            item
            for item in sa.inspect(bind).get_indexes("health_snapshots")
            if item["name"] == INDEX_NAME
        ),
        None,
    )
    if existing is None:
        return False
    state = bind.execute(
        sa.text(
            "SELECT indisvalid, indisready FROM pg_index WHERE indexrelid = to_regclass(:name)"
        ),
        {"name": INDEX_NAME},
    ).one()
    options = existing.get("dialect_options", {})
    if (
        not all(state)
        or existing["column_names"] != COLUMNS
        or existing["unique"]
        or existing.get("column_sorting")
        or existing.get("include_columns")
        or options.get("postgresql_include")
        or options.get("postgresql_where") is not None
        or options.get("postgresql_using", "btree") != "btree"
    ):
        raise RuntimeError(
            f"{INDEX_NAME} is invalid or has an unexpected definition; inspect and repair "
            "this exact index before retrying the uncompleted migration"
        )
    return True


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # A build may have completed before Alembic recorded this revision.
        # Reuse only its exact valid definition; IF NOT EXISTS hides failed builds.
        with op.get_context().autocommit_block():
            if not _reuse_valid_index():
                op.create_index(
                    INDEX_NAME, "health_snapshots", COLUMNS, postgresql_concurrently=True
                )
    else:
        op.create_index(INDEX_NAME, "health_snapshots", COLUMNS)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.drop_index(INDEX_NAME, table_name="health_snapshots", postgresql_concurrently=True)
    else:
        op.drop_index(INDEX_NAME, table_name="health_snapshots")
