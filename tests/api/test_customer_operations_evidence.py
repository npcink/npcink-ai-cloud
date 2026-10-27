from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.db import get_session
from app.core.models import Account, AccountUserMembership, Principal, Site
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


@pytest.mark.parametrize(
    ("site_status", "ownership_released"),
    [("archived", False), ("active", True), ("archived", True)],
)
def test_removed_sites_remain_history_without_current_snapshot_or_key_alerts(
    tmp_path: Path,
    site_status: str,
    ownership_released: bool,
) -> None:
    database_url, client = _build_client(tmp_path)
    service = CommercialService(database_url)
    service.upsert_account(
        account_id="acct_evidence", name="Evidence owner", bind_default_free=True
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        account = session.get(Account, "acct_evidence")
        assert account is not None
        account.metadata_json = {"operator_display_name": "Customer Display Label"}
        session.add(
            Principal(
                principal_id="prn_evidence",
                email="owner@example.test",
                status="active",
                session_version=1,
                metadata_json={},
            )
        )
        session.add(
            AccountUserMembership(
                membership_id="aum_evidence",
                principal_id="prn_evidence",
                account_id="acct_evidence",
                role="owner",
                status="active",
                allowed_actions_json=[],
                metadata_json={},
            )
        )
        session.add(
            Site(
                site_id="site_history",
                account_id="acct_evidence",
                name="Removed history",
                status=site_status,
                ownership_released_at=now if ownership_released else None,
                metadata_json={},
            )
        )
        session.commit()

    response = client.get(
        "/internal/service/admin/subscriptions",
        params={"customer": "Customer Display Label"},
        headers=build_internal_headers(),
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["total"] == 1
    subscription = payload["items"][0]
    assert subscription["covered_sites"][0]["site_id"] == "site_history"
    assert subscription["billing_snapshot_status"]["site_count"] == 0
    assert subscription["billing_snapshot_status"]["next_action"] is None
    subscription_id = subscription["subscription"]["subscription_id"]
    rebuild = client.post(
        f"/internal/service/admin/subscriptions/{subscription_id}/billing-snapshots/rebuild",
        json={},
        headers=build_internal_headers(idempotency_key="rebuild-current-evidence"),
    )
    assert rebuild.status_code == 200
    assert rebuild.json()["data"]["billing_snapshot_refresh"]["status"] == "no_covered_sites"
    assert rebuild.json()["data"]["billing_snapshot_refresh"]["snapshots"] == []

    queue = service.get_admin_coverage_work_queue(q="Customer Display Label", status="all")
    assert queue["total"] == 1
    item = queue["items"][0]
    assert item["evidence"]["site_count"] == 0
    assert item["evidence"]["missing_key_site_count"] == 0
    assert item["reason_code"] == "no_site_footprint"

    # A live site without a key is a service problem even if its statistics are also missing.
    with get_session(database_url) as session:
        session.add(
            Site(
                site_id="site_live",
                account_id="acct_evidence",
                name="Live site",
                status="active",
                metadata_json={},
            )
        )
        session.commit()
    queue = service.get_admin_coverage_work_queue(q="Customer Display Label", status="all")
    item = queue["items"][0]
    assert item["reason_code"] == "site_key_missing"
    assert item["evidence"]["billing_snapshot_status"]["status"] == "missing"
    assert item["evidence"]["missing_key_site_count"] == 1
