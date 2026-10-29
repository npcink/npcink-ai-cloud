from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import update

from app.core.db import get_session
from app.core.models import (
    MediaDerivativeJobMetric,
    PluginObservabilityEvent,
    SiteKnowledgeSearchMetric,
)
from app.domain.observability.plugin_events import PluginObservabilityService
from tests.api import (
    test_editor_assist_quality_routes as quality,
)
from tests.api import (
    test_media_observability_admin as media,
)
from tests.api import (
    test_plugin_observability_admin as plugin,
)
from tests.api import (
    test_vector_observability_admin as vector,
)
from tests.conftest import build_internal_headers


@pytest.mark.parametrize('age_days', [10, 20])
@pytest.mark.parametrize('kind', ['media', 'vector', 'plugin', 'quality'])
def test_observation_windows_include_older_evidence_without_silent_seven_day_clamp(
    tmp_path: Path, kind: str, age_days: int,
) -> None:
    module = {'media': media, 'vector': vector, 'plugin': plugin, 'quality': quality}[kind]
    database_url, client = module._build_client(tmp_path)
    older = datetime.now(UTC) - timedelta(days=age_days)
    if kind == 'media':
        media._seed_media_metrics(database_url)
        model, time_field, route, count = (
            MediaDerivativeJobMetric, 'created_at', 'media-observability', 'jobs_total',
        )
    elif kind == 'vector':
        vector._seed_vector_metrics(database_url)
        model, time_field, route, count = (
            SiteKnowledgeSearchMetric, 'created_at', 'vector-observability', 'search_queries_total',
        )
    elif kind == 'plugin':
        plugin._seed_plugin_events(database_url)
        model, time_field, route, count = (
            PluginObservabilityEvent, 'received_at', 'plugin-observability', 'events_total',
        )
    else:
        PluginObservabilityService(database_url).ingest_events(
            site_id='site-quality', key_id='key_default',
            events=quality._fixture_events(), received_at=older,
        )
        model, time_field, route, count = (
            PluginObservabilityEvent, 'received_at', 'editor-assist-quality', 'session_total',
        )
    with get_session(database_url) as session:
        session.execute(update(model).values({time_field: older}))
        session.commit()
    headers = build_internal_headers(trace_id='traceobservationwindow00000000000')
    for hours in (168, 336, 720):
        response = client.get(
            f'/internal/service/admin/{route}?window_hours={hours}', headers=headers,
        )
        assert response.status_code == 200
        data = response.json()['data']
        assert data['window']['hours'] == hours
        assert (data['totals'][count] > 0) == (hours > age_days * 24)
    for hours in (0, 2161):
        assert client.get(
            f'/internal/service/admin/{route}?window_hours={hours}', headers=headers,
        ).status_code == 422
    assert client.get(f'/internal/service/admin/{route}?window_hours=720').status_code == 401


def test_long_runtime_window_preserves_function_scope_in_summary_and_run_evidence(
    tmp_path: Path,
) -> None:
    database_url, client = media._build_client(tmp_path)
    older = datetime.now(UTC) - timedelta(days=20)
    with get_session(database_url) as session:
        target = media._run_record('window-target', 'site-media-001', status='failed', now=older)
        other = media._run_record('window-other', 'site-media-002', status='succeeded', now=older)
        other.ability_family = 'knowledge'
        other.ability_name = 'other-ability'
        other.profile_id = 'other-profile'
        session.add_all([target, other])
        session.commit()
    headers = build_internal_headers(trace_id='traceruntimewindow000000000000000')
    for minutes in (10080, 20160, 43200):
        query = f'recent_minutes={minutes}&capability=vision'
        response = client.get(f'/internal/service/admin/runtime-telemetry?{query}', headers=headers)
        assert response.status_code == 200
        data = response.json()['data']
        assert data['usage_statistics']['runs'] == (1 if minutes == 43200 else 0)
        runs = client.get(
            f'/internal/service/admin/runtime-telemetry/runs?{query}', headers=headers,
        )
        assert runs.status_code == 200
        assert len(runs.json()['data']['items']) == (1 if minutes == 43200 else 0)
        assert 'input_json' not in runs.text
    for route in ('runtime-telemetry', 'runtime-telemetry/runs'):
        assert client.get(
            f'/internal/service/admin/{route}?recent_minutes=129601', headers=headers,
        ).status_code == 422


def test_exact_run_lookup_keeps_site_window_and_auth_boundaries(tmp_path: Path) -> None:
    db, client = media._build_client(tmp_path)
    now = datetime.now(UTC)
    with get_session(db) as session:
        session.add_all([
            media._run_record("exact-target", "site-media-001", status="failed", now=now),
            media._run_record("exact-other", "site-media-001", status="succeeded", now=now),
            media._run_record("exact-future", "site-media-001", status="failed",
                              now=now + timedelta(days=1)),
            media._run_record("exact-old", "site-media-001", status="failed",
                              now=now - timedelta(days=20)),
        ])
        session.commit()
    path = "/internal/service/admin/runtime-telemetry/runs"
    query = {"site_id": "site-media-001", "run_id": "exact-target", "recent_minutes": 60}
    headers = build_internal_headers()
    assert client.get(path, params=query).status_code == 401
    data = client.get(path, params=query, headers=headers).json()["data"]
    assert [r["run_id"] for r in data["items"]] == ["exact-target"]
    assert data["filters"]["run_id"] == "exact-target"
    assert "input_json" not in str(data) and "output_json" not in str(data)
    for override in ({"site_id": "site-media-002"}, {"run_id": "absent"},
                     {"run_id": "exact-old"}, {"run_id": "exact-future"}):
        assert client.get(path, params={**query, **override}, headers=headers).json()[
            "data"
        ]["items"] == []
    assert client.get(path, params={"run_id": "exact-target"}, headers=headers).status_code == 422
    assert client.get(path, params={**query, "run_id": "exact-old", "recent_minutes": 43200},
                      headers=headers).json()["data"]["items"][0]["run_id"] == "exact-old"
