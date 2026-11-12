from __future__ import annotations

import sqlite3
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from app.core import db
from app.core.config import Settings
from app.workers import callback_dispatch, ops_cadence, runtime_queue


class StopWorker(Exception):
    pass


@pytest.mark.parametrize("worker_name", ["runtime_queue", "callback_dispatch", "ops_cadence"])
def test_running_workers_recover_acquisition_without_replaying_work(
    monkeypatch: pytest.MonkeyPatch,
    worker_name: str,
) -> None:
    worker = {
        "runtime_queue": runtime_queue,
        "callback_dispatch": callback_dispatch,
        "ops_cadence": ops_cadence,
    }[worker_name]
    engine = create_engine("sqlite+pysqlite:///:memory:")
    connections: list[None] = []
    sleeps: list[float] = []
    operations: list[str] = []
    heartbeats: list[str] = []
    closed: list[bool] = []

    def transient_connect(*_args: Any) -> None:
        connections.append(None)
        if len(connections) <= 2:
            raise sqlite3.OperationalError("connection timeout expired")

    event.listen(engine, "do_connect", transient_connect)
    monkeypatch.setattr(db, "get_session_factory", lambda _: sessionmaker(bind=engine))
    monkeypatch.setattr(db.random, "uniform", lambda *_: 0.0)

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        if len(sleeps) > 2:
            raise StopWorker

    monkeypatch.setattr(db.time, "sleep", sleep)

    def read_before_work(label: str) -> None:
        with db.get_session("isolated-test") as session:
            assert session.scalar(text("SELECT 1")) == 1
            operations.append(label)

    class FakeService:
        providers: dict[str, object] = {}

        def run_bounded_auto_repairs(self, **_kwargs: Any) -> dict[str, object]:
            read_before_work("maintenance")
            return {}

        def process_queued_runs(self, **_kwargs: Any) -> list[dict[str, object]]:
            read_before_work("model")
            return [{"run_id": "fake-run"}]

        def dispatch_pending_callbacks(self, **_kwargs: Any) -> list[dict[str, object]]:
            read_before_work("callback")
            return [{"run_id": "fake-run"}]

    class FakeHeartbeat:
        def __init__(self, **_kwargs: Any) -> None:
            pass

        def maybe_record(self, *, status: str, **_kwargs: Any) -> None:
            heartbeats.append(status)
            if status != "started":
                raise StopWorker

    monkeypatch.setattr(worker, "get_settings", lambda: Settings())
    monkeypatch.setattr(worker, "configure_logging", lambda _: None)
    monkeypatch.setattr(worker, "require_database_connection", lambda _: None)
    monkeypatch.setattr(worker, "WorkerHeartbeat", FakeHeartbeat)
    if worker_name == "runtime_queue":
        monkeypatch.setattr(
            runtime_queue,
            "RedisRuntimeQueue",
            lambda *a, **k: SimpleNamespace(close=lambda: closed.append(True)),
        )
        monkeypatch.setattr(runtime_queue, "_build_runtime_service", lambda *a: FakeService())
    elif worker_name == "callback_dispatch":
        monkeypatch.setattr(
            callback_dispatch,
            "HttpRuntimeCallbackDispatcher",
            lambda **k: SimpleNamespace(close=lambda: closed.append(True)),
        )
        monkeypatch.setattr(callback_dispatch, "RuntimeService", lambda *a, **k: FakeService())
    else:
        monkeypatch.setattr(
            ops_cadence.argparse.ArgumentParser,
            "parse_args",
            lambda _: SimpleNamespace(manual_task=None),
        )

        def run_due_tasks(_settings: Settings) -> list[dict[str, object]]:
            read_before_work("scheduled-task")
            return []

        monkeypatch.setattr(ops_cadence, "run_due_tasks", run_due_tasks)
    try:
        with pytest.raises(StopWorker):
            worker.main()
        assert len(connections) == 3
        assert sleeps == [1.0, 2.0]
        assert heartbeats[0] == "started"
        expected = {
            "runtime_queue": ["maintenance", "model"],
            "callback_dispatch": ["maintenance", "callback"],
            "ops_cadence": ["scheduled-task"],
        }
        assert operations == expected[worker_name]
        assert closed == ([] if worker_name == "ops_cadence" else [True])
        # The decorator must release its opt-in scope even after the worker exits.
        engine.dispose()
        with db.get_session("isolated-test"):
            pass
        assert len(connections) == 3
    finally:
        engine.dispose()
