from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.core.config import Settings
from app.core.db import init_schema
from app.dev.editor_assist_quality_status import build_payload
from app.domain.observability.plugin_events import PluginObservabilityService
from tests.api.test_editor_assist_quality_routes import _fixture_events
from tests.conftest import seed_site_auth


def _settings(tmp_path: Path) -> Settings:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'quality-status.sqlite3'}"
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site-quality", scopes=["stats:read"])
    return Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
    )


def test_status_keeps_natural_sample_gate_and_no_mutation_boundary(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    PluginObservabilityService(settings.database_url).ingest_events(
        site_id="site-quality",
        key_id="key_default",
        events=_fixture_events(),
        received_at=datetime.now(UTC),
    )

    payload = build_payload(settings, window_hours=168, minimum_sessions=5)

    assert payload["contract_version"] == "editor_assist_quality_pilot_status.v1"
    assert payload["summary"]["read_only"] is True
    assert payload["pilot"] == {
        "mode": "technical_monitoring_only",
        "observation_window_hours": 168,
        "minimum_sessions": 5,
        "session_total": 5,
        "sample_gate": "met",
        "manual_decision_ready": True,
        "natural_traffic_required": True,
        "synthetic_samples_count_as_natural_traffic": False,
        "next_action": "manual_review",
        "automatic_prompt_mutation": False,
        "automatic_model_mutation": False,
        "automatic_router_mutation": False,
        "read_only": True,
    }


def test_status_stays_insufficient_below_manual_decision_threshold(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    payload = build_payload(settings, window_hours=168, minimum_sessions=50)

    assert payload["pilot"]["sample_gate"] == "insufficient"
    assert payload["pilot"]["manual_decision_ready"] is False
    assert payload["pilot"]["next_action"] == "continue_natural_observation"
