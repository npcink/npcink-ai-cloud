from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session
from app.core.models import (
    Account,
    AccountEntitlementSnapshot,
    AccountSubscription,
    BillingSnapshot,
    Site,
    UsageMeterEvent,
)
from app.domain.commercial.errors import CommercialValidationError
from app.domain.commercial.mixins import _billing_mixin as billing_mixin
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import (
    _build_client,
    _seed_openai_text_model_allowlist,
)
from tests.conftest import (
    build_auth_headers,
    build_internal_headers,
    merge_json_headers,
    seed_site_auth,
)


def test_service_routes_manage_account_site_and_keys(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    account_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_service", "name": "Service Account"},
        headers=build_internal_headers(idempotency_key="svc-account-001"),
    )
    site_response = client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_service",
            "account_id": "acct_service",
            "name": "Service Site",
            "status": "provisioning",
        },
        headers=build_internal_headers(idempotency_key="svc-site-001"),
    )
    activate_response = client.post(
        "/internal/service/sites/site_service/activate",
        headers=build_internal_headers(idempotency_key="svc-site-activate-001"),
    )
    issue_key_response = client.post(
        "/internal/service/sites/site_service/keys",
        json={
            "key_id": "key_service_primary",
            "secret": "svc-primary-secret",
            "scopes": ["runtime:execute", "runtime:read", "runtime:resolve"],
            "label": "primary",
        },
        headers=build_internal_headers(idempotency_key="svc-key-issue-001"),
    )
    list_keys_response = client.get(
        "/internal/service/sites/site_service/keys",
        headers=build_internal_headers(),
    )
    rotate_key_response = client.post(
        "/internal/service/sites/site_service/keys/key_service_primary/rotate",
        json={
            "key_id": "key_service_rotated",
            "secret": "svc-rotated-secret",
            "label": "rotated",
        },
        headers=build_internal_headers(idempotency_key="svc-key-rotate-001"),
    )
    expire_at = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    expire_key_response = client.post(
        "/internal/service/sites/site_service/keys/key_service_rotated/expire",
        json={"expires_at": expire_at},
        headers=build_internal_headers(idempotency_key="svc-key-expire-001"),
    )
    revoke_key_response = client.post(
        "/internal/service/sites/site_service/keys/key_service_rotated/revoke",
        headers=build_internal_headers(idempotency_key="svc-key-revoke-001"),
    )
    suspend_response = client.post(
        "/internal/service/sites/site_service/suspend",
        json={"reason": "manual hold"},
        headers=build_internal_headers(idempotency_key="svc-site-suspend-001"),
    )
    audit_response = client.get(
        "/internal/service/audit-events?site_id=site_service&limit=20",
        headers=build_internal_headers(),
    )
    missing_activate_response = client.post(
        "/internal/service/sites/site_missing/activate",
        headers=build_internal_headers(idempotency_key="svc-site-activate-missing-001"),
    )
    error_audit_response = client.get(
        "/internal/service/audit-events?event_kind=site.activate&outcome=error&limit=5",
        headers=build_internal_headers(),
    )

    assert account_response.status_code == 200
    assert "current_subscription" not in account_response.json()["data"]
    assert site_response.status_code == 200
    assert site_response.json()["data"]["status"] == "provisioning"
    assert activate_response.status_code == 200
    assert activate_response.json()["data"]["status"] == "active"
    assert issue_key_response.status_code == 200
    assert issue_key_response.json()["data"]["secret"] == "svc-primary-secret"
    assert list_keys_response.status_code == 200
    assert len(list_keys_response.json()["data"]["items"]) == 1
    assert list_keys_response.json()["data"]["pagination"] == {
        "limit": 20,
        "offset": 0,
        "total": 1,
        "has_more": False,
        "next_offset": None,
    }
    assert list_keys_response.json()["data"]["sort"] == {
        "created_at": "desc",
        "key_id": "desc",
    }
    assert rotate_key_response.status_code == 200
    assert rotate_key_response.json()["data"]["previous"]["status"] == "revoked"
    assert rotate_key_response.json()["data"]["current"]["key_id"] == "key_service_rotated"
    assert expire_key_response.status_code == 200
    assert expire_key_response.json()["data"]["status"] == "expired"
    assert revoke_key_response.status_code == 200
    assert revoke_key_response.json()["data"]["status"] == "revoked"
    assert suspend_response.status_code == 200
    assert suspend_response.json()["data"]["status"] == "suspended"
    assert suspend_response.json()["data"]["suspension_reason"] == "manual hold"
    assert audit_response.status_code == 200
    audit_items = audit_response.json()["data"]["items"]
    assert {item["event_kind"] for item in audit_items} >= {
        "site.provision",
        "site.activate",
        "site_key.issue",
        "site_key.rotate",
        "site_key.expire",
        "site_key.revoke",
        "site.suspend",
    }
    issue_audit = next(item for item in audit_items if item["event_kind"] == "site_key.issue")
    rotate_audit = next(item for item in audit_items if item["event_kind"] == "site_key.rotate")
    exact_audit_response = client.get(
        "/internal/service/audit-events",
        params={
            "event_id": issue_audit["event_id"],
            "idempotency_key": issue_audit["idempotency_key"],
            "scope_kind": issue_audit["scope_kind"],
            "scope_id": issue_audit["scope_id"],
            "include_payload": False,
        },
        headers=build_internal_headers(),
    )
    paged_audit_response = client.get(
        "/internal/service/audit-events?site_id=site_service&limit=2&offset=2",
        headers=build_internal_headers(),
    )
    assert issue_audit["payload"]["secret"] == "[redacted]"
    assert rotate_audit["payload"]["current"]["secret"] == "[redacted]"
    assert exact_audit_response.status_code == 200
    exact_audit_data = exact_audit_response.json()["data"]
    assert [item["event_id"] for item in exact_audit_data["items"]] == [
        issue_audit["event_id"]
    ]
    assert "payload" not in exact_audit_data["items"][0]
    expected_exact_filters = {
        "event_id": issue_audit["event_id"],
        "idempotency_key": issue_audit["idempotency_key"],
        "scope_kind": issue_audit["scope_kind"],
        "scope_id": issue_audit["scope_id"],
    }
    assert {
        key: exact_audit_data["filters"][key] for key in expected_exact_filters
    } == expected_exact_filters
    assert exact_audit_data["pagination"] == {
        "limit": 50,
        "offset": 0,
        "total": 1,
        "has_more": False,
        "next_offset": None,
    }
    assert exact_audit_data["sort"] == {"created_at": "desc", "event_id": "desc"}
    assert paged_audit_response.status_code == 200
    paged_audit_data = paged_audit_response.json()["data"]
    assert paged_audit_data["pagination"]["offset"] == 2
    assert paged_audit_data["pagination"]["limit"] == 2
    assert paged_audit_data["pagination"]["total"] >= 7
    assert paged_audit_data["pagination"]["has_more"] is True
    assert paged_audit_data["pagination"]["next_offset"] == 4
    assert missing_activate_response.status_code == 404
    assert error_audit_response.status_code == 200
    error_items = error_audit_response.json()["data"]["items"]
    assert any(
        item["payload"]["error_code"] == "service.site_not_found"
        and item["payload"]["request"] == {}
        for item in error_items
    )

    dispose_engine(database_url)


