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
