from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.db import dispose_engine, get_session
from app.core.models import (
    AccountSubscription,
    ProviderCallRecord,
    RunRecord,
    RuntimeGuardEvent,
)
from app.domain.commercial.service import CommercialService, ServiceAuditContext
from app.domain.hosted_model_defaults import TEXT_AI_PROFILE_ID
from app.workers.ops_cadence import run_due_tasks
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


def test_internal_provider_runtime_evidence_summary_is_read_only_and_filterable(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(database_url, site_id="site_provider_evidence")

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = repository.create_run(
            run_id="run_provider_evidence",
            site_id="site_provider_evidence",
            account_id=None,
            subscription_id=None,
            plan_version_id=None,
            ability_name="npcink/test-provider-evidence",
            ability_family="text",
            skill_id="",
            workflow_id="",
            contract_version="v1",
            channel="openapi",
            execution_kind="text",
            execution_tier="cloud",
            execution_pattern="inline",
            data_classification="internal",
            profile_id="text.balanced",
            canonical_run_id=None,
            status="succeeded",
            idempotency_key="idem-provider-evidence",
            request_fingerprint="fingerprint-provider-evidence",
            trace_id="trace-provider-evidence",
            input_json={},
            execution_input_ciphertext=None,
            policy_json={},
        )
        provider_call = repository.record_provider_call(
            run_id=run.run_id,
            provider_id="openai",
            model_id="gpt-test",
            instance_id="openai-global-gpt-test",
            region="global",
            latency_ms=125,
            tokens_in=1000,
            tokens_out=50,
            cost=0.005,
            retry_count=0,
            fallback_used=False,
        )
        CommercialService(database_url).record_provider_call_usage(
            session=session,
            run=run,
            provider_call=provider_call,
            usage_context={
                "input_tokens_uncached": 100,
                "cache_read_tokens": 800,
                "cache_write_tokens": 100,
                "cache_hit_ratio": 0.8,
                "cost_estimate_mode": "cache_rates",
                "cache_affinity_applied": True,
                "context_preflight": "accepted",
                "estimated_input_tokens": 900,
                "requested_output_tokens": 50,
                "context_safety_margin_tokens": 16,
                "estimated_total_tokens": 966,
                "context_window": 4096,
            },
        )
        session.commit()

    unauthorized = client.get(
        "/internal/service/runtime/provider-evidence/summary"
    )
    response = client.get(
        "/internal/service/runtime/provider-evidence/summary"
        "?site_id=site_provider_evidence"
        "&provider_id=openai"
        "&model_id=gpt-test"
        "&ability_name=npcink%2Ftest-provider-evidence"
        "&recent_minutes=120"
        "&lane_limit=10",
        headers=build_internal_headers(),
    )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["revision"] == "m1"
    evidence = payload["data"]
    assert evidence["filters"] == {
        "site_id": "site_provider_evidence",
        "provider_id": "openai",
        "model_id": "gpt-test",
        "ability_name": "npcink/test-provider-evidence",
        "recent_minutes": 120,
        "lane_limit": 10,
    }
    assert evidence["summary"]["evidence_records_total"] == 1
    assert evidence["window"]["record_limit"] == 10000
    assert evidence["window"]["records_truncated"] is False
    assert evidence["summary"]["metering"]["completeness_ratio"] == 1.0
    assert evidence["summary"]["cache"]["read_ratio"] == 0.8
    assert evidence["summary"]["cost"]["cache_monetary_evidence_status"] == (
        "confirmed"
    )
    assert evidence["summary"]["context_preflight"]["accepted_records"] == 1
    assert evidence["lanes"][0]["provider_id"] == "openai"
    assert evidence["lanes"][0]["model_id"] == "gpt-test"
    assert evidence["boundary"]["read_only"] is True
    assert evidence["boundary"]["contains_prompt_or_result_payloads"] is False


def test_image_source_readonly_metrics_summarizes_fast_first_runtime(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    site_id = "site_image_metrics"
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

        def add_image_source_run(
            *,
            run_id: str,
            latency_mode: str,
            status: str = "succeeded",
            provider_error: str = "",
        ) -> None:
            deferred = latency_mode == "fast_first"
            session.add(
                RunRecord(
                    run_id=run_id,
                    site_id=site_id,
                    account_id=subscription.account_id,
                    subscription_id=subscription.subscription_id,
                    plan_version_id=subscription.plan_version_id,
                    ability_name="npcink-toolbox/search-image-source",
                    ability_family="knowledge",
                    skill_id="",
                    workflow_id="",
                    contract_version="image_source_cloud_request.v1",
                    channel="toolbox",
                    execution_kind="image_source",
                    execution_tier="cloud",
                    execution_pattern="step_offload",
                    data_classification="public_reference_media",
                    profile_id="image-source.managed",
                    canonical_run_id=None,
                    status=status,
                    idempotency_key=f"idem-{run_id}",
                    request_fingerprint=f"fingerprint-{run_id}",
                    trace_id=f"trace-{run_id}",
                    cancel_requested_at=None,
                    canceled_at=None,
                    input_json={
                        "latency_mode": latency_mode,
                        "enhancement_mode": "deferred" if deferred else "complete",
                        "query": "sensitive operator query should not appear",
                        "visual_context": {"latency_mode": latency_mode},
                    },
                    execution_input_ciphertext=None,
                    policy_json={},
                    result_ref="inline",
                    result_json={
                        "resolved_provider": "unsplash",
                        "query_chars": 42,
                        "active_sources": [{"provider": "unsplash", "count": 2}],
                        "visual_brief": {
                            "site_context_status": "deferred" if deferred else "ready",
                            "llm_prompt_planner_status": "deferred" if deferred else "ready",
                            "source_context": {"latency_mode": latency_mode},
                        },
                    },
                    error_code=provider_error or None,
                    error_message=None,
                    callback_status="not_requested",
                    callback_attempt_count=0,
                    callback_last_attempt_at=None,
                    callback_delivered_at=None,
                    callback_next_attempt_at=None,
                    callback_last_error_code=None,
                    callback_last_error_message=None,
                    selected_provider_id="unsplash",
                    selected_model_id="image-source-search",
                    selected_instance_id="cloud-managed",
                    fallback_used=False,
                    started_at=now - timedelta(minutes=5),
                    processing_started_at=now - timedelta(minutes=5),
                    finished_at=now - timedelta(minutes=4),
                    retention_expires_at=now + timedelta(days=1),
                    result_purged_at=None,
                )
            )
            session.flush()
            session.add(
                ProviderCallRecord(
                    run_id=run_id,
                    provider_id="unsplash",
                    model_id="image-source-search",
                    instance_id="cloud-managed",
                    region="unspecified",
                    latency_ms=80 if not provider_error else 120,
                    tokens_in=0,
                    tokens_out=0,
                    cost=0.001,
                    retry_count=0,
                    fallback_used=False,
                    error_code=provider_error or None,
                    created_at=now - timedelta(minutes=4),
                )
            )

        add_image_source_run(run_id="run-image-fast", latency_mode="fast_first")
        add_image_source_run(run_id="run-image-complete", latency_mode="complete")
        add_image_source_run(
            run_id="run-image-error",
            latency_mode="fast_first",
            status="failed",
            provider_error="provider.timeout",
        )
        session.commit()

    unauthorized = client.get("/internal/service/admin/image-source-metrics")
    assert unauthorized.status_code == 401

    response = client.get(
        f"/internal/service/admin/image-source-metrics?site_id={site_id}&window_hours=24",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["contract_version"] == "image-source-readonly-metrics.v1"
    assert data["filters"]["site_id"] == site_id
    assert data["totals"]["runs"] == 3
    assert data["totals"]["fast_first_runs"] == 2
    assert data["totals"]["complete_runs"] == 1
    assert data["totals"]["deferred_enrichment_runs"] == 2
    assert data["totals"]["provider_calls"] == 3
    assert data["totals"]["provider_errors"] == 1
    assert data["rates"]["fast_first_rate"] == 0.6667
    assert data["rates"]["provider_error_rate"] == 0.3333
    assert data["providers"][0]["provider_id"] == "unsplash"
    assert data["providers"][0]["calls"] == 3
    assert data["providers"][0]["errors"] == 1
    assert data["boundary"]["direct_wordpress_write"] is False
    assert data["boundary"]["contains_prompt_or_result_payloads"] is False
    payload_text = json.dumps(data, ensure_ascii=False)
    assert "sensitive operator query should not appear" not in payload_text


def test_service_routes_cleanup_retention_and_record_audit(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_openai_text_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_cleanup",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    payload = {
        "site_id": "site_cleanup",
        "ability_name": "npcink-abilities-toolkit/build-article-block-plan",
        "ability_family": "workflow",
        "channel": "openapi",
        "execution_kind": "text",
        "profile_id": "text.balanced",
        "idempotency_key": "idem-cleanup-001",
        "retention_ttl": 60,
        "input": {"messages": [{"role": "user", "content": "expire this result"}]},
    }
    body = json.dumps(payload).encode("utf-8")
    execute_response = client.post(
        "/v1/runtime/execute",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/runtime/execute",
                site_id="site_cleanup",
                idempotency_key="idem-cleanup-001",
                trace_id="tracecleanup0010000000000000000",
                body=body,
            )
        ),
    )
    assert execute_response.status_code == 200
    run_id = execute_response.json()["data"]["run_id"]

    with get_session(database_url) as session:
        run = session.get(RunRecord, run_id)
        assert run is not None
        run.completed_at = datetime.now(UTC) - timedelta(hours=2)
        run.retention_expires_at = datetime.now(UTC) - timedelta(minutes=10)
        session.commit()

    cleanup_response = client.post(
        "/internal/service/runtime/retention/cleanup",
        headers=build_internal_headers(idempotency_key="svc-retention-cleanup-001"),
    )
    assert cleanup_response.status_code == 200
    assert cleanup_response.json()["data"]["purged_runs"] == 1

    with get_session(database_url) as session:
        run = session.get(RunRecord, run_id)
        assert run is not None
        assert run.result_json is None

    audit_response = client.get(
        "/internal/service/audit-events?event_kind=runtime.retention_cleanup&limit=5&include_payload=true",
        headers=build_internal_headers(),
    )
    assert audit_response.status_code == 200
    assert audit_response.json()["data"]["items"][0]["payload"]["purged_runs"] == 1

    dispose_engine(database_url)


def test_service_routes_expose_ops_cadence_summary(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "retention_cleanup_interval_seconds": 60,
            "plugin_observability_cleanup_interval_seconds": 60,
            "usage_rollup_interval_seconds": 60,
            "router_diagnostics_interval_seconds": 60,
            "latency_probe_interval_seconds": 60,
            "alert_provider_degradation_interval_seconds": 60,
            "provider_health_scan_interval_seconds": 60,
        },
    )

    service = CommercialService(database_url)
    now = datetime(2026, 4, 12, 12, 0, tzinfo=UTC)
    audit_context = ServiceAuditContext(
        trace_id="",
        idempotency_key="",
        method="POST",
        path="/internal/workers/test",
        actor_kind="system_worker",
        actor_ref="ops_cadence_test",
    )
    service.record_service_audit_event(
        audit_context=audit_context,
        event_kind="runtime.retention_cleanup.cadence",
        outcome="succeeded",
        scope_kind="ops_cadence",
        scope_id="retention_cleanup",
        payload_json={"purged_runs": 1},
    )
    run_due_tasks(_runtime_service_settings(database_url), now=now + timedelta(seconds=1))
    response = client.get(
        "/internal/service/ops/cadence",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["totals"]["tasks_total"] == 11
    assert any(item["task_id"] == "retention_cleanup" for item in payload["items"])
    assert any(item["task_id"] == "artifact_inventory_reconciliation" for item in payload["items"])
    assert any(item["task_id"] == "payment_order_expiration" for item in payload["items"])
    assert all(item["task_id"] != "hosted_model_governance" for item in payload["items"])
    retention_item = next(
        item for item in payload["items"] if item["task_id"] == "retention_cleanup"
    )
    assert retention_item["last_run_at"] != ""
    assert retention_item["freshness"] in {"fresh", "attention"}

    dispose_engine(database_url)


def test_service_routes_expose_observability_summary(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "worker_heartbeat_interval_seconds": 60,
            "provider_health_scan_interval_seconds": 60,
        },
    )
    settings = _runtime_service_settings(database_url)
    now = datetime(2026, 4, 12, 12, 0, tzinfo=UTC)
    run_due_tasks(settings, now=now)
    CommercialService(database_url, settings=settings).record_service_audit_event(
        audit_context=ServiceAuditContext(
            trace_id="",
            idempotency_key="",
            method="POST",
            path="/internal/workers/runtime_queue/heartbeat",
            actor_kind="system_worker",
            actor_ref="runtime_queue",
        ),
        event_kind="worker.heartbeat",
        outcome="succeeded",
        scope_kind="worker",
        scope_id="runtime_queue",
        payload_json={
            "worker_id": "runtime_queue",
            "status": "idle",
            "recorded_at": now.isoformat().replace("+00:00", "Z"),
        },
    )

    response = client.get(
        "/internal/service/observability/summary?recent_minutes=60&backlog_limit=10",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["ready"]["status"] == "error"
    assert payload["tracing"] == {
        "service_name": "npcink-ai-cloud",
        "otlp_endpoint": "",
        "otlp_configured": False,
        "trace_query_url": "",
        "trace_query_configured": False,
    }
    assert "feature_flags" not in payload
    assert payload["workers"]["totals"]["workers_total"] == 3
    assert any(item["worker_id"] == "runtime_queue" for item in payload["workers"]["items"])
    assert payload["cadence"]["totals"]["tasks_total"] == 11
    assert any(
        item["task_id"] == "artifact_inventory_reconciliation"
        for item in payload["cadence"]["items"]
    )
    assert any(
        item["task_id"] == "payment_order_expiration" for item in payload["cadence"]["items"]
    )
    assert "status_counts" in payload["providers"]
    assert "summary" in payload["runtime"]
    assert "backlog" in payload["runtime"]

    dispose_engine(database_url)


def test_service_routes_observability_summary_reports_external_tracing_configuration(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "otel_exporter_otlp_endpoint": "http://host.docker.internal:4318/v1/traces",
            "otel_trace_query_url": "http://mini.example:16686",
        },
    )

    response = client.get(
        "/internal/service/observability/summary",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["tracing"] == {
        "service_name": "npcink-ai-cloud",
        "otlp_endpoint": "http://host.docker.internal:4318/v1/traces",
        "otlp_configured": True,
        "trace_query_url": "http://mini.example:16686",
        "trace_query_configured": True,
    }

    dispose_engine(database_url)


def test_service_routes_enforce_internal_short_window_rate_limit(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "internal_post_rate_limit_window_seconds": 60,
            "internal_post_max_requests_per_window": 1,
        },
    )

    first_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_limit_1", "name": "Limit One"},
        headers=build_internal_headers(idempotency_key="svc-limit-001"),
    )
    second_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_limit_2", "name": "Limit Two"},
        headers=build_internal_headers(idempotency_key="svc-limit-002"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json()["error_code"] == "auth.rate_limit_exceeded"

    dispose_engine(database_url)


def test_service_routes_enforce_internal_ip_short_window_rate_limit(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "internal_post_rate_limit_window_seconds": 60,
            "internal_post_max_requests_per_window": 10,
            "internal_post_max_requests_per_ip_window": 1,
        },
    )

    first_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_ip_limit_1", "name": "IP Limit One"},
        headers=build_internal_headers(idempotency_key="svc-ip-limit-001"),
    )
    second_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_ip_limit_2", "name": "IP Limit Two"},
        headers=build_internal_headers(idempotency_key="svc-ip-limit-002"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json()["error_code"] == "auth.rate_limit_exceeded"

    dispose_engine(database_url)


def test_service_routes_enforce_internal_guard_cooldown_after_rejects(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "internal_post_rate_limit_window_seconds": 600,
            "internal_post_max_requests_per_window": 10,
            "internal_post_max_requests_per_ip_window": 10,
            "internal_guard_cooldown_window_seconds": 3600,
            "internal_guard_max_reject_events_per_token_window": 1,
            "internal_guard_max_reject_events_per_ip_window": 1,
        },
    )

    first_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_cooldown_1", "name": "Cooldown One"},
        headers=build_internal_headers(idempotency_key="svc-cooldown-001"),
    )
    replay_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_cooldown_replay", "name": "Cooldown Replay"},
        headers=build_internal_headers(idempotency_key="svc-cooldown-001"),
    )
    cooldown_response = client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_cooldown_2", "name": "Cooldown Two"},
        headers=build_internal_headers(idempotency_key="svc-cooldown-002"),
    )

    assert first_response.status_code == 200
    assert replay_response.status_code == 409
    assert replay_response.json()["error_code"] == "auth.replay_blocked"
    assert cooldown_response.status_code == 429
    assert cooldown_response.json()["error_code"] == "auth.rate_limit_exceeded"

    with get_session(database_url) as session:
        events = list(
            session.scalars(select(RuntimeGuardEvent).order_by(RuntimeGuardEvent.id.asc()))
        )
    assert any(event.event_code == "auth.replay_blocked" for event in events)
    assert any(event.event_code == "auth.rate_limit_exceeded" for event in events)

    dispose_engine(database_url)


