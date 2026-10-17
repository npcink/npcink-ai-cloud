from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, select

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.db import dispose_engine, get_engine, get_session, init_schema
from app.core.models import (
    CatalogInstance,
    CatalogModel,
    CatalogProvider,
    HealthSnapshot,
    ProviderCallRecord,
    RoutingBinding,
    RoutingProfile,
    RunRecord,
    Site,
    UsageRollup,
)
from app.domain.catalog.service import CatalogService
from app.domain.runtime.models import RuntimeRequest
from app.domain.runtime.service import RuntimeService
from app.domain.usage.rollup import (
    ALERT_EVALUATE_BATCH_SCOPE,
    GLOBAL_SITE_SCOPE,
    LATENCY_PROBE_BATCH_SCOPE,
    ROUTER_DIAGNOSTICS_BATCH_SCOPE,
    ROUTER_PERFORMANCE_BATCH_SCOPE,
    UsageRollupService,
)
from app.domain.usage.service import UsageService
from tests.conftest import seed_openai_model_allowlist, seed_site_auth


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'usage-rollup-domain.sqlite3'}"


@pytest.fixture
def health_rollup_database(tmp_path: Path):
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 10, 17, 8, tzinfo=UTC)
    with get_session(database_url) as session:
        session.add(CatalogProvider(provider_id="p", display_name="P", adapter_type="fake"))
        session.flush()
        session.add(
            CatalogModel(
                model_id="m",
                provider_id="p",
                family="text",
                feature="text",
                status="active",
                revision="test",
            )
        )
        session.flush()
        for instance_id in ("a", "b", "unknown"):
            session.add(
                CatalogInstance(
                    instance_id=instance_id,
                    model_id="m",
                    provider_id="p",
                    endpoint_variant="default",
                    region="test",
                )
            )
        for profile_id, candidates in (("text.test", ["a", "b"]), ("text.empty", [])):
            session.add(RoutingProfile(profile_id=profile_id, execution_kind="text"))
            session.flush()
            session.add(
                RoutingBinding(
                    profile_id=profile_id, candidate_instance_ids=candidates, revision="test"
                )
            )
        for site_id in ("alpha", "beta"):
            session.add(Site(site_id=site_id, name=site_id))
        session.flush()
        # Same timestamp: summary must retain the latest ID while profile/instance
        # retain the earliest ID. Older and orphan rows must not leak into results.
        for instance_id, status, measured_at in (
            ("a", "unavailable", now - timedelta(hours=2)),
            ("a", "healthy", now - timedelta(minutes=1)),
            ("a", "degraded", now - timedelta(minutes=1)),
            ("b", "healthy", now - timedelta(minutes=2)),
            ("orphan", "unavailable", now),
            (None, "unavailable", now),
        ):
            session.add(
                HealthSnapshot(
                    provider_id="p",
                    instance_id=instance_id,
                    status=status,
                    reason="fixture",
                    measured_at=measured_at,
                )
            )
        session.flush()
        for index, (site_id, age, error) in enumerate(
            (
                ("alpha", timedelta(minutes=10), None),
                ("beta", timedelta(hours=12), "provider.timeout"),
                ("alpha", timedelta(hours=25), None),
            )
        ):
            run_id = f"r{index}"
            at = now - age
            session.add(
                RunRecord(
                    run_id=run_id,
                    site_id=site_id,
                    ability_name="test",
                    channel="openapi",
                    execution_kind="text",
                    profile_id="text.test",
                    status="failed" if error else "succeeded",
                    trace_id=run_id,
                    fallback_used=bool(error),
                    started_at=at,
                    finished_at=at,
                )
            )
            session.flush()
            session.add(
                ProviderCallRecord(
                    run_id=run_id,
                    provider_id="p",
                    model_id="m",
                    instance_id="a",
                    region="test",
                    latency_ms=100 + index,
                    tokens_in=10 + index,
                    tokens_out=20,
                    cost=0.01,
                    fallback_used=bool(error),
                    error_code=error,
                    created_at=at,
                )
            )
        session.commit()
    yield database_url, now
    dispose_engine(database_url)


