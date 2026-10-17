from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.exc import StatementError

from app.core.config import Settings
from app.core.db import dispose_engine, init_schema
from app.domain.catalog.service import CatalogService
from app.domain.commercial.service import CommercialService, ServiceAuditContext
from app.domain.media_artifacts.lifecycle import (
    MediaArtifactLifecycleError,
    MediaArtifactLifecycleService,
)
from app.workers import ops_cadence as ops_cadence_module
from app.workers.ops_cadence import build_cadence_summary, run_due_tasks


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'ops-cadence-worker.sqlite3'}"


def test_editor_assist_quality_detection_records_bounded_read_only_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeEditorAssistQualityService:
        def __init__(self, database_url: str) -> None:
            assert database_url == "sqlite+pysqlite:///:memory:"

        def get_summary(self, *, window_hours: int) -> dict[str, object]:
            assert window_hours == 168
            return {
                "contract_version": "editor_assist_quality.v2",
                "totals": {
                    "session_total": 65,
                    "resolved_session_total": 60,
                    "sample_stage": "observation",
                },
                "issue_candidates": [
                    {
                        "code": "editor_assist.repeat_pressure",
                        "task_key": "content_summary",
                        "confidence": "medium",
                        "persistence": "sustained",
                        "sample_size": 65,
                        "actionable": False,
                    }
                ],
            }

    monkeypatch.setattr(
        ops_cadence_module,
        "EditorAssistQualityService",
        FakeEditorAssistQualityService,
    )
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url="sqlite+pysqlite:///:memory:",
        redis_url="redis://localhost:6379/0",
    )

    payload = ops_cadence_module._run_editor_assist_quality_detection(settings)

    assert payload == {
        "contract_version": "editor_assist_quality.v2",
        "window_hours": 168,
        "session_total": 65,
        "resolved_session_total": 60,
        "sample_stage": "observation",
        "issue_candidate_total": 1,
        "sustained_issue_candidate_total": 1,
        "actionable_issue_candidate_total": 0,
        "candidate_refs": [
            {
                "code": "editor_assist.repeat_pressure",
                "task_key": "content_summary",
                "confidence": "medium",
                "persistence": "sustained",
                "sample_size": 65,
            }
        ],
        "read_only": True,
        "production_mutation": False,
        "automatic_evaluation_trigger": False,
        "content_storage": "omitted_metadata_only",
    }


