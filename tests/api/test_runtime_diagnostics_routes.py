from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import select

from app.adapters.callbacks.http import HttpRuntimeCallbackDispatcher
from app.core.db import dispose_engine, get_session
from app.core.models import (
    AccountSubscription,
    ProviderCallRecord,
    ReplayReceipt,
    RunRecord,
    RuntimeGuardEvent,
    UsageMeterEvent,
)
from app.core.security import REPLAY_SCOPE_PUBLIC_POST_SITE
from app.domain.commercial.service import CommercialService
from app.domain.runtime.service import RuntimeService
from tests.api.service_routes_test_support import (
    _build_client,
    _runtime_service_settings,
    _seed_openai_text_model_allowlist,
)
from tests.conftest import (
    build_auth_headers,
    build_internal_headers,
    merge_json_headers,
    seed_site_auth,
)

RUNTIME_CALLBACK_TEST_SECRET = "callback-fixture-" + ("x" * 32)
MISSING_ACTIVATE_IDEMPOTENCY_KEY = "diag-activate-1"


def test_runtime_telemetry_diagnostics_summarizes_runtime_families(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    site_id = "site_model_gov"
    seed_site_auth(
        database_url,
        site_id=site_id,
        scopes=["runtime:execute", "runtime:read"],
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        subscription = session.scalar(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == f"acct_{site_id}")
            .order_by(AccountSubscription.created_at.desc())
        )
        assert subscription is not None

        def add_run(
            *,
            run_id: str,
            ability_family: str,
            execution_kind: str,
            profile_id: str,
            provider_id: str,
            model_id: str,
            instance_id: str,
        ) -> None:
            session.add(
                RunRecord(
                    run_id=run_id,
                    site_id=site_id,
                    account_id=subscription.account_id,
                    subscription_id=subscription.subscription_id,
                    plan_version_id=subscription.plan_version_id,
                    ability_name=f"npcink-cloud/{execution_kind}",
                    ability_family=ability_family,
                    skill_id="",
                    workflow_id="",
                    contract_version="test.v1",
                    channel="openapi",
                    execution_kind=execution_kind,
                    execution_tier="cloud",
                    execution_pattern="inline",
                    data_classification=(
                        "public_site_content" if ability_family == "knowledge" else "internal"
                    ),
                    profile_id=profile_id,
                    canonical_run_id=None,
                    status="succeeded",
                    idempotency_key=f"idem-{run_id}",
                    request_fingerprint=f"fingerprint-{run_id}",
                    trace_id=f"trace-{run_id}",
                    cancel_requested_at=None,
                    canceled_at=None,
                    input_json={},
                    execution_input_ciphertext=None,
                    policy_json={},
                    result_ref="inline",
                    result_json={"status": "ready"},
                    error_code=None,
                    error_message=None,
                    callback_status="not_requested",
                    callback_attempt_count=0,
                    callback_last_attempt_at=None,
                    callback_delivered_at=None,
                    callback_next_attempt_at=None,
                    callback_last_error_code=None,
                    callback_last_error_message=None,
                    selected_provider_id=provider_id,
                    selected_model_id=model_id,
                    selected_instance_id=instance_id,
                    fallback_used=False,
                    started_at=now - timedelta(minutes=5),
                    processing_started_at=now - timedelta(minutes=5),
                    finished_at=now - timedelta(minutes=4),
                    retention_expires_at=now + timedelta(days=1),
                    result_purged_at=None,
                )
            )

        add_run(
            run_id="run-model-gov-text",
            ability_family="text",
            execution_kind="text",
            profile_id="text.free-gpt55",
            provider_id="openai-global-gpt-5-5",
            model_id="gpt-5.5",
            instance_id="openai-global-gpt-5-5-text",
        )
        add_run(
            run_id="run-model-gov-knowledge",
            ability_family="knowledge",
            execution_kind="embedding",
            profile_id="site-knowledge.managed",
            provider_id="tei",
            model_id="tei/BAAI/bge-m3",
            instance_id="tei-site-knowledge-embedding",
        )
        add_run(
            run_id="run-model-gov-vision",
            ability_family="vision",
            execution_kind="media_derivative",
            profile_id="media.transform.worker",
            provider_id="media_processor",
            model_id="pillow",
            instance_id="cloud-worker",
        )
        add_run(
            run_id="run-model-gov-uncovered-text",
            ability_family="uncovered_text",
            execution_kind="text",
            profile_id="text.free-gpt55",
            provider_id="openai-global-gpt-5-5",
            model_id="gpt-5.5",
            instance_id="openai-global-gpt-5-5-text",
        )
        session.flush()
        session.add_all(
            [
                ProviderCallRecord(
                    run_id="run-model-gov-text",
                    provider_id="openai-global-gpt-5-5",
                    model_id="gpt-5.5",
                    instance_id="openai-global-gpt-5-5-text",
                    region="global",
                    latency_ms=180,
                    tokens_in=20,
                    tokens_out=40,
                    cost=0.0,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=now - timedelta(minutes=4),
                ),
                ProviderCallRecord(
                    run_id="run-model-gov-knowledge",
                    provider_id="tei",
                    model_id="tei/BAAI/bge-m3",
                    instance_id="tei-site-knowledge-embedding",
                    region="unspecified",
                    latency_ms=45,
                    tokens_in=5,
                    tokens_out=0,
                    cost=0.0,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=now - timedelta(minutes=4),
                ),
            ]
        )
        for run_id, ability_family, execution_kind, meter_key, quantity in [
            ("run-model-gov-text", "text", "text", "runs", 1),
            ("run-model-gov-text", "text", "text", "tokens_total", 60),
            ("run-model-gov-knowledge", "knowledge", "embedding", "runs", 1),
            ("run-model-gov-knowledge", "knowledge", "embedding", "tokens_total", 5),
            ("run-model-gov-vision", "vision", "media_derivative", "runs", 1),
        ]:
            session.add(
                UsageMeterEvent(
                    account_id=subscription.account_id,
                    site_id=site_id,
                    subscription_id=subscription.subscription_id,
                    plan_version_id=subscription.plan_version_id,
                    run_id=run_id,
                    provider_call_id=None,
                    event_kind="meter",
                    meter_key=meter_key,
                    quantity=quantity,
                    ability_family=ability_family,
                    channel="openapi",
                    execution_kind=execution_kind,
                    execution_tier="cloud",
                    data_classification=(
                        "public_site_content" if ability_family == "knowledge" else "internal"
                    ),
                    currency="USD",
                    dedupe_key=f"model-gov-{run_id}-{meter_key}",
                    payload_json={},
                    created_at=now - timedelta(minutes=4),
                )
            )
        session.commit()

    unauthenticated = client.get("/internal/service/runtime/diagnostics/runtime-telemetry")
    assert unauthenticated.status_code == 401

    response = client.get(
        "/internal/service/runtime/diagnostics/runtime-telemetry"
        f"?site_id={site_id}&recent_minutes=60&limit=10",
        headers=build_internal_headers(),
    )
    admin_alias_response = client.get(
        "/internal/service/admin/runtime-telemetry"
        f"?site_id={site_id}&recent_minutes=10080&limit=10",
        headers=build_internal_headers(),
    )
    assert response.status_code == 200
    assert admin_alias_response.status_code == 200
    legacy_response = client.get(
        "/internal/service/runtime/diagnostics/hosted-model-governance"
        f"?site_id={site_id}&recent_minutes=60&limit=10",
        headers=build_internal_headers(),
    )
    legacy_admin_alias_response = client.get(
        "/internal/service/admin/hosted-model-governance"
        f"?site_id={site_id}&recent_minutes=10080&limit=10",
        headers=build_internal_headers(),
    )
    assert legacy_response.status_code == 404
    assert legacy_admin_alias_response.status_code == 404
    data = response.json()["data"]
    assert admin_alias_response.json()["data"]["totals"]["runs"] == 4
    assert admin_alias_response.json()["data"]["filters"]["recent_minutes"] == 10080
    assert data["totals"]["runs"] == 4
    assert data["totals"]["ai_evidence_required_runs"] == 4
    assert data["totals"]["non_ai_zero_credit_runs"] == 0
    assert data["totals"]["provider_calls"] == 2
    assert data["totals"]["provider_call_run_coverage_rate"] == 0.5
    assert data["totals"]["metered_run_coverage_rate"] == 0.75
    assert data["boundary"]["direct_wordpress_write"] is False
    assert data["boundary"]["contains_prompt_or_result_payloads"] is False
    capability_by_id = {item["group_id"]: item for item in data["capability_groups"]}
    assert capability_by_id["text"]["tokens_total"] == 60
    assert capability_by_id["knowledge"]["tokens_total"] == 5
    assert capability_by_id["knowledge"]["provider_calls"] == 1
    assert "site-knowledge.managed" in capability_by_id["knowledge"]["profile_ids"]
    assert capability_by_id["vision"]["provider_calls"] == 0
    assert data["governance_gaps"]["unmetered_capabilities"] == ["uncovered_text"]
    assert data["governance_gaps"]["missing_provider_call_capabilities"] == ["uncovered_text"]
    assert data["governance_gaps"]["unmetered_run_count"] == 1
    assert data["governance_gaps"]["runs_without_provider_call_count"] == 2
    assert data["alert_summary"]["status"] == "error"
    assert any(
        alert["code"] == "hosted_model.unmetered_runs"
        and alert["count"] == 1
        and "uncovered_text" in alert["capabilities"]
        for alert in data["alert_summary"]["alerts"]
    )
    assert any(
        alert["code"] == "hosted_model.provider_call_gap"
        and alert["count"] == 2
        and "vision" in alert["capabilities"]
        and "uncovered_text" in alert["capabilities"]
        for alert in data["alert_summary"]["alerts"]
    )
    assert data["alert_summary"]["boundary"]["direct_wordpress_write"] is False


def test_service_routes_runtime_diagnostics_summaries_and_abuse_guard(
    tmp_path: Path,
    allow_example_callback_dns: None,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "public_post_rate_limit_window_seconds": 600,
            "public_post_max_requests_per_window": 10,
            "public_post_max_requests_per_key_window": 10,
            "public_post_max_requests_per_ip_window": 10,
            "public_guard_max_reject_events_per_site_window": 3,
            "internal_post_rate_limit_window_seconds": 600,
            "internal_post_max_requests_per_window": 10,
            "internal_post_max_requests_per_ip_window": 10,
        },
    )
    _seed_openai_text_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_diag",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    account_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_diag", "name": "Diagnostics Account"},
        headers=build_internal_headers(idempotency_key="svc-diag-account-001"),
    )
    internal_replay_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_diag_replay", "name": "Diagnostics Account Replay"},
        headers=build_internal_headers(idempotency_key="svc-diag-account-001"),
    )
    missing_activate_response = client.post(
        "/internal/service/sites/site_missing/activate",
        headers=build_internal_headers(
            idempotency_key=MISSING_ACTIVATE_IDEMPOTENCY_KEY
        ),
    )

    CommercialService(
        database_url,
        settings=_runtime_service_settings(database_url),
    ).update_site_runtime_callbacks(
        site_id="site_diag",
        terminal_callback={
            "enabled": True,
            "callback_url": "https://example.com/diag",
            "key_id": "runtime_callback_key",
            "secret": RUNTIME_CALLBACK_TEST_SECRET,
            "registration_id": "runtime_terminal",
        },
    )

    callback_payload = {
        "site_id": "site_diag",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-diag-callback-001",
        "retention_ttl": 60,
        "task_backend": {
            "enabled": True,
            "mode": "polling",
            "callback_mode": "terminal_callback_required",
            "polling_interval_sec": 60,
        },
        "input": {"messages": [{"role": "user", "content": "diag callback"}]},
    }
    callback_body = json.dumps(callback_payload).encode("utf-8")
    callback_response = client.post(
        "/v1/runtime/execute",
        content=callback_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-callback-001",
                trace_id="tracediagcallback001000000000",
                body=callback_body,
            )
        ),
    )
    callback_replay_response = client.post(
        "/v1/runtime/execute",
        content=callback_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-callback-001",
                trace_id="tracediagcallback001000000000",
                body=callback_body,
            )
        ),
    )
    queued_payload = {
        "site_id": "site_diag",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "input": {"messages": [{"role": "user", "content": "diag queue"}]},
    }
    queued_body = json.dumps({**queued_payload, "idempotency_key": "idem-diag-queued-001"}).encode(
        "utf-8"
    )
    running_body = json.dumps(
        {**queued_payload, "idempotency_key": "idem-diag-running-001"}
    ).encode("utf-8")
    queued_response = client.post(
        "/v1/runtime/execute",
        content=queued_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-queued-001",
                trace_id="tracediagqueued0010000000000",
                body=queued_body,
            )
        ),
    )
    running_response = client.post(
        "/v1/runtime/execute",
        content=running_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-running-001",
                trace_id="tracediagrunning001000000000",
                body=running_body,
            )
        ),
    )
    dispatching_payload = {
        **callback_payload,
        "idempotency_key": "idem-diag-dispatching-001",
    }
    overdue_payload = {
        **callback_payload,
        "idempotency_key": "idem-diag-overdue-001",
    }
    dispatching_body = json.dumps(dispatching_payload).encode("utf-8")
    overdue_body = json.dumps(overdue_payload).encode("utf-8")
    dispatching_response = client.post(
        "/v1/runtime/execute",
        content=dispatching_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-dispatching-001",
                trace_id="tracediagdispatch00100000000",
                body=dispatching_body,
            )
        ),
    )
    overdue_response = client.post(
        "/v1/runtime/execute",
        content=overdue_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_diag",
                idempotency_key="idem-diag-overdue-001",
                trace_id="tracediagoverdue001000000000",
                body=overdue_body,
            )
        ),
    )

    assert account_response.status_code == 200
    assert internal_replay_response.status_code == 409
    assert missing_activate_response.status_code == 404
    assert callback_response.status_code == 200
    assert callback_replay_response.status_code == 409
    assert queued_response.status_code == 200
    assert running_response.status_code == 200
    assert dispatching_response.status_code == 200
    assert overdue_response.status_code == 200

    callback_run_id = callback_response.json()["data"]["run_id"]
    queued_run_id = queued_response.json()["data"]["run_id"]
    running_run_id = running_response.json()["data"]["run_id"]
    dispatching_run_id = dispatching_response.json()["data"]["run_id"]
    overdue_run_id = overdue_response.json()["data"]["run_id"]

    with get_session(database_url) as session:
        callback_run = session.get(RunRecord, callback_run_id)
        queued_run = session.get(RunRecord, queued_run_id)
        running_run = session.get(RunRecord, running_run_id)
        dispatching_run = session.get(RunRecord, dispatching_run_id)
        overdue_run = session.get(RunRecord, overdue_run_id)
        assert callback_run is not None
        assert queued_run is not None
        assert running_run is not None
        assert dispatching_run is not None
        assert overdue_run is not None

        callback_run.callback_status = "failed"
        callback_run.callback_last_attempt_at = datetime.now(UTC) - timedelta(minutes=15)
        callback_run.callback_last_error_code = "runtime.callback_delivery_failed"
        callback_run.retention_expires_at = datetime.now(UTC) - timedelta(minutes=5)

        queued_run.status = "queued"
        queued_run.started_at = datetime.now(UTC) - timedelta(minutes=11)
        queued_run.processing_started_at = None
        queued_run.finished_at = None

        dispatching_run.callback_status = "dispatching"
        dispatching_run.callback_last_attempt_at = datetime.now(UTC) - timedelta(minutes=6)

        running_run.status = "running"
        running_run.processing_started_at = datetime.now(UTC) - timedelta(minutes=7)
        running_run.cancel_requested_at = datetime.now(UTC) - timedelta(minutes=7)

        overdue_run.callback_status = "pending"
        overdue_run.callback_next_attempt_at = datetime.now(UTC) - timedelta(minutes=12)

        for index in range(12):
            session.add(
                ReplayReceipt(
                    scope_kind=REPLAY_SCOPE_PUBLIC_POST_SITE,
                    scope_id="site_diag",
                    replay_key=f"manual-burst-{index}",
                    method="POST",
                    path="/v1/runtime/execute",
                    trace_id=f"manualburst{index:02d}",
                    created_at=datetime.now(UTC) - timedelta(minutes=2),
                    expires_at=datetime.now(UTC) + timedelta(minutes=8),
                )
            )

        for index in range(4):
            session.add(
                RuntimeGuardEvent(
                    auth_surface="public_runtime",
                    scope_kind=REPLAY_SCOPE_PUBLIC_POST_SITE,
                    scope_id="site_diag",
                    site_id="site_diag",
                    key_id="key_default",
                    client_ref="127.0.0.1",
                    event_code="auth.rate_limit_exceeded" if index < 3 else "auth.replay_blocked",
                    status_code=429 if index < 3 else 409,
                    method="POST",
                    path="/v1/runtime/execute",
                    trace_id=f"manualguard{index:02d}",
                    payload_json={"source": "test_seed"},
                    created_at=datetime.now(UTC) - timedelta(minutes=3),
                )
            )

        session.commit()

    runtime_summary_response = client.get(
        "/internal/service/runtime/diagnostics/summary?site_id=site_diag&recent_minutes=120",
        headers=build_internal_headers(),
    )
    callback_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=callback_failed&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    cancel_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=cancel_requested&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    dispatching_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=callback_dispatching&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    queued_stale_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=queued_stale&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    cancel_stuck_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=cancel_stuck&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    callback_overdue_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=callback_overdue&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    guard_events_response = client.get(
        "/internal/service/runtime/diagnostics/guard-events?site_id=site_diag&limit=20",
        headers=build_internal_headers(),
    )
    audit_summary_response = client.get(
        "/internal/service/audit-events/summary?window_minutes=120&limit=10",
        headers=build_internal_headers(),
    )
    decision_summary_response = client.get(
        "/internal/service/commercial-decisions/summary?site_id=site_diag&window_minutes=120&limit=10",
        headers=build_internal_headers(),
    )
    abuse_guard_response = client.get(
        "/internal/service/runtime/diagnostics/abuse-guard?window_seconds=600&limit_per_scope=5",
        headers=build_internal_headers(),
    )

    assert runtime_summary_response.status_code == 200
    runtime_summary = runtime_summary_response.json()["data"]
    assert runtime_summary["queue"]["queued_runs"] == 1
    assert runtime_summary["queue"]["running_runs"] == 1
    assert runtime_summary["queue"]["pressure_state"] == "attention"
    assert "queue.queued_stale" in runtime_summary["queue"]["pressure_reasons"]
    assert runtime_summary["queue"]["queued_oldest_age_seconds"] >= 600
    assert runtime_summary["cancel"]["active_requests"] == 1
    assert runtime_summary["cancel"]["pressure_state"] == "attention"
    assert "cancel.request_stuck" in runtime_summary["cancel"]["pressure_reasons"]
    assert runtime_summary["cancel"]["oldest_request_age_seconds"] >= 300
    assert runtime_summary["callback"]["failed"] == 1
    assert runtime_summary["callback"]["recoverable_dispatching"] == 1
    assert runtime_summary["callback"]["recovery_action"] == (
        "requeue_pending_after_stale_dispatch_lease"
    )
    assert runtime_summary["callback"]["pressure_state"] == "attention"
    assert "callback.failed" in runtime_summary["callback"]["pressure_reasons"]
    assert "callback.overdue" in runtime_summary["callback"]["pressure_reasons"]
    assert "callback.dispatching_stale" in runtime_summary["callback"]["pressure_reasons"]
    assert runtime_summary["callback"]["pending_not_due"] == 0
    assert runtime_summary["callback"]["oldest_due_age_seconds"] >= 600
    assert runtime_summary["retention"]["due_purge"] == 1

    assert callback_runs_response.status_code == 200
    callback_items = callback_runs_response.json()["data"]["items"]
    assert any(
        item["run_id"] == callback_run_id
        and item["callback_last_error_code"] == "runtime.callback_delivery_failed"
        for item in callback_items
    )

    assert cancel_runs_response.status_code == 200
    cancel_items = cancel_runs_response.json()["data"]["items"]
    assert any(item["run_id"] == running_run_id for item in cancel_items)
    assert all(item["run_id"] != queued_run_id for item in cancel_items)

    assert dispatching_runs_response.status_code == 200
    dispatching_items = dispatching_runs_response.json()["data"]["items"]
    assert any(item["run_id"] == dispatching_run_id for item in dispatching_items)

    assert queued_stale_runs_response.status_code == 200
    queued_stale_items = queued_stale_runs_response.json()["data"]["items"]
    assert any(
        item["run_id"] == queued_run_id
        and item["suggested_actions"][0]["action"] == "requeue_stale_queued"
        and item["suggested_actions"][0]["mode"] == "worker_auto"
        for item in queued_stale_items
    )

    assert cancel_stuck_runs_response.status_code == 200
    cancel_stuck_items = cancel_stuck_runs_response.json()["data"]["items"]
    assert any(item["run_id"] == running_run_id for item in cancel_stuck_items)

    assert callback_overdue_runs_response.status_code == 200
    callback_overdue_items = callback_overdue_runs_response.json()["data"]["items"]
    assert any(
        item["run_id"] == overdue_run_id
        and item["suggested_actions"][0]["action"] == "redeliver_failed_callback"
        and item["suggested_actions"][0]["mode"] == "worker_auto"
        for item in callback_overdue_items
    )

    assert guard_events_response.status_code == 200
    guard_items = guard_events_response.json()["data"]["items"]
    assert any(item["event_code"] == "auth.replay_blocked" for item in guard_items)

    assert audit_summary_response.status_code == 200
    audit_summary = audit_summary_response.json()["data"]
    assert audit_summary["totals"]["succeeded"] >= 1
    assert audit_summary["totals"]["error"] >= 1
    assert any(
        item["event_kind"] == "account.upsert" and item["outcome"] == "succeeded"
        for item in audit_summary["groups"]
    )
    assert any(
        item["event_kind"] == "site.activate" and item["outcome"] == "error"
        for item in audit_summary["groups"]
    )

    assert decision_summary_response.status_code == 200
    decision_summary = decision_summary_response.json()["data"]
    assert decision_summary["totals"]["events"] >= 3
    assert decision_summary["totals"]["allow"] >= 3
    assert any(item["decision_code"] == "commercial.allowed" for item in decision_summary["groups"])

    assert abuse_guard_response.status_code == 200
    abuse_guard_payload = abuse_guard_response.json()["data"]
    abuse_guard = abuse_guard_payload["scopes"]
    assert abuse_guard["public_post_site"]["max_requests_per_window"] == 10
    assert any(item["scope_id"] == "site_diag" for item in abuse_guard["public_post_site"]["items"])
    assert abuse_guard["internal_post_token"]["items"][0]["scope_id"] == "internal"
    assert abuse_guard_payload["watchlist_summary"]["highest_severity"] == "critical"
    assert abuse_guard_payload["watchlist_summary"]["request_burst_count"] >= 1
    assert abuse_guard_payload["watchlist_summary"]["reject_storm_count"] >= 1
    public_site_request_item = next(
        item for item in abuse_guard["public_post_site"]["items"] if item["scope_id"] == "site_diag"
    )
    assert public_site_request_item["severity"] == "critical"
    assert public_site_request_item["signal_kind"] == "request_burst"
    assert "request_burst_limit_exceeded" in public_site_request_item["reason_codes"]
    assert public_site_request_item["limit_ratio"] > 1.0
    public_site_cooldown_item = next(
        item
        for item in abuse_guard["public_post_site"]["cooldown_items"]
        if item["scope_id"] == "site_diag"
    )
    assert public_site_cooldown_item["severity"] == "critical"
    assert public_site_cooldown_item["signal_kind"] == "reject_storm"
    assert "reject_storm_limit_exceeded" in public_site_cooldown_item["reason_codes"]
    assert "rejects_include_rate_limits" in public_site_cooldown_item["reason_codes"]
    assert any(
        item["event_code"] == "auth.rate_limit_exceeded"
        for item in public_site_cooldown_item["event_code_breakdown"]
    )
    assert any(
        item["scope_kind"] == REPLAY_SCOPE_PUBLIC_POST_SITE
        and item["scope_id"] == "site_diag"
        and item["signal_kind"] == "reject_storm"
        for item in abuse_guard_payload["watchlist"]
    )
    assert any(
        item["event_code"] == "auth.replay_blocked"
        for item in abuse_guard_payload["guard_event_codes"]
    )
    assert any(
        item["scope_id"] == "site_diag"
        for item in abuse_guard["public_post_site"]["cooldown_items"]
    )

    with get_session(database_url) as session:
        guard_events = list(
            session.scalars(
                select(RuntimeGuardEvent)
                .where(RuntimeGuardEvent.site_id == "site_diag")
                .order_by(RuntimeGuardEvent.id.asc())
            )
        )
    assert any(event.event_code == "auth.replay_blocked" for event in guard_events)

    with get_session(database_url) as session:
        running_run = session.get(RunRecord, running_run_id)
        assert running_run is not None
        running_run.status = "canceled"
        running_run.canceled_at = datetime.now(UTC)
        session.commit()

    canceled_runs_response = client.get(
        "/internal/service/runtime/diagnostics/runs?issue_kind=canceled_recent&site_id=site_diag&limit=5",
        headers=build_internal_headers(),
    )
    assert canceled_runs_response.status_code == 200
    canceled_items = canceled_runs_response.json()["data"]["items"]
    assert any(item["run_id"] == running_run_id for item in canceled_items)

    dispose_engine(database_url)


