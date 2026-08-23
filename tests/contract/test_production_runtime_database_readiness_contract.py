from __future__ import annotations

import socket
from contextlib import nullcontext
from pathlib import Path

import pytest

from app.core.runtime_config import RuntimeConfigError

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "deploy/remote-runtime-database-readiness.sh"
WORKFLOW = ROOT / ".github/workflows/production-maintenance.yml"


def _payload() -> str:
    source = HELPER.read_text(encoding="utf-8")
    start = source.index("import socket")
    end = source.index("\nPY\n", start)
    return source[start:end]


class _Result:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self.rows = rows

    def scalar_one(self) -> object:
        assert len(self.rows) == 1 and len(self.rows[0]) == 1
        return self.rows[0][0]

    def __iter__(self):  # type: ignore[no-untyped-def]
        return iter(self.rows)


class _Connection:
    def __init__(
        self,
        *,
        server_version_num: int,
        revisions: set[str],
        server_version_query_error: Exception | None,
        alembic_query_error: Exception | None,
    ) -> None:
        self.server_version_num = server_version_num
        self.revisions = revisions
        self.server_version_query_error = server_version_query_error
        self.alembic_query_error = alembic_query_error

    def execute(self, statement: object) -> _Result:
        sql = str(statement)
        if "SHOW server_version_num" in sql:
            if self.server_version_query_error is not None:
                raise self.server_version_query_error
            return _Result([(self.server_version_num,)])
        if "SELECT version_num FROM alembic_version" in sql:
            if self.alembic_query_error is not None:
                raise self.alembic_query_error
            return _Result([(revision,) for revision in sorted(self.revisions)])
        raise AssertionError(f"unexpected SQL: {sql}")


class _Engine:
    def __init__(
        self,
        connection: _Connection,
        connection_error: Exception | None,
    ) -> None:
        self.connection = connection
        self.connection_error = connection_error

    def connect(self):  # type: ignore[no-untyped-def]
        if self.connection_error is not None:
            raise self.connection_error
        return nullcontext(self.connection)


class _SqlstateError(RuntimeError):
    def __init__(self, sqlstate: str) -> None:
        super().__init__("secret postgres detail")
        self.sqlstate = sqlstate


class _WrappedConnectionError(RuntimeError):
    def __init__(self, original: Exception) -> None:
        super().__init__("secret wrapper detail")
        self.orig = original