def _uncached_payloads(database_url: str, now: datetime) -> dict[str, dict]:
    service = UsageService(database_url, now_factory=lambda: now)
    expected = {}
    for scope in (GLOBAL_SITE_SCOPE, "alpha", "beta"):
        site_id = None if scope == GLOBAL_SITE_SCOPE else scope
        expected[f"{scope}:summary:__summary__"] = service.get_usage_summary(site_id=site_id)
        for profile_id in ("text.test", "text.empty"):
            expected[f"{scope}:profile:{profile_id}"] = service.get_profile_stats(
                profile_id, site_id=site_id
            )
        for instance_id in ("a", "b", "unknown"):
            expected[f"{scope}:instance:{instance_id}"] = service.get_instance_stats(
                instance_id, site_id=site_id
            )
    return expected


def test_rollup_reuses_two_health_reads_without_changing_statistics(health_rollup_database) -> None:
    database_url, now = health_rollup_database
    expected = _uncached_payloads(database_url, now)
    health_queries = []

    def count_health_queries(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and "health_snapshots" in statement:
            health_queries.append(statement)

    engine = get_engine(database_url)
    event.listen(engine, "before_cursor_execute", count_health_queries)
    try:
        result = UsageRollupService(database_url, now_factory=lambda: now).generate_rollups()
    finally:
        event.remove(engine, "before_cursor_execute", count_health_queries)

    assert len(health_queries) == result["health_snapshot_reads"] == 2
    assert result["sites_total"] == 2
    assert result["counts"] == {"summary": 3, "profile": 6, "instance": 9}
    assert result["rollups_total"] == 18
    assert result["profile_rollups_total"] == 6
    assert result["instance_rollups_total"] == 9
    assert set(result["timings_ms"]) == {"total", "prepare", "health_read", "statistics", "write"}
    assert all(value >= 0 for value in result["timings_ms"].values())
    assert result["timings_ms"]["total"] >= result["timings_ms"]["prepare"]
    assert result["timings_ms"]["prepare"] >= result["timings_ms"]["health_read"]
    with get_session(database_url) as session:
        actual = {
            item.rollup_key: item.payload_json for item in session.scalars(select(UsageRollup))
        }
    assert actual == expected


def test_rollup_refreshes_health_each_round_and_rolls_back_failed_writes(
    health_rollup_database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, now = health_rollup_database
    service = UsageRollupService(database_url, now_factory=lambda: now)
    original_upsert = StatsRepository.upsert_usage_rollup
    writes = 0

    def fail_after_first_write(repository, **kwargs):
        nonlocal writes
        writes += 1
        if writes == 2:
            raise RuntimeError("injected rollup failure")
        return original_upsert(repository, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(StatsRepository, "upsert_usage_rollup", fail_after_first_write)
        with pytest.raises(RuntimeError, match="injected rollup failure"):
            service.generate_rollups()
    with get_session(database_url) as session:
        assert list(session.scalars(select(UsageRollup))) == []
    service.generate_rollups()
    before = _uncached_payloads(database_url, now)
    with get_session(database_url) as session:
        session.add(
            HealthSnapshot(
                provider_id="p",
                instance_id="a",
                status="unavailable",
                reason="new round",
                measured_at=now,
            )
        )
        session.commit()
    expected = _uncached_payloads(database_url, now)
    assert expected != before
    result = service.generate_rollups()
    assert result["health_snapshot_reads"] == 2
    with get_session(database_url) as session:
        assert {
            item.rollup_key: item.payload_json for item in session.scalars(select(UsageRollup))
        } == expected


@pytest.mark.parametrize(
    "site_ids,include_global", [(None, True), (["alpha"], False), (["absent"], True), ([], False)]
)
def test_rollup_batch_matches_live_statistics_at_window_boundaries(
    health_rollup_database,
    site_ids,
    include_global,
) -> None:
    database_url, now = health_rollup_database
    times = [
        now - timedelta(hours=25),
        now - timedelta(hours=24),
        now.replace(hour=0),
        now - timedelta(microseconds=1),
        now,
        now + timedelta(microseconds=1),
    ]
    with get_session(database_url) as session:
        session.add(RoutingProfile(profile_id="text.unbound", execution_kind="text"))
        binding = session.get(RoutingBinding, "text.test")
        binding.candidate_instance_ids = ["a", "missing", "b", "a"]
        for index in range(18):
            at = times[index % len(times)]
            run = RunRecord(
                run_id=f"edge{index}",
                site_id="alpha" if index % 2 else "beta",
                ability_name="test",
                channel="openapi",
                execution_kind="text",
                profile_id="text.test" if index % 3 else "text.empty",
                status=["succeeded", "failed", "running"][index % 3],
                trace_id=f"edge{index}",
                fallback_used=index % 3 == 1,
                started_at=at,
                finished_at=at + timedelta(milliseconds=123 + index) if index % 4 else None,
            )
            session.add(run)
            session.flush()
            session.add(
                ProviderCallRecord(
                    run_id=run.run_id,
                    provider_id="p",
                    model_id="m",
                    instance_id="a" if index % 2 else "b",
                    region="test",
                    latency_ms=90 + index,
                    tokens_in=index,
                    tokens_out=index + 1,
                    cost=0.0000005 * index,
                    fallback_used=index % 3 == 1,
                    error_code=[None, "", "provider.timeout"][index % 3],
                    # The run/call windows deliberately disagree, including retry calls
                    # in-range for a run whose admission was outside the window.
                    created_at=times[(index + 3) % len(times)],
                )
            )
        session.commit()
    scopes = list(site_ids or ["alpha", "beta"])
    if include_global:
        scopes.insert(0, GLOBAL_SITE_SCOPE)
    live = UsageService(database_url, now_factory=lambda: now)
    expected = {}
    for scope in scopes:
        site_id = None if scope == GLOBAL_SITE_SCOPE else scope
        expected[f"{scope}:summary:__summary__"] = live.get_usage_summary(site_id=site_id)
        for key in ["text.test", "text.empty", "text.unbound"]:
            expected[f"{scope}:profile:{key}"] = live.get_profile_stats(key, site_id=site_id)
        for key in ["a", "b", "unknown"]:
            expected[f"{scope}:instance:{key}"] = live.get_instance_stats(key, site_id=site_id)
    UsageRollupService(database_url, now_factory=lambda: now).generate_rollups(
        site_ids=site_ids,
        include_global=include_global,
    )
    with get_session(database_url) as session:
        assert {
            item.rollup_key: item.payload_json for item in session.scalars(select(UsageRollup))
        } == expected


def test_rollup_batch_accepts_naive_utc_clock_like_live_reader(health_rollup_database) -> None:
    database_url, now = health_rollup_database
    now = now.replace(tzinfo=None)
    expected = _uncached_payloads(database_url, now)
    UsageRollupService(database_url, now_factory=lambda: now).generate_rollups()
    with get_session(database_url) as session:
        assert {
            item.rollup_key: item.payload_json for item in session.scalars(select(UsageRollup))
        } == expected


def test_rollup_batch_refreshes_call_statistics_on_next_round(health_rollup_database) -> None:
    database_url, now = health_rollup_database
    service = UsageRollupService(database_url, now_factory=lambda: now)
    service.generate_rollups()
    before = _uncached_payloads(database_url, now)
    with get_session(database_url) as session:
        session.add(
            ProviderCallRecord(
                run_id="r2",
                provider_id="p",
                model_id="m",
                instance_id="b",
                region="test",
                latency_ms=999,
                tokens_in=7,
                tokens_out=3,
                cost=0.1234567,
                created_at=now,
            )
        )
        session.commit()
    expected = _uncached_payloads(database_url, now)
    assert expected != before
    service.generate_rollups()
    with get_session(database_url) as session:
        assert {
            item.rollup_key: item.payload_json for item in session.scalars(select(UsageRollup))
        } == expected


def test_rollup_batch_keeps_empty_database_summary(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 10, 17, tzinfo=UTC)
    expected = UsageService(database_url, now_factory=lambda: now).get_usage_summary()
    result = UsageRollupService(database_url, now_factory=lambda: now).generate_rollups()
    assert result["counts"] == {"summary": 1, "profile": 0, "instance": 0}
    with get_session(database_url) as session:
        assert session.get(UsageRollup, "__global__:summary:__summary__").payload_json == expected
    dispose_engine(database_url)


def test_rollup_statistic_queries_do_not_grow_with_catalog_size(health_rollup_database) -> None:
    database_url, now = health_rollup_database
    queries = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and "usage_rollups" not in statement:
            queries.append(statement)

    engine = get_engine(database_url)
    event.listen(engine, "before_cursor_execute", capture)
    try:
        service = UsageRollupService(database_url, now_factory=lambda: now)
        service.generate_rollups()
        small_queries = len(queries)
        with get_session(database_url) as session:
            for index in range(20):
                session.add(
                    CatalogInstance(
                        instance_id=f"extra{index}",
                        model_id="m",
                        provider_id="p",
                        endpoint_variant="default",
                        region="test",
                    )
                )
                session.add(RoutingProfile(profile_id=f"extra{index}", execution_kind="text"))
            session.commit()
        queries.clear()
        result = service.generate_rollups()
        # The bound protects against returning to per-profile/per-instance reads;
        # rollup row writes are deliberately outside this query-count assertion.
        assert len(queries) == small_queries
        assert small_queries < 50
        assert result["health_snapshot_reads"] == 2
        assert result["rollups_total"] == 138
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def test_usage_rollup_service_writes_summary_profile_and_instance_snapshots(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha")

    runtime_result = RuntimeService(database_url).execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="rollup-run-001",
            trace_id="rollup-trace-001",
            input_payload={"messages": [{"role": "user", "content": "rollup me"}]},
        )
    )
    fixed_now = datetime(2026, 3, 12, 8, 0, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == runtime_result.run_id))
        assert run is not None
        run.started_at = fixed_now.replace(hour=7, minute=50)
        run.finished_at = fixed_now.replace(hour=7, minute=50)

        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == runtime_result.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        for index, provider_call in enumerate(provider_calls):
            provider_call.created_at = fixed_now.replace(hour=7, minute=50, second=index + 1)

        session.commit()

    service = UsageRollupService(
        database_url,
        now_factory=lambda: fixed_now,
    )
    with get_session(database_url) as session:
        repository = StatsRepository(session)
        expected_profile_rollups = len(repository.list_profiles()) * 2
        expected_instance_rollups = len(repository.list_instances()) * 2

    def forbidden_history(*_args, **_options):
        raise AssertionError("hourly rollup must not materialize health history")

    monkeypatch.setattr(StatsRepository, "list_health_snapshots", forbidden_history)
    result = service.generate_rollups(site_ids=["site_alpha"], include_global=True)

    assert result["counts"] == {
        "summary": 2,
        "profile": expected_profile_rollups,
        "instance": expected_instance_rollups,
    }
    assert result["rollups_total"] == 2 + expected_profile_rollups + expected_instance_rollups

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        global_summary = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope=GLOBAL_SITE_SCOPE,
                scope_kind="summary",
            )
            if rollup.scope_id == "__summary__"
        )
        site_summary = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind="summary",
            )
            if rollup.scope_id == "__summary__"
        )
        instance_rollup = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind="instance",
            )
            if rollup.scope_id == "openai-us-east-text-balanced"
        )

    assert global_summary.payload_json["windows"]["today"]["runs_total"] == 1
    assert site_summary.payload_json["windows"]["today"]["runs_total"] == 1
    assert instance_rollup.payload_json["instance_id"] == "openai-us-east-text-balanced"
    assert "health_score" in instance_rollup.payload_json

    dispose_engine(database_url)


