from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
import pytest
from fastapi import Request
from sqlalchemy import select

from app.api.routes import service as service_routes
from app.core.db import dispose_engine, get_session
from app.core.models import (
    SUBSCRIPTION_STATUS_PAST_DUE,
    AccountSubscription,
    PluginObservabilityEvent,
    ProviderCallRecord,
    RunRecord,
    RuntimeGuardEvent,
)
from tests.api.service_routes_test_support import (
    _build_client,
)
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    build_internal_headers,
    seed_site_auth,
)

MALICIOUS_EXCEPTION_DETAIL = (
    "Traceback (most recent call last): /srv/private/advisor.py "
    "database_password=super-secret-token"
)


def _raise_malicious_value_error(*_args: object, **_kwargs: object) -> None:
    raise ValueError(MALICIOUS_EXCEPTION_DETAIL)


def _admin_session_token(*, principal_id: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "iss": "npcink-ai-cloud",
            "aud": "npcink-ai-cloud-admin",
            "sub": principal_id,
            "purpose": "admin_session",
            "auth_mode": "admin_key",
            "grant_id": "",
            "is_persisted": False,
            "session_version": 1,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        TEST_ADMIN_SESSION_SECRET,
        algorithm="HS256",
    )


def test_ops_summary_review_uses_verified_admin_actor_and_blocks_replay(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    principal_id = "platform:trusted-reviewer"
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"admin_principal_id": principal_id},
    )
    calls: list[dict[str, object]] = []
    actor_kinds: list[str] = []

    class AdvisorStub:
        def review_ops_summary_disclosure(self, **kwargs: object) -> dict[str, object]:
            calls.append(kwargs)
            return {
                "review_status": kwargs["review_status"],
                "reviewed_by": kwargs["actor_ref"],
            }

    def _advisor_stub(request: Request) -> AdvisorStub:
        actor_kinds.append(str(request.state.internal_actor_kind))
        return AdvisorStub()

    monkeypatch.setattr(service_routes, "_get_advisor_service", _advisor_stub)
    client.cookies.set(
        "npcink_admin_session_token",
        _admin_session_token(principal_id=principal_id),
    )
    headers = build_internal_headers(idempotency_key="ops-summary-review-trusted-actor-001")
    payload = {
        "cache_key": "ops-summary-cache-key-trusted-actor-001",
        "review_status": "human_confirmed",
        "actor_ref": "platform:forged-browser-actor",
        "note": "verified review",
    }
    try:
        first = client.post(
            "/internal/service/advisor/ops-summary-review",
            headers=headers,
            json=payload,
        )
        replay = client.post(
            "/internal/service/advisor/ops-summary-review",
            headers=headers,
            json=payload,
        )

        assert first.status_code == 200
        assert first.json()["data"]["reviewed_by"] == principal_id
        assert replay.status_code == 409
        assert replay.json()["error_code"] == "auth.replay_blocked"
        assert len(calls) == 1
        assert calls[0]["actor_ref"] == principal_id
        assert actor_kinds == ["platform_admin"]
    finally:
        client.close()
        dispose_engine(database_url)


def test_ops_summary_review_without_admin_session_keeps_internal_actor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    calls: list[dict[str, object]] = []
    actor_kinds: list[str] = []

    class AdvisorStub:
        def review_ops_summary_disclosure(self, **kwargs: object) -> dict[str, object]:
            calls.append(kwargs)
            return {"reviewed_by": kwargs["actor_ref"]}

    def _advisor_stub(request: Request) -> AdvisorStub:
        actor_kinds.append(str(request.state.internal_actor_kind))
        return AdvisorStub()

    monkeypatch.setattr(service_routes, "_get_advisor_service", _advisor_stub)
    try:
        response = client.post(
            "/internal/service/advisor/ops-summary-review",
            headers=build_internal_headers(
                idempotency_key="ops-summary-review-internal-actor-001"
            ),
            json={
                "cache_key": "ops-summary-cache-key-internal-actor-001",
                "review_status": "human_confirmed",
                "actor_ref": "platform:forged-internal-actor",
            },
        )

        assert response.status_code == 200
        assert response.json()["data"]["reviewed_by"] == "internal"
        assert calls[0]["actor_ref"] == "internal"
        assert actor_kinds == ["internal_token"]
    finally:
        client.close()
        dispose_engine(database_url)


