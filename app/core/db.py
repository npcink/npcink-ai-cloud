from __future__ import annotations

import json
import random
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.core.logging import get_logger
from app.core.models import Base
from app.core.redaction import safe_exception_type

_worker_connection_retry_scope: ContextVar[str | None] = ContextVar(
    "worker_connection_retry_scope", default=None
)
_WORKER_CONNECTION_ATTEMPTS = 5


@contextmanager
def worker_database_connection_retries(worker_id: str) -> Iterator[None]:
    """Opt in only long-lived workers; never replay a session's business body."""
    token = _worker_connection_retry_scope.set(worker_id)
    try:
        yield
    finally:
        _worker_connection_retry_scope.reset(token)


def _is_transient_connection_error(error: DBAPIError) -> bool:
    state = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
    if state:
        return str(state).startswith("08") or state in {"57P01", "57P02", "57P03", "53300"}
    if error.connection_invalidated:
        return True
    # psycopg's connect timeout has no server SQLSTATE. Do not retry arbitrary
    # OperationalError messages (authentication, invalid database, SQL, etc.).
    return isinstance(error, OperationalError) and "connection timeout expired" in str(error.orig)


def _open_worker_session(database_url: str, worker_id: str) -> Session:
    for attempt in range(1, _WORKER_CONNECTION_ATTEMPTS + 1):
        session = get_session_factory(database_url)()
        try:
            # Establish the connection before yielding. Retrying after yield
            # could replay a Provider call, callback or uncertain commit.
            session.connection()
        except DBAPIError as error:
            session.close()
            if not _is_transient_connection_error(error) or attempt == _WORKER_CONNECTION_ATTEMPTS:
                raise
            delay = float(2 ** (attempt - 1)) + random.uniform(0.0, 0.25)
            get_logger("npcink_ai_cloud.db").warning(
                "worker database connection retry: worker=%s attempt=%s/%s delay=%ss error_type=%s",
                worker_id,
                attempt,
                _WORKER_CONNECTION_ATTEMPTS,
                delay,
                safe_exception_type(error),
            )
            time.sleep(delay)
        except BaseException:
            session.close()
            raise
        else:
            return session
    raise AssertionError("worker connection attempts exhausted")


def build_postgres_advisory_lock_material(*parts: str) -> str:
    """Encode lock-key parts as PostgreSQL-safe, unambiguous text."""
    return json.dumps(parts, ensure_ascii=True, separators=(",", ":"))


@lru_cache(maxsize=8)
def get_engine(
    database_url: str,
    pool_size: int = 2,
    max_overflow: int = 1,
    pool_timeout_seconds: int = 10,
    pool_recycle_seconds: int = 1800,
    connect_timeout_seconds: int = 5,
) -> Engine:
    backend_name = make_url(database_url).get_backend_name()
    connect_args: dict[str, object] = (
        {"check_same_thread": False} if backend_name == "sqlite" else {}
    )
    if backend_name == "postgresql":
        connect_args["connect_timeout"] = connect_timeout_seconds
        return create_engine(
            database_url,
            future=True,
            hide_parameters=True,
            pool_pre_ping=True,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout_seconds,
            pool_recycle=pool_recycle_seconds,
            connect_args=connect_args,
        )
    return create_engine(
        database_url,
        future=True,
        hide_parameters=True,
        pool_pre_ping=True,
        pool_recycle=pool_recycle_seconds,
        connect_args=connect_args,
    )


@lru_cache(maxsize=8)
def get_session_factory(database_url: str) -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(database_url), autoflush=False, expire_on_commit=False)


@contextmanager
def get_session(database_url: str) -> Iterator[Session]:
    worker_id = _worker_connection_retry_scope.get()
    session = (
        get_session_factory(database_url)()
        if worker_id is None
        else _open_worker_session(database_url, worker_id)
    )

    try:
        yield session
    finally:
        session.close()


def init_schema(database_url: str) -> None:
    # Test-only helper for sqlite fixtures and focused local harnesses.
    engine = get_engine(database_url)
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            # sqlite3's legacy transaction mode does not BEGIN for DDL. Without
            # this, every table/index is committed separately on the test disk.
            connection.exec_driver_sql("BEGIN")
        Base.metadata.create_all(bind=connection)


def dispose_engine(database_url: str) -> None:
    get_engine(database_url).dispose()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


def check_database_connection(database_url: str) -> tuple[bool, str]:
    try:
        engine = get_engine(database_url)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, "database is reachable"
    except Exception as error:
        return False, safe_exception_type(error)


def require_database_connection(database_url: str) -> None:
    ok, detail = check_database_connection(database_url)
    if ok:
        return
    raise RuntimeError(f"database is not reachable: {detail}")