def test_usage_rollup_service_stores_router_performance_projection_batches(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha")

    runtime_result = RuntimeService(database_url).execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="router-performance-rollup-001",
            trace_id="router-performance-rollup-001",
            input_payload={"messages": [{"role": "user", "content": "snapshot me"}]},
            policy={"preset_id": "preset.alpha"},
        )
    )

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == runtime_result.run_id))
        assert run is not None
        run.started_at = fixed_now.replace(hour=8, minute=15)
        run.finished_at = fixed_now.replace(hour=8, minute=15)
        run.policy_json = {"preset_id": "preset.alpha"}

        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == runtime_result.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        for index, provider_call in enumerate(provider_calls):
            provider_call.created_at = fixed_now.replace(hour=8, minute=15, second=index + 1)
            if index == 0:
                provider_call.error_code = "quota.rate_limited"

        session.commit()

    service = UsageRollupService(database_url, now_factory=lambda: fixed_now)
    result = service.store_router_performance_snapshot_batches(
        site_ids=["site_alpha"],
        start_at=fixed_now.replace(hour=8, minute=0, second=0, microsecond=0),
        end_at=fixed_now.replace(hour=9, minute=0, second=0, microsecond=0),
    )

    assert result["scope_kind"] == ROUTER_PERFORMANCE_BATCH_SCOPE
    assert result["stored_batches_total"] == 1
    assert result["rows_total"] >= 1

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batch = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind=ROUTER_PERFORMANCE_BATCH_SCOPE,
            )
            if rollup.scope_id == "2026-03-24T08:00:00Z__2026-03-24T09:00:00Z"
        )

    assert stored_batch.payload_json["delivery"]["owner"] == "wordpress_fetch_apply"
    assert stored_batch.payload_json["source"] == "cloud_router_performance_snapshot"
    assert stored_batch.payload_json["window"]["start_gmt"] == "2026-03-24 08:00:00"
    assert stored_batch.payload_json["window"]["end_gmt"] == "2026-03-24 09:00:00"
    row = stored_batch.payload_json["rows"][0]
    assert row["preset_id"] == "preset.alpha"
    assert row["guard_fail_total"] >= 1

    dispose_engine(database_url)


