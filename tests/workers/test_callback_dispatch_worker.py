from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.workers import callback_dispatch as worker


@pytest.mark.parametrize("poll_seconds", [1, 5, 30])
def test_cold_idle_preserves_configured_poll_and_recent_work_probes_quickly(
    poll_seconds: int,
) -> None:
    schedule = worker._CallbackPollSchedule(poll_seconds=poll_seconds)
    assert [schedule.after_dispatch(processed=False) for _ in range(4)] == [poll_seconds] * 4
    assert schedule.after_dispatch(processed=True) == 0
    assert schedule.after_dispatch(processed=False) == 0.25
    assert schedule.after_dispatch(processed=False) == 0.5
    for _ in range(10):
        assert 0 < schedule.after_dispatch(processed=False) <= poll_seconds
    assert schedule.after_dispatch(processed=False) == poll_seconds
    # New work restores low latency without changing the long-idle ceiling.
    assert schedule.after_dispatch(processed=True) == 0
    assert schedule.after_dispatch(processed=False) == 0.25


def test_fast_polling_and_work_do_not_postpone_or_multiply_maintenance() -> None:
    schedule = worker._CallbackPollSchedule(poll_seconds=5)
    assert schedule.maintenance_due(now=100)
    for i in range(1, 20):
        schedule.after_dispatch(processed=i % 2 == 0)
        assert not schedule.maintenance_due(now=100 + i * 0.25)
    assert schedule.maintenance_due(now=105)
    assert not schedule.maintenance_due(now=105)
    assert schedule.maintenance_due(now=110)


class _StopWorker(RuntimeError):
    pass


@pytest.mark.parametrize("fail_dispatch", [False, True])
def test_worker_applies_backoff_preserves_heartbeat_and_closes_dispatcher(
    monkeypatch: pytest.MonkeyPatch,
    fail_dispatch: bool,
) -> None:
    settings = SimpleNamespace(
        database_url="unused",
        log_level="WARNING",
        runtime_callback_timeout_seconds=10,
        runtime_callback_max_attempts=3,
        runtime_callback_retry_backoff_seconds=30,
        worker_heartbeat_interval_seconds=30,
        runtime_callback_worker_poll_seconds=5,
        runtime_callback_batch_size=8,
    )
    clock = [0.0]
    sleeps: list[float] = []
    repairs: list[float] = []
    heartbeats: list[str] = []
    closed: list[bool] = []
    batches = iter([[], [{"run_id": "first"}], [], [], [], [], [], [], []])

    class FakeService:
        def run_bounded_auto_repairs(self, **kwargs: object) -> dict[str, object]:
            assert kwargs == {
                "worker_id": "callback_dispatch",
                "max_stale_queued": 0,
                "max_callback_overdue": 8,
                "max_running_stale_suggestions": 0,
                "max_stale_running_auto_fail": 0,
            }
            repairs.append(clock[0])
            return {"redelivered_callback_overdue_total": 0}

        def dispatch_pending_callbacks(self, *, max_callbacks: int) -> list[dict[str, object]]:
            assert max_callbacks == 8
            if fail_dispatch:
                raise _StopWorker("dispatch interrupted")
            return next(batches)

    class FakeHeartbeat:
        def maybe_record(self, *, status: str, **kwargs: object) -> None:
            heartbeats.append(status)

    def sleep(delay: float) -> None:
        sleeps.append(delay)
        clock[0] += delay
        if len(sleeps) == 8:
            raise _StopWorker("sampling complete")

    monkeypatch.setattr(worker, "get_settings", lambda: settings)
    monkeypatch.setattr(worker, "configure_logging", lambda _: None)
    monkeypatch.setattr(worker, "require_database_connection", lambda _: None)
    monkeypatch.setattr(worker, "get_logger", lambda _: SimpleNamespace(info=lambda *args: None))
    monkeypatch.setattr(
        worker,
        "HttpRuntimeCallbackDispatcher",
        lambda **kwargs: SimpleNamespace(close=lambda: closed.append(True)),
    )
    monkeypatch.setattr(worker, "RuntimeService", lambda *args, **kwargs: FakeService())
    monkeypatch.setattr(worker, "WorkerHeartbeat", lambda **kwargs: FakeHeartbeat())
    monkeypatch.setattr(worker.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(worker.time, "sleep", sleep)

    with pytest.raises(_StopWorker):
        worker.main()
    assert closed == [True]
    assert heartbeats[0] == "started"
    if fail_dispatch:
        assert sleeps == []
        assert repairs == [0]
    else:
        assert sleeps == [5, 0.25, 0.5, 1, 2, 4, 5, 5]
        assert heartbeats.count("processed") == 1
        assert heartbeats.count("idle") == 8
        assert repairs == [0, 5, 12.75, 17.75]
