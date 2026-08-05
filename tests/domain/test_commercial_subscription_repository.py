from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_subscription_repository import (
    CommercialSubscriptionRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-subscription-repository.sqlite3'}"


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialSubscriptionRepository],
)
def test_subscription_upsert_preserves_create_update_flush_and_rollback_semantics(
    tmp_path: Path,
    repository_type: type[CommercialSubscriptionRepository],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 5, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add(Account(account_id="acct_subscription", name="Account", status="active"))
        repository = repository_type(session)
        assert isinstance(repository, CommercialSubscriptionRepository)

        subscription = repository.upsert_account_subscription(
            subscription_id="sub_characterized",
            account_id="acct_subscription",
            plan_id="plan_initial",
            plan_version_id="version_initial",
            status="trialing",
            current_period_start_at=now,
            current_period_end_at=now + timedelta(days=7),
            started_at=now,
            canceled_at=None,
            suspended_at=None,
            metadata_json={"revision": 1},
        )
        assert session.get(type(subscription), subscription.subscription_id) is subscription

        subscription.scheduled_plan_id = "plan_scheduled"
        subscription.scheduled_plan_version_id = "version_scheduled"
        subscription.scheduled_change_at = now + timedelta(days=7)
        session.flush()

        same_subscription = repository.upsert_account_subscription(
            subscription_id=subscription.subscription_id,
            account_id="acct_subscription",
            plan_id="plan_updated",
            plan_version_id="version_updated",
            status="active",
            current_period_start_at=now + timedelta(days=1),
            current_period_end_at=now + timedelta(days=31),
            started_at=now + timedelta(days=1),
            canceled_at=now + timedelta(days=2),
            suspended_at=now + timedelta(days=3),
            metadata_json=None,
        )
        assert same_subscription is subscription
        assert (
            subscription.account_id,
            subscription.plan_id,
            subscription.plan_version_id,
            subscription.status,
            subscription.current_period_start_at,
            subscription.current_period_end_at,
            subscription.started_at,
            subscription.canceled_at,
            subscription.suspended_at,
            subscription.metadata_json,
        ) == (
            "acct_subscription",
            "plan_updated",
            "version_updated",
            "active",
            now + timedelta(days=1),
            now + timedelta(days=31),
            now + timedelta(days=1),
            now + timedelta(days=2),
            now + timedelta(days=3),
            None,
        )
        assert (
            subscription.scheduled_plan_id,
            subscription.scheduled_plan_version_id,
            subscription.scheduled_change_at,
        ) == (
            "plan_scheduled",
            "version_scheduled",
            now + timedelta(days=7),
        )

        session.rollback()
        assert repository.get_subscription(subscription.subscription_id) is None

    dispose_engine(database_url)
