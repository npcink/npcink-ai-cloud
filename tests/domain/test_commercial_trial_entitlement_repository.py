from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_trial_entitlement_repository import (
    CommercialTrialEntitlementRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialTrialEntitlementRepository],
)
def test_commercial_repository_preserves_trial_and_entitlement_snapshot_semantics(
    tmp_path: Path,
    repository_type: type[CommercialTrialEntitlementRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 19, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Account(
                    account_id="acct_trial_entitlement",
                    name="Trial Entitlement",
                    status="active",
                    metadata_json=None,
                ),
                Account(
                    account_id="acct_trial_entitlement_other",
                    name="Other",
                    status="active",
                    metadata_json=None,
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)
        assert isinstance(repository, CommercialTrialEntitlementRepository)

        assert repository.get_trial_claim("missing") is None
        assert repository.find_trial_claim() is None
        claim = repository.create_trial_claim(
            claim_id="trial_claim",
            account_id="acct_trial_entitlement",
            principal_id=None,
            site_domain="trial.example.test",
            plan_id="plan_pro",
            plan_version_id="plan_pro_v1",
            tier_id="pro",
            highest_tier_id="pro",
            status="active",
            ai_credit_limit=500,
            started_at=now,
            ends_at=now + timedelta(days=14),
            approved_by_principal_id=None,
            metadata_json={"source": "test"},
        )
        assert repository.get_trial_claim(claim.claim_id) is claim
        assert repository.find_trial_claim(account_id=claim.account_id) is claim
        assert repository.find_trial_claim(site_domain=claim.site_domain) is claim
        assert (
            repository.find_trial_claim(
                account_id="missing",
                site_domain=claim.site_domain,
            )
            is claim
        )
        assert repository.find_trial_claim(account_id="missing") is None
        assert claim.ai_credit_limit == 500
        assert claim.metadata_json == {"source": "test"}

        first = repository.create_entitlement_snapshot(
            account_id=claim.account_id,
            subscription_id="sub_primary",
            plan_version_id="plan_pro_v1",
            entitlements_json={"runtime": True},
            budgets_json={"ai_credits": 100},
            concurrency_json={"runs": 1},
            policy_json={"mode": "trial"},
            site_limit=1,
            metadata_json={"version": 1},
        )
        latest = repository.create_entitlement_snapshot(
            account_id=claim.account_id,
            subscription_id="sub_primary",
            plan_version_id="plan_pro_v2",
            entitlements_json={"runtime": True},
            budgets_json={"ai_credits": 200},
            concurrency_json={"runs": 2},
            policy_json={"mode": "paid"},
            site_limit=2,
            metadata_json={"version": 2},
        )
        other_subscription = repository.create_entitlement_snapshot(
            account_id=claim.account_id,
            subscription_id="sub_other",
            plan_version_id="plan_other_v1",
            entitlements_json={},
            budgets_json={},
            concurrency_json={},
            policy_json={},
            site_limit=3,
        )
        first.generated_at = now - timedelta(days=2)
        latest.generated_at = now
        other_subscription.generated_at = now - timedelta(days=1)
        session.flush()

        assert first.status == "active"
        assert latest.status == "active"
        assert latest.id > first.id
        assert repository.get_active_entitlement_snapshot(claim.account_id) is latest
        assert (
            repository.get_active_entitlement_snapshot(
                claim.account_id,
                subscription_id="sub_primary",
            )
            is latest
        )
        assert repository.get_active_entitlement_snapshot("missing") is None

        repository.supersede_entitlement_snapshots(
            claim.account_id,
            subscription_id="sub_primary",
        )
        assert first.status == "superseded"
        assert latest.status == "superseded"
        assert other_subscription.status == "active"
        assert (
            repository.get_active_entitlement_snapshot(
                claim.account_id,
                subscription_id="sub_primary",
            )
            is None
        )
        assert repository.get_active_entitlement_snapshot(claim.account_id) is other_subscription

        replacement = repository.create_entitlement_snapshot(
            account_id=claim.account_id,
            subscription_id="sub_primary",
            plan_version_id="plan_pro_v3",
            entitlements_json={"runtime": True},
            budgets_json={"ai_credits": 300},
            concurrency_json={"runs": 3},
            policy_json={"mode": "renewed"},
            site_limit=4,
        )
        assert replacement.status == "active"
        repository.supersede_entitlement_snapshots(claim.account_id)
        assert replacement.status == "superseded"
        assert other_subscription.status == "superseded"
        assert repository.get_active_entitlement_snapshot(claim.account_id) is None
        repository.supersede_entitlement_snapshots("acct_trial_entitlement_other")

    dispose_engine(database_url)