def test_ops_summary_review_rejects_invalid_admin_cookie_before_replay_reservation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    calls = 0

    class AdvisorStub:
        def review_ops_summary_disclosure(self, **_kwargs: object) -> dict[str, object]:
            nonlocal calls
            calls += 1
            return {}

    monkeypatch.setattr(service_routes, "_get_advisor_service", lambda _request: AdvisorStub())
    client.cookies.set("npcink_admin_session_token", "invalid-admin-session")
    headers = build_internal_headers(idempotency_key="ops-summary-review-invalid-session-001")
    payload = {
        "cache_key": "ops-summary-cache-key-invalid-session-001",
        "review_status": "human_confirmed",
    }
    try:
        invalid = client.post(
            "/internal/service/advisor/ops-summary-review",
            headers=headers,
            json=payload,
        )
        client.cookies.delete("npcink_admin_session_token")
        internal_retry = client.post(
            "/internal/service/advisor/ops-summary-review",
            headers=headers,
            json=payload,
        )

        assert invalid.status_code == 401
        assert invalid.json()["error_code"] == "auth.admin_session_invalid"
        assert internal_retry.status_code == 200
        assert calls == 1
    finally:
        client.close()
        dispose_engine(database_url)


def test_admin_agent_workflow_metadata_projection_is_read_only(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)

    response = client.get(
        "/internal/service/admin/agent-workflow-metadata",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["projection_version"] == "cloud-agent-workflow-metadata.v1"
    assert data["projection_kind"] == "read_only_runtime_metadata"
    assert "compatibility_registry_version" not in data
    assert "registry_version" not in data
    agents = {item["agent_id"]: item for item in data["agents"]}
    assert "internal_ops_advisor_agent" in agents
    assert agents["site_knowledge_suggestion_agent"]["handoff_owner"] == ("wordpress_local")
    assert agents["site_knowledge_suggestion_agent"]["direct_wordpress_write"] is False
    workflows = {item["workflow_id"]: item for item in data["workflows"]}
    assert workflows["external_web_evidence_preflight"]["handoff_owner"] == ("wordpress_local")
    assert workflows["media_derivative_artifact_generation"]["direct_wordpress_write"] is False

    unauthorized = client.get("/internal/service/admin/agent-workflow-metadata")
    assert unauthorized.status_code in (401, 403)


def test_internal_ai_advisor_routes_are_internal_and_evidence_backed(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_advisor",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve", "stats:read"],
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription).where(AccountSubscription.account_id == "acct_site_advisor")
        )
        assert subscription is not None
        subscription.status = SUBSCRIPTION_STATUS_PAST_DUE
        session.add(
            RuntimeGuardEvent(
                auth_surface="public",
                scope_kind="site",
                scope_id="site_advisor",
                site_id="site_advisor",
                key_id="key_default",
                client_ref="127.0.0.1",
                event_code="auth.rate_limit_exceeded",
                status_code=429,
                method="POST",
                path="/v1/runtime/execute",
                trace_id="advisor-runtime-trace",
                payload_json={"reason": "test"},
                created_at=now,
            )
        )
        session.add(
            RunRecord(
                run_id="run_advisor",
                site_id="site_advisor",
                account_id="acct_site_advisor",
                subscription_id=subscription.subscription_id,
                plan_version_id=subscription.plan_version_id,
                ability_name="advisor-test",
                ability_family="text",
                skill_id=None,
                workflow_id=None,
                contract_version="test",
                channel="api",
                execution_kind="text",
                execution_tier="cloud",
                execution_pattern="step_offload",
                data_classification="internal",
                profile_id="text.balanced",
                canonical_run_id=None,
                status="succeeded",
                idempotency_key="advisor-run",
                request_fingerprint="advisor-fingerprint",
                trace_id="advisor-routing-trace",
                cancel_requested_at=None,
                canceled_at=None,
                input_json={},
                execution_input_ciphertext=None,
                policy_json={},
                result_ref="inline",
                result_json={"ok": True},
                error_code=None,
                error_message=None,
                callback_status="not_requested",
                callback_attempt_count=0,
                callback_last_attempt_at=None,
                callback_delivered_at=None,
                callback_next_attempt_at=None,
                callback_last_error_code=None,
                callback_last_error_message=None,
                selected_provider_id="openai",
                selected_model_id="gpt-4o-mini",
                selected_instance_id="openai-us-east-text-balanced",
                fallback_used=False,
                started_at=now,
                processing_started_at=now,
                finished_at=now,
                retention_expires_at=now + timedelta(days=1),
                result_purged_at=None,
            )
        )
        session.flush()
        session.add(
            ProviderCallRecord(
                run_id="run_advisor",
                provider_id="openai",
                model_id="gpt-4o-mini",
                instance_id="openai-us-east-text-balanced",
                region="us-east",
                latency_ms=250,
                tokens_in=10,
                tokens_out=20,
                cost=0.001,
                retry_count=0,
                fallback_used=False,
                error_code=None,
                created_at=now,
            )
        )
        session.commit()

    unauthenticated = client.get("/internal/service/advisor/runtime")
    runtime_response = client.get(
        "/internal/service/advisor/runtime?site_id=site_advisor&recent_minutes=60",
        headers=build_internal_headers(),
    )
    commercial_response = client.get(
        "/internal/service/advisor/commercial",
        headers=build_internal_headers(),
    )
    routing_response = client.get(
        "/internal/service/advisor/routing?site_id=site_advisor",
        headers=build_internal_headers(),
    )
    operations_response = client.get(
        "/internal/service/advisor/operations?site_id=site_advisor&range=24h",
        headers=build_internal_headers(),
    )
    ops_summary_response = client.get(
        "/internal/service/advisor/ops-summary?scope=runtime&site_id=site_advisor",
        headers=build_internal_headers(),
    )
    ops_summary_preview_response = client.get(
        "/internal/service/advisor/ops-summary-preview?scope=runtime&site_id=site_advisor",
        headers=build_internal_headers(),
    )
    ops_summary_value_response = client.get(
        "/internal/service/advisor/ops-summary-value?scope=runtime&site_id=site_advisor",
        headers=build_internal_headers(),
    )

    assert unauthenticated.status_code == 401
    assert runtime_response.status_code == 200
    runtime_payload = runtime_response.json()["data"]
    assert runtime_payload["advisor_version"] == "internal-ai-advisor-v1"
    assert runtime_payload["scope"] == "runtime_operations"
    assert runtime_payload["agent_handoff"]["agent_id"] == "internal_ops_advisor_agent"
    assert runtime_payload["agent_handoff"]["handoff_type"] == "operator_recommendation"
    assert runtime_payload["agent_handoff"]["requires_operator_review"] is True
    assert runtime_payload["agent_handoff"]["direct_wordpress_write"] is False
    assert runtime_payload["agent_handoff"]["execution_pattern"] == "inline"
    assert (
        "automatic_commercial_state_mutation"
        in runtime_payload["agent_handoff"]["forbidden_actions"]
    )
    assert runtime_payload["status"] == "attention"
    assert runtime_payload["evidence"][0]["ref"] == (
        "/internal/service/runtime/diagnostics/summary"
    )
    assert {item["action"] for item in runtime_payload["recommended_actions"]} >= {
        "inspect_commercial_entitlement_and_runtime_guard"
    }
    assert any(
        signal["code"] == "runtime.guard_events" and signal["recent_rate_limit_exceeded"] == 1
        for signal in runtime_payload["signals"]
    )

    assert commercial_response.status_code == 200
    commercial_payload = commercial_response.json()["data"]
    assert commercial_payload["scope"] == "commercial_operations"
    assert commercial_payload["status"] == "attention"
    assert any(
        signal["code"] == "commercial.subscription_attention"
        for signal in commercial_payload["signals"]
    )
    assert commercial_payload["recommended_actions"][0]["requires_operator"] is True

    assert routing_response.status_code == 200
    routing_payload = routing_response.json()["data"]
    assert routing_payload["scope"] == "routing_operations"
    assert routing_payload["status"] == "ready"
    assert "text.balanced" in routing_payload["signals"][0]["recommended_profile_ids"]
    assert routing_payload["evidence"][0]["kind"] == "router_recommendation_summary"

    assert operations_response.status_code == 200
    operations_payload = operations_response.json()["data"]
    assert operations_payload["scope"] == "operations_analysis"
    assert operations_payload["agent_handoff"]["agent_role"] == "operations_analysis"
    assert operations_payload["agent_handoff"]["handoff_owner"] == "cloud_internal_operator"
    assert operations_payload["agent_handoff"]["fail_closed_behavior"] == (
        "return_deterministic_advisory_summary"
    )
    assert operations_payload["evidence"][0]["kind"] == "admin_overview"
    assert any(signal["code"] == "ops.runtime_quality" for signal in operations_payload["signals"])
    assert any(signal["code"] == "ops.provider_quality" for signal in operations_payload["signals"])
    assert operations_payload["recommended_actions"][0]["requires_operator"] is True

    assert ops_summary_response.status_code == 200
    ops_summary_payload = ops_summary_response.json()["data"]
    assert ops_summary_payload["summarizer_version"] == "internal-ops-summarizer-v1"
    assert ops_summary_payload["generation"]["mode"] == "deterministic_fallback"
    assert ops_summary_payload["source_context"]["advisor"]["agent_handoff"]["agent_id"] == (
        "internal_ops_advisor_agent"
    )
    assert (
        ops_summary_payload["source_context"]["advisor"]["agent_handoff"]["direct_wordpress_write"]
        is False
    )
    assert "agent_registry_metadata" not in ops_summary_payload
    assert ops_summary_payload["agent_metadata_projection"]["agent_id"] == (
        "internal_ops_advisor_agent"
    )
    assert (
        ops_summary_payload["agent_metadata_projection"]["agent_role"]
        == (ops_summary_payload["source_context"]["advisor"]["agent_handoff"]["agent_role"])
    )
    assert ops_summary_payload["agent_metadata_projection"]["direct_wordpress_write"] is False
    assert (
        "cloud_workflow_truth"
        in ops_summary_payload["agent_metadata_projection"]["forbidden_actions"]
    )
    assert ops_summary_payload["support_draft"]
    assert "article" not in ops_summary_payload["support_draft"].lower()
    assert "write WordPress" in ops_summary_payload["safety_note"]

    assert ops_summary_preview_response.status_code == 200
    preview_payload = ops_summary_preview_response.json()["data"]
    assert preview_payload["preview_version"] == "internal-ops-summarizer-preview-v1"
    assert preview_payload["baseline"]["generation"]["mode"] == "deterministic_fallback"
    assert preview_payload["ai"]["generation"]["mode"] == "deterministic_fallback"
    assert preview_payload["comparison"]["ai_called"] is False
    assert preview_payload["comparison"]["value_check"] == "pass_provider_id_to_test_llm"
    assert preview_payload["safety"]["wordpress_write_allowed"] is False

    assert ops_summary_value_response.status_code == 200
    value_payload = ops_summary_value_response.json()["data"]
    assert value_payload["value_metrics_version"] == "internal-ops-summary-value-v1"
    assert value_payload["filters"]["scope"] == "runtime_operations"
    assert value_payload["totals"]["analysis_requests"] >= 1
    assert value_payload["totals"]["deterministic_fallbacks"] >= 1
    assert value_payload["value_signal"]["status"] in {
        "not_using_ai",
        "monitor",
        "insufficient_data",
    }

    dispose_engine(database_url)