def _execute_payload(
    monkeypatch: pytest.MonkeyPatch,
    *,
    server_version_num: int = 180000,
    revisions: set[str] | None = None,
    settings_error: Exception | None = None,
    engine_error: Exception | None = None,
    connection_error: Exception | None = None,
    server_version_query_error: Exception | None = None,
    alembic_query_error: Exception | None = None,
    sslmode: str = "verify-full",
    sslrootcert: str | None = None,
    tcp_error: OSError | None = None,
    expected_tcp_host: str | None = None,
) -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.core import db as db_module
    from app.core import runtime_config as runtime_config_module

    head = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_heads()[0]
    ca_path = sslrootcert if sslrootcert is not None else str(ROOT / "alembic.ini")
    settings = {
        "database_url": (
            "postgresql+psycopg://app:redacted@db.internal:5432/cloud"
            f"?sslmode={sslmode}&sslrootcert={ca_path}&hostaddr=127.0.0.1"
        ),
        "database_pool_size": 2,
        "database_max_overflow": 1,
        "database_pool_timeout_seconds": 10,
        "database_pool_recycle_seconds": 1800,
        "database_connect_timeout_seconds": 5,
    }

    def fake_load_runtime_settings_values(_config_dir: Path) -> dict[str, object]:
        if settings_error is not None:
            raise settings_error
        return settings

    def fake_get_engine(*_args: object, **_kwargs: object) -> _Engine:
        if engine_error is not None:
            raise engine_error
        return _Engine(
            _Connection(
                server_version_num=server_version_num,
                revisions=revisions if revisions is not None else {head},
                server_version_query_error=server_version_query_error,
                alembic_query_error=alembic_query_error,
            ),
            connection_error,
        )

    monkeypatch.setattr(db_module, "get_engine", fake_get_engine)
    monkeypatch.setattr(
        runtime_config_module,
        "load_runtime_settings_values",
        fake_load_runtime_settings_values,
    )

    def reject_getaddrinfo(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("validated runtime database address must be reused")

    monkeypatch.setattr(socket, "getaddrinfo", reject_getaddrinfo)

    def fake_create_connection(address, **_kwargs):  # type: ignore[no-untyped-def]
        if tcp_error is not None:
            raise tcp_error
        if expected_tcp_host is not None:
            assert address == (expected_tcp_host, 5432)
        return nullcontext()

    monkeypatch.setattr(socket, "create_connection", fake_create_connection)
    monkeypatch.chdir(ROOT)
    exec(compile(_payload(), str(HELPER), "exec"), {"__name__": "__main__"})


def test_running_api_payload_accepts_fresh_pg18_tls_and_known_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _execute_payload(monkeypatch, expected_tcp_host="127.0.0.1")


@pytest.mark.parametrize(
    ("kwargs", "expected_code"),
    [
        ({"settings_error": RuntimeError("secret setting detail")}, 10),
        (
            {
                "settings_error": RuntimeConfigError(
                    "runtime database TLS mode is invalid"
                )
            },
            16,
        ),
        (
            {
                "settings_error": RuntimeConfigError(
                    "runtime database CA digest is invalid"
                )
            },
            17,
        ),
        (
            {
                "settings_error": RuntimeConfigError(
                    "runtime database hostname could not be resolved"
                )
            },
            18,
        ),
        ({"engine_error": RuntimeError("secret engine detail")}, 11),
        (
            {
                "server_version_num": 170006,
                "alembic_query_error": RuntimeError("must not query alembic"),
            },
            12,
        ),
        ({"revisions": {"unknown_revision"}}, 13),
        ({"connection_error": RuntimeError("secret TLS detail")}, 14),
        ({"alembic_query_error": RuntimeError("secret query detail")}, 15),
        ({"sslmode": "require"}, 16),
        ({"sslrootcert": "/missing/secret-ca.pem"}, 17),
        ({"tcp_error": OSError("secret TCP detail")}, 19),
        ({"connection_error": _SqlstateError("28P01")}, 20),
        ({"connection_error": _SqlstateError("53300")}, 21),
        ({"connection_error": _SqlstateError("57P03")}, 22),
        ({"server_version_query_error": RuntimeError("secret SHOW detail")}, 23),
        ({"connection_error": _SqlstateError("3D000")}, 24),
        (
            {
                "connection_error": _WrappedConnectionError(
                    RuntimeError("certificate verify failed: secret")
                )
            },
            25,
        ),
        (
            {"connection_error": RuntimeError("server does not support SSL")},
            26,
        ),
        (
            {
                "connection_error": RuntimeError(
                    "server closed the connection unexpectedly"
                )
            },
            27,
        ),
        ({"connection_error": RuntimeError("connection timed out")}, 28),
        ({"connection_error": RuntimeError("connection refused: secret")}, 29),
    ],
)
def test_running_api_payload_returns_only_fixed_failure_codes(
    monkeypatch: pytest.MonkeyPatch,
    kwargs: dict[str, object],
    expected_code: int,
) -> None:
    with pytest.raises(SystemExit) as caught:
        _execute_payload(monkeypatch, **kwargs)  # type: ignore[arg-type]

    assert caught.value.code == expected_code


def test_helper_redacts_raw_errors_and_maps_fixed_reasons() -> None:
    source = HELPER.read_text(encoding="utf-8")

    assert 'docker exec -i "${api_container_id}" python -' in source
    assert "timeout --signal=TERM --kill-after=5s 45s" in source
    assert "PY\ndiagnostic_status=$?" in source
    assert "PY\n" in source
    assert ">/dev/null 2>&1" in source
    for reason in (
        "protected_runtime_config_invalid",
        "postgres_engine_initialization_failed",
        "postgres_major_not_18",
        "alembic_revision_not_upgradeable",
        "postgres_tls_connection_failed",
        "alembic_revision_query_failed",
        "postgres_tls_contract_invalid",
        "postgres_ca_file_unavailable",
        "postgres_host_resolution_failed",
        "postgres_tcp_connection_failed",
        "postgres_authentication_failed",
        "postgres_connection_capacity_exhausted",
        "postgres_service_unavailable",
        "postgres_server_version_query_failed",
        "postgres_database_missing",
        "postgres_tls_certificate_verification_failed",
        "postgres_tls_protocol_failed",
        "postgres_tls_handshake_terminated",
        "postgres_connection_timeout",
        "postgres_connection_transport_failed",
        "runtime_database_diagnostic_timeout",
        "running_api_diagnostic_execution_failed",
    ):
        assert reason in source
    for secret_detail in (
        "secret setting detail",
        "secret engine detail",
        "secret TLS detail",
        "secret query detail",
        "secret DNS detail",
        "secret TCP detail",
        "secret postgres detail",
        "secret SHOW detail",
        "secret wrapper detail",
        "certificate verify failed: secret",
        "connection refused: secret",
    ):
        assert secret_detail not in source


def test_production_maintenance_exposes_bounded_read_only_action() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert '- "runtime-database-readiness"' in workflow
    assert "group: production-host-mutation" in workflow
    assert "Checkout runtime database readiness helper" in workflow
    assert "if: inputs.action == 'runtime-database-readiness'" in workflow
    assert "persist-credentials: false" in workflow
    assert "permissions:\n      contents: read" in workflow
    assert "StrictHostKeyChecking=yes" in workflow
    assert 'diagnostic_script_local="deploy/remote-runtime-database-readiness.sh"' in workflow
    assert 'ssh "${ssh_args[@]}" "${ssh_target}" "${remote_command}"' in workflow
    assert '< "${diagnostic_script_local}"' in workflow
    assert "timeout --signal=TERM --kill-after=5s 75s" in workflow
    assert 'if [ "${diagnostic_status}" = "124" ]' in workflow
    assert "reason=runtime_database_diagnostic_timeout" in workflow
    assert "scp " not in workflow
    assert "/tmp/npcink-runtime-database-readiness" not in workflow
    assert "Deploy Production" not in _payload()