def test_admin_account_creation_provisions_one_owner_identity(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    response = client.post(
        "/internal/service/accounts",
        json={
            "name": "Owner Identity",
            "primary_email": "Owner@Example.COM",
        },
        headers=build_internal_headers(idempotency_key="owner-identity-create"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    assert payload["account_id"].startswith("acct_")
    assert len(payload["account_id"]) == len("acct_") + 32
    assert payload["primary_identity"]["email"] == "owner@example.com"
    assert payload["primary_identity"]["status"] == "active"
    assert payload["membership"]["role"] == "owner"
    assert payload["membership"]["status"] == "active"

    directory_response = client.get(
        "/internal/service/admin/accounts?q=owner%40example.com",
        headers=build_internal_headers(),
    )
    assert directory_response.status_code == 200, directory_response.text
    directory_item = directory_response.json()["data"]["items"][0]
    assert directory_item["account"]["account_id"] == payload["account_id"]
    assert directory_item["identity_relationship_state"] == "healthy"
    assert directory_item["primary_identity"]["email"] == "owner@example.com"
    assert directory_item["primary_identity"]["membership_role"] == "owner"

    conflicting_response = client.post(
        "/internal/service/accounts",
        json={
            "account_id": "acct_second_for_owner",
            "name": "Second Owner Account",
            "primary_email": "owner@example.com",
        },
        headers=build_internal_headers(idempotency_key="owner-identity-conflict"),
    )
    assert conflicting_response.status_code == 409, conflicting_response.text
    assert (
        conflicting_response.json()["error_code"]
        == "service.single_account_membership_limit"
    )

    dispose_engine(database_url)


def test_service_routes_account_default_free_binding_is_explicit(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    generic_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_ops_only", "name": "Ops Only Account"},
        headers=build_internal_headers(idempotency_key="svc-account-explicit-001"),
    )
    onboarding_response = client.post(
        "/internal/service/accounts",
        json={
            "account_id": "acct_customer_free",
            "name": "Customer Free Account",
            "bind_default_free": True,
        },
        headers=build_internal_headers(idempotency_key="svc-account-explicit-002"),
    )

    assert generic_response.status_code == 200
    assert "current_subscription" not in generic_response.json()["data"]
    assert onboarding_response.status_code == 200
    onboarding_payload = onboarding_response.json()["data"]
    assert onboarding_payload["current_subscription"]["plan_id"] == "free"
    assert onboarding_payload["current_subscription"]["plan_version_id"] == "free_v1"
    assert onboarding_payload["current_subscription"]["package_alias"] == "Free"

    with get_session(database_url) as session:
        generic_subscription = session.scalar(
            select(AccountSubscription).where(AccountSubscription.account_id == "acct_ops_only")
        )
        free_subscription = session.scalar(
            select(AccountSubscription).where(
                AccountSubscription.account_id == "acct_customer_free"
            )
        )
        free_snapshot = session.scalar(
            select(AccountEntitlementSnapshot).where(
                AccountEntitlementSnapshot.account_id == "acct_customer_free",
                AccountEntitlementSnapshot.status == "active",
            )
        )

    assert generic_subscription is None
    assert free_subscription is not None
    assert free_subscription.plan_id == "free"
    assert free_subscription.plan_version_id == "free_v1"
    assert free_snapshot is not None
    assert free_snapshot.plan_version_id == "free_v1"

    dispose_engine(database_url)


def test_service_site_keys_support_limit_offset_and_desc_sort(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)

    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_keys_page", "name": "Paged Keys Account"},
        headers=build_internal_headers(idempotency_key="svc-page-account-001"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_keys_page",
            "account_id": "acct_keys_page",
            "name": "Paged Keys Site",
            "status": "active",
        },
        headers=build_internal_headers(idempotency_key="svc-page-site-001"),
    )

    for index in range(3):
        client.post(
            "/internal/service/sites/site_keys_page/keys",
            json={
                "key_id": f"key_page_{index}",
                "secret": f"svc-page-secret-{index}",
                "scopes": ["runtime:read"],
                "label": f"page-{index}",
            },
            headers=build_internal_headers(idempotency_key=f"svc-page-key-{index:03d}"),
        )

    response = client.get(
        "/internal/service/sites/site_keys_page/keys?limit=2&offset=0",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert [item["key_id"] for item in payload["items"]] == [
        "key_page_2",
        "key_page_1",
    ]
    assert payload["pagination"] == {
        "limit": 2,
        "offset": 0,
        "total": 3,
        "has_more": True,
        "next_offset": 2,
    }
    assert payload["sort"] == {"created_at": "desc", "key_id": "desc"}


def test_service_routes_bind_subscription_and_rebuild_billing_snapshot(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)

    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_billing", "name": "Billing Account"},
        headers=build_internal_headers(idempotency_key="svc-account-101"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_billing",
            "account_id": "acct_billing",
            "name": "Billing Site",
            "status": "provisioning",
        },
        headers=build_internal_headers(idempotency_key="svc-site-101"),
    )
    client.post(
        "/internal/service/sites/site_billing/activate",
        headers=build_internal_headers(idempotency_key="svc-site-activate-101"),
    )
    key_response = client.post(
        "/internal/service/sites/site_billing/keys",
        json={
            "key_id": "key_billing_primary",
            "secret": "billing-secret",
            "scopes": ["runtime:execute", "runtime:read", "runtime:resolve", "stats:read"],
            "label": "billing-primary",
        },
        headers=build_internal_headers(idempotency_key="svc-key-101"),
    )
    plan_response = client.post(
        "/internal/service/plans",
        json={"plan_id": "plan_pro_topup", "name": "Pro"},
        headers=build_internal_headers(idempotency_key="svc-plan-101"),
    )
    version_response = client.post(
        "/internal/service/plans/plan_pro_topup/versions",
        json={
            "plan_version_id": "plan_pro_topup_v1",
            "version_label": "v1",
            "entitlements": {
                "ability_families": ["workflow"],
                "channels": ["openapi"],
                "execution_kinds": ["text"],
                "execution_tiers": ["cloud"],
                "data_classifications": ["internal"],
            },
            "budgets": {"max_runs_per_period": 10, "max_tokens_per_period": 5000},
            "concurrency": {"max_active_runs": 2},
        },
        headers=build_internal_headers(idempotency_key="svc-plan-version-101"),
    )
    subscription_response = client.post(
        "/internal/service/admin/accounts/acct_billing/subscription",
        json={
            "subscription_id": "sub_pro_topup",
            "account_id": "acct_billing",
            "plan_id": "plan_pro_topup",
            "plan_version_id": "plan_pro_topup_v1",
            "status": "active",
        },
        headers=build_internal_headers(idempotency_key="svc-subscription-101"),
    )
    topup_response = client.post(
        "/internal/service/subscriptions/sub_pro_topup/topup",
        json={
            "target_period_start_at": subscription_response.json()["data"]["subscription"][
                "current_period_start_at"
            ],
            "target_period_end_at": subscription_response.json()["data"]["subscription"][
                "current_period_end_at"
            ],
            "ai_credits_increment": 10000,
            "runs_increment": 10000,
            "tokens_increment": 2000000,
            "cost_cny_increment": 99,
            "reason": "operator_overage_buffer",
            "note": "Customer needs temporary headroom before tier review.",
        },
        headers=build_internal_headers(idempotency_key="svc-subscription-topup-101"),
    )

    assert key_response.status_code == 200
    assert plan_response.status_code == 200
    assert plan_response.json()["data"]["receipt"]["event_kind"] == "plan.upsert"
    assert plan_response.json()["data"]["receipt"]["audit_filters"]["event_kind"] == "plan.upsert"
    assert plan_response.json()["data"]["receipt"]["audit_filters"]["outcome"] == "succeeded"
    assert plan_response.json()["data"]["receipt"]["audit_filters"]["idempotency_key"] == (
        "svc-plan-101"
    )
    assert plan_response.json()["data"]["receipt"]["audit_filters"]["scope_kind"] == "plan"
    assert plan_response.json()["data"]["receipt"]["audit_filters"]["scope_id"] == (
        "plan_pro_topup"
    )
    assert version_response.status_code == 200
    assert version_response.json()["data"]["receipt"]["event_kind"] == "plan_version.publish"
    assert (
        version_response.json()["data"]["receipt"]["audit_filters"]["event_kind"]
        == "plan_version.publish"
    )
    assert subscription_response.status_code == 200
    assert subscription_response.json()["data"]["receipt"]["event_kind"] == "subscription.upsert"
    assert (
        subscription_response.json()["data"]["receipt"]["audit_filters"]["account_id"]
        == "acct_billing"
    )
    assert topup_response.status_code == 200
    topup_payload = topup_response.json()["data"]
    assert topup_payload["receipt"]["event_kind"] == "subscription.topup"
    assert topup_payload["topup"]["pack_id"] == ""
    assert topup_payload["topup"]["reason"] == "operator_overage_buffer"
    assert topup_payload["entitlement_snapshot"]["budgets"]["max_ai_credits_per_period"] == 10000.0
    assert topup_payload["entitlement_snapshot"]["budgets"]["max_runs_per_period"] == 10010.0
    assert topup_payload["entitlement_snapshot"]["budgets"]["max_tokens_per_period"] == 2005000.0
    assert topup_payload["entitlement_snapshot"]["budgets"]["max_cost_cny_per_period"] == 99.0
    assert topup_payload["topup_summary"]["current_period_count"] == 1
    assert topup_payload["topup_summary"]["current_period_totals"]["ai_credits"] == 10000.0
    assert topup_payload["topup_summary"]["current_period_totals"]["runs"] == 10000.0
    assert topup_payload["topup_summary"]["current_period_totals"]["tokens"] == 2000000.0
    assert topup_payload["topup_summary"]["current_period_totals"]["cost_cny"] == 99.0
    assert topup_payload["billing_snapshot_refresh"]["status"] == "refreshed"
    assert topup_payload["billing_snapshot_refresh"]["site_count"] == 1
    assert topup_payload["billing_snapshot_refresh"]["snapshots"][0]["site_id"] == "site_billing"
    assert topup_payload["billing_snapshot_status"]["status"] == "fresh"
    assert topup_payload["billing_snapshot_status"]["next_action"] is None

    admin_subscription_response = client.get(
        "/internal/service/admin/subscriptions/sub_pro_topup",
        headers=build_internal_headers(),
    )
    assert admin_subscription_response.status_code == 200
    admin_subscription = admin_subscription_response.json()["data"]
    assert admin_subscription["topup_summary"]["count"] == 1
    assert admin_subscription["topup_summary"]["latest"]["pack_id"] == ""
    assert admin_subscription["topup_summary"]["latest"]["reason"] == "operator_overage_buffer"
    assert admin_subscription["topup_summary"]["current_period_totals"]["ai_credits"] == 10000.0
    assert admin_subscription["topup_summary"]["current_period_totals"]["cost_cny"] == 99.0
    assert admin_subscription["budget_headroom"]["base_budget"]["ai_credits"] == 0.0
    assert admin_subscription["budget_headroom"]["base_budget"]["runs"] == 10.0
    assert (
        admin_subscription["budget_headroom"]["current_period_topup_delta"]["ai_credits"] == 10000.0
    )
    assert admin_subscription["budget_headroom"]["current_period_topup_delta"]["runs"] == 10000.0
    assert admin_subscription["budget_headroom"]["current_period_topup_delta"]["cost"] == 99.0
    assert admin_subscription["budget_headroom"]["effective_budget"]["ai_credits"] == 10000.0
    assert admin_subscription["budget_headroom"]["effective_budget"]["runs"] == 10010.0
    assert admin_subscription["budget_headroom"]["effective_budget"]["cost"] == 99.0
    assert admin_subscription["budget_headroom"]["cost_currency"] == "CNY"
    assert admin_subscription["billing_snapshot_status"]["status"] == "fresh"
    assert admin_subscription["billing_snapshot_status"]["fresh_site_count"] == 1
    assert admin_subscription["billing_snapshot_status"]["next_action"] is None

    rebuild_subscription_response = client.post(
        "/internal/service/admin/subscriptions/sub_pro_topup/billing-snapshots/rebuild",
        headers=build_internal_headers(idempotency_key="svc-subscription-rebuild-101"),
    )
    assert rebuild_subscription_response.status_code == 200
    rebuild_payload = rebuild_subscription_response.json()["data"]
    assert rebuild_payload["receipt"]["event_kind"] == "subscription.billing_snapshot.rebuild"
    assert rebuild_payload["receipt"]["scope_kind"] == "subscription"
    assert rebuild_payload["receipt"]["scope_id"] == "sub_pro_topup"
    assert (
        rebuild_payload["receipt"]["audit_filters"]["event_kind"]
        == "subscription.billing_snapshot.rebuild"
    )
    assert rebuild_payload["billing_snapshot_refresh"]["status"] == "refreshed"
    assert rebuild_payload["billing_snapshot_refresh"]["site_count"] == 1
    assert rebuild_payload["billing_snapshot_status"]["status"] == "fresh"
    assert rebuild_payload["billing_snapshot_status"]["next_action"] is None

    removed_cost_topup_response = client.post(
        "/internal/service/subscriptions/sub_pro_topup/topup",
        json={
            "target_period_start_at": subscription_response.json()["data"]["subscription"][
                "current_period_start_at"
            ],
            "target_period_end_at": subscription_response.json()["data"]["subscription"][
                "current_period_end_at"
            ],
            "cost_increment": 1,
            "reason": "removed_api_field",
        },
        headers=build_internal_headers(idempotency_key="svc-subscription-topup-removed-cost"),
    )
    assert removed_cost_topup_response.status_code == 422
    assert any(
        detail["loc"][-1] == "cost_increment" and detail["type"] == "extra_forbidden"
        for detail in removed_cost_topup_response.json()["detail"]
    )

    execute_payload = {
        "site_id": "site_billing",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-service-billing-001",
        "input": {"messages": [{"role": "user", "content": "meter this run"}]},
    }
    body = json.dumps(execute_payload).encode("utf-8")
    execute_response = client.post(
        "/v1/runtime/execute",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_billing",
                key_id="key_billing_primary",
                secret="billing-secret",
                idempotency_key="idem-service-billing-001",
                trace_id="traceservicebilling001000000",
                body=body,
            )
        ),
    )
    usage_response = client.get(
        "/internal/service/sites/site_billing/usage-meter?limit=20",
        headers=build_internal_headers(),
    )
    rebuild_response = client.post(
        "/internal/service/sites/site_billing/billing-snapshots/rebuild",
        headers=build_internal_headers(idempotency_key="svc-billing-rebuild-101"),
    )
    list_billing_response = client.get(
        "/internal/service/sites/site_billing/billing-snapshots",
        headers=build_internal_headers(),
    )
    suspend_subscription_response = client.post(
        "/internal/service/admin/accounts/acct_billing/subscription/suspend",
        headers=build_internal_headers(idempotency_key="svc-subscription-suspend-101"),
    )
    cancel_subscription_response = client.post(
        "/internal/service/admin/accounts/acct_billing/subscription/cancel",
        headers=build_internal_headers(idempotency_key="svc-subscription-cancel-101"),
    )
    denied_resolve_response = client.post(
        "/v1/runtime/resolve",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/resolve",
                site_id="site_billing",
                key_id="key_billing_primary",
                secret="billing-secret",
                nonce="svc-billing-deny-nonce-001",
                trace_id="traceservicebillingdeny00100",
                body=body,
            )
        ),
    )
    commercial_decisions_response = client.get(
        "/internal/service/commercial-decisions?site_id=site_billing&limit=10",
        headers=build_internal_headers(),
    )

    assert execute_response.status_code == 200
    assert execute_response.json()["data"]["status"] == "succeeded"
    assert usage_response.status_code == 200
    assert usage_response.json()["data"]["totals"]["runs"] == 1.0
    assert usage_response.json()["data"]["totals"]["provider_calls"] == 1.0
    assert usage_response.json()["data"]["totals"]["tokens_total"] > 0
    assert rebuild_response.status_code == 200
    assert rebuild_response.json()["data"]["totals"]["runs"] == 1.0
    assert (
        rebuild_response.json()["data"]["breakdown"]["ability_families"]["workflow"]["runs"] == 1.0
    )
    assert list_billing_response.status_code == 200
    assert len(list_billing_response.json()["data"]["items"]) == 1
    assert suspend_subscription_response.status_code == 200
    assert suspend_subscription_response.json()["data"]["status"] == "suspended"
    assert (
        suspend_subscription_response.json()["data"]["receipt"]["event_kind"]
        == "subscription.suspend"
    )
    assert (
        suspend_subscription_response.json()["data"]["receipt"]["audit_filters"]["event_kind"]
        == "subscription.suspend"
    )
    assert denied_resolve_response.status_code == 403
    assert denied_resolve_response.json()["error_code"] in {
        "commercial.subscription_inactive",
        "commercial.entitlement_denied",
    }
    assert cancel_subscription_response.status_code == 200
    assert cancel_subscription_response.json()["data"]["status"] == "canceled"
    assert (
        cancel_subscription_response.json()["data"]["receipt"]["event_kind"]
        == "subscription.cancel"
    )
    assert (
        cancel_subscription_response.json()["data"]["receipt"]["audit_filters"]["event_kind"]
        == "subscription.cancel"
    )
    assert commercial_decisions_response.status_code == 200
    decision_items = commercial_decisions_response.json()["data"]["items"]
    assert {item["decision"] for item in decision_items} >= {"allow", "deny"}
    assert {item["request_kind"] for item in decision_items} >= {"execute", "resolve"}
    assert any(item["decision_code"] == "commercial.allowed" for item in decision_items)
    assert any(
        item["decision_code"]
        in {"commercial.subscription_inactive", "commercial.entitlement_denied"}
        for item in decision_items
    )

    dispose_engine(database_url)


