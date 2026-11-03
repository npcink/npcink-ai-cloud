from datetime import UTC, datetime
from pathlib import Path

from app.core.db import get_session
from app.core.models import Account, AccountSubscription, Plan, PlanVersion
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def test_credit_pack_api_requires_revision_and_rejects_stale_replacement(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    path = "/internal/service/admin/credit-packs"
    catalog = client.get(path, headers=build_internal_headers()).json()["data"]
    revision = catalog["revision"]

    def patch(body: dict, key: str):
        return client.patch(path, json=body, headers=build_internal_headers(idempotency_key=key))

    assert patch({"items": []}, "missing-revision").status_code == 409
    items = [{**item, "amount": 119} for item in catalog["items"]]
    first = patch({"items": items, "expected_revision": revision}, "operator-a")
    assert first.status_code == 200, first.json()
    assert first.json()["data"]["revision"] != revision
    stale = patch({"items": [], "expected_revision": revision}, "operator-b")
    assert stale.status_code == 409
    assert stale.json()["error_code"] == "service.credit_pack_catalog_revision_conflict"
    current = client.get(path, headers=build_internal_headers()).json()["data"]
    assert current == first.json()["data"]


def test_active_plan_drilldown_matches_count_before_pagination(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    now = datetime.now(UTC)
    statuses = ["trialing", "active", "past_due", "suspended", "canceled", "expired"]
    with get_session(database_url) as session:
        session.add(Plan(plan_id="exact-plan", name="Exact plan", status="active"))
        session.flush()
        session.add(
            PlanVersion(
                plan_version_id="exact-v1",
                plan_id="exact-plan",
                version_label="v1",
                status="published",
                currency="CNY",
            )
        )
        session.flush()
        for index, status in enumerate(statuses):
            session.add(Account(account_id=f"exact-{index}", name=f"Customer {index}"))
            session.add(
                AccountSubscription(
                    subscription_id=f"exact-{index}",
                    account_id=f"exact-{index}",
                    plan_id="exact-plan",
                    plan_version_id="exact-v1",
                    status=status,
                    started_at=now,
                    current_period_start_at=now,
                    metadata_json={},
                )
            )
        session.commit()
    headers = build_internal_headers()
    plans = client.get("/internal/service/admin/plans", headers=headers).json()["data"]
    plan = next(item for item in plans["items"] if item["plan"]["plan_id"] == "exact-plan")
    assert plan["subscription_counts"] == {"active": 4, "total": 6}
    path = "/internal/service/admin/subscriptions"
    params = {"plan_id": "exact-plan", "risk": "all", "status_group": "active", "limit": 2}
    first = client.get(path, params=params, headers=headers).json()["data"]
    second = client.get(path, params={**params, "offset": 2}, headers=headers).json()["data"]
    assert first["total"] == second["total"] == plan["subscription_counts"]["active"]
    assert first["pagination"]["has_more"] is True
    assert second["pagination"]["has_more"] is False
    assert sum(first["summary"].values()) == 4
    items = first["items"] + second["items"]
    assert {item["subscription"]["status"] for item in items} == set(statuses[:4])
    assert len({item["subscription"]["subscription_id"] for item in items}) == 4
    exact = client.get(path, params={"status": "active", "plan_id": "exact-plan"}, headers=headers)
    assert exact.json()["data"]["total"] == 1
    conflicting = client.get(path, params={**params, "status": "active"}, headers=headers)
    assert conflicting.status_code == 400
    assert client.get(path, params={"status_group": "unknown"}, headers=headers).status_code == 422