def test_ops_cadence_worker_records_managed_task_audit_and_respects_intervals(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    artifact_root = tmp_path / "artifacts"
    artifact_root.mkdir()
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
        retention_cleanup_interval_seconds=60,
        retention_cleanup_batch_size=2,
        plugin_observability_cleanup_interval_seconds=60,
        usage_rollup_interval_seconds=60,
        router_diagnostics_interval_seconds=60,
        latency_probe_interval_seconds=60,
        alert_provider_degradation_interval_seconds=60,
        provider_health_scan_interval_seconds=60,
        artifact_cleanup_interval_seconds=60,
        artifact_store_root=str(artifact_root),
        artifact_reconciliation_interval_seconds=60,
    )

    first_now = datetime(2026, 4, 12, 12, 0, tzinfo=UTC)
    first_results = run_due_tasks(settings, now=first_now)

    assert {item["task_id"] for item in first_results} == {
        "retention_cleanup",
        "plugin_observability_cleanup",
        "usage_rollup",
        "site_knowledge_observability_cleanup",
        "router_diagnostics_summary",
        "latency_probe_summary",
        "alert_provider_degradation",
        "provider_health_scan",
        "artifact_cleanup",
        "artifact_inventory_reconciliation",
        "payment_order_expiration",
    }
    assert all(item["outcome"] == "succeeded" for item in first_results)
    retention_cleanup = next(
        item for item in first_results if item["task_id"] == "retention_cleanup"
    )
    assert retention_cleanup["payload"]["retention_batch_limit"] == 2
    assert retention_cleanup["payload"]["retention_remaining_due_runs"] == 0
    assert retention_cleanup["payload"]["retention_partial"] is False
    artifact_cleanup = next(item for item in first_results if item["task_id"] == "artifact_cleanup")
    assert artifact_cleanup["payload"] == {
        "claimed": 0,
        "purged": 0,
        "retry_scheduled": 0,
        "stale_claims_reclaimed": 0,
        "superseded_finalizations": 0,
        "interval_seconds": 60,
    }
    artifact_reconciliation = next(
        item for item in first_results if item["task_id"] == "artifact_inventory_reconciliation"
    )
    assert artifact_reconciliation["payload"] == {
        "store_examined": 0,
        "referenced_present": 0,
        "orphan_observed": 0,
        "orphan_deferred": 0,
        "orphan_eligible": 0,
        "cleanup_candidates_eligible": 0,
        "db_available_examined": 0,
        "referenced_missing": 0,
        "pass_started": 1,
        "pass_busy": 0,
        "pass_completed": 1,
        "pass_abandoned": 0,
        "candidates_claimed": 0,
        "candidates_deleted": 0,
        "candidates_invalidated": 0,
        "retry_scheduled": 0,
        "stale_claims_reclaimed": 0,
        "superseded_finalizations": 0,
        "cleanup_fence_busy": 0,
        "deletion_enabled": False,
        "fixed_root_sessions_supported": True,
        "interval_seconds": 60,
    }
    assert (artifact_root / ".artifact-store-generation").exists() is False

    service = CommercialService(database_url, settings=settings)
    first_events = service.list_service_audit_events(
        limit=20,
        include_payload=True,
    )["items"]
    assert len(first_events) == 11
    cleanup_event = next(
        item for item in first_events if item["event_kind"] == "runtime.artifact_cleanup.cadence"
    )
    assert cleanup_event["payload"] == artifact_cleanup["payload"]
    reconciliation_event = next(
        item
        for item in first_events
        if item["event_kind"] == "runtime.artifact_inventory_reconciliation.cadence"
    )
    assert reconciliation_event["payload"] == artifact_reconciliation["payload"]
    assert all(item["task_id"] != "editor_assist_quality_detection" for item in first_results)

    latest_created_at = datetime.fromisoformat(
        str(first_events[0]["created_at"]).replace("Z", "+00:00")
    )
    second_results = run_due_tasks(settings, now=latest_created_at + timedelta(seconds=30))
    assert second_results == []

    third_results = run_due_tasks(settings, now=latest_created_at + timedelta(seconds=61))
    assert len(third_results) == 11
    assert {item["task_id"] for item in third_results} == {
        "retention_cleanup",
        "plugin_observability_cleanup",
        "site_knowledge_observability_cleanup",
        "usage_rollup",
        "router_diagnostics_summary",
        "latency_probe_summary",
        "alert_provider_degradation",
        "provider_health_scan",
        "artifact_cleanup",
        "artifact_inventory_reconciliation",
        "payment_order_expiration",
    }

    fourth_results = run_due_tasks(settings, now=latest_created_at + timedelta(seconds=121))
    assert {item["task_id"] for item in fourth_results} == {
        "retention_cleanup",
        "plugin_observability_cleanup",
        "site_knowledge_observability_cleanup",
        "usage_rollup",
        "router_diagnostics_summary",
        "latency_probe_summary",
        "alert_provider_degradation",
        "provider_health_scan",
        "artifact_cleanup",
        "artifact_inventory_reconciliation",
        "payment_order_expiration",
    }

    fifth_results = run_due_tasks(settings, now=latest_created_at + timedelta(seconds=301))
    assert {item["task_id"] for item in fifth_results} == {
        "retention_cleanup",
        "plugin_observability_cleanup",
        "site_knowledge_observability_cleanup",
        "usage_rollup",
        "router_diagnostics_summary",
        "latency_probe_summary",
        "alert_provider_degradation",
        "provider_health_scan",
        "artifact_cleanup",
        "artifact_inventory_reconciliation",
        "payment_order_expiration",
    }

    dispose_engine(database_url)


def test_cadence_summary_hides_stale_error_details_after_newer_success(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
    )
    service = CommercialService(database_url, settings=settings)
    audit_context = ServiceAuditContext(
        trace_id="",
        idempotency_key="",
        method="POST",
        path="/internal/workers/ops-cadence/retention_cleanup",
        actor_kind="system_worker",
        actor_ref="ops_cadence",
    )
    service.record_service_audit_event(
        audit_context=audit_context,
        event_kind="runtime.retention_cleanup.cadence",
        outcome="error",
        scope_kind="ops_cadence",
        scope_id="retention_cleanup",
        payload_json={"message": "old error", "error_code": "ops.cadence_task_failed"},
    )
    service.record_service_audit_event(
        audit_context=audit_context,
        event_kind="runtime.retention_cleanup.cadence",
        outcome="succeeded",
        scope_kind="ops_cadence",
        scope_id="retention_cleanup",
        payload_json={"purged_runs": 1},
    )

    summary = build_cadence_summary(settings, now=datetime.now(UTC))
    item = next(
        candidate for candidate in summary["items"] if candidate["task_id"] == "retention_cleanup"
    )
    assert item["last_outcome"] == "succeeded"
    assert item["last_error_at"] == ""
    assert item["last_error_message"] == ""
    assert item["last_error_code"] == ""

    dispose_engine(database_url)


