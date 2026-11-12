from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    SITE_STATUS_SUSPENDED,
    CatalogInstance,
    HealthSnapshot,
    ProviderCallRecord,
    RunRecord,
)
from app.domain.catalog.service import CatalogService
from app.domain.runtime.models import RuntimeRequest
from app.domain.runtime.service import RuntimeService
from app.domain.usage.rollup import LATENCY_PROBE_BATCH_SCOPE
from app.workers.latency_probe_summary import run_once
from tests.conftest import seed_site_auth


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'latency-probe-worker.sqlite3'}"


def test_latency_probe_worker_generates_active_recent_instance_batches(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])
    seed_site_auth(
        database_url,
        site_id="site_suspended",
        scopes=["stats:read"],
        site_status=SITE_STATUS_SUSPENDED,
    )

    runtime_service = RuntimeService(database_url)
    result = runtime_service.execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="worker-latency-probe-a",
            trace_id="worker-latency-probe-a",
            input_payload={"messages": [{"role": "user", "content": "worker batch"}]},
        )
    )

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == result.run_id))
        assert run is not None
        run.started_at = fixed_now - timedelta(minutes=30)
        run.finished_at = fixed_now - timedelta(minutes=30) + timedelta(milliseconds=420)

        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == result.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        assert provider_calls
        primary_call = provider_calls[0]
        primary_call.created_at = fixed_now - timedelta(minutes=20)
        primary_call.latency_ms = 420
        if len(provider_calls) > 1:
            provider_calls[1].created_at = fixed_now - timedelta(minutes=19)
            provider_calls[1].latency_ms = 900
        else:
            session.add(
                ProviderCallRecord(
                    run_id=result.run_id,
                    provider_id=primary_call.provider_id,
                    model_id=primary_call.model_id,
                    instance_id=primary_call.instance_id,
                    region=primary_call.region,
                    latency_ms=900,
                    tokens_in=1,
                    tokens_out=1,
                    cost=0.0,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=fixed_now - timedelta(minutes=19),
                )
            )

        session.add(
            HealthSnapshot(
                provider_id=primary_call.provider_id,
                instance_id=primary_call.instance_id,
                status="healthy",
                reason="worker smoke",
                measured_at=fixed_now - timedelta(minutes=10),
            )
        )

        session.add(
            CatalogInstance(
                instance_id="archived.instance",
                model_id=primary_call.model_id,
                provider_id=primary_call.provider_id,
                endpoint_variant=primary_call.region,
                region=primary_call.region,
                capability_tags=["chat"],
                health_status="unknown",
                is_default=False,
                weight=1,
            )
        )
        session.add(
            ProviderCallRecord(
                run_id=result.run_id,
                provider_id=primary_call.provider_id,
                model_id=primary_call.model_id,
                instance_id="archived.instance",
                region=primary_call.region,
                latency_ms=999,
                tokens_in=1,
                tokens_out=1,
                cost=0.0,
                retry_count=0,
                fallback_used=False,
                error_code=None,
                created_at=fixed_now - timedelta(hours=5),
            )
        )
        session.commit()
        primary_instance_id = primary_call.instance_id

    summary = run_once(
        Settings(
            project_name="Npcink AI Cloud Test",
            environment="test",
            database_url=database_url,
            redis_url="redis://localhost:6379/0",
            latency_probe_worker_recent_minutes=60,
            latency_probe_worker_site_limit=10,
            latency_probe_worker_instance_limit=10,
        ),
        now_factory=lambda: fixed_now,
    )

    assert summary["source"] == "cloud_latency_probe_worker"
    assert summary["window"]["start_gmt"] == "2026-03-24 08:20:00"
    assert summary["window"]["end_gmt"] == "2026-03-24 09:20:00"
    assert summary["sites_total"] == 1
    assert summary["stored_batches_total"] == 1
    assert summary["delivery_owner"] == "wordpress_fetch_apply"
    assert summary["rollup_scope_kind"] == LATENCY_PROBE_BATCH_SCOPE
    assert summary["instances_total"] == 1
    batch = summary["site_batches"][0]
    assert batch["site_id"] == "site_alpha"
    assert batch["instances_total"] == 1
    assert batch["ready_total"] == 1
    assert batch["healthy_total"] == 1
    assert batch["scope_id"] == "2026-03-24T08:20:00Z__2026-03-24T09:20:00Z"
    instance = batch["instance_batches"][0]
    assert instance["instance_id"] == primary_instance_id
    assert instance["latency_ms_p50"] == 420
    assert instance["latency_ms_p95"] == 900
    assert instance["sample_count"] >= 1
    assert instance["health"]["status"] == "healthy"

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batches = repository.list_usage_rollups(
            site_scope="site_alpha",
            scope_kind=LATENCY_PROBE_BATCH_SCOPE,
        )

    assert len(stored_batches) == 1
    assert stored_batches[0].payload_json["delivery"]["buffer_kind"] == "usage_rollup"
    assert stored_batches[0].payload_json["window"]["end_gmt"] == "2026-03-24 09:20:00"

    dispose_engine(database_url)