def test_admin_ai_resources_exposes_recent_runtime_evidence_without_content(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    seed_site_auth(
        database_url,
        site_id="site_ai_resources",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        session.add(
            RunRecord(
                run_id="run_ai_resources_text_recent",
                site_id="site_ai_resources",
                account_id="acct_site_ai_resources",
                subscription_id=None,
                plan_version_id=None,
                ability_name="npcink-toolbox/ai-content-support",
                ability_family="text",
                skill_id="",
                workflow_id="",
                contract_version="hosted_ai_content_support.v1",
                channel="admin",
                execution_kind="text",
                execution_tier="cloud",
                execution_pattern="inline",
                data_classification="public_site_content",
                profile_id=TEXT_AI_PROFILE_ID,
                canonical_run_id=None,
                status="succeeded",
                idempotency_key="idem-ai-resources-text-recent",
                request_fingerprint="fingerprint-ai-resources-text-recent",
                trace_id="trace-ai-resources-text-recent",
                cancel_requested_at=None,
                canceled_at=None,
                input_json={"prompt": "sensitive draft body should not appear"},
                execution_input_ciphertext=None,
                policy_json={},
                result_ref="inline",
                result_json={"output_text": "generated text should not appear"},
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
                selected_model_id="gpt-5.5",
                selected_instance_id="openai-global-gpt-5-5",
                fallback_used=False,
                started_at=now,
                processing_started_at=now,
                finished_at=now,
                retention_expires_at=now + timedelta(days=1),
                result_purged_at=None,
            )
        )
        session.add(
            ProviderCallRecord(
                run_id="run_ai_resources_text_recent",
                provider_id="openai",
                model_id="gpt-5.5",
                instance_id="openai-global-gpt-5-5",
                region="global",
                latency_ms=1234,
                tokens_in=12,
                tokens_out=34,
                cost=0.0042,
                retry_count=0,
                fallback_used=False,
                error_code=None,
                created_at=now,
            )
        )
        session.add(
            ProviderCallRecord(
                run_id="run_ai_resources_text_recent",
                provider_id="openai",
                model_id="gpt-5.5",
                instance_id="openai-global-gpt-5-5",
                region="global",
                latency_ms=25_000,
                tokens_in=10,
                tokens_out=0,
                cost=0.0,
                retry_count=1,
                fallback_used=True,
                error_code="provider.timeout",
                created_at=now - timedelta(days=2),
            )
        )
        session.commit()

    response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    evidence = data["recent_runtime_evidence"]["profiles"][TEXT_AI_PROFILE_ID]
    assert evidence["run_id"] == "run_ai_resources_text_recent"
    assert evidence["status"] == "succeeded"
    assert evidence["provider_id"] == "openai"
    usage = {item["feature_id"]: item for item in data["feature_model_usage"]}
    assert usage["content_support"]["last_run"]["run_id"] == "run_ai_resources_text_recent"
    assert usage["content_support"]["last_provider_call"]["latency_ms"] == 1234
    assert usage["content_support"]["last_provider_call"]["cost"] == 0.0042
    assert usage["content_support"]["evidence"]["content_exposed"] is False
    assert usage["content_support"]["boundary"]["direct_wordpress_write"] is False
    health_rows = {
        (item["provider_id"], item["model_id"]): item
        for item in data["provider_model_health"]["rows"]
    }
    health = health_rows[("openai", "gpt-5.5")]
    assert health["status"] == "healthy"
    assert health["call_count"] == 1
    assert health["success_count"] == 1
    assert health["error_count"] == 0
    assert health["success_rate"] == 1.0
    assert health["avg_latency_ms"] == 1234
    assert health["p95_latency_ms"] == 1234
    assert health["tokens_in"] == 12
    assert health["tokens_out"] == 34
    assert health["cost"] == 0.0042
    assert health["evidence"]["content_exposed"] is False
    assert health["boundary"]["direct_wordpress_write"] is False
    windows = {item["window_id"]: item for item in data["provider_model_health"]["windows"]}
    assert {"last_24h", "last_7d"}.issubset(windows)
    assert windows["last_24h"]["rows"][0]["status"] == "healthy"
    assert windows["last_24h"]["alert_summary"]["alert_count"] == 0
    seven_day_rows = {
        (item["provider_id"], item["model_id"]): item for item in windows["last_7d"]["rows"]
    }
    assert seven_day_rows[("openai", "gpt-5.5")]["status"] == "degraded"
    assert windows["last_7d"]["alert_summary"]["alert_count"] >= 2
    assert {alert["code"] for alert in windows["last_7d"]["alert_summary"]["alerts"]}.issuperset(
        {"provider_model.degraded", "provider_model.fallback_used"}
    )
    assert (
        data["provider_model_health"]["alert_summary"]["boundary"]["automatic_routing_change"]
        is False
    )
    serialized = json.dumps(data)
    assert "sensitive draft body" not in serialized
    assert "generated text should not appear" not in serialized
