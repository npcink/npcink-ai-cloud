from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.pool import NullPool

from app.core.models import Base
from app.core.runtime_config import (
    RuntimeConfigError,
    build_database_url,
    resolve_private_database_address,
)
from app.setup.errors import SetupError
from app.setup.models import DatabaseInput

INSTALL_MARKER_TABLE = "npcink_first_install_marker"


@dataclass(frozen=True, slots=True)
class DatabaseValidationResult:
    postgres_major_version: int
    ssl_mode: str
    database_empty: bool
    alembic_state: str
    latency_ms: int
    max_connections: int
    database_url: str

    def public_payload(self) -> dict[str, object]:
        return {
            "postgres_major_version": self.postgres_major_version,
            "ssl_mode": self.ssl_mode,
            "database_empty": self.database_empty,
            "alembic_state": self.alembic_state,
            "latency_ms": self.latency_ms,
            "max_connections": self.max_connections,
        }


class PostgreSQL18Validator:
    def validate(
        self,
        database: DatabaseInput,
        *,
        ca_path: Path,
        interrupted_attempt_id: str = "",
    ) -> DatabaseValidationResult:
        hostaddr = self._resolve_private_address(database.host, database.port)
        database_url = build_database_url(
            database.connection_components(),
            ca_path=ca_path,
            hostaddr=hostaddr,
        )
        engine = self._engine(database_url)
        started_at = time.monotonic()
        try:
            with engine.connect() as connection:
                transaction = connection.begin()
                try:
                    version_number = int(
                        connection.execute(text("SHOW server_version_num")).scalar_one()
                    )
                    major_version = version_number // 10000
                    if major_version != 18:
                        raise SetupError(
                            422,
                            "setup.database_version_unsupported",
                            "PostgreSQL 18 is required",
                        )
                    tls_active = bool(
                        connection.execute(
                            text("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
                        ).scalar_one()
                    )
                    if not tls_active:
                        raise SetupError(
                            422,
                            "setup.database_tls_required",
                            "verified database TLS is required",
                        )
                    max_connections = int(
                        connection.execute(text("SHOW max_connections")).scalar_one()
                    )
                    current_schema, relation_identities = self._relation_names(connection)
                    database_empty, alembic_state = self._classify_database(
                        connection,
                        current_schema=current_schema,
                        relation_identities=relation_identities,
                        interrupted_attempt_id=interrupted_attempt_id,
                    )
                    self._probe_ddl_permissions(connection)
                finally:
                    transaction.rollback()
        except SetupError:
            raise
        except Exception as error:
            raise SetupError(
                422,
                self._connection_error_code(error),
                "database validation failed",
            ) from error
        finally:
            engine.dispose()
        latency_ms = max(0, int((time.monotonic() - started_at) * 1000))
        return DatabaseValidationResult(
            postgres_major_version=18,
            ssl_mode="verify-full",
            database_empty=database_empty,
            alembic_state=alembic_state,
            latency_ms=latency_ms,
            max_connections=max_connections,
            database_url=database_url,
        )

    def ensure_attempt_marker(self, database_url: str, *, attempt_id: str) -> None:
        engine = self._engine(database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        f"CREATE TABLE IF NOT EXISTS {INSTALL_MARKER_TABLE} "
                        "(attempt_id varchar(64) PRIMARY KEY)"
                    )
                )
                existing = connection.execute(
                    text(f"SELECT attempt_id FROM {INSTALL_MARKER_TABLE}")
                ).scalars().all()
                if existing and existing != [attempt_id]:
                    raise SetupError(
                        409,
                        "setup.database_not_empty",
                        "database belongs to another installation attempt",
                    )
                if not existing:
                    connection.execute(
                        text(
                            f"INSERT INTO {INSTALL_MARKER_TABLE} (attempt_id) "
                            "VALUES (:attempt_id)"
                        ),
                        {"attempt_id": attempt_id},
                    )
        finally:
            engine.dispose()

    def remove_attempt_marker(self, database_url: str) -> None:
        engine = self._engine(database_url)
        try:
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS {INSTALL_MARKER_TABLE}"))
        finally:
            engine.dispose()

    def run_migrations(self, database_url: str) -> None:
        engine = self._engine(database_url)
        try:
            with engine.connect() as connection:
                config = AlembicConfig(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
        except Exception as error:
            raise SetupError(500, "setup.migration_failed", "database migration failed") from error
        finally:
            engine.dispose()

    @staticmethod
    def _engine(database_url: str) -> Engine:
        return create_engine(
            database_url,
            future=True,
            hide_parameters=True,
            pool_pre_ping=True,
            poolclass=NullPool,
        )

    @staticmethod
    def _resolve_private_address(host: str, port: int) -> str:
        try:
            return resolve_private_database_address(host, port)
        except RuntimeConfigError as error:
            error_code = (
                "setup.database_private_endpoint_required"
                if "must resolve only to private addresses" in str(error)
                else "setup.database_unreachable"
            )
            raise SetupError(
                422,
                error_code,
                (
                    "database hostname does not satisfy private endpoint policy"
                    if error_code == "setup.database_private_endpoint_required"
                    else "database hostname could not be resolved"
                ),
            ) from error

    @staticmethod
    def _connection_error_code(error: Exception) -> str:
        pending: list[BaseException] = [error]
        observed: set[int] = set()
        messages: list[str] = []
        sqlstates: set[str] = set()
        while pending and len(observed) < 8:
            current = pending.pop()
            if id(current) in observed:
                continue
            observed.add(id(current))
            messages.append(str(current).lower())
            for attribute in ("sqlstate", "pgcode"):
                value = str(getattr(current, attribute, "") or "").strip().upper()
                if value:
                    sqlstates.add(value)
            for nested in (
                getattr(current, "orig", None),
                current.__cause__,
                current.__context__,
            ):
                if isinstance(nested, BaseException):
                    pending.append(nested)

        combined = " ".join(messages)
        if sqlstates.intersection({"28000", "28P01"}) or any(
            marker in combined
            for marker in (
                "password authentication failed",
                "authentication failed",
                "invalid password",
            )
        ):
            return "setup.database_auth_failed"
        if any(
            marker in combined
            for marker in (
                "certificate verify failed",
                "certificate validation failed",
                "hostname mismatch",
                "ssl error",
                "sslrootcert",
                "tls error",
            )
        ):
            return "setup.database_tls_required"
        return "setup.database_unreachable"

    @staticmethod
    def _relation_names(connection: Connection) -> tuple[str, set[tuple[str, str, str]]]:
        current_schema = str(
            connection.execute(text("SELECT current_schema()")).scalar_one()
        )
        rows = connection.execute(
            text(
                "SELECT n.nspname, c.relname, c.relkind FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') "
                "AND n.nspname NOT LIKE 'pg_toast%' "
                "AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')"
            )
        )
        return current_schema, {
            (str(schema_name), str(relation_name), str(relation_kind))
            for schema_name, relation_name, relation_kind in rows
        }

    def _classify_database(
        self,
        connection: Connection,
        *,
        current_schema: str,
        relation_identities: set[tuple[str, str, str]],
        interrupted_attempt_id: str,
    ) -> tuple[bool, str]:
        if not relation_identities:
            return True, "empty"
        marker_identity = (current_schema, INSTALL_MARKER_TABLE, "r")
        if not interrupted_attempt_id or marker_identity not in relation_identities:
            raise SetupError(409, "setup.database_not_empty", "database must be empty")
        marker_attempts = connection.execute(
            text(f"SELECT attempt_id FROM {INSTALL_MARKER_TABLE}")
        ).scalars().all()
        if marker_attempts != [interrupted_attempt_id]:
            raise SetupError(409, "setup.database_not_empty", "database must be empty")
        model_tables = {table.name for table in Base.metadata.sorted_tables}
        unexpected = {
            (schema_name, relation_name, relation_kind)
            for schema_name, relation_name, relation_kind in relation_identities
            if schema_name != current_schema
            or not (
                (
                    relation_kind in {"r", "p"}
                    and relation_name in model_tables
                )
                or (
                    relation_kind == "r"
                    and relation_name in {"alembic_version", INSTALL_MARKER_TABLE}
                )
                or (
                    relation_kind == "S"
                    and any(
                        relation_name.startswith(f"{table_name}_")
                        and relation_name.endswith("_seq")
                        for table_name in model_tables
                    )
                )
            )
        }
        if unexpected:
            raise SetupError(409, "setup.database_not_empty", "database must be empty")
        alembic_state = (
            "interrupted"
            if (current_schema, "alembic_version", "r") in relation_identities
            else "empty"
        )
        return False, alembic_state

    @staticmethod
    def _probe_ddl_permissions(connection: Connection) -> None:
        suffix = str(int(time.time_ns()))
        table_name = f"npcink_setup_probe_{suffix}"
        sequence_name = f"npcink_setup_probe_seq_{suffix}"
        try:
            connection.execute(text(f"CREATE TABLE {table_name} (id bigint PRIMARY KEY)"))
            connection.execute(text(f"CREATE INDEX {table_name}_idx ON {table_name} (id)"))
            connection.execute(text(f"CREATE SEQUENCE {sequence_name}"))
        except Exception as error:
            raise SetupError(
                422,
                "setup.database_permissions_insufficient",
                "database account lacks required schema permissions",
            ) from error
