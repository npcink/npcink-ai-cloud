from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from typing import Any

import pytest
from sqlalchemy.exc import InterfaceError, OperationalError

from app.core import db


def connection_error(
    message: str = "connection timeout expired", *, state: str | None = None
) -> OperationalError:
    original = RuntimeError(message)
    if state is not None:
        original.sqlstate = state  # type: ignore[attr-defined]
    return OperationalError(None, None, original)


class FakeSession:
    def __init__(self, events: list[str], error: Exception | None = None) -> None:
        self.events = events
        self.error = error

    def connection(self) -> None:
        self.events.append("connect")
        if self.error:
            raise self.error

    def close(self) -> None:
        self.events.append("close")


def install_sessions(monkeypatch: pytest.MonkeyPatch, errors: list[Exception | None]) -> list[str]:
    events: list[str] = []
    remaining = iter(errors)

    def factory() -> FakeSession:
        events.append("new")
        return FakeSession(events, next(remaining))

    monkeypatch.setattr(db, "get_session_factory", lambda _: factory)
    monkeypatch.setattr(db.time, "sleep", lambda seconds: events.append(f"sleep:{seconds}"))
    monkeypatch.setattr(db.random, "uniform", lambda *_: 0.0)
    return events


def test_worker_reconnects_before_body_and_closes_failed_sessions_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = install_sessions(monkeypatch, [connection_error(), connection_error(), None])
    with db.worker_database_connection_retries("runtime_queue"):
        with db.get_session("unused"):
            events.append("model/callback-once")
    assert events == [
        "new",
        "connect",
        "close",
        "sleep:1.0",
        "new",
        "connect",
        "close",
        "sleep:2.0",
        "new",
        "connect",
        "model/callback-once",
        "close",
    ]


def test_retry_exhaustion_is_bounded_and_does_not_enter_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = install_sessions(monkeypatch, [connection_error()] * 5)
    with db.worker_database_connection_retries("ops_cadence"):
        with pytest.raises(OperationalError):
            with db.get_session("unused"):
                pytest.fail("failed acquisition must not execute business work")
    assert events.count("new") == events.count("close") == 5
    assert [event for event in events if event.startswith("sleep:")] == [
        "sleep:1.0",
        "sleep:2.0",
        "sleep:4.0",
        "sleep:8.0",
    ]


@pytest.mark.parametrize("state", ["08001", "08006", "57P01", "57P02", "57P03", "53300"])
def test_transient_postgres_connection_codes_recover(
    monkeypatch: pytest.MonkeyPatch, state: str
) -> None:
    events = install_sessions(monkeypatch, [connection_error("sanitized", state=state), None])
    with db.worker_database_connection_retries("callback_dispatch"):
        with db.get_session("unused"):
            events.append("body")
    assert events.count("connect") == 2
    assert events.count("body") == 1


@pytest.mark.parametrize(
    "error",
    [
        connection_error("password authentication failed", state="28P01"),
        connection_error("connection timeout expired", state="28000"),
        connection_error("database missing", state="3D000"),
        connection_error("unclassified driver error"),
        InterfaceError(None, None, RuntimeError("unexpected interface error")),
        TypeError("invalid configuration"),
    ],
)
def test_auth_configuration_and_unknown_errors_fail_fast(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    events = install_sessions(monkeypatch, [error])
    with db.worker_database_connection_retries("runtime_queue"):
        with pytest.raises(type(error)):
            with db.get_session("unused"):
                pytest.fail("must not enter body")
    assert events == ["new", "connect", "close"]


def test_invalidated_connection_can_recover_before_body(monkeypatch: pytest.MonkeyPatch) -> None:
    error = InterfaceError(None, None, RuntimeError("disconnected"), connection_invalidated=True)
    events = install_sessions(monkeypatch, [error, None])
    with db.worker_database_connection_retries("runtime_queue"):
        with db.get_session("unused"):
            events.append("body")
    assert events.count("connect") == 2


@pytest.mark.parametrize("operation", ["query", "commit", "provider", "callback"])
def test_business_failure_is_never_retried(monkeypatch: pytest.MonkeyPatch, operation: str) -> None:
    events = install_sessions(monkeypatch, [None])
    error = connection_error()
    with db.worker_database_connection_retries("runtime_queue"):
        with pytest.raises(OperationalError) as caught:
            with db.get_session("unused"):
                events.append(operation)
                raise error
    assert caught.value is error
    assert events == ["new", "connect", operation, "close"]


@pytest.mark.parametrize("leave_by_error", [False, True])
def test_retry_scope_resets_after_normal_and_exceptional_exit(
    monkeypatch: pytest.MonkeyPatch, leave_by_error: bool
) -> None:
    events = install_sessions(monkeypatch, [None, None, None])
    with pytest.raises(RuntimeError) if leave_by_error else nullcontext():
        with db.worker_database_connection_retries("outer"):
            with db.worker_database_connection_retries("inner"):
                with db.get_session("unused"):
                    pass
            with db.get_session("unused"):
                pass
            if leave_by_error:
                raise RuntimeError("leave worker")
    with db.get_session("unused"):
        events.append("default-lazy-session")
    assert events.count("connect") == 2
    assert events[-3:] == ["new", "default-lazy-session", "close"]


def test_worker_context_does_not_leak_to_other_threads(monkeypatch: pytest.MonkeyPatch) -> None:
    events = install_sessions(monkeypatch, [None])

    def other_request() -> None:
        with db.get_session("unused"):
            events.append("api-body")

    with db.worker_database_connection_retries("runtime_queue"):
        with ThreadPoolExecutor(max_workers=1) as executor:
            executor.submit(other_request).result()
    assert events == ["new", "api-body", "close"]


def test_retry_logs_do_not_include_driver_messages_dsn_or_sql(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "postgresql://private-user:private-password@private-host/private-db"
    error = OperationalError(
        "SELECT private_sql",
        {"secret": secret},
        RuntimeError(f"connection timeout expired: {secret}"),
    )
    install_sessions(monkeypatch, [error, None])
    messages: list[tuple[Any, ...]] = []
    monkeypatch.setattr(
        db,
        "get_logger",
        lambda _: type("Logger", (), {"warning": lambda self, *args: messages.append(args)})(),
    )
    with db.worker_database_connection_retries("runtime_queue"):
        with db.get_session("unused"):
            pass
    assert messages
    assert secret not in str(messages)
    assert "private_sql" not in str(messages)
    assert "connection timeout expired" not in str(messages)
