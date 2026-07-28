from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = (
    ROOT / "migrations/versions/20260728_0076_remove_legacy_usd_budget_inputs.py"
)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("cny_budget_cutover_migration", MIGRATION_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cny_budget_cutover_removes_only_unreleased_usd_inputs() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    metadata = sa.MetaData()
    plan_versions = sa.Table(
        "plan_versions",
        metadata,
        sa.Column("plan_version_id", sa.String(length=191), primary_key=True),
        sa.Column("budgets_json", sa.JSON(), nullable=False),
    )
    snapshots = sa.Table(
        "account_entitlement_snapshots",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("budgets_json", sa.JSON(), nullable=False),
    )
    subscriptions = sa.Table(
        "account_subscriptions",
        metadata,
        sa.Column("subscription_id", sa.String(length=191), primary_key=True),
        sa.Column("metadata_json", sa.JSON()),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            plan_versions.insert(),
            {
                "plan_version_id": "plan_v1",
                "budgets_json": {
                    "max_runs_per_period": 10,
                    "max_cost_per_period": 2,
                    "max_cost_cny_per_period": 99,
                },
            },
        )
        connection.execute(
            snapshots.insert(),
            {
                "budgets_json": {
                    "max_cost_per_period": 2,
                    "max_cost_cny_per_period": 106.2,
                },
            },
        )
        connection.execute(
            subscriptions.insert(),
            [
                {
                    "subscription_id": "subscription_v1",
                    "metadata_json": {
                        "current_period_topup_totals": {
                            "cost": 1,
                            "cost_cny": 7.2,
                        },
                        "operator_managed_topups": [
                            {
                                "increments": {
                                    "cost": 1,
                                    "legacy_cost_usd": 1,
                                    "cost_cny": 7.2,
                                    "accounting_fx": {"rate": "7.2"},
                                }
                            }
                        ],
                        "unrelated": "preserved",
                    },
                },
                {
                    "subscription_id": "subscription_without_metadata",
                    "metadata_json": None,
                },
            ],
        )

        migration = _load_migration()
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.upgrade()

        plan = connection.execute(sa.select(plan_versions)).mappings().one()
        snapshot = connection.execute(sa.select(snapshots)).mappings().one()
        subscription = connection.execute(
            sa.select(subscriptions).where(
                subscriptions.c.subscription_id == "subscription_v1"
            )
        ).mappings().one()
        subscription_without_metadata = connection.execute(
            sa.select(subscriptions).where(
                subscriptions.c.subscription_id == "subscription_without_metadata"
            )
        ).mappings().one()

    assert plan.budgets_json == {
        "max_runs_per_period": 10,
        "max_cost_cny_per_period": 99,
    }
    assert snapshot.budgets_json == {"max_cost_cny_per_period": 106.2}
    assert subscription.metadata_json == {
        "current_period_topup_totals": {"cost_cny": 7.2},
        "operator_managed_topups": [{"increments": {"cost_cny": 7.2}}],
        "unrelated": "preserved",
    }
    assert subscription_without_metadata.metadata_json is None
