from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
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

            at = datetime(2026, 10, 17, tzinfo=UTC)
            session.add_all(
                HealthSnapshot(
                    provider_id="p",
                    instance_id=instance_id,
                    status="healthy",
                    reason="latest",
                    measured_at=at,
                )
                for instance_id in ["a", "b"]
            )
            session.commit()
            raw = session.connection().connection.driver_connection

            def read_steps():
                steps = 0

                def progress():
                    nonlocal steps
                    steps += 1
                    return 0

                raw.set_progress_handler(progress, 1)
                try:
                    assert (
                        len(StatsRepository(session).list_latest_health_snapshots(["a", "b"])) == 2
                    )
                finally:
                    raw.set_progress_handler(None, 0)
                return steps

            small_steps = read_steps()
            session.add_all(
                HealthSnapshot(
                    provider_id="p",
                    instance_id=instance_id,
                    status="unknown",
                    reason="older history",
                    measured_at=at - timedelta(days=1),
                )
                for instance_id in ["a", "b"]
                for _ in range(2000)
            )
            session.commit()
            # VM work, not wall time: an indexed range aggregate still grows
            # with history even though EXPLAIN labels it a SEARCH rather than SCAN.
            assert read_steps() < small_steps * 3
    finally:
        engine.dispose()


def assert_rollup_batch_save_contract(engine: Engine) -> None:
    """Exercise the same persistence contract on SQLite and isolated PostgreSQL."""
    from app.core.models import UsageRollup

    UsageRollup.__table__.create(engine)
    sentinel = datetime(2020, 1, 1, tzinfo=UTC)

    def row(prefix: str, key: str, payload: dict, *, scope: str = "site") -> UsageRollup:
        return UsageRollup(
            rollup_key=f"{prefix}:{key}",
            site_scope=scope,
            scope_kind="instance",
            scope_id=key,
            payload_json=payload,
        )

    with Session(engine, autoflush=False, expire_on_commit=False) as session:
        for prefix in ["legacy", "batch"]:
            for key, payload in [
                ("same", {"value": 1}),
                ("changed", {"value": 1}),
                ("scope", {}),
                ("equal", {"value": 1}),
            ]:
                item = row(prefix, key, payload)
                item.generated_at = sentinel
                session.add(item)
        session.commit()

        payloads = [
            ("same", {"value": 1}, "site"),
            ("changed", {"nested": [None, False, "中文" * 100000]}, "site"),
            ("new", {"empty": []}, "site"),
            ("scope", {}, "other"),
            ("equal", {"value": True}, "site"),
        ]
        repository = StatsRepository(session)
        for key, payload, scope in payloads:
            repository.upsert_usage_rollup(
                rollup_key=f"legacy:{key}",
                site_scope=scope,
                scope_kind="instance",
                scope_id=key,
                payload_json=payload,
            )
        queries = []
        commits = []
        event.listen(session, "after_commit", lambda _session: commits.append(True))

        def capture(_conn, _cursor, sql, _parameters, _context, _many):
            queries.append(sql.lstrip().upper())

        event.listen(engine, "before_cursor_execute", capture)
        try:
            repository.upsert_usage_rollups([])
            assert queries == []
            with pytest.raises(ValueError, match="distinct keys"):
                repository.upsert_usage_rollups([row("batch", "same", {})] * 2)
            assert queries == []
            repository.upsert_usage_rollups(
                [row("batch", key, payload, scope=scope) for key, payload, scope in payloads]
            )
        finally:
            event.remove(engine, "before_cursor_execute", capture)
        assert sum(sql.startswith("SELECT") for sql in queries) == 1
        assert commits == []
        session.commit()
        assert len(commits) == 1
        session.expire_all()
        stored = {item.rollup_key: item for item in session.scalars(select(UsageRollup))}
        for key, _, _ in payloads:
            legacy, batch = stored[f"legacy:{key}"], stored[f"batch:{key}"]
            assert (legacy.site_scope, legacy.scope_kind, legacy.scope_id, legacy.payload_json) == (
                batch.site_scope,
                batch.scope_kind,
                batch.scope_id,
                batch.payload_json,
            )
            if key in {"same", "equal"}:
                assert batch.generated_at.replace(tzinfo=None) == sentinel.replace(tzinfo=None)
            else:
                assert batch.generated_at.replace(tzinfo=None) > sentinel.replace(tzinfo=None)
            if engine.dialect.name == "postgresql":
                assert batch.generated_at == legacy.generated_at
        # A later failed round must restore updates as well as discard inserts.
        previous = stored["batch:changed"].payload_json
        previous_generated_at = stored["batch:changed"].generated_at
        repository.upsert_usage_rollups([row("batch", "changed", {"failed": True})])
        repository.upsert_usage_rollups([row("batch", "uncommitted", {})])
        session.rollback()
        assert session.get(UsageRollup, "batch:uncommitted") is None
        assert session.get(UsageRollup, "batch:changed").payload_json == previous
        assert session.get(UsageRollup, "batch:changed").generated_at == previous_generated_at

    # Both save paths must still fail if another transaction inserts a missing
    # key between our read and flush, rather than silently overwriting its row.
    for batched in [False, True]:
        key = f"race:{batched}"
        injected = False

        def race(_conn, _cursor, sql, _parameters, _context, _many, *, batched: bool = batched):
            nonlocal injected
            if not injected and sql.startswith("SELECT") and "usage_rollups" in sql:
                injected = True
                with Session(engine) as other:
                    other.add(row("race", str(batched), {"winner": True}))
                    other.commit()

        event.listen(engine, "after_cursor_execute", race)
        try:
            with Session(engine, autoflush=False) as session:
                repository = StatsRepository(session)
                with pytest.raises(IntegrityError):
                    if batched:
                        repository.upsert_usage_rollups([row("race", str(batched), {})])
                    else:
                        repository.upsert_usage_rollup(
                            rollup_key=key,
                            site_scope="site",
                            scope_kind="instance",
                            scope_id=str(batched),
                            payload_json={},
                        )
                session.rollback()
        finally:
            event.remove(engine, "after_cursor_execute", race)
        assert injected
        with Session(engine) as session:
            assert session.get(UsageRollup, key).payload_json == {"winner": True}


def test_rollup_batch_save_matches_single_row_semantics(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'batch-save.sqlite3'}")
    try:
        assert_rollup_batch_save_contract(engine)
    finally:
        engine.dispose()
