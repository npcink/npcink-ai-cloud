from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_plan_repository import CommercialPlanRepository
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-plan-repository.sqlite3'}"


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialPlanRepository],
)
def test_plan_upserts_preserve_create_update_flush_and_rollback_semantics(
    tmp_path: Path,
    repository_type: type[CommercialPlanRepository],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 4, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        repository = repository_type(session)
        assert isinstance(repository, CommercialPlanRepository)

        plan = repository.upsert_plan(
            plan_id="plan_characterized",
            name="",
            status="draft",
            description="",
            metadata_json={"revision": 1},
        )
        assert session.get(type(plan), plan.plan_id) is plan
        assert plan.name == "plan_characterized"
        assert plan.description is None

        same_plan = repository.upsert_plan(
            plan_id=plan.plan_id,
            name="Published plan",
            status="published",
            description="Current description",
            metadata_json={"revision": 2},
        )
        assert same_plan is plan
        assert (
            plan.name,
            plan.status,
            plan.description,
            plan.metadata_json,
        ) == (
            "Published plan",
            "published",
            "Current description",
            {"revision": 2},
        )

        version = repository.upsert_plan_version(
            plan_version_id="version_characterized",
            plan_id=plan.plan_id,
            version_label="v1",
            status="draft",
            currency="CNY",
            entitlements_json={"feature": False},
            budgets_json={"credits": 1},
            concurrency_json={"jobs": 1},
            policy_json={"grace_days": 0},
            metadata_json={"revision": 1},
        )
        assert session.get(type(version), version.plan_version_id) is version

        same_version = repository.upsert_plan_version(
            plan_version_id=version.plan_version_id,
            plan_id=plan.plan_id,
            version_label="v2",
            status="published",
            currency="USD",
            entitlements_json={"feature": True},
            budgets_json={"credits": 2},
            concurrency_json={"jobs": 2},
            policy_json={"grace_days": 3},
            metadata_json=None,
        )
        assert same_version is version
        assert (
            version.version_label,
            version.status,
            version.currency,
            version.entitlements_json,
            version.budgets_json,
            version.concurrency_json,
            version.policy_json,
            version.metadata_json,
        ) == (
            "v2",
            "published",
            "USD",
            {"feature": True},
            {"credits": 2},
            {"jobs": 2},
            {"grace_days": 3},
            None,
        )

        offer = repository.upsert_plan_offer(
            offer_id="offer_characterized",
            plan_id=plan.plan_id,
            plan_version_id=version.plan_version_id,
            account_id=None,
            tier_id="pro",
            billing_cycle="monthly",
            amount=Decimal("99.00"),
            currency="CNY",
            purchase_mode="self_serve",
            status="active",
            trial_enabled=True,
            trial_days=7,
            trial_ai_credit_limit=100,
            trial_requires_approval=False,
            valid_from_at=now,
            valid_until_at=now + timedelta(days=30),
            metadata_json={"revision": 1},
        )
        assert session.get(type(offer), offer.offer_id) is offer

        same_offer = repository.upsert_plan_offer(
            offer_id=offer.offer_id,
            plan_id=plan.plan_id,
            plan_version_id=version.plan_version_id,
            account_id=None,
            tier_id="plus",
            billing_cycle="annual",
            amount=Decimal("199.00"),
            currency="USD",
            purchase_mode="quote",
            status="retired",
            trial_enabled=False,
            trial_days=0,
            trial_ai_credit_limit=0,
            trial_requires_approval=True,
            valid_from_at=None,
            valid_until_at=None,
            metadata_json=None,
        )
        assert same_offer is offer
        assert (
            offer.tier_id,
            offer.billing_cycle,
            offer.amount,
            offer.currency,
            offer.purchase_mode,
            offer.status,
            offer.trial_enabled,
            offer.trial_days,
            offer.trial_ai_credit_limit,
            offer.trial_requires_approval,
            offer.valid_from_at,
            offer.valid_until_at,
            offer.metadata_json,
        ) == (
            "plus",
            "annual",
            Decimal("199.00"),
            "USD",
            "quote",
            "retired",
            False,
            0,
            0,
            True,
            None,
            None,
            None,
        )

        session.rollback()
        assert repository.get_plan(plan.plan_id) is None
        assert repository.get_plan_version(version.plan_version_id) is None
        assert repository.get_plan_offer(offer.offer_id) is None

    dispose_engine(database_url)
