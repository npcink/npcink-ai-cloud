from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "migrations/versions/20260827_0081_run_worker_eligibility.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "run_worker_eligibility_0081",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_0081_adds_and_removes_worker_eligibility_column_and_index() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    metadata = sa.MetaData()
    sa.Table(
        "run_records",
        metadata,
        sa.Column("run_id", sa.String(64), primary_key=True),
    )
    metadata.create_all(engine)
    migration = _load()

    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        inspector = sa.inspect(connection)
        assert "worker_eligible_at" in {
            column["name"] for column in inspector.get_columns("run_records")
        }
        assert "ix_run_records_worker_eligible_at" in {
            index["name"] for index in inspector.get_indexes("run_records")
        }

        migration.downgrade()

        inspector = sa.inspect(connection)
        assert "worker_eligible_at" not in {
            column["name"] for column in inspector.get_columns("run_records")
        }
        assert "ix_run_records_worker_eligible_at" not in {
            index["name"] for index in inspector.get_indexes("run_records")
        }