def test_artifact_cleanup_unexpected_delete_error_records_stable_cadence_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
        artifact_cleanup_interval_seconds=60,
    )

    def fail_cleanup(
        _service: MediaArtifactLifecycleService,
        **_kwargs: object,
    ) -> dict[str, int]:
        raise MediaArtifactLifecycleError() from None

    monkeypatch.setattr(
        MediaArtifactLifecycleService,
        "cleanup_expired_artifacts",
        fail_cleanup,
    )
    monkeypatch.setattr(
        ops_cadence_module,
        "cadence_task_specs",
        lambda: [
            ops_cadence_module.CadenceTaskSpec(
                task_id="artifact_cleanup",
                event_kind="runtime.artifact_cleanup.cadence",
                interval_seconds=lambda _settings: 60,
                runner=ops_cadence_module._run_artifact_cleanup,
            )
        ],
    )

    results = run_due_tasks(settings, now=datetime(2026, 7, 15, 19, 0, tzinfo=UTC))

    assert results == [
        {
            "task_id": "artifact_cleanup",
            "event_kind": "runtime.artifact_cleanup.cadence",
            "outcome": "error",
            "payload": {
                "interval_seconds": 60,
                "message": "media artifact lifecycle cleanup failed",
                "error_code": "ops.cadence_task_failed",
            },
        }
    ]
    dispose_engine(database_url)


def test_artifact_cleanup_claim_database_error_never_reaches_cadence_payload_or_log(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
        artifact_cleanup_interval_seconds=60,
    )
    private_statement = "SELECT purge_claim_id FROM media_artifacts WHERE storage_key=:key"
    private_storage_key = "private/object/cadence-claim.png"

    def fail_claim(
        _service: MediaArtifactLifecycleService,
        **_kwargs: object,
    ) -> tuple[list[object], int]:
        raise StatementError(
            "private cadence claim failure",
            private_statement,
            {"key": private_storage_key},
            RuntimeError("private database driver detail"),
        )

    monkeypatch.setattr(MediaArtifactLifecycleService, "_claim_batch", fail_claim)
    monkeypatch.setattr(
        ops_cadence_module,
        "cadence_task_specs",
        lambda: [
            ops_cadence_module.CadenceTaskSpec(
                task_id="artifact_cleanup",
                event_kind="runtime.artifact_cleanup.cadence",
                interval_seconds=lambda _settings: 60,
                runner=ops_cadence_module._run_artifact_cleanup,
            )
        ],
    )
    caplog.set_level("ERROR", logger="npcink_ai_cloud.ops_cadence")

    results = run_due_tasks(settings, now=datetime(2026, 7, 15, 19, 1, tzinfo=UTC))

    assert results[0]["payload"] == {
        "interval_seconds": 60,
        "message": "media artifact lifecycle cleanup failed",
        "error_code": "ops.cadence_task_failed",
    }
    observed = f"{results!r}\n{caplog.text}"
    assert private_statement not in observed
    assert private_storage_key not in observed
    assert "private database driver detail" not in observed
    dispose_engine(database_url)


