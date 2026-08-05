from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import (
    PluginObservabilityEvent,
    RunRecord,
    Site,
    SiteApiKey,
    UsageMeterEvent,
)
from app.dev.seed_feedback_flywheel_demo import (
    FIXTURE_SITE_IDS,
    _validate_local_environment,
    build_fixture_report,
    cleanup_fixture,
    seed_fixture,
)


def _settings(tmp_path: Path, *, environment: str = "test") -> Settings:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'feedback-flywheel-fixture.sqlite3'}"
    init_schema(database_url)
    return Settings(
        _env_file=None,
        environment=environment,
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
    )


def _fixture_counts(settings: Settings) -> dict[str, int]:
    with get_session(settings.database_url) as session:
        return {
            model.__tablename__: int(
                session.scalar(
                    select(func.count()).select_from(model).where(
                        model.site_id.in_(FIXTURE_SITE_IDS)
                    )
                )
                or 0
            )
            for model in (
                Site,
                SiteApiKey,
                RunRecord,
                UsageMeterEvent,
                PluginObservabilityEvent,
            )
        }


def test_fixture_seed_reports_intentional_coverage_gaps_and_sample_stages(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    now = datetime(2026, 7, 30, 12, 0, tzinfo=UTC)

    payload = seed_fixture(settings, now=now)
    report = payload["report"]

    assert payload["fixture_scope"] == "deterministic_synthetic_metadata_only"
    assert report["sites"] == {
        "connected_total": 4,
        "active_runtime_window": 2,
        "monitoring_state_reported_window": 3,
        "monitoring_enabled_window": 2,
        "monitoring_disabled_window": 1,
        "monitoring_state_unknown_total": 1,
        "plugin_observability_window": 1,
        "plugin_observability_on_enabled_window": 1,
        "agent_feedback_window": 1,
        "editor_assist_quality_window": 1,
    }
    assert report["coverage"] == {
        "active_over_connected": 0.5,
        "monitoring_enabled_over_connected": 0.5,
        "plugin_observability_over_monitoring_enabled": 0.5,
        "plugin_observability_over_active": 0.5,
        "agent_feedback_over_active": 0.5,
        "editor_assist_quality_over_active": 0.5,
    }
    assert report["sample_readiness"]["agent_feedback"] == {
        "unit": "event",
        "count": 4,
        "stage": "insufficient",
    }
    assert report["sample_readiness"]["editor_assist_quality"] == {
        "unit": "quality_session",
        "count": 5,
        "stage": "validation",
    }
    assert report["known_gaps"][0]["code"] == "monitoring_state_projection_incomplete"
    assert report["known_gaps"][0]["site_count"] == 1
    assert report["content_storage"] == "none"


def test_fixture_seed_is_replaceable_and_cleanup_is_exact(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    now = datetime(2026, 7, 30, 12, 0, tzinfo=UTC)
    with get_session(settings.database_url) as session:
        session.add(Site(site_id="site_unrelated", name="Unrelated", status="active"))
        session.commit()

    seed_fixture(settings, now=now)
    first_counts = _fixture_counts(settings)
    seed_fixture(settings, now=now)

    assert _fixture_counts(settings) == first_counts == {
        "sites": 4,
        "site_api_keys": 4,
        "run_records": 2,
        "usage_meter_events": 4,
        "plugin_observability_events": 9,
    }
    deleted = cleanup_fixture(settings)
    assert _fixture_counts(settings) == {
        "sites": 0,
        "site_api_keys": 0,
        "run_records": 0,
        "usage_meter_events": 0,
        "plugin_observability_events": 0,
    }
    assert deleted["sites"] == 4
    with get_session(settings.database_url) as session:
        assert session.get(Site, "site_unrelated") is not None


def test_fixture_records_are_metadata_only_and_report_hides_site_identity(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    seed_fixture(settings, now=datetime(2026, 7, 30, 12, 0, tzinfo=UTC))

    with get_session(settings.database_url) as session:
        payloads = [
            event.payload_json
            for event in session.scalars(
                select(PluginObservabilityEvent).where(
                    PluginObservabilityEvent.site_id.in_(FIXTURE_SITE_IDS)
                )
            )
        ]
        payloads.extend(
            event.payload_json
            for event in session.scalars(
                select(UsageMeterEvent).where(UsageMeterEvent.site_id.in_(FIXTURE_SITE_IDS))
            )
        )

    serialized_payloads = json.dumps(payloads, sort_keys=True)
    for forbidden in (
        "prompt",
        "generated_text",
        "post_content",
        "provider_response",
        "secret",
        "credential",
    ):
        assert forbidden not in serialized_payloads

    serialized_report = json.dumps(
        build_fixture_report(
            settings,
            now=datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
        ),
        sort_keys=True,
    )
    for site_id in FIXTURE_SITE_IDS:
        assert site_id not in serialized_report


@pytest.mark.parametrize("environment", ["production", "prod", "staging"])
def test_fixture_rejects_production_like_environments(
    tmp_path: Path,
    environment: str,
) -> None:
    settings = _settings(tmp_path).model_copy(update={"environment": environment})

    with pytest.raises(RuntimeError, match="development-only"):
        seed_fixture(settings)


def test_fixture_rejects_remote_database_even_in_development(tmp_path: Path) -> None:
    settings = _settings(tmp_path).model_copy(
        update={"database_url": "postgresql+psycopg://fixture@db.example.com/cloud"}
    )

    with pytest.raises(RuntimeError, match="require a local database"):
        _validate_local_environment(settings)
