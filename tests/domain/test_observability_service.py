from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    CatalogInstance,
    CatalogModel,
    CatalogProvider,
    HealthSnapshot,
    RoutingBinding,
)
from app.domain.observability.service import ObservabilityService


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'observability-domain.sqlite3'}"


def _seed_provider_health(
    database_url: str,
    *,
    routed_instance_ids: list[str],
    now: datetime,
) -> None:
    with get_session(database_url) as session:
        session.add(
            CatalogProvider(
                provider_id="openai",
                display_name="OpenAI",
                adapter_type="openai",
                status="active",
            )
        )
        for model_id, instance_id, status in (
            ("routed-model", "openai-routed", "healthy"),
            ("optional-model", "openai-optional", "degraded"),
        ):
            session.add(
                CatalogModel(
                    model_id=model_id,
                    provider_id="openai",
                    family=model_id,
                    feature="text",
                    status="available",
                    revision="test",
                )
            )
            session.add(
                CatalogInstance(
                    instance_id=instance_id,
                    model_id=model_id,
                    provider_id="openai",
                    endpoint_variant="responses",
                    region="global",
                    capability_tags=["text"],
                    health_status=status,
                )
            )
            session.add(
                HealthSnapshot(
                    provider_id="openai",
                    instance_id=instance_id,
                    status=status,
                    reason=f"test {status}",
                    measured_at=now,
                )
            )
        session.add(
            RoutingBinding(
                profile_id="wp-ai.short-text",
                candidate_instance_ids=routed_instance_ids,
                selection_policy_json={"strategy": "ordered"},
                revision="test",
            )
        )
        session.commit()


def test_provider_readiness_scope_excludes_unrouted_degraded_instance(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 5, 8, 0, tzinfo=UTC)
    _seed_provider_health(database_url, routed_instance_ids=["openai-routed"], now=now)

    summary = ObservabilityService(
        Settings(
            environment="test",
            database_url=database_url,
            provider_health_scan_interval_seconds=60,
        )
    )._build_provider_health_summary(now)

    assert summary["instances_total"] == 2
    assert summary["status_counts"] == {
        "healthy": 1,
        "degraded": 1,
        "unhealthy": 0,
        "unknown": 0,
    }
    assert summary["operational_scope"] == {
        "interval_seconds": 60,
        "freshness": "fresh",
        "last_measured_at": "2026-08-05T08:00:00Z",
        "age_seconds": 0,
        "providers_total": 1,
        "instances_total": 1,
        "configured_instance_ids_total": 1,
        "resolved_instances_total": 1,
        "unresolved_instance_ids_total": 0,
        "status_counts": {
            "healthy": 1,
            "degraded": 0,
            "unhealthy": 0,
            "unknown": 0,
        },
        "degraded_provider_ids": [],
    }

    dispose_engine(database_url)


def test_provider_readiness_scope_keeps_routed_degraded_instance_blocking(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 5, 8, 0, tzinfo=UTC)
    _seed_provider_health(
        database_url,
        routed_instance_ids=["openai-routed", "openai-optional"],
        now=now,
    )

    summary = ObservabilityService(
        Settings(
            environment="test",
            database_url=database_url,
            provider_health_scan_interval_seconds=60,
        )
    )._build_provider_health_summary(now)
    operational_scope = summary["operational_scope"]

    assert isinstance(operational_scope, dict)
    assert operational_scope["instances_total"] == 2
    assert operational_scope["status_counts"]["degraded"] == 1
    assert operational_scope["degraded_provider_ids"] == ["openai"]

    dispose_engine(database_url)


def test_provider_readiness_scope_reports_missing_routed_instance_without_counting_it(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 5, 8, 0, tzinfo=UTC)
    _seed_provider_health(
        database_url,
        routed_instance_ids=["openai-routed", "missing-instance"],
        now=now,
    )

    summary = ObservabilityService(
        Settings(
            environment="test",
            database_url=database_url,
            provider_health_scan_interval_seconds=60,
        )
    )._build_provider_health_summary(now)
    operational_scope = summary["operational_scope"]

    assert isinstance(operational_scope, dict)
    assert operational_scope["instances_total"] == 1
    assert operational_scope["configured_instance_ids_total"] == 2
    assert operational_scope["resolved_instances_total"] == 1
    assert operational_scope["unresolved_instance_ids_total"] == 1
    assert operational_scope["status_counts"]["unknown"] == 0

    dispose_engine(database_url)


def test_provider_readiness_scope_has_no_operational_instances_when_all_routes_missing(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 5, 8, 0, tzinfo=UTC)
    _seed_provider_health(
        database_url,
        routed_instance_ids=["missing-instance"],
        now=now,
    )

    summary = ObservabilityService(
        Settings(
            environment="test",
            database_url=database_url,
            provider_health_scan_interval_seconds=60,
        )
    )._build_provider_health_summary(now)
    operational_scope = summary["operational_scope"]

    assert isinstance(operational_scope, dict)
    assert operational_scope["instances_total"] == 0
    assert operational_scope["configured_instance_ids_total"] == 1
    assert operational_scope["unresolved_instance_ids_total"] == 1
    assert operational_scope["freshness"] == "missing"

    dispose_engine(database_url)