def test_usage_rollup_service_stores_router_diagnostics_projection_batches(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])

    runtime_result = RuntimeService(database_url).execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="router-diagnostics-rollup-001",
            trace_id="router-diagnostics-rollup-001",
            input_payload={"messages": [{"role": "user", "content": "diagnose me"}]},
        )
    )

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == runtime_result.run_id))
        assert run is not None
        run.started_at = fixed_now - timedelta(minutes=20)
        run.finished_at = fixed_now - timedelta(minutes=19)
        run.policy_json = {"callback_url": "https://callbacks.example.test/runtime"}
        run.callback_status = "failed"
        run.error_code = "callback.failed"
        session.commit()

    service = UsageRollupService(database_url, now_factory=lambda: fixed_now)
    result = service.store_router_diagnostics_batches(
        site_ids=["site_alpha"],
        recent_minutes=60,
        config_revision="cloud_runtime_summary_worker",
    )

    assert result["scope_kind"] == ROUTER_DIAGNOSTICS_BATCH_SCOPE
    assert result["stored_batches_total"] == 1
    assert result["regressions_total"] >= 1

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batch = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind=ROUTER_DIAGNOSTICS_BATCH_SCOPE,
            )
            if rollup.scope_id == "2026-03-24T09:20:00Z__60m"
        )

    assert stored_batch.payload_json["delivery"]["owner"] == "wordpress_fetch_apply"
    assert stored_batch.payload_json["source"] == "cloud_router_diagnostics"
    assert stored_batch.payload_json["config_revision"] == "cloud_runtime_summary_worker"
    report = stored_batch.payload_json["report"]
    assert report["regressions"]["count"] >= 1
    assert isinstance(report["regressions"]["items"], list)

    dispose_engine(database_url)


