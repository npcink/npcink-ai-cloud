from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import PluginObservabilityEvent
from app.core.services import CloudServices
from app.domain.observability.editor_assist_quality import (
    CONTRACT_VERSION,
    EditorAssistQualityService,
)
from app.domain.observability.plugin_events import PluginObservabilityService
from tests.conftest import (
    build_auth_headers,
    build_internal_headers,
    merge_json_headers,
    seed_site_auth,
)

FIXTURE_PATH = (
    Path(__file__).parents[1]
    / "fixtures"
    / "editor_assist_quality"
    / "quality_events.json"
)


def _build_client(tmp_path: Path) -> tuple[str, TestClient]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'editor-quality.sqlite3'}"
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site-quality", scopes=["stats:read"])
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
    )
    return database_url, TestClient(create_app(CloudServices(settings=settings)))


def _fixture_events() -> list[dict[str, object]]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert payload["contract_version"] == CONTRACT_VERSION
    return payload["events"]


def test_editor_assist_quality_summary_builds_problem_candidates(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    PluginObservabilityService(database_url).ingest_events(
        site_id="site-quality",
        key_id="key_default",
        events=_fixture_events(),
        received_at=datetime.now(UTC),
    )

    response = client.get(
        "/internal/service/admin/editor-assist-quality?window_hours=24",
        headers=build_internal_headers(
            trace_id="traceeditorquality0010000000000000"
        ),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["contract_version"] == CONTRACT_VERSION
    assert data["read_only"] is True
    assert data["boundary"] == {
        "production_mutation": False,
        "automatic_prompt_mutation": False,
        "automatic_model_mutation": False,
        "automatic_router_mutation": False,
        "approval_truth": "wordpress_local",
        "preflight_truth": "wordpress_local",
        "final_write_truth": "wordpress_local",
        "control_plane": "wordpress_local",
        "raw_content_retention": False,
    }
    assert data["totals"]["session_total"] == 5
    assert data["totals"]["generation_total"] == 5
    assert data["totals"]["repeated_session_total"] == 2
    assert data["totals"]["repeat_session_rate"] == 0.4
    assert data["totals"]["exact_saved_session_total"] == 1
    assert data["totals"]["exact_saved_rate"] == 0.2
    assert data["totals"]["expired_without_save_session_total"] == 2
    assert data["totals"]["expired_without_save_rate"] == 0.4
    assert data["totals"]["p50_generation_latency_ms"] == 300
    assert data["totals"]["p95_generation_latency_ms"] == 500
    assert data["tasks"][0]["task_key"] == "content_summary"
    assert {
        candidate["code"] for candidate in data["issue_candidates"]
    } == {
        "editor_assist.repeat_pressure",
        "editor_assist.no_save_pressure",
        "editor_assist.exact_adoption_low",
    }
    assert all(
        candidate["next_action"] == "run_fixed_corpus_evaluation"
        and candidate["recommended_eval_task"] == "summary_hard_gate"
        and candidate["production_mutation"] is False
        for candidate in data["issue_candidates"]
    )


def test_editor_assist_quality_internal_route_requires_auth(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    response = client.get("/internal/service/admin/editor-assist-quality")
    assert response.status_code in (401, 403)
    assert response.json()["status"] == "error"


def test_editor_assist_quality_public_ingestion_accepts_only_metadata(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    event = _fixture_events()[0]
    payload = {
        "contract_version": "magick-plugin-observability-v1",
        "source": "npcink-cloud-addon",
        "events": [event],
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    response = client.post(
        "/v1/observability/plugin-events",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/observability/plugin-events",
                site_id="site-quality",
                body=body,
                idempotency_key="editor-quality-ingest-1",
                trace_id="traceeditorquality0020000000000000",
            )
        ),
    )
    assert response.status_code == 200

    with get_session(database_url) as session:
        stored = session.scalar(select(PluginObservabilityEvent))
        assert stored is not None
        assert stored.payload_json["quality_contract"] == CONTRACT_VERSION
        assert stored.payload_json["task_key"] == "content_summary"
        assert stored.payload_json["content_storage"] == "omitted_metadata_only"
        assert "content" not in stored.payload_json
        assert "prompt" not in stored.payload_json

    payload["events"][0]["prompt"] = "must not be accepted"
    body = json.dumps(payload, separators=(",", ":")).encode()
    rejected = client.post(
        "/v1/observability/plugin-events",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/observability/plugin-events",
                site_id="site-quality",
                body=body,
                idempotency_key="editor-quality-ingest-raw-1",
                trace_id="traceeditorquality0030000000000000",
            )
        ),
    )
    assert rejected.status_code == 422


def test_editor_assist_quality_task_filter_is_read_only(tmp_path: Path) -> None:
    database_url, _ = _build_client(tmp_path)
    events = _fixture_events()
    events.append(
        {
            **events[0],
            "event_id": "evt_quality_title_generation",
            "quality_session_id": "quality_title_1",
            "task_key": "title_generation",
        }
    )
    PluginObservabilityService(database_url).ingest_events(
        site_id="site-quality",
        key_id="key_default",
        events=events,
        received_at=datetime.now(UTC),
    )

    summary = EditorAssistQualityService(database_url).get_summary(
        task_key="title_generation"
    )
    assert summary["filters"]["task_key"] == "title_generation"
    assert summary["totals"]["session_total"] == 1
    assert summary["tasks"][0]["task_key"] == "title_generation"