def test_service_validation_errors_do_not_expose_exception_details(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    for method_name in (
        "get_routing_advisor",
        "get_ops_summary",
        "get_ops_summary_preview",
        "review_ops_summary_disclosure",
    ):
        monkeypatch.setattr(
            service_routes.InternalAIAdvisorService,
            method_name,
            _raise_malicious_value_error,
        )
    monkeypatch.setattr(
        service_routes.PluginObservabilityService,
        "update_attention_state",
        _raise_malicious_value_error,
    )

    advisor_cases = (
        (
            "/internal/service/advisor/routing?site_id=site_advisor",
            "advisor.invalid_routing_window",
            "invalid routing advisor request",
        ),
        (
            "/internal/service/advisor/ops-summary?scope=runtime&site_id=site_advisor",
            "advisor.invalid_ops_summary_request",
            "invalid ops summary request",
        ),
        (
            "/internal/service/advisor/ops-summary-preview?scope=runtime&site_id=site_advisor",
            "advisor.invalid_ops_summary_preview_request",
            "invalid ops summary preview request",
        ),
    )
    for path, error_code, public_message in advisor_cases:
        response = client.get(path, headers=build_internal_headers())

        assert response.status_code == 400
        payload = response.json()
        assert payload["error_code"] == error_code
        assert payload["message"] == public_message
        assert payload["meta"]["revision"] == "m1"
        assert "super-secret-token" not in response.text
        assert "Traceback" not in response.text
        assert "/srv/private/advisor.py" not in response.text

    review_response = client.post(
        "/internal/service/advisor/ops-summary-review",
        headers=build_internal_headers(
            idempotency_key="ops-summary-review-redaction-001"
        ),
        json={
            "cache_key": "ops-summary-cache-key-001",
            "review_status": "human_confirmed",
        },
    )
    assert review_response.status_code == 400
    assert review_response.json()["error_code"] == ("advisor.invalid_ops_summary_review_request")
    assert review_response.json()["message"] == "invalid ops summary review request"
    assert review_response.json()["meta"]["revision"] == "m1"
    assert "super-secret-token" not in review_response.text
    assert "Traceback" not in review_response.text
    assert "/srv/private/advisor.py" not in review_response.text

    attention_response = client.post(
        "/internal/service/admin/plugin-observability/attention-state",
        headers=build_internal_headers(
            idempotency_key="plugin-attention-redaction-001",
            trace_id="tracepluginredaction001000000000",
        ),
        json={
            "attention_key": "plugin-attention-key-redaction-001",
            "attention_code": "plugin_observability.plugin_error",
            "action": "acknowledge",
        },
    )
    assert attention_response.status_code == 422
    attention_payload = attention_response.json()
    assert attention_payload["error_code"] == ("plugin_observability.attention_action_invalid")
    assert attention_payload["message"] == ("invalid plugin observability attention action")
    assert attention_payload["meta"]["revision"] == "m6"
    assert "super-secret-token" not in attention_response.text
    assert "Traceback" not in attention_response.text
    assert "/srv/private/advisor.py" not in attention_response.text

    dispose_engine(database_url)


def test_internal_site_diagnostic_advisor_uses_monitoring_actions(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_diag",
        scopes=["runtime:execute", "runtime:read", "stats:read"],
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        session.add(
            PluginObservabilityEvent(
                dedupe_key="diag-plugin-error-001",
                site_id="site_diag",
                key_id="key_default",
                schema_version="2026-06-01",
                plugin_slug="npcink-ai-client-adapter",
                plugin_version="0.1.0",
                source="local",
                event_kind="adapter.runtime.failed",
                event_id="diag-plugin-error-event-001",
                status="error",
                error_code="wordpress.fatal_error",
                latency_ms=4200,
                ability_id="npcink-abilities-toolkit/create-draft",
                payload_json={"raw": "must stay out of advisor response"},
                captured_at=now - timedelta(minutes=5),
                received_at=now - timedelta(minutes=5),
            )
        )
        session.commit()

    unauthenticated = client.get("/internal/service/advisor/site-diagnostics?site_id=site_diag")
    response = client.get(
        "/internal/service/advisor/site-diagnostics?site_id=site_diag&window_hours=24",
        headers=build_internal_headers(),
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    assert payload["advisor_version"] == "internal-ai-advisor-v1"
    assert payload["scope"] == "site_diagnostics"
    assert payload["status"] == "attention"
    assert payload["severity"] in {"warning", "error"}
    assert payload["agent_handoff"]["requires_operator_review"] is True
    assert payload["agent_handoff"]["direct_wordpress_write"] is False
    assert payload["safety"] == {
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
        "operator_review_required": True,
        "automatic_repair_allowed": False,
        "raw_payload_exposed": False,
    }
    assert payload["diagnostic_items"]
    first_item = payload["diagnostic_items"][0]
    assert first_item["diagnostic_key"]
    assert first_item["source"] == "plugins"
    assert first_item["workflow_status"] == "new"
    assert first_item["status_detail"]["workflow_status"] == "new"
    assert first_item["status_detail"]["status_source"] in {
        "monitoring_signal",
        "operator_state",
    }
    assert first_item["evidence_window"]["hours"] == 24
    assert first_item["last_updated_at"]
    assert first_item["operator_review_required"] is True
    assert first_item["direct_wordpress_write"] is False
    assert first_item["recommended_action_id"] == "inspect_plugin_observability_attention"
    assert payload["diagnostic_workflow"]["new"] >= 1
    assert payload["diagnostic_workflow"]["needs_attention"] >= 1
    assert payload["evidence_window"]["hours"] == 24
    assert any(
        action["action"] == "inspect_plugin_observability_attention"
        and action["requires_operator"] is True
        for action in payload["recommended_actions"]
    )
    serialized = json.dumps(payload)
    assert "must stay out of advisor response" not in serialized
    assert "payload_json" not in serialized

    attention_key = first_item["diagnostic_key"].replace("plugin_attention:", "", 1)
    acknowledge_response = client.post(
        "/internal/service/admin/plugin-observability/attention-state",
        headers=build_internal_headers(idempotency_key="diag-attention-ack-001"),
        json={
            "attention_key": attention_key,
            "attention_code": first_item["code"],
            "action": "acknowledge",
            "site_id": "site_diag",
            "note": "Operator is reviewing the plugin error.",
        },
    )
    follow_up_response = client.get(
        "/internal/service/advisor/site-diagnostics?site_id=site_diag&window_hours=24",
        headers=build_internal_headers(),
    )

    assert acknowledge_response.status_code == 200, acknowledge_response.text
    assert follow_up_response.status_code == 200, follow_up_response.text
    follow_up_item = follow_up_response.json()["data"]["diagnostic_items"][0]
    assert follow_up_item["workflow_status"] == "acknowledged"
    assert follow_up_item["status_detail"]["status_source"] == "operator_state"
    assert follow_up_item["status_detail"]["operator_note"] == (
        "Operator is reviewing the plugin error."
    )

    dispose_engine(database_url)