def test_service_routes_plan_version_label_conflict_is_readable(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    plan_response = client.post(
        "/internal/service/plans",
        json={"plan_id": "free_conflict", "name": "Free Conflict"},
        headers=build_internal_headers(idempotency_key="svc-plan-conflict-001"),
    )
    first_version_response = client.post(
        "/internal/service/plans/free_conflict/versions",
        json={
            "plan_version_id": "free_conflict_v1",
            "version_label": "v1",
            "budgets": {"max_runs_per_period": 10},
            "concurrency": {"max_active_runs": 1},
        },
        headers=build_internal_headers(idempotency_key="svc-plan-conflict-version-001"),
    )
    conflict_response = client.post(
        "/internal/service/plans/free_conflict/versions",
        json={
            "plan_version_id": "free_conflict_v2",
            "version_label": "v1",
            "budgets": {"max_runs_per_period": 20},
            "concurrency": {"max_active_runs": 2},
        },
        headers=build_internal_headers(idempotency_key="svc-plan-conflict-version-002"),
    )

    assert plan_response.status_code == 200
    assert first_version_response.status_code == 200
    assert conflict_response.status_code == 409
    conflict_payload = conflict_response.json()
    assert conflict_payload["error_code"] == "service.plan_version_label_conflict"
    assert "already has version label 'v1'" in conflict_payload["message"]
    assert "free_conflict_v1" in conflict_payload["message"]

    dispose_engine(database_url)


def test_service_routes_admin_read_facade(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)

    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_admin", "name": "Admin Account"},
        headers=build_internal_headers(idempotency_key="svc-admin-account-001"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_primary",
            "account_id": "acct_admin",
            "name": "Admin Site",
            "status": "provisioning",
        },
        headers=build_internal_headers(idempotency_key="svc-admin-site-001"),
    )
    client.post(
        "/internal/service/sites/site_primary/activate",
        headers=build_internal_headers(idempotency_key="svc-admin-site-activate-001"),
    )
    client.post(
        "/internal/service/accounts/acct_admin/members",
        json={"email": "admin@example.com", "site_id": "site_primary"},
        headers=build_internal_headers(idempotency_key="svc-admin-account-members-001"),
    )
    client.post(
        "/internal/service/sites/site_primary/keys",
        json={
            "key_id": "key_admin_primary",
            "secret": "admin-secret",
            "scopes": ["runtime:execute", "runtime:read", "runtime:resolve", "stats:read"],
            "label": "admin-primary",
        },
        headers=build_internal_headers(idempotency_key="svc-admin-key-001"),
    )
    client.post(
        "/internal/service/plans",
        json={"plan_id": "plan_admin", "name": "Admin Plan"},
        headers=build_internal_headers(idempotency_key="svc-admin-plan-001"),
    )
    client.post(
        "/internal/service/plans/plan_admin/versions",
        json={
            "plan_version_id": "plan_admin_v1",
            "version_label": "v1",
            "entitlements": {
                "ability_families": ["workflow"],
                "channels": ["openapi"],
                "execution_kinds": ["text"],
                "execution_tiers": ["cloud"],
                "data_classifications": ["internal"],
            },
            "budgets": {"max_runs_per_period": 25, "max_tokens_per_period": 12000},
            "concurrency": {"max_active_runs": 3},
        },
        headers=build_internal_headers(idempotency_key="svc-admin-version-001"),
    )
    client.post(
        "/internal/service/admin/accounts/acct_admin/subscription",
        json={
            "subscription_id": "sub_admin",
            "account_id": "acct_admin",
            "plan_id": "plan_admin",
            "plan_version_id": "plan_admin_v1",
            "status": "active",
            "current_period_end_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
        },
        headers=build_internal_headers(idempotency_key="svc-admin-subscription-001"),
    )

    execute_payload = {
        "site_id": "site_primary",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-admin-facade-001",
        "input": {"messages": [{"role": "user", "content": "exercise admin overview"}]},
    }
    body = json.dumps(execute_payload).encode("utf-8")
    execute_response = client.post(
        "/v1/runtime/execute",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_primary",
                key_id="key_admin_primary",
                secret="admin-secret",
                idempotency_key="idem-admin-facade-001",
                trace_id="traceadminfacade001000000",
                body=body,
            )
        ),
    )
    assert execute_response.status_code == 200

    client.post(
        "/internal/service/sites/site_primary/billing-snapshots/rebuild",
        headers=build_internal_headers(idempotency_key="svc-admin-billing-001"),
    )

    def _fail_unbounded_overview_read(*args: object, **kwargs: object) -> None:
        del args, kwargs
        pytest.fail("admin overview must not load unbounded usage, credit, or index detail")

    with monkeypatch.context() as overview_guard:
        overview_guard.setattr(
            CommercialRepository,
            "list_usage_meter_events_for_admin",
            _fail_unbounded_overview_read,
        )
        overview_guard.setattr(
            CommercialRepository,
            "list_credit_ledger_entries",
            _fail_unbounded_overview_read,
        )
        overview_guard.setattr(
            CommercialRepository,
            "summarize_site_knowledge_index_usage",
            _fail_unbounded_overview_read,
        )
        overview_response = client.get(
            "/internal/service/admin/overview",
            headers=build_internal_headers(),
        )
    coverage_work_queue_response = client.get(
        "/internal/service/admin/coverage-work-queue",
        headers=build_internal_headers(),
    )
    filtered_coverage_work_queue_response = client.get(
        "/internal/service/admin/coverage-work-queue",
        params={
            "q": "admin@example.com",
            "status": "warning",
            "reason": "subscription_expiring_soon",
            "sort": "expiry",
            "offset": 0,
            "limit": 1,
        },
        headers=build_internal_headers(),
    )
    accounts_response = client.get(
        "/internal/service/admin/accounts",
        headers=build_internal_headers(),
    )
    account_detail_response = client.get(
        "/internal/service/admin/accounts/acct_admin",
        headers=build_internal_headers(),
    )
    sites_response = client.get(
        "/internal/service/admin/sites",
        headers=build_internal_headers(),
    )
    site_detail_response = client.get(
        "/internal/service/admin/sites/site_primary",
        headers=build_internal_headers(),
    )
    subscriptions_response = client.get(
        "/internal/service/admin/subscriptions",
        headers=build_internal_headers(),
    )
    plans_response = client.get(
        "/internal/service/admin/plans",
        headers=build_internal_headers(),
    )
    plan_detail_response = client.get(
        "/internal/service/admin/plans/plan_admin",
        headers=build_internal_headers(),
    )
    subscription_detail_response = client.get(
        "/internal/service/admin/subscriptions/sub_admin",
        headers=build_internal_headers(),
    )
    package_filtered_accounts_response = client.get(
        "/internal/service/admin/accounts?coverage_state=covered&package_kind=tier_package&top_plan_id=plan_admin",
        headers=build_internal_headers(),
    )
    filtered_sites_response = client.get(
        "/internal/service/admin/sites?account_id=acct_admin&subscription_status=active",
        headers=build_internal_headers(),
    )
    filtered_subscriptions_response = client.get(
        "/internal/service/admin/subscriptions?plan_id=plan_admin",
        headers=build_internal_headers(),
    )
    expiring_accounts_response = client.get(
        "/internal/service/admin/accounts",
        params={"expires_before": (datetime.now(UTC) + timedelta(days=30)).isoformat()},
        headers=build_internal_headers(),
    )
    unauthorized_response = client.get("/internal/service/admin/overview")

    assert overview_response.status_code == 200
    assert overview_response.json()["meta"]["revision"] == "m7"
    overview = overview_response.json()["data"]
    assert overview["counts"]["accounts_total"] == 1
    assert overview["counts"]["principals_active"] == 1
    assert overview["counts"]["sites_active"] == 1
    assert overview["counts"]["site_keys_active"] == 1
    assert overview["recent_usage"]["event_count"] >= 1
    assert "platform_credit_summary" not in overview
    assert "runtime_diagnostics" in overview
    assert overview["operational_readiness"]["status"] == "error"
    assert overview["operational_readiness"]["ok"] is False
    assert overview["operational_readiness"]["checks_failed"] >= 1
    assert "providers" in overview["operational_readiness"]["failure_scopes"]
    assert overview["operational_readiness"]["href"] == "/admin/troubleshooting"
    assert "summary" not in overview["operational_readiness"]
    assert overview["operator_projection"]["revision"] == (
        "admin-overview-operator-projection-v1"
    )
    assert overview["operator_projection"]["status"] == "error"
    assert overview["operator_projection"]["conclusion_code"] == (
        "operational_readiness_blocked"
    )
    assert overview["operator_projection"]["primary_action"] == {
        "kind": "readiness",
        "href": "/admin/troubleshooting",
    }
    assert overview["operator_projection"]["watch_items"][0]["code"] == (
        "operational_readiness_blocked"
    )
    assert overview["runtime_telemetry"]["filters"]["recent_minutes"] == 1440
    assert overview["runtime_telemetry"]["alert_summary"]["status"] in {
        "ok",
        "warning",
        "error",
        "inactive",
    }
    assert (
        overview["runtime_telemetry"]["alert_summary"]["boundary"]["direct_wordpress_write"]
        is False
    )
    assert "hosted_model_governance" not in overview
    assert overview["runtime_operator_explanations"]
    assert len(overview["expiring_subscriptions"]["items"]) >= 1
    assert any(
        item["subscription"]["account_id"] == "acct_admin"
        for item in overview["expiring_subscriptions"]["items"]
    )
    assert overview["expiring_subscriptions"]["within_30_days_expires_before"]
    assert overview["attention_subscriptions"] == []

    assert coverage_work_queue_response.status_code == 200
    coverage_queue = coverage_work_queue_response.json()["data"]
    assert coverage_queue["summary"]["total"] == 1
    assert coverage_queue["summary"]["needs_action"] == 1
    coverage_item = coverage_queue["items"][0]
    assert coverage_item["account"]["account_id"] == "acct_admin"
    assert coverage_item["primary_subscription"]["subscription_id"] == "sub_admin"
    assert coverage_item["package"]["display_package_label"] == "Pro"
    assert coverage_item["severity"] == "warning"
    assert coverage_item["reason_code"] == "subscription_expiring_soon"
    assert coverage_item["recommended_action"] == "review_renewal"
    assert coverage_item["action_href"] == "/admin/subscriptions/sub_admin"
    assert coverage_item["evidence"]["site_count"] == 1
    assert coverage_item["evidence"]["active_key_site_count"] == 1
    assert coverage_item["evidence"]["billing_snapshot_status"]["status"] == "fresh"
    assert filtered_coverage_work_queue_response.status_code == 200
    filtered_coverage_queue = filtered_coverage_work_queue_response.json()["data"]
    assert filtered_coverage_queue["filters"] == {
        "q": "admin@example.com",
        "status": "warning",
        "reason": "subscription_expiring_soon",
        "sort": "expiry",
        "offset": 0,
        "limit": 1,
    }
    assert filtered_coverage_queue["pagination"] == {
        "offset": 0,
        "limit": 1,
        "total": 1,
        "has_more": False,
    }
    assert filtered_coverage_queue["summary"]["total"] == 1
    assert filtered_coverage_queue["items"][0]["account"]["account_id"] == "acct_admin"

    assert accounts_response.status_code == 200
    accounts_data = accounts_response.json()["data"]
    accounts = accounts_data["items"]
    assert accounts_data["pagination"]["total"] == 1
    assert accounts_data["pagination"]["has_more"] is False
    assert len(accounts) == 1
    assert accounts[0]["account"]["account_id"] == "acct_admin"
    assert accounts[0]["site_count"] == 1
    assert accounts[0]["active_subscription_count"] >= 1
    assert accounts[0]["display_package_label"] == "Pro"
    assert accounts[0]["package_kind"] == "tier_package"
    assert accounts[0]["coverage_state"] == "covered"
    assert accounts[0]["primary_subscription_id"] == "sub_admin"
    assert account_detail_response.status_code == 200
    account_detail = account_detail_response.json()["data"]
    assert account_detail["identity_relationship_state"] == "healthy"
    assert account_detail["primary_identity"]["email"] == "admin@example.com"
    assert package_filtered_accounts_response.status_code == 200
    assert (
        package_filtered_accounts_response.json()["data"]["filters"]["coverage_state"] == "covered"
    )
    assert (
        package_filtered_accounts_response.json()["data"]["filters"]["package_kind"]
        == "tier_package"
    )
    assert (
        package_filtered_accounts_response.json()["data"]["filters"]["top_plan_id"] == "plan_admin"
    )
    assert len(package_filtered_accounts_response.json()["data"]["items"]) == 1

    assert account_detail_response.status_code == 200
    account_detail = account_detail_response.json()["data"]
    assert len(account_detail["sites"]) == 1
    assert len(account_detail["subscriptions"]) >= 1

    suspend_account_response = client.post(
        "/internal/service/admin/accounts/acct_admin/suspend",
        json={"reason": "billing review"},
        headers=build_internal_headers(idempotency_key="svc-admin-account-suspend-001"),
    )
    assert suspend_account_response.status_code == 200
    assert suspend_account_response.json()["data"]["status"] == "suspended"
    assert (
        suspend_account_response.json()["data"]["metadata"]["account_status_note"]
        == "billing review"
    )
    assert suspend_account_response.json()["data"]["receipt"]["event_kind"] == "account.suspend"

    suspended_account_detail_response = client.get(
        "/internal/service/admin/accounts/acct_admin",
        headers=build_internal_headers(),
    )
    assert suspended_account_detail_response.status_code == 200
    assert suspended_account_detail_response.json()["data"]["account"]["status"] == "suspended"
    assert (
        suspended_account_detail_response.json()["data"]["account"]["metadata"][
            "account_status_note"
        ]
        == "billing review"
    )

    restore_account_response = client.post(
        "/internal/service/admin/accounts/acct_admin/restore",
        headers=build_internal_headers(idempotency_key="svc-admin-account-restore-001"),
    )
    assert restore_account_response.status_code == 200
    assert restore_account_response.json()["data"]["status"] == "active"
    assert restore_account_response.json()["data"]["receipt"]["event_kind"] == "account.restore"

    assert sites_response.status_code == 200
    sites = sites_response.json()["data"]["items"]
    assert len(sites) == 1
    assert sites[0]["site"]["site_id"] == "site_primary"
    assert sites[0]["active_key_count"] == 1
    assert sites[0]["coverage"]["covered_by_subscription_id"]
    assert sites[0]["coverage"]["subscription_status"] == "active"
    assert filtered_sites_response.status_code == 200
    assert filtered_sites_response.json()["data"]["filters"]["account_id"] == "acct_admin"
    assert filtered_sites_response.json()["data"]["filters"]["subscription_status"] == "active"
    assert len(filtered_sites_response.json()["data"]["items"]) == 1

    assert site_detail_response.status_code == 200
    site_detail = site_detail_response.json()["data"]
    assert site_detail["site"]["site_id"] == "site_primary"
    assert len(site_detail["site_keys"]) == 1
    assert site_detail["subscription"]["account_id"] == "acct_admin"
    assert site_detail["usage_meter"]["totals"]["runs"] >= 1
    assert site_detail["billing_reconciliation"]["site_id"] == "site_primary"
    assert site_detail["commercial_policy"]["policy"]["subscription"]["grace_period_days"] == 0
    assert "runtime_diagnostics" in site_detail
    assert site_detail["related_surfaces"]["account_href"] == "/admin/accounts/acct_admin"
    assert "/admin/subscriptions/" in site_detail["related_surfaces"]["subscription_href"]
    assert site_detail["commercial_follow_up"]["next_operator_follow_up"]
    assert site_detail["runtime_operator_explanations"]

    assert subscriptions_response.status_code == 200
    subscriptions_data = subscriptions_response.json()["data"]
    subscriptions = subscriptions_data["items"]
    assert subscriptions_data["pagination"]["total"] >= 1
    assert subscriptions_data["pagination"]["offset"] == 0
    assert subscriptions_data["pagination"]["has_more"] is False
    assert len(subscriptions) >= 1
    assert any(item["subscription"]["subscription_id"] == "sub_admin" for item in subscriptions)
    assert all(
        item["account"]["account_id"] == "acct_admin"
        for item in subscriptions
        if item.get("account")
    )
    assert any(
        any(site["site_id"] == "site_primary" for site in item.get("covered_sites") or [])
        for item in subscriptions
    )
    subscription_summary = next(
        item for item in subscriptions if item["subscription"]["subscription_id"] == "sub_admin"
    )
    assert subscription_summary["billing_snapshot_status"]["status"] == "fresh"
    assert subscription_summary["billing_snapshot_status"]["fresh_site_count"] == 1
    assert subscription_summary["billing_snapshot_status"]["stale_site_count"] == 0
    assert subscription_summary["billing_snapshot_status"]["missing_site_count"] == 0
    assert plans_response.status_code == 200
    plans = plans_response.json()["data"]["items"]
    tier_templates = plans_response.json()["data"]["tier_templates"]
    tier_template_by_id = {item["tier_id"]: item for item in tier_templates}
    assert len(plans) >= 1
    assert [item["tier_id"] for item in tier_templates] == ["free", "plus", "pro", "agency"]
    assert tier_template_by_id["free"]["package_alias"] == "Free"
    assert tier_template_by_id["free"]["monthly_included_points"] == 300
    assert tier_template_by_id["plus"]["monthly_included_points"] == 3000
    assert tier_template_by_id["pro"]["monthly_included_points"] == 10000
    assert tier_template_by_id["agency"]["monthly_included_points"] == 150000
    assert tier_template_by_id["free"]["site_limit"] == 1
    assert tier_template_by_id["plus"]["site_limit"] == 3
    assert tier_template_by_id["pro"]["site_limit"] == 5
    assert tier_template_by_id["agency"]["site_limit"] == 25
    assert tier_template_by_id["free"]["max_vector_documents"] == 100
    assert tier_template_by_id["plus"]["max_vector_documents"] == 800
    assert tier_template_by_id["pro"]["max_vector_documents"] == 2000
    assert tier_template_by_id["agency"]["max_vector_documents"] == 10000
    assert tier_template_by_id["agency"]["concurrency_template"]["max_active_runs"] == 10
    assert tier_template_by_id["free"]["canonical_shell"]["entitlements"]["execution_tiers"] == [
        "cloud"
    ]
    assert (
        tier_template_by_id["pro"]["canonical_shell"]["budgets"]["max_ai_credits_per_period"]
        == 10000
    )
    assert tier_template_by_id["pro"]["canonical_shell"]["budgets"]["max_runs_per_period"] == 0
    assert tier_template_by_id["pro"]["canonical_shell"]["metadata"]["max_batch_items"] == 25
    assert (
        tier_template_by_id["pro"]["canonical_shell"]["metadata"][
            "nightly_inspection_runs_per_period"
        ]
        == 0
    )
    assert tier_template_by_id["agency"]["canonical_shell"]["metadata"]["max_batch_items"] == 100
    assert (
        tier_template_by_id["agency"]["canonical_shell"]["metadata"][
            "nightly_inspection_runs_per_period"
        ]
        == 0
    )
    admin_plan_summary = next(item for item in plans if item["plan"]["plan_id"] == "plan_admin")
    assert admin_plan_summary["tier_summary"]["tier_id"] == "pro"
    assert admin_plan_summary["tier_summary"]["label"] == "Pro"
    assert admin_plan_summary["tier_summary"]["package_alias"] == "Pro"
    assert admin_plan_summary["tier_summary"]["monthly_included_points"] == 10000
    assert admin_plan_summary["tier_summary"]["site_limit"] == 5
    assert admin_plan_summary["tier_summary"]["max_vector_documents"] == 2000
    assert admin_plan_summary["tier_summary"]["max_batch_items"] == 25
    assert admin_plan_summary["tier_summary"]["nightly_inspection_runs_per_period"] == 0
    assert admin_plan_summary["tier_summary"]["nightly_inspection_retention_days"] == 14
    assert admin_plan_summary["tier_summary"]["automation_enabled"] is True
    assert admin_plan_summary["tier_summary"]["api_enabled"] is True
    assert admin_plan_summary["tier_summary"]["openclaw_enabled"] is True
    assert "ai credits" in admin_plan_summary["tier_summary"]["package_operator_note"].lower()
    assert admin_plan_summary["latest_version"]["plan_version_id"] == "plan_admin_v1"
    assert admin_plan_summary["published_version_count"] == 1
    assert plan_detail_response.status_code == 200
    plan_detail = plan_detail_response.json()["data"]
    assert plan_detail["plan"]["plan_id"] == "plan_admin"
    assert plan_detail["tier_summary"]["tier_id"] == "pro"
    assert plan_detail["tier_summary"]["package_alias"] == "Pro"
    assert plan_detail["tier_summary"]["monthly_included_points"] == 10000
    assert plan_detail["tier_summary"]["site_limit"] == 5
    assert plan_detail["tier_summary"]["max_vector_documents"] == 2000
    assert plan_detail["tier_summary"]["max_batch_items"] == 25
    assert plan_detail["tier_summary"]["nightly_inspection_runs_per_period"] == 0
    assert plan_detail["tier_summary"]["nightly_inspection_retention_days"] == 14
    assert plan_detail["tier_summary"]["automation_enabled"] is True
    assert plan_detail["tier_summary"]["api_enabled"] is True
    assert plan_detail["tier_summary"]["openclaw_enabled"] is True
    assert plan_detail["tier_summary"]["concurrency_template"]["max_active_runs"] == 3
    assert plan_detail["latest_version"]["plan_version_id"] == "plan_admin_v1"
    assert plan_detail["package_fit_cues"]
    cue_codes = {item["code"] for item in plan_detail["package_fit_cues"]}
    assert "package_fit.cost_ceiling_missing" in cue_codes
    assert subscription_detail_response.status_code == 200
    subscription_detail = subscription_detail_response.json()["data"]
    assert subscription_detail["subscription"]["subscription_id"] == "sub_admin"
    assert subscription_detail["account"]["account_id"] == "acct_admin"
    assert subscription_detail["covered_sites"][0]["site_id"] == "site_primary"
    assert subscription_detail["plan"]["plan_id"] == "plan_admin"
    assert subscription_detail["plan_version"]["plan_version_id"] == "plan_admin_v1"
    assert subscription_detail["commercial_policy"]["subscription"]["grace_period_days"] == 0
    assert "runs" in subscription_detail["budget_state"]
    assert "tokens" in subscription_detail["budget_state"]
    assert "cost" in subscription_detail["budget_state"]
    assert subscription_detail["subscription_grace"]["subscription_status"] == "active"
    assert subscription_detail["usage_totals"]["runs"] >= 1
    assert subscription_detail["usage_totals"]["cost_cny_snapshot_missing_count"] == 0.0
    assert subscription_detail["related_surfaces"]["site_href"] in {"", "/admin/sites/site_primary"}
    assert subscription_detail["related_surfaces"]["account_href"] == "/admin/accounts/acct_admin"
    assert subscription_detail["commercial_follow_up"]["next_operator_follow_up"]
    assert filtered_subscriptions_response.status_code == 200
    assert filtered_subscriptions_response.json()["data"]["filters"]["plan_id"] == "plan_admin"
    assert len(filtered_subscriptions_response.json()["data"]["items"]) == 1
    assert (
        filtered_subscriptions_response.json()["data"]["items"][0]["billing_snapshot_status"][
            "status"
        ]
        == "fresh"
    )
    assert expiring_accounts_response.status_code == 200
    assert len(expiring_accounts_response.json()["data"]["items"]) == 1

    assert unauthorized_response.status_code == 401
    assert unauthorized_response.json()["error_code"] == "auth.internal_token_required"

    dispose_engine(database_url)