def test_usage_rollup_service_stores_latency_probe_projection_batches(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])

    runtime_result = RuntimeService(database_url).execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="latency-probe-rollup-001",
            trace_id="latency-probe-rollup-001",
            input_payload={"messages": [{"role": "user", "content": "probe me"}]},
        )
    )

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == runtime_result.run_id))
        assert run is not None
        run.started_at = fixed_now - timedelta(minutes=30)
        run.finished_at = fixed_now - timedelta(minutes=30)

        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == runtime_result.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        assert provider_calls
        provider_calls[0].created_at = fixed_now - timedelta(minutes=20)
        provider_calls[0].latency_ms = 420
        if len(provider_calls) > 1:
            provider_calls[1].created_at = fixed_now - timedelta(minutes=18)
            provider_calls[1].latency_ms = 900
        else:
            session.add(
                ProviderCallRecord(
                    run_id=runtime_result.run_id,
                    provider_id=provider_calls[0].provider_id,
                    model_id=provider_calls[0].model_id,
                    instance_id=provider_calls[0].instance_id,
                    region=provider_calls[0].region,
                    latency_ms=900,
                    tokens_in=1,
                    tokens_out=1,
                    cost=0.0,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=fixed_now - timedelta(minutes=18),
                )
            )
        session.commit()
        primary_instance_id = provider_calls[0].instance_id

    service = UsageRollupService(database_url, now_factory=lambda: fixed_now)
    result = service.store_latency_probe_batches(
        site_instances={"site_alpha": [primary_instance_id]},
        start_at=fixed_now - timedelta(minutes=60),
        end_at=fixed_now,
    )

    assert result["scope_kind"] == LATENCY_PROBE_BATCH_SCOPE
    assert result["stored_batches_total"] == 1
    assert result["instances_total"] == 1

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batch = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind=LATENCY_PROBE_BATCH_SCOPE,
            )
            if rollup.scope_id == "2026-03-24T08:20:00Z__2026-03-24T09:20:00Z"
        )

    assert stored_batch.payload_json["delivery"]["owner"] == "wordpress_fetch_apply"
    assert stored_batch.payload_json["source"] == "cloud_latency_probe"
    instance = stored_batch.payload_json["instances"][0]
    assert instance["instance_id"] == primary_instance_id
    assert instance["runtime"] == "hosted_profile"
    assert instance["latency_ms_p50"] == 420
    assert instance["latency_ms_p95"] == 900

    dispose_engine(database_url)


