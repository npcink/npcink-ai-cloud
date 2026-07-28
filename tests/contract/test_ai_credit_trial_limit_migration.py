from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = ROOT / "migrations/versions/20260728_0075_ai_credit_trial_limits.py"


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "ai_credit_trial_limit_migration",
        MIGRATION_PATH,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ai_credit_trial_limit_migration_renames_offer_and_claim_fields() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    legacy_metadata = sa.MetaData()
    offers = sa.Table(
        "plan_offers",
        legacy_metadata,
        sa.Column("offer_id", sa.String(length=191), primary_key=True),
        sa.Column("trial_credit_limit", sa.Integer(), nullable=False),
    )
    claims = sa.Table(
        "trial_claims",
        legacy_metadata,
        sa.Column("claim_id", sa.String(length=191), primary_key=True),
        sa.Column("credit_limit", sa.Integer(), nullable=False),
    )
    legacy_metadata.create_all(engine)

    migration = _load_migration()
    with engine.begin() as connection:
        connection.execute(offers.insert(), {"offer_id": "offer_test", "trial_credit_limit": 300})
        connection.execute(claims.insert(), {"claim_id": "claim_test", "credit_limit": 600})
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        upgraded_offers = sa.Table("plan_offers", sa.MetaData(), autoload_with=connection)
        upgraded_claims = sa.Table("trial_claims", sa.MetaData(), autoload_with=connection)
        upgraded_offer = connection.execute(sa.select(upgraded_offers)).mappings().one()
        upgraded_claim = connection.execute(sa.select(upgraded_claims)).mappings().one()
        assert set(upgraded_offers.c.keys()) == {"offer_id", "trial_ai_credit_limit"}
        assert set(upgraded_claims.c.keys()) == {"claim_id", "ai_credit_limit"}
        assert upgraded_offer.trial_ai_credit_limit == 300
        assert upgraded_claim.ai_credit_limit == 600

        migration.downgrade()
        downgraded_offers = sa.Table("plan_offers", sa.MetaData(), autoload_with=connection)
        downgraded_claims = sa.Table("trial_claims", sa.MetaData(), autoload_with=connection)

    assert set(downgraded_offers.c.keys()) == {"offer_id", "trial_credit_limit"}
    assert set(downgraded_claims.c.keys()) == {"claim_id", "credit_limit"}
