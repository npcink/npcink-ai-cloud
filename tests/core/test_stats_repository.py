from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import HealthSnapshot


def test_list_latest_health_snapshots_returns_one_row_per_instance(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'stats-repository.sqlite3'}"
    init_schema(database_url)
    measured_at = datetime(2026, 7, 11, 1, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                HealthSnapshot(
                    provider_id="provider-a",
                    instance_id="instance-a",
                    status="healthy",
                    reason="initial",
                    measured_at=measured_at,
                ),
                HealthSnapshot(
                    provider_id="provider-a",
                    instance_id="instance-a",
                    status="degraded",
                    reason="latest first write",
                    measured_at=measured_at + timedelta(minutes=1),
                ),
                HealthSnapshot(
                    provider_id="provider-a",
                    instance_id="instance-a",
                    status="unhealthy",
                    reason="latest tie breaker",
                    measured_at=measured_at + timedelta(minutes=1),
                ),
                HealthSnapshot(
                    provider_id="provider-b",
                    instance_id="instance-b",
                    status="healthy",
                    reason="only snapshot",
                    measured_at=measured_at,
                ),
                HealthSnapshot(
                    provider_id="provider-unknown",
                    instance_id=None,
                    status="unknown",
                    reason="not attached to an instance",
                    measured_at=measured_at + timedelta(minutes=2),
                ),
            ]
        )
        session.commit()

        repository = StatsRepository(session)
        latest = repository.list_latest_health_snapshots()
        filtered = repository.list_latest_health_snapshots(["instance-a"])
        empty = repository.list_latest_health_snapshots([])

    assert [(item.instance_id, item.status) for item in latest] == [
        ("instance-a", "unhealthy"),
        ("instance-b", "healthy"),
    ]
    assert [(item.instance_id, item.status) for item in filtered] == [("instance-a", "unhealthy")]
    assert empty == []

    dispose_engine(database_url)


def assert_latest_health_lookup_contract(engine: Engine) -> None:
    """Also called against an isolated PostgreSQL database in M4 validation."""
    HealthSnapshot.__table__.create(engine)
    at = datetime(2026, 10, 17, tzinfo=UTC)
    with Session(engine) as session:
        session.add_all(
            HealthSnapshot(
                provider_id="p",
                instance_id=instance_id,
                status="healthy",
                reason="older",
                measured_at=at - timedelta(minutes=i),
            )
            for instance_id in ["a", "b", "orphan", ""]
            for i in range(1, 81)
        )
        session.flush()
        for instance_id in ["a", "b", "orphan", "", None]:
            for status in ["healthy", "degraded", "unhealthy"]:
                session.add(
                    HealthSnapshot(
                        provider_id="p",
                        instance_id=instance_id,
                        status=status,
                        reason="latest tie",
                        measured_at=at,
                    )
                )
                session.flush()
        session.add(
            HealthSnapshot(
                provider_id="p",
                instance_id="a",
                status="unknown",
                reason="backdated larger ID",
                measured_at=at - timedelta(days=2),
            )
        )
        session.commit()

    def identity(row):
        return (row.id, row.instance_id, row.provider_id, row.status, row.reason, row.measured_at)

    with Session(engine) as session:
        repository = StatsRepository(session)
        history = list(session.scalars(select(HealthSnapshot)))
        for first in [False, True]:
            for scope in [
                None,
                [],
                ["a"],
                ["a", "a", "missing"],
                ["b", "a"],
                ["orphan"],
                [""],
                ["missing"],
            ]:
                expected = {}
                for row in history:
                    if row.instance_id is None or (
                        scope is not None and row.instance_id not in scope
                    ):
                        continue
                    previous = expected.get(row.instance_id)
                    if (
                        previous is None
                        or row.measured_at > previous.measured_at
                        or (
                            row.measured_at == previous.measured_at
                            and (row.id < previous.id if first else row.id > previous.id)
                        )
                    ):
                        expected[row.instance_id] = row
                actual = repository.list_latest_health_snapshots(scope, earliest_on_tie=first)
                assert [identity(row) for row in actual] == [
                    identity(expected[key]) for key in sorted(expected)
                ]
        # No process-wide or per-repository cache can hide a new append.
        session.add(
            HealthSnapshot(
                provider_id="p",
                instance_id="a",
                status="healthy",
                reason="new read",
                measured_at=at + timedelta(seconds=1),
            )
        )
        session.commit()
        for first in [False, True]:
            assert (
                repository.list_latest_health_snapshots(["a"], earliest_on_tie=first)[0].reason
                == "new read"
            )


def test_scoped_latest_health_matches_history_and_refreshes() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    try:
        assert_latest_health_lookup_contract(engine)
    finally:
        engine.dispose()


def test_scoped_latest_health_avoids_scanning_history() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    try:
        HealthSnapshot.__table__.create(engine)
        statements = []

        def capture(_conn, _cursor, statement, parameters, _context, _many):
            statements.append((statement, parameters))

        with Session(engine) as session:
            event.listen(engine, "before_cursor_execute", capture)
            try:
                assert StatsRepository(session).list_latest_health_snapshots(["a", "b"]) == []
            finally:
                event.remove(engine, "before_cursor_execute", capture)
            assert len(statements) == 1  # One batch, not one database round trip per instance.
            sql, parameters = statements[0]
            plan = session.connection().exec_driver_sql("EXPLAIN QUERY PLAN " + sql, parameters)
            details = [row[-1] for row in plan]
            assert not any("SCAN health_snapshots" in detail for detail in details), details
            assert any("ix_health_snapshots_instance_measured_id" in detail for detail in details)
    finally:
        engine.dispose()