def test_usage_rollup_service_skips_missing_latency_probe_instances(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    service = UsageRollupService(database_url, now_factory=lambda: fixed_now)
    result = service.store_latency_probe_batches(
        site_instances={"site_alpha": ["retired-instance"]},
        start_at=fixed_now - timedelta(minutes=60),
        end_at=fixed_now,
    )

    assert result["scope_kind"] == LATENCY_PROBE_BATCH_SCOPE
    assert result["stored_batches_total"] == 1
    assert result["instances_total"] == 0
    assert result["site_batches"][0]["skipped_total"] == 1
    assert result["site_batches"][0]["instance_batches"] == []

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batch = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind=LATENCY_PROBE_BATCH_SCOPE,
            )
            if rollup.scope_id == "2026-03-24T08:20:00Z__2026-03-24T09:20:00Z"
        )

    assert stored_batch.payload_json["source"] == "cloud_latency_probe"
    assert stored_batch.payload_json["instances"] == []

    dispose_engine(database_url)


def test_usage_rollup_service_stores_alert_provider_degradation_batches(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_openai_model_allowlist(database_url)
    CatalogService(database_url).scan_provider_health()
    seed_site_auth(database_url, site_id="site_alpha", scopes=["stats:read"])

    runtime_result = RuntimeService(database_url).execute(
        RuntimeRequest(
            site_id="site_alpha",
            ability_name="npcink-abilities-toolkit/build-article-block-plan",
            channel="openapi",
            execution_kind="text",
            profile_id="text.balanced",
            idempotency_key="alert-rollup-001",
            trace_id="alert-rollup-001",
            input_payload={"messages": [{"role": "user", "content": "alert me"}]},
        )
    )

    fixed_now = datetime(2026, 3, 24, 9, 20, tzinfo=UTC)
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == runtime_result.run_id))
        assert run is not None
        run.started_at = fixed_now - timedelta(minutes=10)
        run.finished_at = fixed_now - timedelta(minutes=10) + timedelta(milliseconds=25000)

        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == runtime_result.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        assert provider_calls
        provider_calls[0].created_at = fixed_now - timedelta(minutes=5)
        provider_calls[0].latency_ms = 25000
        provider_calls[0].error_code = "provider.timeout"
        session.commit()
        provider_id = provider_calls[0].provider_id

    service = UsageRollupService(database_url, now_factory=lambda: fixed_now)
    result = service.store_alert_provider_degradation_batches(
        site_ids=["site_alpha"],
        window_minutes=30,
        min_requests=1,
        error_rate_threshold=0.1,
        latency_ms_threshold=1000,
    )

    assert result["scope_kind"] == ALERT_EVALUATE_BATCH_SCOPE
    assert result["stored_batches_total"] == 1
    assert result["events_total"] == 1

    with get_session(database_url) as session:
        repository = StatsRepository(session)
        stored_batch = next(
            rollup
            for rollup in repository.list_usage_rollups(
                site_scope="site_alpha",
                scope_kind=ALERT_EVALUATE_BATCH_SCOPE,
            )
            if rollup.scope_id == "2026-03-24T08:50:00Z__2026-03-24T09:20:00Z"
        )

    assert stored_batch.payload_json["delivery"]["owner"] == "wordpress_fetch_apply"
    assert stored_batch.payload_json["source"] == "cloud_alert_evaluate"
    assert stored_batch.payload_json["touched_rule_types"] == ["provider_degradation"]
    event = stored_batch.payload_json["events"][0]
    assert event["rule_type"] == "provider_degradation"
    assert event["summary"]["provider"] == provider_id

    dispose_engine(database_url)
