from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.exc import OperationalError

from app.core import db as db_module


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'db-core.sqlite3'}"


def test_get_engine_hides_sql_parameters(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    engine = db_module.get_engine(database_url)

    try:
        assert engine.hide_parameters is True
    finally:
        db_module.dispose_engine(database_url)


def test_get_engine_supports_sqlite_singleton_pool() -> None:
    database_url = "sqlite+pysqlite:///:memory:"
    engine = db_module.get_engine(database_url)

    try:
        assert engine.dialect.name == "sqlite"
    finally:
        db_module.dispose_engine(database_url)


def test_postgresql_engine_keeps_frozen_queue_pool_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = "postgresql+psycopg://db-user:db-password@private-db/cloud"
    sentinel = object()
    captured: dict[str, object] = {}

    def capture_engine(url: str, **kwargs: object) -> Any:
        captured["url"] = url
        captured.update(kwargs)
        return sentinel

    monkeypatch.setattr(db_module, "create_engine", capture_engine)
    db_module.get_engine.cache_clear()
    try:
        assert db_module.get_engine(
            database_url,
            pool_size=3,
            max_overflow=2,
            pool_timeout_seconds=11,
            pool_recycle_seconds=1900,
            connect_timeout_seconds=6,
        ) is sentinel
    finally:
        db_module.get_engine.cache_clear()

    assert captured["url"] == database_url
    assert captured["pool_size"] == 3
    assert captured["max_overflow"] == 2
    assert captured["pool_timeout"] == 11
    assert captured["pool_recycle"] == 1900
    assert captured["connect_args"] == {"connect_timeout": 6}


def test_engine_creation_type_error_is_not_retried_or_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    def fail_engine_creation(_url: str, **kwargs: object) -> Any:
        calls.append(kwargs)
        raise TypeError("driver-specific engine failure")

    monkeypatch.setattr(db_module, "create_engine", fail_engine_creation)
    db_module.get_engine.cache_clear()
    try:
        with pytest.raises(TypeError, match="driver-specific engine failure"):
            db_module.get_engine("sqlite+pysqlite:///:memory:")
    finally:
        db_module.get_engine.cache_clear()

    assert len(calls) == 1
    assert "pool_size" not in calls[0]
    assert "max_overflow" not in calls[0]
    assert "pool_timeout" not in calls[0]


def test_database_connection_failure_returns_stable_non_sensitive_error_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "postgresql://db-user:db-password@private-db/cloud"

    class _FailingEngine:
        def connect(self) -> Any:
            raise OperationalError(
                "SELECT :private_value",
                {"private_value": secret},
                RuntimeError(f"could not connect to {secret}"),
            )

    monkeypatch.setattr(db_module, "get_engine", lambda _database_url: _FailingEngine())

    ok, detail = db_module.check_database_connection(secret)

    assert ok is False
    assert detail == "OperationalError"
    assert secret not in detail

    with pytest.raises(RuntimeError) as error_info:
        db_module.require_database_connection(secret)
    assert str(error_info.value) == "database is not reachable: OperationalError"
    assert secret not in str(error_info.value)


def test_database_engine_creation_failure_uses_stable_non_sensitive_error_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "postgresql://db-user:db-password@private-db:not-a-port/cloud"

    def fail_engine_creation(_database_url: str) -> Any:
        raise ValueError(f"invalid database URL: {secret}")

    monkeypatch.setattr(db_module, "get_engine", fail_engine_creation)

    ok, detail = db_module.check_database_connection(secret)

    assert ok is False
    assert detail == "ValueError"
    assert secret not in detail

    with pytest.raises(RuntimeError) as error_info:
        db_module.require_database_connection(secret)
    assert str(error_info.value) == "database is not reachable: ValueError"
    assert secret not in str(error_info.value)
