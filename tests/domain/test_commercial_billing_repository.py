from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_billing_repository import CommercialBillingRepository
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialBillingRepository],
)
def test_billing_repository_preserves_order_latest_and_upsert_semantics(
    tmp_path: Path,
    repository_type: type[CommercialBillingRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        repository = repository_type(session)
        older = repository.upsert_billing_snapshot(
            snapshot_id="snapshot-a-old",
            account_id="account-a",
            site_id="site-a",
            subscription_id="subscription-a",
            plan_version_id="billing-v1",
            currency="CNY",
            period_start_at=now - timedelta(days=2),
            period_end_at=now - timedelta(days=1),
            totals_json={"runs": 1},
            breakdown_json={"kind": "old"},
        )
        latest = repository.upsert_billing_snapshot(
            snapshot_id="snapshot-a-latest",
            account_id="account-a",
            site_id="site-a",
            subscription_id="subscription-a",
            plan_version_id="billing-v1",
            currency="CNY",
            period_start_at=now - timedelta(days=1),
            period_end_at=now,
            totals_json={"runs": 2},
            breakdown_json={"kind": "latest"},
        )
        site_b = repository.upsert_billing_snapshot(
            snapshot_id="snapshot-b",
            account_id="account-b",
            site_id="site-b",
            subscription_id=None,
            plan_version_id=None,
            currency="USD",
            period_start_at=now,
            period_end_at=now + timedelta(days=1),
            totals_json={},
            breakdown_json={},
        )

        assert older.snapshot_id is not None
        assert repository.list_billing_snapshots("site-a") == [latest, older]
        assert repository.get_latest_billing_snapshots_by_site(site_ids=[]) == {}
        assert repository.get_latest_billing_snapshots_by_site(
            site_ids=["site-a", "site-b"]
        ) == {"site-a": latest, "site-b": site_b}

        updated = repository.upsert_billing_snapshot(
            snapshot_id="snapshot-a-latest",
            account_id="account-updated",
            site_id="site-a",
            subscription_id=None,
            plan_version_id="billing-v2",
            currency="USD",
            period_start_at=now - timedelta(hours=12),
            period_end_at=now + timedelta(hours=12),
            totals_json={"runs": 3},
            breakdown_json={"kind": "updated"},
        )
        assert updated is latest
        assert latest.account_id == "account-updated"
        assert latest.currency == "USD"
        assert latest.totals_json == {"runs": 3}
        assert latest.breakdown_json == {"kind": "updated"}

    dispose_engine(database_url)
