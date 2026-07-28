from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = ROOT / "migrations/versions/20260728_0073_ai_credit_contract.py"


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "ai_credit_contract_migration",
        MIGRATION_PATH,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ai_credit_contract_migration_renames_ledger_and_grant_fields() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    legacy_metadata = sa.MetaData()
    ledger = sa.Table(
        "credit_ledger_entries",
        legacy_metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("credit_delta", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False, server_default="credit"),
    )
    grants = sa.Table(
        "paid_credit_grants",
        legacy_metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("original_credits", sa.Float(), nullable=False),
        sa.Column("remaining_credits", sa.Float(), nullable=False),
        sa.Column("refunded_credits", sa.Float(), nullable=False),
    )
    legacy_metadata.create_all(engine)

    migration = _load_migration()
    with engine.begin() as connection:
        connection.execute(ledger.insert(), {"id": 1, "credit_delta": -3.5})
        connection.execute(
            grants.insert(),
            {
                "id": 1,
                "original_credits": 10.0,
                "remaining_credits": 6.5,
                "refunded_credits": 3.5,
            },
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        upgraded_ledger = sa.Table(
            "credit_ledger_entries", sa.MetaData(), autoload_with=connection
        )
        upgraded_grants = sa.Table(
            "paid_credit_grants", sa.MetaData(), autoload_with=connection
        )
        upgraded_entry = connection.execute(sa.select(upgraded_ledger)).mappings().one()
        upgraded_grant = connection.execute(sa.select(upgraded_grants)).mappings().one()

        assert set(upgraded_ledger.c.keys()) == {"id", "ai_credit_delta", "unit"}
        assert set(upgraded_grants.c.keys()) == {
            "id",
            "original_ai_credits",
            "remaining_ai_credits",
            "refunded_ai_credits",
        }
        assert upgraded_entry.ai_credit_delta == -3.5
        assert upgraded_entry.unit == "ai_credits"
        assert upgraded_grant.original_ai_credits == 10.0
        assert upgraded_grant.remaining_ai_credits == 6.5
        assert upgraded_grant.refunded_ai_credits == 3.5

        migration.downgrade()
        downgraded_ledger = sa.Table(
            "credit_ledger_entries", sa.MetaData(), autoload_with=connection
        )
        downgraded_grants = sa.Table(
            "paid_credit_grants", sa.MetaData(), autoload_with=connection
        )

    assert set(downgraded_ledger.c.keys()) == {"id", "credit_delta", "unit"}
    assert set(downgraded_grants.c.keys()) == {
        "id",
        "original_credits",
        "remaining_credits",
        "refunded_credits",
    }
