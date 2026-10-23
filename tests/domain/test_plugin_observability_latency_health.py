from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.db import get_session, init_schema
from app.core.models import PluginObservabilityEvent
from app.domain.observability.plugin_events import (
    LATENCY_WARNING_MS,
    PluginObservabilityService,
)


def _db(tmp_path: Path) -> str:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'latency-health.sqlite3'}"
    init_schema(database_url)
    return database_url


def _add_event(
    database_url: str,
    *,
    dedupe: str,
    event_kind: str,
    latency_ms: int,
    status: str = "ok",
    received_at: datetime | None = None,
) -> None:
    now = received_at or datetime.now(UTC)
    with get_session(database_url) as session:
        session.add(
            PluginObservabilityEvent(
                dedupe_key=dedupe,
                site_id="site-latency-001",
                key_id="key_default",
                schema_version="2026-06-01",
                plugin_slug="npcink-cloud-addon",
                plugin_version="0.1.0",
                source="local",
                event_kind=event_kind,
                event_id=dedupe,
                status=status,
                latency_ms=latency_ms,
                captured_at=now,
                received_at=now,
            )
        )
        session.commit()


def test_editor_assist_llm_latency_does_not_raise_latency_high(tmp_path: Path) -> None:
    database_url = _db(tmp_path)
    now = datetime.now(UTC)
    # Assist wall-clock well above the connection threshold.
    _add_event(
        database_url,
        dedupe="assist-presented",
        event_kind="addon.editor_assist.generation.presented",
        latency_ms=LATENCY_WARNING_MS * 3,
        received_at=now - timedelta(minutes=2),
    )
    _add_event(
        database_url,
        dedupe="assist-outcome",
        event_kind="addon.editor_assist.outcome.observed",
        latency_ms=LATENCY_WARNING_MS * 4,
        received_at=now - timedelta(minutes=1),
    )
    # Low connection-ish event so the site is active without assist pollution.
    _add_event(
        database_url,
        dedupe="heartbeat",
        event_kind="addon.monitoring.state_projected",
        latency_ms=120,
        received_at=now,
    )

    summary = PluginObservabilityService(database_url).get_summary(
        site_id="site-latency-001",
        window_hours=24,
        now=now,
    )

    assert summary["totals"]["events_total"] == 3
    # Health avg excludes editor_assist.* so only the 120ms heartbeat counts.
    assert summary["totals"]["avg_latency_ms"] == 120
    assert "plugin_observability.latency_high" not in summary["health"]["reasons"]
    assert all(
        item["code"] != "plugin_observability.latency_high" for item in summary["attention"]
    )
    # Drill-down still exposes assist wall-clock for operators.
    addon = next(p for p in summary["plugins"] if p["plugin_slug"] == "npcink-cloud-addon")
    assert addon["avg_latency_ms"] > LATENCY_WARNING_MS


def test_non_assist_high_latency_still_raises_latency_high(tmp_path: Path) -> None:
    database_url = _db(tmp_path)
    now = datetime.now(UTC)
    _add_event(
        database_url,
        dedupe="slow-preflight",
        event_kind="preflight.completed",
        latency_ms=LATENCY_WARNING_MS + 500,
        received_at=now,
    )

    summary = PluginObservabilityService(database_url).get_summary(
        site_id="site-latency-001",
        window_hours=24,
        now=now,
    )

    assert summary["totals"]["avg_latency_ms"] == LATENCY_WARNING_MS + 500
    assert "plugin_observability.latency_high" in summary["health"]["reasons"]
    assert any(
        item["code"] == "plugin_observability.latency_high" for item in summary["attention"]
    )