def test_service_routes_plan_tier_fallback_and_package_fit_cues(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    create_plan_responses = [
        client.post(
            "/internal/service/plans",
            json={
                "plan_id": "free_ops",
                "name": "Free Ops",
                "metadata": {"tier_id": "free"},
            },
            headers=build_internal_headers(idempotency_key="svc-tier-plan-free-001"),
        ),
        client.post(
            "/internal/service/plans",
            json={"plan_id": "plan_version_tier", "name": "Version Tier Plan"},
            headers=build_internal_headers(idempotency_key="svc-tier-plan-version-001"),
        ),
        client.post(
            "/internal/service/plans",
            json={"plan_id": "agency_ops", "name": "Agency Operations"},
            headers=build_internal_headers(idempotency_key="svc-tier-plan-name-001"),
        ),
        client.post(
            "/internal/service/plans",
            json={"plan_id": "general_ops", "name": "General Operations"},
            headers=build_internal_headers(idempotency_key="svc-tier-plan-default-001"),
        ),
    ]
    assert all(response.status_code == 200 for response in create_plan_responses)

    create_version_responses = [
        client.post(
            "/internal/service/plans/free_ops/versions",
            json={
                "plan_version_id": "free_ops_v1",
                "version_label": "v1",
                "budgets": {
                    "max_runs_per_period": 100,
                    "max_tokens_per_period": 50_000,
                },
                "concurrency": {"max_active_runs": 1},
                "metadata": {"tier_id": "agency"},
            },
            headers=build_internal_headers(idempotency_key="svc-tier-version-free-001"),
        ),
        client.post(
            "/internal/service/plans/plan_version_tier/versions",
            json={
                "plan_version_id": "plan_version_tier_v1",
                "version_label": "v1",
                "budgets": {
                    "max_runs_per_period": 8_000,
                    "max_tokens_per_period": 6_000_000,
                    "max_cost_cny_per_period": 220,
                },
                "concurrency": {"max_active_runs": 12},
                "metadata": {"tier_id": "agency"},
            },
            headers=build_internal_headers(idempotency_key="svc-tier-version-agency-001"),
        ),
        client.post(
            "/internal/service/plans/agency_ops/versions",
            json={
                "plan_version_id": "agency_ops_v1",
                "version_label": "v1",
                "budgets": {
                    "max_runs_per_period": 12_000,
                    "max_tokens_per_period": 9_000_000,
                    "max_cost_cny_per_period": 260,
                },
                "concurrency": {"max_active_runs": 18},
            },
            headers=build_internal_headers(idempotency_key="svc-tier-version-name-001"),
        ),
        client.post(
            "/internal/service/plans/general_ops/versions",
            json={
                "plan_version_id": "general_ops_v1",
                "version_label": "v1",
                "budgets": {
                    "max_runs_per_period": 10_000,
                    "max_tokens_per_period": 2_000_000,
                    "max_cost_cny_per_period": 99,
                },
                "concurrency": {"max_active_runs": 2},
            },
            headers=build_internal_headers(idempotency_key="svc-tier-version-default-001"),
        ),
    ]
    assert all(response.status_code == 200 for response in create_version_responses)

    plans_response = client.get(
        "/internal/service/admin/plans",
        headers=build_internal_headers(),
    )
    free_detail_response = client.get(
        "/internal/service/admin/plans/free_ops",
        headers=build_internal_headers(),
    )
    version_tier_detail_response = client.get(
        "/internal/service/admin/plans/plan_version_tier",
        headers=build_internal_headers(),
    )
    name_tier_detail_response = client.get(
        "/internal/service/admin/plans/agency_ops",
        headers=build_internal_headers(),
    )
    default_tier_detail_response = client.get(
        "/internal/service/admin/plans/general_ops",
        headers=build_internal_headers(),
    )

    assert plans_response.status_code == 200
    plans = {item["plan"]["plan_id"]: item for item in plans_response.json()["data"]["items"]}
    assert plans["free_ops"]["tier_summary"]["tier_id"] == "free"
    assert plans["free_ops"]["tier_summary"]["package_alias"] == "Free"
    assert plans["free_ops"]["tier_summary"]["monthly_included_points"] == 300
    assert plans["free_ops"]["tier_summary"]["site_limit"] == 1
    assert plans["free_ops"]["tier_summary"]["max_vector_documents"] == 100
    assert plans["free_ops"]["tier_summary"]["max_batch_items"] == 5
    assert plans["free_ops"]["tier_summary"]["automation_enabled"] is True
    assert plans["free_ops"]["tier_summary"]["api_enabled"] is True
    assert plans["free_ops"]["tier_summary"]["openclaw_enabled"] is True
    assert plans["plan_version_tier"]["tier_summary"]["tier_id"] == "agency"
    assert plans["plan_version_tier"]["tier_summary"]["package_alias"] == "Agency"
    assert plans["plan_version_tier"]["tier_summary"]["monthly_included_points"] == 150000
    assert plans["plan_version_tier"]["tier_summary"]["max_vector_documents"] == 10000
    assert plans["plan_version_tier"]["tier_summary"]["max_batch_items"] == 100
    assert plans["plan_version_tier"]["tier_summary"]["nightly_inspection_runs_per_period"] == 0
    assert plans["plan_version_tier"]["tier_summary"]["openclaw_enabled"] is True
    assert plans["agency_ops"]["tier_summary"]["tier_id"] == "agency"
    assert plans["general_ops"]["tier_summary"]["tier_id"] == "pro"
    assert plans["general_ops"]["tier_summary"]["max_vector_documents"] == 2000
    assert plans["general_ops"]["tier_summary"]["max_batch_items"] == 25
    assert plans["general_ops"]["tier_summary"]["nightly_inspection_runs_per_period"] == 0

    assert free_detail_response.status_code == 200
    free_detail = free_detail_response.json()["data"]
    assert free_detail["tier_summary"]["tier_id"] == "free"
    assert free_detail["tier_summary"]["package_alias"] == "Free"
    assert free_detail["tier_summary"]["monthly_included_points"] == 300
    assert free_detail["tier_summary"]["max_vector_documents"] == 100
    assert free_detail["tier_summary"]["budgets_template"]["max_ai_credits_per_period"] == 300
    free_cue_codes = {item["code"] for item in free_detail["package_fit_cues"]}
    assert "package_fit.cost_ceiling_missing" in free_cue_codes

    assert version_tier_detail_response.status_code == 200
    version_tier_detail = version_tier_detail_response.json()["data"]
    assert version_tier_detail["tier_summary"]["tier_id"] == "agency"
    assert version_tier_detail["tier_summary"]["package_alias"] == "Agency"
    assert version_tier_detail["tier_summary"]["openclaw_enabled"] is True

    assert name_tier_detail_response.status_code == 200
    name_tier_detail = name_tier_detail_response.json()["data"]
    assert name_tier_detail["tier_summary"]["tier_id"] == "agency"

    assert default_tier_detail_response.status_code == 200
    default_tier_detail = default_tier_detail_response.json()["data"]
    assert default_tier_detail["tier_summary"]["tier_id"] == "pro"
    assert default_tier_detail["tier_summary"]["package_alias"] == "Pro"
    assert default_tier_detail["tier_summary"]["automation_enabled"] is True
    assert default_tier_detail["tier_summary"]["api_enabled"] is True
    assert default_tier_detail["tier_summary"]["openclaw_enabled"] is True
    assert default_tier_detail["package_fit_cues"][0]["code"] == "package_fit.within_band"

    removed_budget_response = client.post(
        "/internal/service/plans/general_ops/versions",
        json={
            "plan_version_id": "general_ops_removed_usd_budget",
            "version_label": "removed-usd-budget",
            "budgets": {"max_cost_per_period": 99},
        },
        headers=build_internal_headers(idempotency_key="svc-tier-version-removed-usd-budget"),
    )
    assert removed_budget_response.status_code == 400
    assert (
        removed_budget_response.json()["error_code"]
        == "service.plan_budget_legacy_cost_field_removed"
    )

    dispose_engine(database_url)


def test_admin_subscriptions_queue_sorts_and_summarizes_globally_before_pagination(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    now = datetime.now(UTC)
    fixtures = [
        {
            "subscription_id": "sub_queue_critical",
            "account_id": "acct_queue_delta",
            "account_name": "Delta Critical",
            "status": "past_due",
            "period_end_at": now - timedelta(days=1),
            "created_at": now - timedelta(days=4),
        },
        {
            "subscription_id": "sub_queue_warning",
            "account_id": "acct_queue_alpha",
            "account_name": "Alpha Warning",
            "status": "active",
            "period_end_at": now + timedelta(days=7),
            "created_at": now - timedelta(days=3),
        },
        {
            "subscription_id": "sub_queue_monitor",
            "account_id": "acct_queue_charlie",
            "account_name": "Charlie Monitor",
            "status": "trialing",
            "period_end_at": now + timedelta(days=30),
            "created_at": now - timedelta(days=2),
        },
        {
            "subscription_id": "sub_queue_stable",
            "account_id": "acct_queue_bravo",
            "account_name": "Bravo Stable",
            "status": "active",
            "period_end_at": None,
            "created_at": now - timedelta(days=1),
        },
    ]
    with get_session(database_url) as session:
        for fixture in fixtures:
            session.add(
                Account(
                    account_id=fixture["account_id"],
                    name=fixture["account_name"],
                    status="active",
                    metadata_json={},
                )
            )
            session.add(
                AccountSubscription(
                    subscription_id=fixture["subscription_id"],
                    account_id=fixture["account_id"],
                    plan_id="queue_plan",
                    plan_version_id="queue_plan_v1",
                    status=fixture["status"],
                    current_period_start_at=now - timedelta(days=30),
                    current_period_end_at=fixture["period_end_at"],
                    started_at=now - timedelta(days=30),
                    metadata_json={},
                    created_at=fixture["created_at"],
                    updated_at=fixture["created_at"],
                )
            )
        session.add(
            Site(
                site_id="site_queue_critical",
                account_id="acct_queue_delta",
                name="Critical Site",
                status="active",
                site_url="https://critical.example.test",
                platform_kind="wordpress",
                metadata_json={},
            )
        )
        session.commit()

    priority_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"sort": "priority", "limit": 1},
        headers=build_internal_headers(),
    )
    assert priority_response.status_code == 200
    priority_data = priority_response.json()["data"]
    assert priority_data["filters"]["sort"] == "priority"
    assert priority_data["total"] == 4
    assert priority_data["pagination"] == {
        "offset": 0,
        "limit": 1,
        "total": 4,
        "has_more": True,
    }
    assert priority_data["summary"] == {
        "critical": 1,
        "warning": 1,
        "monitor": 1,
        "stable": 1,
    }
    assert priority_data["items"][0]["subscription"]["subscription_id"] == ("sub_queue_critical")
    assert priority_data["items"][0]["operator_risk"] == {
        "level": "critical",
        "reason_code": "past_due",
    }

    customer_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"sort": "customer", "limit": 4},
        headers=build_internal_headers(),
    )
    assert customer_response.status_code == 200
    assert [item["account"]["name"] for item in customer_response.json()["data"]["items"]] == [
        "Alpha Warning",
        "Bravo Stable",
        "Charlie Monitor",
        "Delta Critical",
    ]

    expiry_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"sort": "expiry", "limit": 4},
        headers=build_internal_headers(),
    )
    assert expiry_response.status_code == 200
    assert [
        item["subscription"]["subscription_id"] for item in expiry_response.json()["data"]["items"]
    ] == [
        "sub_queue_critical",
        "sub_queue_warning",
        "sub_queue_monitor",
        "sub_queue_stable",
    ]

    active_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"status": "active", "sort": "priority"},
        headers=build_internal_headers(),
    )
    assert active_response.status_code == 200
    assert active_response.json()["data"]["summary"] == {
        "critical": 0,
        "warning": 1,
        "monitor": 0,
        "stable": 1,
    }

    needs_action_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"risk": "needs_action", "sort": "priority"},
        headers=build_internal_headers(),
    )
    assert needs_action_response.status_code == 200
    needs_action_data = needs_action_response.json()["data"]
    assert needs_action_data["filters"]["risk"] == "needs_action"
    assert needs_action_data["total"] == 3
    assert needs_action_data["summary"] == {
        "critical": 1,
        "warning": 1,
        "monitor": 1,
        "stable": 1,
    }
    assert [item["operator_risk"]["level"] for item in needs_action_data["items"]] == [
        "critical",
        "warning",
        "monitor",
    ]

    stable_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"risk": "stable"},
        headers=build_internal_headers(),
    )
    assert stable_response.status_code == 200
    assert stable_response.json()["data"]["total"] == 1
    assert stable_response.json()["data"]["items"][0]["operator_risk"]["level"] == "stable"

    invalid_sort_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"sort": "newest"},
        headers=build_internal_headers(),
    )
    assert invalid_sort_response.status_code == 422
    with pytest.raises(
        CommercialValidationError,
        match="subscription sort must be one of",
    ):
        CommercialService(database_url).list_admin_subscriptions(sort="newest")

    invalid_risk_response = client.get(
        "/internal/service/admin/subscriptions",
        params={"risk": "unknown"},
        headers=build_internal_headers(),
    )
    assert invalid_risk_response.status_code == 422
    with pytest.raises(
        CommercialValidationError,
        match="subscription risk must be one of",
    ):
        CommercialService(database_url).list_admin_subscriptions(risk="unknown")

    monkeypatch.setattr(billing_mixin, "ADMIN_SUBSCRIPTION_QUEUE_MAX_SUBSCRIPTIONS", 3)
    with pytest.raises(
        CommercialValidationError,
        match="subscription queue scope exceeds",
    ):
        CommercialService(database_url).list_admin_subscriptions()

    monkeypatch.setattr(billing_mixin, "ADMIN_SUBSCRIPTION_QUEUE_MAX_SUBSCRIPTIONS", 500)
    monkeypatch.setattr(billing_mixin, "ADMIN_SUBSCRIPTION_QUEUE_MAX_SITES", 0)
    with pytest.raises(
        CommercialValidationError,
        match="subscription queue site scope exceeds",
    ):
        CommercialService(database_url).list_admin_subscriptions()

    dispose_engine(database_url)


