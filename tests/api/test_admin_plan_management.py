from __future__ import annotations

from pathlib import Path

from app.core.db import get_session
from app.core.models import PlanVersion
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def test_admin_plan_management_is_structured_and_preserves_hidden_policy(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    plan_id = "plan_admin_structured"
    plan_version_id = "plan_admin_structured_v1"

    assert client.post(
        "/internal/service/plans",
        json={"plan_id": plan_id, "name": "Structured plan"},
        headers=build_internal_headers(idempotency_key="admin-plan-structured-create"),
    ).status_code == 200
    assert client.post(
        f"/internal/service/plans/{plan_id}/versions",
        json={
            "plan_version_id": plan_version_id,
            "version_label": "v1",
            "entitlements": {
                "ability_families": ["workflow"],
                "channels": ["openapi"],
                "execution_kinds": ["text"],
                "execution_tiers": ["cloud"],
                "data_classifications": ["internal"],
            },
            "budgets": {
                "max_ai_credits_per_period": 300,
                "max_runs_per_period": 99,
                "max_tokens_per_period": 12000,
                "max_cost_cny_per_period": 5,
            },
            "concurrency": {"max_active_runs": 1},
            "policy": {
                "subscription": {
                    "grace_period_days": 1,
                    "downgrade_policy": {"allow_fallback": False, "retry_max": 2},
                },
                "budgets": {
                    "runs": {
                        "grace_requests": 7,
                        "downgrade_policy": {"allow_fallback": True},
                    }
                },
                "reconciliation": {
                    "tolerance": {
                        "runs": 2,
                        "provider_calls": 3,
                        "tokens_total": 400,
                        "cost": 5,
                    }
                },
            },
            "metadata": {"tier_id": "pro", "custom_metadata": "keep"},
        },
        headers=build_internal_headers(idempotency_key="admin-plan-structured-version"),
    ).status_code == 200

    detail_response = client.get(
        f"/internal/service/admin/plans/{plan_id}",
        headers=build_internal_headers(),
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert "versions" not in detail
    assert detail["latest_version"]["plan_version_id"] == plan_version_id
    assert detail["latest_version"]["budgets"]["max_tokens_per_period"] == 12000

    list_response = client.get(
        "/internal/service/admin/plans",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200
    item = next(
        item
        for item in list_response.json()["data"]["items"]
        if item["plan"]["plan_id"] == plan_id
    )
    assert "versions" not in item
    assert item["published_version_count"] == 1

    update_response = client.patch(
        f"/internal/service/admin/plans/{plan_id}",
        json={
            "monthly_included_points": 900,
            "site_limit": 4,
            "max_vector_documents": 1200,
            "max_cost_cny_per_period": 25,
            "sales_price_cny": 39,
            "max_active_runs": 6,
            "max_batch_items": 40,
            "grace_period_days": 3,
        },
        headers=build_internal_headers(idempotency_key="admin-plan-structured-update"),
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["plan_version_id"] == plan_version_id

    with get_session(database_url) as session:
        version = session.get(PlanVersion, plan_version_id)
        assert version is not None
        assert version.entitlements_json == {
            "ability_families": ["workflow"],
            "channels": ["openapi"],
            "execution_kinds": ["text"],
            "execution_tiers": ["cloud"],
            "data_classifications": ["internal"],
        }
        assert version.budgets_json["max_ai_credits_per_period"] == 900
        assert version.budgets_json["max_runs_per_period"] == 99
        assert version.budgets_json["max_tokens_per_period"] == 12000
        assert version.budgets_json["max_cost_cny_per_period"] == 25
        assert version.concurrency_json == {"max_active_runs": 6}
        assert version.policy_json["subscription"] == {
            "grace_period_days": 3,
            "downgrade_policy": {
                "allow_fallback": False,
                "retry_max": 2,
                "max_retries": 2,
            },
        }
        assert version.policy_json["budgets"]["runs"] == {
            "grace_requests": 7,
            "downgrade_policy": {"allow_fallback": True},
        }
        assert version.policy_json["reconciliation"] == {
            "tolerance": {
                "runs": 2,
                "provider_calls": 3,
                "tokens_total": 400,
                "cost": 5,
            }
        }
        assert version.metadata_json["custom_metadata"] == "keep"
        assert version.metadata_json["site_limit"] == 4
        assert version.metadata_json["max_vector_documents"] == 1200
        assert version.metadata_json["max_batch_items"] == 40

    rejected_raw_override = client.patch(
        f"/internal/service/admin/plans/{plan_id}",
        json={
            "monthly_included_points": 900,
            "site_limit": 4,
            "max_vector_documents": 1200,
            "max_cost_cny_per_period": 25,
            "sales_price_cny": 39,
            "max_active_runs": 6,
            "max_batch_items": 40,
            "grace_period_days": 3,
            "budgets": {"max_runs_per_period": 9999},
        },
        headers=build_internal_headers(idempotency_key="admin-plan-raw-override-rejected"),
    )
    assert rejected_raw_override.status_code == 422
