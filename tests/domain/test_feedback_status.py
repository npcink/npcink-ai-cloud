from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.db import get_session, init_schema
from app.core.models import PluginObservabilityEvent, RunRecord, UsageMeterEvent
from app.domain.agent_feedback.contracts import AGENT_FEEDBACK_EVENT_KIND
from app.domain.feedback_status.service import FeedbackOperationalStatusService
from app.domain.observability.editor_assist_quality import (
    ADDON_PLUGIN_SLUG,
    GENERATION_EVENT,
)
from app.domain.observability.editor_assist_quality import (
    CONTRACT_VERSION as EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
)
from tests.conftest import seed_site_auth


def _database_url(tmp_path: Path) -> str:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'feedback-status.sqlite3'}"
    init_schema(database_url)
    return database_url


def _run_record(run_id: str, site_id: str, started_at: datetime) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id=None,
        subscription_id=None,
        plan_version_id=None,
        ability_name="npcink-abilities-toolkit/test",
        ability_family="text",
        skill_id="",
        workflow_id="",
        contract_version="test.v1",
        channel="wordpress",
        execution_kind="text",
        execution_tier="cloud",
        execution_pattern="step_offload",
        data_classification="internal",
        profile_id="default",
        canonical_run_id=None,
        status="succeeded",
        idempotency_key=f"idem-{run_id}",
        request_fingerprint=f"fingerprint-{run_id}",
        trace_id=f"trace-{run_id}",
        input_json={},
        execution_input_ciphertext=None,
        policy_json={},
        selected_provider_id="test",
        selected_model_id="test-model",
        selected_instance_id="test-instance",
        fallback_used=False,
        started_at=started_at,
        processing_started_at=started_at,
        finished_at=started_at,
    )


def test_feedback_status_reports_coverage_and_separate_sample_units(tmp_path: Path) -> None:
    database_url = _database_url(tmp_path)
    now = datetime(2026, 7, 30, 12, 0, tzinfo=UTC)
    seed_site_auth(
        database_url,
        site_id="site-active",
        key_id="key-active",
        expires_at=now + timedelta(days=1),
    )
    seed_site_auth(
        database_url,
        site_id="site-connected-only",
        key_id="key-connected-only",
        expires_at=now + timedelta(days=1),
    )

    with get_session(database_url) as session:
        session.add(_run_record("run-active", "site-active", now - timedelta(hours=1)))
        session.add(
            UsageMeterEvent(
                site_id="site-active",
                event_kind=AGENT_FEEDBACK_EVENT_KIND,
                meter_key="agent_feedback.editor",
                quantity=1,
                dedupe_key="feedback-1",
                payload_json={"contract_version": "cloud_agent_feedback.v1"},
                created_at=now - timedelta(minutes=30),
            )
        )
        for index in range(5):
            session.add(
                PluginObservabilityEvent(
                    dedupe_key=f"quality-{index}",
                    site_id="site-active",
                    schema_version="1",
                    plugin_slug=ADDON_PLUGIN_SLUG,
                    plugin_version="1.0.0",
                    source="local",
                    event_kind=GENERATION_EVENT,
                    event_id=f"event-{index}",
                    status="ok",
                    payload_json={
                        "quality_contract": EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
                        "quality_session_id": f"session-{index}",
                    },
                    received_at=now - timedelta(minutes=20 - index),
                )
            )
        session.add(
            PluginObservabilityEvent(
                dedupe_key="generic-observability",
                site_id="site-active",
                schema_version="1",
                plugin_slug=ADDON_PLUGIN_SLUG,
                source="local",
                event_kind="addon.runtime.ready",
                payload_json={},
                received_at=now - timedelta(minutes=10),
            )
        )
        session.commit()

    report = FeedbackOperationalStatusService(database_url).get_status(
        window_hours=168,
        now=now,
    )

    assert report["sites"] == {
        "connected_total": 2,
        "active_runtime_window": 1,
        "monitoring_enabled_window": None,
        "plugin_observability_window": 1,
        "agent_feedback_window": 1,
        "editor_assist_quality_window": 1,
    }
    assert report["events"]["plugin_observability_total"] == 6
    assert report["events"]["agent_feedback_total"] == 1
    assert report["events"]["editor_assist_quality_total"] == 5
    assert report["events"]["editor_assist_quality_session_total"] == 5
    assert report["coverage"]["active_over_connected"] == 0.5
    assert report["sample_readiness"]["agent_feedback"] == {
        "unit": "event",
        "count": 1,
        "stage": "insufficient",
    }
    assert report["sample_readiness"]["editor_assist_quality"] == {
        "unit": "quality_session",
        "count": 5,
        "stage": "validation",
    }
    assert report["read_only"] is True
    assert report["boundary"]["production_mutation"] is False
    serialized = json.dumps(report, sort_keys=True)
    assert "site-active" not in serialized
    assert '"prompt_text"' not in serialized
    assert '"generated_text"' not in serialized
    assert '"input_json"' not in serialized
    assert '"result_json"' not in serialized


def test_feedback_status_does_not_guess_coverage_without_denominators(tmp_path: Path) -> None:
    report = FeedbackOperationalStatusService(_database_url(tmp_path)).get_status(
        window_hours=720,
        now=datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
    )

    assert report["coverage"] == {
        "active_over_connected": None,
        "plugin_observability_over_active": None,
        "agent_feedback_over_active": None,
        "editor_assist_quality_over_active": None,
    }
    assert report["known_gaps"][0]["code"] == "monitoring_consent_projection_unavailable"
