from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.config import Settings
from app.domain.observability import heartbeat as projection
from app.workers import heartbeat as writer

NOW = datetime(2026, 10, 26, 12, tzinfo=UTC)


def _settings() -> Settings:
    return Settings(environment="test", database_url="sqlite://")


def _events(monkeypatch: pytest.MonkeyPatch, items: object) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    class AuditReader:
        def __init__(self, database_url: str, *, settings: Settings) -> None:
            assert database_url == settings.database_url

        def list_service_audit_events(self, **kwargs: Any) -> dict[str, object]:
            calls.append(kwargs)
            return {"items": items}

    monkeypatch.setattr(projection, "CommercialService", AuditReader)
    return calls


def test_summary_preserves_order_latest_event_thresholds_and_totals(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    worker_ids = ("fresh", "attention", "stale", "missing")
    events = [
        {
            "payload": {
                "worker_id": worker,
                "status": "idle",
                "recorded_at": (NOW - timedelta(seconds=age)).isoformat(),
            }
        }
        for worker, age in zip(worker_ids, (60, 120, 121), strict=False)
    ]
    # First matching event wins; old duplicates and unrelated workers stay ignored.
    events.extend([
        {"payload": {"worker_id": "fresh", "recorded_at": "invalid"}},
        {"payload": {"worker_id": "other", "recorded_at": NOW.isoformat()}},
    ])
    calls = _events(monkeypatch, events)
    result = projection.build_worker_heartbeat_summary(
        _settings(), worker_ids=worker_ids, now=NOW,
    )

    assert result == {
        "generated_at": "2026-10-26T12:00:00Z",
        "interval_seconds": 60,
        "stale_after_seconds": 120,
        "items": [
            {
                "worker_id": worker,
                "freshness": freshness,
                "status": "idle" if age >= 0 else "",
                "last_seen_at": (NOW - timedelta(seconds=age)).isoformat() if age >= 0 else "",
                "age_seconds": age,
            }
            for worker, freshness, age in zip(
                worker_ids, ("fresh", "attention", "stale", "missing"), (60, 120, 121, -1),
                strict=True,
            )
        ],
        "totals": {
            "workers_total": 4, "fresh_total": 1, "attention_total": 1,
            "stale_total": 1, "missing_total": 1,
        },
    }
    assert calls == [{
        "event_kind": "worker.heartbeat", "outcome": "succeeded",
        "limit": 40, "include_payload": True,
    }]


@pytest.mark.parametrize(
    ("payload", "created_at", "age", "freshness", "last_seen"),
    [
        ({"recorded_at": "bad"}, NOW.isoformat(), -1, "missing", "bad"),
        ({}, "2026-10-26T12:00:00", 0, "fresh", "2026-10-26T12:00:00"),
        ({"recorded_at": "2026-10-26T14:00:00+02:00"}, "", 0, "fresh",
         "2026-10-26T14:00:00+02:00"),
        ({"recorded_at": "2026-10-26T12:00:01Z"}, "", 0, "fresh",
         "2026-10-26T12:00:01Z"),
        ({"recorded_at": ""}, "", -1, "missing", ""),
        ([], NOW.isoformat(), -1, "missing", ""),
    ],
)
def test_summary_preserves_timestamp_fallback_and_bad_payload_behavior(
    monkeypatch: pytest.MonkeyPatch, payload: object, created_at: str,
    age: int, freshness: str, last_seen: str,
) -> None:
    _events(monkeypatch, [None, "bad", {"payload": payload, "scope_id": "runtime_queue",
                                         "created_at": created_at}])
    result = projection.build_worker_heartbeat_summary(
        _settings(), worker_ids=("runtime_queue",), now=NOW,
    )
    assert result["items"] == [{
        "worker_id": "runtime_queue", "freshness": freshness,
        "status": "", "last_seen_at": last_seen, "age_seconds": age,
    }]


@pytest.mark.parametrize("items", [None, {}, "bad", [None, 1, {"payload": None}]])
def test_bad_event_collection_and_empty_ids_keep_default_workers(
    monkeypatch: pytest.MonkeyPatch, items: object,
) -> None:
    calls = _events(monkeypatch, items)
    settings = _settings().model_copy(update={"worker_heartbeat_interval_seconds": 1})
    result = projection.build_worker_heartbeat_summary(settings, worker_ids=(), now=NOW)
    assert projection.EXPECTED_WORKER_IDS == (
        "runtime_queue", "callback_dispatch", "ops_cadence",
    )
    assert projection.expected_worker_ids(settings) == projection.EXPECTED_WORKER_IDS
    assert [item["worker_id"] for item in result["items"]] == list(projection.EXPECTED_WORKER_IDS)
    assert result["interval_seconds"] == 30
    assert result["stale_after_seconds"] == 60
    assert result["totals"] == {
        "workers_total": 3, "fresh_total": 0, "attention_total": 0,
        "stale_total": 0, "missing_total": 3,
    }
    assert calls[0]["limit"] == 30


def test_writer_preserves_audit_contract_interval_and_payload_precedence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []

    class AuditWriter:
        def __init__(self, database_url: str, *, settings: Settings) -> None:
            assert database_url == settings.database_url

        def record_service_audit_event(self, **kwargs: Any) -> None:
            calls.append(kwargs)

    monkeypatch.setattr(writer, "CommercialService", AuditWriter)
    heartbeat = writer.WorkerHeartbeat(_settings(), "runtime_queue", 60)
    assert heartbeat.maybe_record(status="started", now=NOW)
    assert not heartbeat.maybe_record(status="idle", now=NOW + timedelta(seconds=59))
    assert heartbeat.maybe_record(status="idle", now=NOW + timedelta(seconds=60))
    assert heartbeat.maybe_record(status="forced", now=NOW + timedelta(seconds=61), force=True)
    assert len(calls) == 3
    assert heartbeat.last_recorded_at == NOW + timedelta(seconds=61)
    first = calls[0]
    context = first.pop("audit_context")
    assert asdict(context) == {
        "trace_id": "", "idempotency_key": "", "method": "POST",
        "path": "/internal/workers/runtime_queue/heartbeat",
        "actor_kind": "system_worker", "actor_ref": "runtime_queue", "request_fingerprint": "",
    }
    assert first == {
        "event_kind": "worker.heartbeat", "outcome": "succeeded",
        "scope_kind": "worker", "scope_id": "runtime_queue",
        "payload_json": {"worker_id": "runtime_queue", "status": "started",
                         "recorded_at": "2026-10-26T12:00:00Z"},
    }
    assert writer.WORKER_HEARTBEAT_EVENT_KIND == "worker.heartbeat"
    assert writer.WORKER_SCOPE_KIND == "worker"
    result = writer.record_worker_heartbeat(
        _settings(), worker_id="runtime_queue", now=NOW,
        payload={"status": "custom", "recorded_at": "override"},
    )
    assert result == calls[-1]["payload_json"] == {
        "worker_id": "runtime_queue", "status": "custom", "recorded_at": "override",
    }