def test_artifact_reconciliation_error_is_independent_stable_and_redacted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
        artifact_reconciliation_interval_seconds=60,
    )
    private_path = "/private/customer/artifact.png"

    class FailingInventoryStore:
        chunk_size = 4096

        def list_objects(self, **_kwargs: object) -> object:
            raise StatementError(
                "private inventory query failed",
                private_path,
                {"path": private_path},
                RuntimeError("private inventory driver detail"),
            )

        def contains(self, storage_key: str) -> bool:
            raise AssertionError(storage_key)

    import app.domain.media_artifacts as media_artifacts_module

    monkeypatch.setattr(
        media_artifacts_module,
        "build_artifact_store",
        lambda _settings: FailingInventoryStore(),
    )
    monkeypatch.setattr(
        ops_cadence_module,
        "cadence_task_specs",
        lambda: [
            ops_cadence_module.CadenceTaskSpec(
                task_id="artifact_inventory_reconciliation",
                event_kind="runtime.artifact_inventory_reconciliation.cadence",
                interval_seconds=lambda _settings: 60,
                runner=ops_cadence_module._run_artifact_inventory_reconciliation,
            )
        ],
    )
    caplog.set_level("ERROR", logger="npcink_ai_cloud.ops_cadence")

    results = run_due_tasks(settings, now=datetime(2026, 7, 15, 19, 2, tzinfo=UTC))

    assert results == [
        {
            "task_id": "artifact_inventory_reconciliation",
            "event_kind": "runtime.artifact_inventory_reconciliation.cadence",
            "outcome": "error",
            "payload": {
                "interval_seconds": 60,
                "message": "media artifact orphan reconciliation failed",
                "error_code": "ops.cadence_task_failed",
            },
        }
    ]
    observed = f"{results!r}\n{caplog.text}"
    assert private_path not in observed
    dispose_engine(database_url)


def test_artifact_reconciliation_store_construction_error_is_redacted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    private_root = tmp_path / "private-customer-artifact-root"
    private_root.symlink_to(private_root, target_is_directory=True)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
        artifact_store_root=str(private_root),
        artifact_reconciliation_interval_seconds=60,
    )
    monkeypatch.setattr(
        ops_cadence_module,
        "cadence_task_specs",
        lambda: [
            ops_cadence_module.CadenceTaskSpec(
                task_id="artifact_inventory_reconciliation",
                event_kind="runtime.artifact_inventory_reconciliation.cadence",
                interval_seconds=lambda _settings: 60,
                runner=ops_cadence_module._run_artifact_inventory_reconciliation,
            )
        ],
    )
    caplog.set_level("ERROR", logger="npcink_ai_cloud.ops_cadence")

    results = run_due_tasks(settings, now=datetime(2026, 7, 15, 19, 3, tzinfo=UTC))

    assert results[0]["payload"] == {
        "interval_seconds": 60,
        "message": "media artifact orphan reconciliation failed",
        "error_code": "ops.cadence_task_failed",
    }
    observed = f"{results!r}\n{caplog.text}"
    assert str(private_root) not in observed
    dispose_engine(database_url)


def test_optional_diagnostics_default_to_hourly_without_changing_core_cadences() -> None:
    settings = Settings(_env_file=None, environment="test")
    for field in (
        "router_diagnostics_interval_seconds",
        "latency_probe_interval_seconds",
        "alert_provider_degradation_interval_seconds",
    ):
        assert getattr(settings, field) == 3600
    assert settings.alert_worker_window_minutes == 30
    assert settings.provider_health_scan_interval_seconds == 900
    assert settings.usage_rollup_interval_seconds == 3600
    assert settings.retention_cleanup_interval_seconds == 3600
    assert settings.runtime_callback_worker_poll_seconds == 5


@pytest.mark.parametrize("elapsed", [900, 3599, 3600, 86401])
def test_due_tasks_obey_hourly_schedule_and_never_auto_run_quality(
    monkeypatch: pytest.MonkeyPatch,
    elapsed: int,
) -> None:
    from dataclasses import replace

    now = datetime(2026, 10, 17, 12, tzinfo=UTC)
    settings = Settings(_env_file=None, environment="test")
    called = []

    class AuditSink:
        def __init__(self, *_args, **_kwargs):
            pass

        def record_service_audit_event(self, **_kwargs):
            pass

    specs = [
        replace(spec, runner=lambda _settings, task_id=spec.task_id: called.append(task_id) or {})
        for spec in ops_cadence_module.cadence_task_specs()
    ]
    monkeypatch.setattr(ops_cadence_module, "CommercialService", AuditSink)
    monkeypatch.setattr(ops_cadence_module, "cadence_task_specs", lambda: specs)
    monkeypatch.setattr(
        ops_cadence_module,
        "_latest_event",
        lambda *_args, **_kwargs: {"created_at": now.isoformat()},
    )
    run_due_tasks(settings, now=now + timedelta(seconds=elapsed))
    assert "editor_assist_quality_detection" not in called
    optional = {"router_diagnostics_summary", "latency_probe_summary", "alert_provider_degradation"}
    assert optional.intersection(called) == (optional if elapsed >= 3600 else set())
    if elapsed >= 3600:
        assert {
            "usage_rollup",
            "retention_cleanup",
            "artifact_cleanup",
            "payment_order_expiration",
        }.issubset(called)


