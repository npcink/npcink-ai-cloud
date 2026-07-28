from __future__ import annotations

import importlib.util
from decimal import Decimal
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = ROOT / "migrations/versions/20260728_0074_ai_credit_subscription_order.py"


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "ai_credit_subscription_order_migration",
        MIGRATION_PATH,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ai_credit_subscription_order_migration_renames_credit_amount() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    legacy_metadata = sa.MetaData()
    orders = sa.Table(
        "subscription_orders",
        legacy_metadata,
        sa.Column("order_id", sa.String(length=191), primary_key=True),
        sa.Column("credit_amount", sa.Numeric(precision=12, scale=2), nullable=False),
    )
    legacy_metadata.create_all(engine)

    migration = _load_migration()
    with engine.begin() as connection:
        connection.execute(
            orders.insert(),
            {"order_id": "subord_test", "credit_amount": Decimal("12.50")},
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        upgraded_orders = sa.Table(
            "subscription_orders", sa.MetaData(), autoload_with=connection
        )
        upgraded_order = connection.execute(sa.select(upgraded_orders)).mappings().one()
        assert set(upgraded_orders.c.keys()) == {"order_id", "ai_credit_amount"}
        assert upgraded_order.ai_credit_amount == Decimal("12.50")

        migration.downgrade()
        downgraded_orders = sa.Table(
            "subscription_orders", sa.MetaData(), autoload_with=connection
        )

    assert set(downgraded_orders.c.keys()) == {"order_id", "credit_amount"}
