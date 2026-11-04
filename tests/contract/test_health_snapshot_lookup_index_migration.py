from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import Mock

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.engine import Engine


def load_migration():
    path = Path(__file__).resolve().parents[2] / (
        "migrations/versions/20261017_0088_health_snapshot_lookup_index.py"
    )
    spec = importlib.util.spec_from_file_location("health_snapshot_index_0088", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def assert_health_index_round_trip(engine: Engine) -> None:
    """Exercise real index DDL and retry semantics on SQLite and isolated M4 PG."""
    migration = load_migration()
    metadata = sa.MetaData()
    health = sa.Table(
        "health_snapshots",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("instance_id", sa.String(191), index=True),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
    )
    with engine.connect() as connection:
        metadata.create_all(connection)
        connection.execute(
            sa.text(
                "INSERT INTO health_snapshots(id, instance_id, measured_at) "
                "VALUES (1, 'a', '2026-10-17 00:00:00')"
            )
        )
        connection.commit()
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        index = next(
            item
            for item in sa.inspect(connection).get_indexes("health_snapshots")
            if item["name"] == migration.INDEX_NAME
        )
        assert index["column_names"] == migration.COLUMNS and not index["unique"]
        connection.commit()
        if connection.dialect.name == "postgresql":
            migration.upgrade()  # Valid completed index after a missing revision write.
            migration.op.drop_index(migration.INDEX_NAME)
            migration.op.create_index(migration.INDEX_NAME, "health_snapshots", ["id"])
            connection.commit()
            with pytest.raises(RuntimeError, match="unexpected definition"):
                migration.upgrade()
            migration.op.drop_index(migration.INDEX_NAME)
            connection.commit()
            migration.upgrade()
        connection.commit()
        migration.downgrade()
        assert migration.INDEX_NAME not in {
            item["name"] for item in sa.inspect(connection).get_indexes("health_snapshots")
        }
        assert "ix_health_snapshots_instance_id" in {
            item["name"] for item in sa.inspect(connection).get_indexes("health_snapshots")
        }
        assert connection.scalar(sa.select(sa.func.count()).select_from(health)) == 1


def test_health_lookup_index_sqlite_round_trip() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    try:
        assert_health_index_round_trip(engine)
    finally:
        engine.dispose()


@pytest.mark.parametrize("state", [(False, True), (True, False)])
def test_health_lookup_index_refuses_unusable_postgres_index(monkeypatch, state) -> None:
    migration = load_migration()
    inspector = Mock()
    inspector.get_indexes.return_value = [
        {
            "name": migration.INDEX_NAME,
            "column_names": migration.COLUMNS,
            "unique": False,
        }
    ]
    monkeypatch.setattr(migration.sa, "inspect", lambda _bind: inspector)
    bind = Mock()
    bind.execute.return_value.one.return_value = state
    migration.op = Mock()
    migration.op.get_bind.return_value = bind
    with pytest.raises(RuntimeError, match="invalid or has an unexpected definition"):
        migration._reuse_valid_index()