def test_manual_quality_is_reported_separately_without_stale_health_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 10, 17, 12, tzinfo=UTC)
    settings = Settings(_env_file=None, environment="test")
    monkeypatch.setattr(ops_cadence_module, "CommercialService", lambda *_args, **_kwargs: object())

    def event(*_args, **kwargs):
        assert kwargs["event_kind"] != "editor_assist.quality_detection.cadence"
        if kwargs.get("outcome") == "error":
            return None
        return {"created_at": (now - timedelta(seconds=30)).isoformat(), "outcome": "succeeded"}

    monkeypatch.setattr(ops_cadence_module, "_latest_event", event)
    report = build_cadence_summary(settings, now=now)
    assert report["totals"]["tasks_total"] == 11
    assert report["totals"]["non_fresh_total"] == 0
    assert report["manual_tasks"] == [
        {
            "task_id": "editor_assist_quality_detection",
            "execution_mode": "manual",
        }
    ]
    assert all(row["task_id"] != "editor_assist_quality_detection" for row in report["items"])


def test_manual_quality_command_executes_once_without_worker_heartbeat(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import json
    import sys

    settings = Settings(_env_file=None, environment="test")
    calls = []
    monkeypatch.setattr(
        sys, "argv", ["ops-cadence", "--manual-task", "editor_assist_quality_detection"]
    )
    monkeypatch.setattr(ops_cadence_module, "get_settings", lambda: settings)
    monkeypatch.setattr(ops_cadence_module, "require_database_connection", lambda _url: None)
    monkeypatch.setattr(ops_cadence_module, "configure_logging", lambda _level: None)
    monkeypatch.setattr(
        ops_cadence_module,
        "_run_editor_assist_quality_detection",
        lambda _settings: calls.append("quality") or {"read_only": True},
    )

    def no_daemon(*_args, **_kwargs):
        raise AssertionError("manual analysis must not start or impersonate the cadence worker")

    monkeypatch.setattr(ops_cadence_module, "WorkerHeartbeat", no_daemon)
    monkeypatch.setattr(ops_cadence_module.time, "sleep", no_daemon)
    ops_cadence_module.main()
    assert calls == ["quality"]
    assert json.loads(capsys.readouterr().out) == {"read_only": True}


def test_manual_command_rejects_scheduled_tasks_before_loading_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import sys

    monkeypatch.setattr(sys, "argv", ["ops-cadence", "--manual-task", "retention_cleanup"])

    def no_runtime():
        raise AssertionError("invalid manual task must fail before runtime initialization")

    monkeypatch.setattr(ops_cadence_module, "get_settings", no_runtime)
    with pytest.raises(SystemExit) as error:
        ops_cadence_module.main()
    assert error.value.code == 2


@pytest.mark.parametrize(
    ("interval", "configured_window", "expected_window"),
    [
        (900, None, 30),
        (3600, None, 60),
        (900, 30, 30),
        (3600, 30, 60),
        (3600, 120, 120),
        (3600, 60, 60),
        (3601, 30, 61),
        (172800, 30, 1440),
    ],
)
def test_degradation_window_covers_schedule_and_preserves_legacy_override_cost(
    monkeypatch: pytest.MonkeyPatch,
    interval: int,
    configured_window: int | None,
    expected_window: int,
) -> None:
    overrides = (
        {"alert_worker_window_minutes": configured_window} if configured_window is not None else {}
    )
    settings = Settings(
        _env_file=None,
        environment="test",
        alert_provider_degradation_interval_seconds=interval,
        **overrides,
    )
    observed = []

    def run(effective_settings: Settings) -> dict:
        observed.append(effective_settings.alert_worker_window_minutes)
        return {}

    monkeypatch.setattr(ops_cadence_module, "run_alert_provider_degradation", run)
    result = ops_cadence_module._run_alert_provider_degradation_summary(settings)
    assert observed == [expected_window]
    assert result["window_minutes"] == expected_window
    assert settings.alert_worker_window_minutes == (configured_window or 30)
