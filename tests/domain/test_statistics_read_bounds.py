from __future__ import annotations

from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.db import dispose_engine, get_engine, get_session, init_schema
from app.core.models import (
    CatalogInstance,
    CatalogModel,
    CatalogProvider,
    HealthSnapshot,
    ProviderCallRecord,
    RunRecord,
    Site,
)
from app.domain.catalog.service import CatalogService
from app.domain.health.scoring import assess_instance_health
from app.domain.usage.service import UsageService

NOW = datetime(2026, 11, 12, 8, tzinfo=UTC)


def _database_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'read-bounds.sqlite3'}"


@pytest.fixture
def statistics_database(tmp_path: Path):
    database_url = _database_url(tmp_path)
    init_schema(database_url)
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
        for instance_id in ("a", "b", "empty"):
            session.add(
                CatalogInstance(
                    instance_id=instance_id,
                    model_id="m",
                    provider_id="p",
                    endpoint_variant="default",
                    region="test",
                )
            )
        session.add_all([Site(site_id="alpha", name="Alpha"), Site(site_id="beta", name="Beta")])
        session.flush()
        for run_id, site_id in (
            ("first", "alpha"),
            ("second", "alpha"),
            ("historical", "alpha"),
            ("other", "beta"),
        ):
            session.add(
                RunRecord(
                    run_id=run_id,
                    site_id=site_id,
                    ability_name="test/edit",
                    channel="openapi",
                    execution_kind="text",
                    profile_id="text.test",
                    trace_id=run_id,
                    status="succeeded",
                    started_at=NOW - timedelta(days=5),
                    policy_json={"preset_id": run_id},
                    result_json={"large": "x" * 65536},
                    execution_input_ciphertext="unused" * 1000,
                )
            )
        session.commit()
    try:
        yield database_url
    finally:
        dispose_engine(database_url)


def _call(
    at: datetime, *, run_id: str = "first", instance_id: str = "a", error_code: str | None = None
) -> ProviderCallRecord:
    return ProviderCallRecord(
        run_id=run_id,
        provider_id="p",
        model_id="m",
        instance_id=instance_id,
        region="test",
        latency_ms=2000 if error_code else 80,
        error_code=error_code,
        created_at=at,
    )


def test_health_scan_loads_only_its_inclusive_24_hour_window(statistics_database, monkeypatch):
    database_url = statistics_database
    lower = NOW - timedelta(hours=24)
    calls = [
        _call(lower),
        _call(NOW, error_code="provider.timeout"),
        _call(
            NOW - timedelta(minutes=1),
            instance_id="b",
            error_code="provider.output_quality_rejected",
        ),
        *[_call(lower - timedelta(microseconds=1)) for _ in range(150)],
        _call(NOW + timedelta(microseconds=1)),
    ]
    expected = {
        instance_id: assess_instance_health(
            [call for call in calls if call.instance_id == instance_id], now=NOW
        )
        for instance_id in ("a", "b", "empty")
    }
    with get_session(database_url) as session:
        session.add_all(calls)
        session.commit()

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW

    monkeypatch.setattr("app.domain.catalog.service.datetime", FixedDatetime)
    loaded = []

    def track_load(session, instance):
        if isinstance(instance, ProviderCallRecord):
            loaded.append(instance.id)

    event.listen(Session, "loaded_as_persistent", track_load)
    try:
        result = CatalogService(database_url, providers={}).scan_provider_health()
    finally:
        event.remove(Session, "loaded_as_persistent", track_load)
    with get_session(database_url) as session:
        snapshots = list(session.scalars(select(HealthSnapshot)))
    assert result["scanned_count"] == 3
    assert {row.instance_id: (row.status, row.reason) for row in snapshots} == {
        key: (value.status, value.reason) for key, value in expected.items()
    }
    assert len(loaded) == 3, "Health scans must not materialize old or future call history"