def test_service_routes_removed_platform_admin_grant_routes(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    response = client.post(
        "/internal/service/platform-admin-identities",
        json={
            "principal_id": "platform:founder",
            "role": "platform_admin",
            "email": "founder@example.com",
            "provider": "manual",
        },
        headers=build_internal_headers(idempotency_key="svc-platform-admin-001"),
    )

    assert response.status_code == 404

    delete_response = client.delete(
        "/internal/service/platform-admin-identities/platform:founder",
        headers=build_internal_headers(idempotency_key="svc-platform-admin-delete-001"),
    )

    assert delete_response.status_code == 404

    missing_response = client.delete(
        "/internal/service/platform-admin-identities/platform:founder",
        headers=build_internal_headers(idempotency_key="svc-platform-admin-delete-002"),
    )

    assert missing_response.status_code == 404

    dispose_engine(database_url)


def test_admin_account_quota_summary_reports_ai_credits_and_resource_limits(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_quota",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={
            "max_ai_credits_per_period": 20,
            "max_runs_per_period": 10,
            "max_tokens_per_period": 5000,
        },
        concurrency={"max_active_runs": 1},
    )
    concurrency_queries: list[tuple[str, ...] | None] = []

    def count_active_runs_by_site(
        _self: object,
        *,
        site_ids: list[str],
        execution_patterns: tuple[str, ...] | None = None,
    ) -> dict[str, int]:
        assert site_ids == ["site_quota"]
        concurrency_queries.append(execution_patterns)
        return {"site_quota": 1}

    monkeypatch.setattr(
        "app.adapters.repositories.commercial_runtime_knowledge_queries."
        "CommercialRuntimeKnowledgeQueries.count_active_runs_by_site",
        count_active_runs_by_site,
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_quota")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None
        events = [
            UsageMeterEvent(
                account_id="acct_site_quota",
                site_id="site_quota",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                run_id="run-quota-1",
                provider_call_id=None,
                event_kind="runtime.run",
                meter_key="runs",
                quantity=2,
                ability_family="text",
                channel="api",
                execution_kind="text",
                execution_tier="cloud",
                data_classification="internal",
                currency=None,
                dedupe_key="quota-summary-runs",
                payload_json={},
                created_at=now,
            ),
            UsageMeterEvent(
                account_id="acct_site_quota",
                site_id="site_quota",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                run_id="run-quota-1",
                provider_call_id=None,
                event_kind="runtime.tokens",
                meter_key="tokens_total",
                quantity=1500,
                ability_family="text",
                channel="api",
                execution_kind="text",
                execution_tier="cloud",
                data_classification="internal",
                currency=None,
                dedupe_key="quota-summary-tokens",
                payload_json={},
                created_at=now,
            ),
            UsageMeterEvent(
                account_id="acct_site_quota",
                site_id="site_quota",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                run_id="run-quota-1",
                provider_call_id=None,
                event_kind="provider.call",
                meter_key="provider_calls",
                quantity=1,
                ability_family="tool",
                channel="api",
                execution_kind="web_search",
                execution_tier="cloud",
                data_classification="internal",
                currency=None,
                dedupe_key="quota-summary-search",
                payload_json={},
                created_at=now,
            ),
        ]
        session.add_all(events)
        session.commit()

    response = client.get(
        "/internal/service/admin/accounts/acct_site_quota/quota-summary",
        headers=build_internal_headers(),
    )
    unauthenticated = client.get(
        "/internal/service/admin/accounts/acct_site_quota/quota-summary",
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["account_id"] == "acct_site_quota"
    assert data["ai_credits"]["key"] == "ai_credits"
    assert data["ai_credits"]["used"] == 9.0
    assert data["ai_credits"]["limit"] == 20.0
    assert data["ai_credits"]["remaining"] == 11.0
    assert data["ai_credits"]["status"] == "ok"
    assert data["ai_credits"]["estimated"] is True
    assert data["ai_credits"]["rate_version"] == "ai-credit-estimate-v2"
    assert data["ai_credit_policy"]["rate_version"] == "ai-credit-ledger-v2"
    assert data["ai_credit_policy"]["renewal_policy"] == "monthly_plan_grant_resets_each_period"
    assert {item["key"]: item["ai_credits"] for item in data["breakdown"]} == {
        "runs": 2.0,
        "tokens_total": 2,
        "web_search": 5.0,
    }
    resource_limits = {item["key"]: item for item in data["resource_limits"]}
    assert resource_limits["bound_sites"]["used"] == 1.0
    assert resource_limits["bound_sites"]["limit"] == 3.0
    assert resource_limits["active_sites"]["used"] == 1.0
    assert resource_limits["active_sites"]["limit"] == 1.0
    assert resource_limits["active_api_key_sites"]["used"] == 1.0
    assert resource_limits["concurrent_runs"]["used"] == 2.0
    assert resource_limits["concurrent_runs"]["limit"] == 2.0
    assert resource_limits["concurrent_runs"]["status"] == "limited"
    assert concurrency_queries == [
        ("inline",),
        ("step_offload", "whole_run_offload"),
    ]
    assert resource_limits["vector_documents"]["unit"] == "document"
    assert resource_limits["vector_documents"]["limit"] == 100.0
    assert data["coverage"]["active_key_site_count"] == 1


def test_account_quota_summary_shares_ai_credits_across_sites(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_shared_primary",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={"max_ai_credits_per_period": 20},
    )
    seed_site_auth(
        database_url,
        site_id="site_shared_secondary",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        primary_subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_shared_primary")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert primary_subscription is not None
        secondary_site = session.get(Site, "site_shared_secondary")
        assert secondary_site is not None
        secondary_site.account_id = "acct_site_shared_primary"
        repository = CommercialRepository(session)
        for site_id, delta in (
            ("site_shared_primary", -3.0),
            ("site_shared_secondary", -4.0),
        ):
            repository.record_credit_ledger_entry(
                account_id="acct_site_shared_primary",
                site_id=site_id,
                subscription_id=primary_subscription.subscription_id,
                plan_version_id=primary_subscription.plan_version_id,
                run_id=f"run_{site_id}",
                provider_call_id=None,
                event_type="consume",
                source_type="tokens_total",
                source_id=f"{site_id}:tokens",
                ai_credit_delta=delta,
                quantity=abs(delta),
                unit="ai_credits",
                rate=1.0,
                rate_unit=None,
                rate_version="ai-credit-ledger-v2",
                idempotency_key=f"{site_id}:credit-share",
                metadata_json={"source": "account_shared_credit_test"},
                created_at=now,
            )
        session.commit()

    response = client.get(
        "/internal/service/admin/accounts/acct_site_shared_primary/quota-summary",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["ai_credits"]["used"] == 7.0
    assert data["ai_credits"]["limit"] == 20.0
    assert data["ai_credits"]["remaining"] == 13.0
    assert data["ai_credits"]["source"] == "ledger"
    assert data["ai_credit_ledger_summary"]["net_used_ai_credits"] == 7.0


def test_admin_account_credit_ledger_lists_current_period_entries(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_credit_ledger",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={"max_ai_credits_per_period": 20},
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_credit_ledger")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None
        repository = CommercialRepository(session)
        repository.record_credit_ledger_entry(
            account_id="acct_site_credit_ledger",
            site_id="site_credit_ledger",
            subscription_id=subscription.subscription_id,
            plan_version_id=subscription.plan_version_id,
            run_id="run-credit-ledger-1",
            provider_call_id=None,
            source_type="tokens_total",
            source_id="run-credit-ledger-1:tokens",
            ai_credit_delta=-2,
            quantity=1500,
            unit="token",
            rate=1,
            rate_unit="1000_tokens_rounded_up",
            rate_version="ai-credit-ledger-v2",
            idempotency_key="credit-ledger-tokens-001",
            created_at=now,
        )
        repository.record_credit_ledger_entry(
            account_id="acct_site_credit_ledger",
            site_id="site_credit_ledger",
            subscription_id=subscription.subscription_id,
            plan_version_id=subscription.plan_version_id,
            run_id="run-credit-ledger-1",
            provider_call_id=None,
            source_type="vector_chunks",
            source_id="run-credit-ledger-1:chunks",
            ai_credit_delta=-2,
            quantity=11,
            unit="chunk",
            rate=1,
            rate_unit="10_chunks_rounded_up",
            rate_version="ai-credit-ledger-v2",
            idempotency_key="credit-ledger-chunks-001",
            created_at=now + timedelta(seconds=1),
        )
        session.commit()

    unauthenticated = client.get(
        "/internal/service/admin/accounts/acct_site_credit_ledger/credit-ledger"
    )
    response = client.get(
        "/internal/service/admin/accounts/acct_site_credit_ledger/credit-ledger?limit=1",
        headers=build_internal_headers(),
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["account_id"] == "acct_site_credit_ledger"
    assert data["rate_version"] == "ai-credit-ledger-v2"
    assert data["summary"]["total_ai_credits"] == 4.0
    assert data["summary"]["entry_count"] == 2
    assert {item["key"]: item["ai_credits"] for item in data["summary"]["breakdown"]} == {
        "tokens_total": 2.0,
        "vector_chunks": 2.0,
    }
    assert data["pagination"] == {
        "limit": 1,
        "offset": 0,
        "total": 2,
        "has_more": True,
    }
    assert len(data["items"]) == 1
    assert data["items"][0]["source_type"] == "vector_chunks"
    assert data["items"][0]["ai_credit_delta"] == -2.0
    assert data["items"][0]["consumed_ai_credits"] == 2.0

    dispose_engine(database_url)


def test_admin_account_credit_adjustment_updates_ledger_and_quota_summary(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_credit_adjustment",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={"max_ai_credits_per_period": 20},
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_credit_adjustment")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None
        repository = CommercialRepository(session)
        repository.record_credit_ledger_entry(
            account_id="acct_site_credit_adjustment",
            site_id="site_credit_adjustment",
            subscription_id=subscription.subscription_id,
            plan_version_id=subscription.plan_version_id,
            run_id="run-credit-adjustment-1",
            provider_call_id=None,
            source_type="tokens_total",
            source_id="run-credit-adjustment-1:tokens",
            ai_credit_delta=-12,
            quantity=12000,
            unit="token",
            rate=1,
            rate_unit="1000_tokens_rounded_up",
            rate_version="ai-credit-ledger-v2",
            idempotency_key="credit-adjustment-consume-001",
            created_at=now,
        )
        session.commit()

    response = client.post(
        "/internal/service/admin/accounts/acct_site_credit_adjustment/credit-ledger/adjustments",
        headers=build_internal_headers(idempotency_key="svc-credit-adjustment-001"),
        json={
            "event_type": "grant",
            "ai_credit_delta": 5,
            "reason": "billing_correction",
            "note": "restore manually purchased credits",
        },
    )
    missing_reason = client.post(
        "/internal/service/admin/accounts/acct_site_credit_adjustment/credit-ledger/adjustments",
        headers=build_internal_headers(idempotency_key="svc-credit-adjustment-002"),
        json={"event_type": "grant", "ai_credit_delta": 1, "reason": ""},
    )
    quota_response = client.get(
        "/internal/service/admin/accounts/acct_site_credit_adjustment/quota-summary",
        headers=build_internal_headers(),
    )
    ledger_response = client.get(
        "/internal/service/admin/accounts/acct_site_credit_adjustment/credit-ledger",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["receipt"]["event_kind"] == "credit_ledger.adjustment"
    assert payload["entry"]["event_type"] == "grant"
    assert payload["entry"]["ai_credit_delta"] == 5.0
    assert payload["entry"]["granted_ai_credits"] == 5.0
    assert payload["entry"]["metadata"]["reason"] == "billing_correction"
    assert payload["summary"]["consumed_ai_credits"] == 12.0
    assert payload["summary"]["granted_ai_credits"] == 5.0
    assert payload["summary"]["net_ai_credit_delta"] == -7.0
    assert payload["summary"]["net_used_ai_credits"] == 7.0
    assert missing_reason.status_code == 400

    assert quota_response.status_code == 200
    quota = quota_response.json()["data"]
    assert quota["ai_credits"]["used"] == 12.0
    assert quota["ai_credits"]["limit"] == 25.0
    assert quota["ai_credits"]["remaining"] == 13.0
    assert quota["ai_credits"]["estimated"] is False
    assert quota["ai_credit_ledger_summary"]["net_used_ai_credits"] == 7.0

    assert ledger_response.status_code == 200
    ledger = ledger_response.json()["data"]
    assert ledger["summary"]["entry_count"] == 2
    assert ledger["summary"]["consumed_ai_credits"] == 12.0
    assert ledger["summary"]["granted_ai_credits"] == 5.0
    assert ledger["summary"]["net_used_ai_credits"] == 7.0
    assert {item["event_type"] for item in ledger["items"]} == {"consume", "grant"}

    dispose_engine(database_url)


def test_admin_account_credit_grant_expands_current_period_available_balance(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_credit_grant_headroom",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={"max_ai_credits_per_period": 300},
    )

    response = client.post(
        "/internal/service/admin/accounts/acct_site_credit_grant_headroom/credit-ledger/adjustments",
        headers=build_internal_headers(idempotency_key="svc-credit-grant-headroom-001"),
        json={
            "event_type": "grant",
            "ai_credit_delta": 1000,
            "reason": "operator_test_grant",
            "note": "expand current-period available balance",
        },
    )
    quota_response = client.get(
        "/internal/service/admin/accounts/acct_site_credit_grant_headroom/quota-summary",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    assert quota_response.status_code == 200
    credit = quota_response.json()["data"]["ai_credits"]
    assert credit["used"] == 0.0
    assert credit["limit"] == 1300.0
    assert credit["remaining"] == 1300.0
    assert credit["package_limit"] == 300.0
    assert credit["package_remaining"] == 1300.0
    assert credit["paid_remaining"] == 0.0
    assert credit["total_remaining"] == 1300.0

    dispose_engine(database_url)


def test_account_quota_summary_keeps_grants_and_adjustments_out_of_used_credits(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_credit_summary_semantics",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
        budgets={"max_ai_credits_per_period": 300},
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_credit_summary_semantics")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None
        repository = CommercialRepository(session)
        for event_type, source_id, delta in (
            ("grant", "credit-summary-grant", 9000.0),
            ("adjustment", "credit-summary-adjustment", 1000.0),
            ("consume", "credit-summary-consumption", -740.0),
        ):
            repository.record_credit_ledger_entry(
                account_id=subscription.account_id,
                site_id="site_credit_summary_semantics",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                run_id=(
                    "run-credit-summary-consumption"
                    if event_type == "consume"
                    else None
                ),
                provider_call_id=None,
                event_type=event_type,
                source_type=(
                    "tokens_total"
                    if event_type == "consume"
                    else "operator_credit_adjustment"
                ),
                source_id=source_id,
                ai_credit_delta=delta,
                quantity=abs(delta),
                unit="ai_credits",
                rate=1,
                rate_unit=None,
                rate_version="ai-credit-ledger-v2",
                idempotency_key=f"{source_id}-001",
                created_at=now,
            )
        session.commit()

    response = client.get(
        "/internal/service/admin/accounts/"
        "acct_site_credit_summary_semantics/quota-summary",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["ai_credit_ledger_summary"]["consumed_ai_credits"] == 740.0
    assert data["ai_credit_ledger_summary"]["granted_ai_credits"] == 9000.0
    assert data["ai_credit_ledger_summary"]["adjustment_ai_credits"] == 1000.0
    assert data["ai_credit_ledger_summary"]["net_ai_credit_delta"] == 9260.0
    assert data["ai_credit_ledger_summary"]["net_used_ai_credits"] == 0.0
    assert data["ai_credits"]["used"] == 740.0
    assert data["ai_credits"]["limit"] == 10300.0
    assert data["ai_credits"]["remaining"] == 9560.0
    assert data["ai_credits"]["package_limit"] == 300.0
    assert data["ai_credits"]["package_remaining"] == 9560.0
    assert data["ai_credits"]["total_remaining"] == 9560.0

    dispose_engine(database_url)


def test_credit_ledger_consume_credit_delta_must_be_integer(
    tmp_path: Path,
) -> None:
    database_url, _client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_credit_integer",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
    )
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == "acct_site_credit_integer")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None
        repository = CommercialRepository(session)
        try:
            repository.record_credit_ledger_entry(
                account_id="acct_site_credit_integer",
                site_id="site_credit_integer",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                run_id="run-credit-integer-1",
                provider_call_id=None,
                source_type="tokens_total",
                source_id="run-credit-integer-1:tokens",
                ai_credit_delta=-1.25,
                quantity=1250,
                unit="token",
                rate=1,
                rate_unit="1000_tokens_rounded_up",
                rate_version="ai-credit-ledger-v2",
                idempotency_key="credit-integer-invalid-001",
            )
        except ValueError as error:
            assert "integer credit unit" in str(error)
        else:
            raise AssertionError("non-integer consume ai_credit_delta should be rejected")
        session.rollback()

        entry = repository.record_credit_ledger_entry(
            account_id="acct_site_credit_integer",
            site_id="site_credit_integer",
            subscription_id=subscription.subscription_id,
            plan_version_id=subscription.plan_version_id,
            run_id="run-credit-integer-2",
            provider_call_id=None,
            source_type="vector_chunks",
            source_id="run-credit-integer-2:chunks",
            ai_credit_delta=-2.0,
            quantity=11,
            unit="chunk",
            rate=1,
            rate_unit="10_chunks_rounded_up",
            rate_version="ai-credit-ledger-v2",
            idempotency_key="credit-integer-valid-001",
        )
        assert entry.ai_credit_delta == -2.0
        session.commit()

    dispose_engine(database_url)


def test_service_routes_inspect_commercial_policy_and_reconciliation(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)

    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_policy", "name": "Policy Account"},
        headers=build_internal_headers(idempotency_key="svc-policy-account-001"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_policy",
            "account_id": "acct_policy",
            "name": "Policy Site",
            "status": "provisioning",
        },
        headers=build_internal_headers(idempotency_key="svc-policy-site-001"),
    )
    client.post(
        "/internal/service/sites/site_policy/activate",
        headers=build_internal_headers(idempotency_key="svc-policy-site-activate-001"),
    )
    client.post(
        "/internal/service/sites/site_policy/keys",
        json={
            "key_id": "key_policy_primary",
            "secret": "policy-secret",
            "scopes": ["runtime:execute", "runtime:read", "runtime:resolve", "stats:read"],
            "label": "policy-primary",
        },
        headers=build_internal_headers(idempotency_key="svc-policy-key-001"),
    )
    client.post(
        "/internal/service/plans",
        json={"plan_id": "plan_policy", "name": "Policy"},
        headers=build_internal_headers(idempotency_key="svc-policy-plan-001"),
    )
    version_response = client.post(
        "/internal/service/plans/plan_policy/versions",
        json={
            "plan_version_id": "plan_policy_v1",
            "version_label": "v1",
            "entitlements": {
                "ability_families": ["workflow", "automation"],
                "channels": ["openapi"],
                "execution_kinds": ["text"],
                "execution_tiers": ["cloud"],
                "data_classifications": ["internal"],
            },
            "budgets": {"max_runs_per_period": 1},
            "concurrency": {"max_active_runs": 2},
            "policy": {
                "subscription": {
                    "grace_period_days": 2,
                    "downgrade_policy": {
                        "retry_max": 0,
                        "task_backend": {
                            "enabled": False,
                            "mode": "inline",
                            "callback_mode": "polling_only",
                        },
                    },
                },
                "budgets": {
                    "runs": {
                        "grace_requests": 1,
                        "downgrade_policy": {
                            "retry_max": 0,
                            "task_backend": {
                                "enabled": False,
                                "mode": "inline",
                                "callback_mode": "polling_only",
                            },
                        },
                    }
                },
                "reconciliation": {
                    "tolerance": {
                        "runs": 0,
                        "provider_calls": 0,
                        "tokens_total": 0,
                        "cost": 0,
                    }
                },
            },
        },
        headers=build_internal_headers(idempotency_key="svc-policy-plan-version-001"),
    )
    bind_response = client.post(
        "/internal/service/admin/accounts/acct_policy/subscription",
        json={
            "subscription_id": "sub_policy",
            "account_id": "acct_policy",
            "plan_id": "plan_policy",
            "plan_version_id": "plan_policy_v1",
            "status": "active",
        },
        headers=build_internal_headers(idempotency_key="svc-policy-subscription-001"),
    )

    assert version_response.status_code == 200
    assert version_response.json()["data"]["policy"]["budgets"]["runs"]["grace_requests"] == 1
    assert bind_response.status_code == 200

    execute_payload = {
        "site_id": "site_policy",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-policy-run-001",
        "input": {"messages": [{"role": "user", "content": "policy run"}]},
    }
    execute_body = json.dumps(execute_payload).encode("utf-8")
    execute_response = client.post(
        "/v1/runtime/execute",
        content=execute_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_policy",
                key_id="key_policy_primary",
                secret="policy-secret",
                idempotency_key="idem-policy-run-001",
                trace_id="tracepolicyrun0010000000000",
                body=execute_body,
            )
        ),
    )
    policy_response = client.get(
        "/internal/service/sites/site_policy/commercial-policy",
        headers=build_internal_headers(),
    )
    reconciliation_before_response = client.get(
        "/internal/service/sites/site_policy/billing-snapshots/reconciliation",
        headers=build_internal_headers(),
    )
    rebuild_response = client.post(
        "/internal/service/sites/site_policy/billing-snapshots/rebuild",
        headers=build_internal_headers(idempotency_key="svc-policy-rebuild-001"),
    )

    assert execute_response.status_code == 200
    assert policy_response.status_code == 200
    assert policy_response.json()["data"]["policy"]["budgets"]["runs"]["grace_requests"] == 1
    assert policy_response.json()["data"]["budget_state"]["runs"]["limit"] == 1.0
    assert reconciliation_before_response.status_code == 200
    assert "snapshot_present" in reconciliation_before_response.json()["data"]["reconciliation"]
    assert rebuild_response.status_code == 200

    with get_session(database_url) as session:
        snapshot = session.scalar(
            select(BillingSnapshot)
            .where(BillingSnapshot.site_id == "site_policy")
            .order_by(BillingSnapshot.generated_at.desc())
        )
        assert snapshot is not None
        snapshot.totals_json = {
            **(snapshot.totals_json or {}),
            "runs": 0.0,
        }
        session.commit()

    reconciliation_after_response = client.get(
        "/internal/service/sites/site_policy/billing-snapshots/reconciliation",
        headers=build_internal_headers(),
    )

    assert reconciliation_after_response.status_code == 200
    mismatch = reconciliation_after_response.json()["data"]["reconciliation"]
    assert mismatch["snapshot_present"] is True
    assert mismatch["in_sync"] is False
    assert mismatch["recommended_action"] == "rebuild_snapshot"
    assert mismatch["mismatches"]["runs"]["delta"] == 1.0

    dispose_engine(database_url)