def test_service_routes_runtime_callback_dispatch_recovery_is_operator_visible(
    tmp_path: Path,
    allow_example_callback_dns: None,
) -> None:
    callback_requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        callback_requests.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(202)

    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_recovery",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    CommercialService(
        database_url,
        settings=_runtime_service_settings(database_url),
    ).update_site_runtime_callbacks(
        site_id="site_recovery",
        terminal_callback={
            "enabled": True,
            "callback_url": "https://example.com/recover",
            "key_id": "runtime_callback_key",
            "secret": RUNTIME_CALLBACK_TEST_SECRET,
            "registration_id": "runtime_terminal",
        },
    )

    payload = {
        "site_id": "site_recovery",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-service-recover-001",
        "task_backend": {
            "enabled": True,
            "mode": "polling",
            "callback_mode": "terminal_callback_required",
            "polling_interval_sec": 60,
        },
        "input": {"messages": [{"role": "user", "content": "recover callback dispatch"}]},
    }
    body = json.dumps(payload).encode("utf-8")
    execute_response = client.post(
        "/v1/runtime/execute",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_recovery",
                idempotency_key="idem-service-recover-001",
                trace_id="traceservicerecover001000000",
                body=body,
            )
        ),
    )

    assert execute_response.status_code == 200
    run_id = str(execute_response.json()["data"]["run_id"])
    trace_id = str(execute_response.json()["data"]["trace_id"])

    with get_session(database_url) as session:
        run = session.get(RunRecord, run_id)
        assert run is not None
        run.callback_status = "dispatching"
        run.callback_attempt_count = 1
        run.callback_last_attempt_at = datetime.now(UTC) - timedelta(minutes=6)
        run.callback_next_attempt_at = None
        session.commit()

    summary_before_response = client.get(
        "/internal/service/runtime/diagnostics/summary?site_id=site_recovery&recent_minutes=120",
        headers=build_internal_headers(),
    )
    assert summary_before_response.status_code == 200
    summary_before = summary_before_response.json()
    assert summary_before["meta"]["revision"] == "m8"
    assert summary_before["data"]["callback"]["recoverable_dispatching"] == 1

    worker = RuntimeService(
        database_url,
        settings=_runtime_service_settings(database_url),
        callback_dispatcher=HttpRuntimeCallbackDispatcher(
            transport=httpx.MockTransport(handler),
        ),
        callback_max_attempts=3,
        callback_retry_backoff_seconds=0,
    )
    dispatched = worker.dispatch_pending_callbacks(max_callbacks=1)

    assert dispatched == [
        {
            "run_id": run_id,
            "callback_status": "delivered",
            "trace_id": trace_id,
            "status_code": 202,
        }
    ]
    assert callback_requests[0]["run_id"] == run_id

    audit_response = client.get(
        "/internal/service/audit-events?event_kind=runtime.callback_dispatch_recovered&site_id=site_recovery&limit=5&include_payload=true",
        headers=build_internal_headers(),
    )
    assert audit_response.status_code == 200
    audit_items = audit_response.json()["data"]["items"]
    assert any(
        item["scope_id"] == run_id
        and item["payload"]["recovery_action"] == "requeue_pending_after_stale_dispatch_lease"
        for item in audit_items
    )

    dispose_engine(database_url)