@pytest.mark.parametrize("instance_limit", [1, 4, 10])
def test_latency_probe_selects_recent_instances_without_loading_call_history(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    instance_limit: int,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])
    seed_site_auth(database_url, site_id="site_beta", scopes=["stats:read"])
    now = datetime(2026, 11, 12, 1, tzinfo=UTC)
    since = now - timedelta(hours=6)
    with get_session(database_url) as session:
        for site_id in ["site_alpha", "site_beta"]:
            session.add(
                RunRecord(
                    run_id=site_id,
                    site_id=site_id,
                    ability_name="test/probe",
                    channel="test",
                    execution_kind="text",
                    profile_id="text.balanced",
                    trace_id=site_id,
                    status="succeeded",
                )
            )
        session.flush()

        def add_call(instance_id: str, at: datetime, site_id: str = "site_alpha") -> None:
            session.add(
                ProviderCallRecord(
                    run_id=site_id,
                    provider_id="test",
                    model_id="model",
                    instance_id=instance_id,
                    region="test",
                    latency_ms=1,
                    created_at=at,
                )
            )

        for _ in range(1500):
            add_call("old", since - timedelta(microseconds=1))
        add_call("boundary", since)
        # Hundreds of duplicates must not hide the next distinct instance.
        for _ in range(600):
            add_call("duplicate", now - timedelta(minutes=1))
        add_call("tie-a", now)
        session.flush()
        add_call("tie-b", now)  # Higher ID wins timestamp ties, as before.
        add_call(" tie-b ", now)
        add_call(" \t\n", now)
        # Preserve the old reader's lower-bound-only behavior for clock skew.
        add_call("future", now + timedelta(seconds=1))
        add_call("other-site", now + timedelta(seconds=2), "site_beta")
        session.commit()

    captured: dict[str, list[str]] = {}

    def store_batches(self, *, site_instances, start_at, end_at):
        assert start_at == since
        assert end_at == now
        captured.update(site_instances)
        return {"site_batches": [], "stored_batches_total": 0}

    monkeypatch.setattr(
        "app.workers.latency_probe_summary.UsageRollupService.store_latency_probe_batches",
        store_batches,
    )
    loaded_calls: list[int] = []

    def track_load(session, instance):
        if isinstance(instance, ProviderCallRecord):
            loaded_calls.append(instance.id)

    event.listen(Session, "loaded_as_persistent", track_load)
    try:
        run_once(
            Settings(
                environment="test",
                database_url=database_url,
                latency_probe_worker_recent_minutes=360,
                latency_probe_worker_site_limit=10,
                latency_probe_worker_instance_limit=instance_limit,
            ),
            now_factory=lambda: now,
        )
    finally:
        event.remove(Session, "loaded_as_persistent", track_load)
        dispose_engine(database_url)

    assert captured == {
        "site_alpha": ["future", "tie-b", "tie-a", "duplicate", "boundary"][:instance_limit],
        "site_beta": ["other-site"],
    }
    assert loaded_calls == [], "Probe discovery must not materialize historical call records"