def test_router_snapshot_streams_only_window_calls_and_needed_run_fields(statistics_database):
    database_url = statistics_database
    lower = NOW - timedelta(hours=1)
    with get_session(database_url) as session:
        session.add_all(
            [
                *[_call(lower) for _ in range(260)],
                _call(lower, run_id="second", error_code="guard.blocked"),
                _call(lower - timedelta(microseconds=1), run_id="historical"),
                _call(NOW),
                _call(lower, run_id="other"),
            ]
        )
        session.commit()
    loaded_calls = []
    loaded_runs = []

    def track_load(session, instance):
        if isinstance(instance, ProviderCallRecord):
            loaded_calls.append(instance.created_at)
        elif isinstance(instance, RunRecord):
            loaded_runs.append((instance.run_id, set(inspect(instance).dict)))

    event.listen(Session, "loaded_as_persistent", track_load)
    try:
        payload = UsageService(
            database_url, now_factory=lambda: NOW
        ).get_router_performance_snapshot_projection(site_id="alpha", start_at=lower, end_at=NOW)
    finally:
        event.remove(Session, "loaded_as_persistent", track_load)
    assert len(payload["rows"]) == 1
    row = payload["rows"][0]
    assert row["request_total"] == 261
    assert row["success_total"] == 260
    assert row["guard_fail_total"] == 1
    assert row["preset_id"] == "first", "First call by timestamp and ID keeps preset ownership"
    assert row["avg_latency_ms"] == round((260 * 80 + 2000) / 261, 4)
    assert len(loaded_calls) == 261, (
        "Exclude other sites and calls outside the half-open window in SQL"
    )
    assert {run_id for run_id, _ in loaded_runs} == {"first", "second"}
    assert all(
        "result_json" not in fields and "execution_input_ciphertext" not in fields
        for _, fields in loaded_runs
    )


@pytest.mark.parametrize(
    "reader", ["stream_router_performance_runs", "stream_router_performance_calls"]
)
@pytest.mark.parametrize("consumer_fails", [False, True])
def test_router_readers_close_cursors_on_early_exit(statistics_database, reader, consumer_fails):
    engine = get_engine(statistics_database)
    with get_session(statistics_database) as session:
        session.add(_call(NOW - timedelta(minutes=1)))
        session.commit()
    cursors = []

    def capture_cursor(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("SELECT") and "provider_call_records" in statement:
            cursors.append(cursor)

    event.listen(engine, "after_cursor_execute", capture_cursor)
    try:
        with get_session(statistics_database) as session:
            repository = StatsRepository(session)
            expected_error = (
                pytest.raises(RuntimeError, match="consumer failed")
                if consumer_fails
                else nullcontext()
            )
            with (
                expected_error,
                getattr(repository, reader)(
                    site_id="alpha", start_at=NOW - timedelta(hours=1), end_at=NOW
                ) as rows,
            ):
                next(rows)
                if consumer_fails:
                    raise RuntimeError("consumer failed")
            assert len(cursors) == 1
            with pytest.raises(engine.dialect.dbapi.Error):
                cursors[0].fetchone()
            assert session.scalar(select(1)) == 1
    finally:
        event.remove(engine, "after_cursor_execute", capture_cursor)


@pytest.mark.parametrize(
    "filters", [{"app_id": "unsupported"}, {"post_id": 12}, {"mcp_method": "tools/list"}]
)
def test_unsupported_log_dimensions_skip_statistics_reads(statistics_database, filters):
    statements = []
    engine = get_engine(statistics_database)

    def track_sql(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", track_sql)
    try:
        service = UsageService(statistics_database, now_factory=lambda: NOW)
        summary = service.get_logs_analytics_summary(site_id="alpha", filters=filters)
        latency = service.get_logs_analytics_tool_latency(site_id="alpha", filters=filters)
        recommendations = service.get_logs_analytics_recommendations(
            site_id="alpha", filters=filters
        )
        mcp_zone = service.get_logs_analytics_mcp_zone(site_id="alpha", filters=filters)
    finally:
        event.remove(engine, "before_cursor_execute", track_sql)
    assert summary["total"] == 0
    assert latency["samples"] == 0
    assert recommendations["recommended_providers"] == []
    assert mcp_zone["calls_total"] == 0
    assert statements == [], "Unsupported dimensions cannot match; do not read run/call history"