def test_service_routes_runtime_backlog_diagnostics_exposes_scope_and_stale_layers(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_backlog_a",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    seed_site_auth(
        database_url,
        site_id="site_backlog_b",
        key_id="key_backlog_b",
        secret="npcink-cloud-test-secret-backlog-b",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    queued_payload = {
        "site_id": "site_backlog_a",
        "ability_name": "workflow/media_nightly_image_optimize",
        "ability_family": "automation",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-service-backlog-queued-001",
        "input": {"messages": [{"role": "user", "content": "queued backlog"}]},
    }
    running_payload = {
        "site_id": "site_backlog_a",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-service-backlog-running-001",
        "input": {"messages": [{"role": "user", "content": "running backlog"}]},
    }
    other_payload = {
        "site_id": "site_backlog_b",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-service-backlog-other-001",
        "input": {"messages": [{"role": "user", "content": "fresh second scope"}]},
    }

    queued_body = json.dumps(queued_payload).encode("utf-8")
    running_body = json.dumps(running_payload).encode("utf-8")
    other_body = json.dumps(other_payload).encode("utf-8")
    queued_response = client.post(
        "/v1/runtime/execute",
        content=queued_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_backlog_a",
                idempotency_key="idem-service-backlog-queued-001",
                trace_id="traceservicebacklogqueued0001",
                body=queued_body,
            )
        ),
    )
    running_response = client.post(
        "/v1/runtime/execute",
        content=running_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_backlog_a",
                idempotency_key="idem-service-backlog-running-001",
                trace_id="traceservicebacklogrunning001",
                body=running_body,
            )
        ),
    )
    other_response = client.post(
        "/v1/runtime/execute",
        content=other_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_backlog_b",
                key_id="key_backlog_b",
                secret="npcink-cloud-test-secret-backlog-b",
                idempotency_key="idem-service-backlog-other-001",
                trace_id="traceservicebacklogother0001",
                body=other_body,
            )
        ),
    )

    assert queued_response.status_code == 200
    assert running_response.status_code == 200
    assert other_response.status_code == 200

    queued_run_id = str(queued_response.json()["data"]["run_id"])
    running_run_id = str(running_response.json()["data"]["run_id"])
    other_run_id = str(other_response.json()["data"]["run_id"])

    with get_session(database_url) as session:
        queued_run = session.get(RunRecord, queued_run_id)
        running_run = session.get(RunRecord, running_run_id)
        other_run = session.get(RunRecord, other_run_id)
        assert queued_run is not None
        assert running_run is not None
        assert other_run is not None
        queued_run.status = "queued"
        queued_run.started_at = datetime.now(UTC) - timedelta(minutes=9)
        running_run.status = "running"
        running_run.processing_started_at = datetime.now(UTC) - timedelta(minutes=18)
        other_run.status = "queued"
        other_run.started_at = datetime.now(UTC) - timedelta(seconds=45)
        session.commit()

    site_backlog_response = client.get(
        "/internal/service/runtime/diagnostics/backlog?scope_kind=site_id&limit=10",
        headers=build_internal_headers(),
    )
    family_backlog_response = client.get(
        "/internal/service/runtime/diagnostics/backlog?scope_kind=ability_family&limit=10",
        headers=build_internal_headers(),
    )

    assert site_backlog_response.status_code == 200
    site_payload = site_backlog_response.json()
    assert site_payload["meta"]["revision"] == "m1"
    assert site_payload["data"]["totals"]["queued"]["state"] == "stale"
    assert site_payload["data"]["totals"]["running"]["state"] == "stale"
    assert site_payload["data"]["totals"]["bottleneck_state"] == "mixed"
    assert site_payload["data"]["totals"]["lease_recovery_inputs"]["queued_stale_runs"] == 1
    assert site_payload["data"]["totals"]["lease_recovery_inputs"]["running_stale_runs"] == 1
    assert site_payload["data"]["scope_pressure"]["spread_state"] == "isolated"
    assert site_payload["data"]["scope_pressure"]["stale_scope_count"] == 1
    first_site_item = site_payload["data"]["items"][0]
    assert first_site_item["scope_kind"] == "site_id"
    assert first_site_item["scope_id"] == "site_backlog_a"
    assert first_site_item["queued"]["state"] == "stale"
    assert first_site_item["running"]["state"] == "stale"
    assert first_site_item["bottleneck_state"] == "mixed"
    assert "queue.stale" in first_site_item["pressure_reasons"]
    assert "worker.stale" in first_site_item["pressure_reasons"]

    assert family_backlog_response.status_code == 200
    family_payload = family_backlog_response.json()["data"]
    assert family_payload["scope_pressure"]["scope_kind"] == "ability_family"
    assert any(item["scope_id"] == "automation" for item in family_payload["items"])
    assert any(item["scope_id"] == "workflow" for item in family_payload["items"])

    dispose_engine(database_url)
