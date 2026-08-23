#!/usr/bin/env bash
set -euo pipefail
set +x

if [ "$#" -ne 1 ]; then
	echo "[runtime-database-readiness:fail] reason=invalid_managed_root_argument." >&2
	exit 1
fi

requested_root="$1"
if [[ "${requested_root}" != /* ]] || [ -L "${requested_root}" ]; then
	echo "[runtime-database-readiness:fail] reason=invalid_managed_root." >&2
	exit 1
fi
MANAGED_ROOT="$(cd "${requested_root}" 2>/dev/null && pwd -P)" || {
	echo "[runtime-database-readiness:fail] reason=unavailable_managed_root." >&2
	exit 1
}
if [ "${MANAGED_ROOT}" != "${requested_root}" ]; then
	echo "[runtime-database-readiness:fail] reason=unmanaged_root_alias." >&2
	exit 1
fi

current_link="${MANAGED_ROOT}/current"
if [ ! -L "${current_link}" ]; then
	echo "[runtime-database-readiness:fail] reason=invalid_current_release_link." >&2
	exit 1
fi
ROOT_DIR="$(readlink -f -- "${current_link}" 2>/dev/null || true)"
if [[ "${ROOT_DIR}" != "${MANAGED_ROOT}"/release-* ]] || \
	[ "$(dirname -- "${ROOT_DIR}")" != "${MANAGED_ROOT}" ] || \
	[[ ! "$(basename -- "${ROOT_DIR}")" =~ ^release-[A-Za-z0-9._-]+$ ]] || \
	[ ! -d "${ROOT_DIR}" ]; then
	echo "[runtime-database-readiness:fail] reason=invalid_current_release." >&2
	exit 1
fi

. "${ROOT_DIR}/deploy/common.sh"
npcink_ai_cloud_load_env_file "${ROOT_DIR}"
npcink_ai_cloud_require_cmd docker
npcink_ai_cloud_require_cmd timeout

api_container_ids="$(npcink_ai_cloud_compose "${ROOT_DIR}" ps -q api)" || {
	echo "[runtime-database-readiness:fail] reason=api_container_query_failed." >&2
	exit 1
}
api_container_count="$(
	printf '%s\n' "${api_container_ids}" | awk 'NF { count += 1 } END { print count + 0 }'
)"
if [ "${api_container_count}" -ne 1 ]; then
	echo "[runtime-database-readiness:fail] reason=api_container_not_unique." >&2
	exit 1
fi
api_container_id="$(printf '%s\n' "${api_container_ids}" | awk 'NF { print; exit }')"
if [[ ! "${api_container_id}" =~ ^[0-9a-f]{12,64}$ ]]; then
	echo "[runtime-database-readiness:fail] reason=invalid_api_container_id." >&2
	exit 1
fi

diagnostic_status=0
set +e
timeout --signal=TERM --kill-after=5s 45s \
	docker exec -i "${api_container_id}" python - <<'PY' >/dev/null 2>&1
import socket
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.db import get_engine
from app.core.runtime_config import (
    RuntimeConfigError,
    config_dir_from_environment,
    load_runtime_settings_values,
)
from scripts.alembic_revision_gate import require_upgradeable_revisions

try:
    runtime_values = load_runtime_settings_values(config_dir_from_environment())
except RuntimeConfigError as error:
    config_error = str(error)
    if config_error == "runtime database TLS mode is invalid":
        raise SystemExit(16)
    if config_error.startswith("runtime database CA "):
        raise SystemExit(17)
    if config_error in {
        "runtime database hostname could not be resolved",
        "runtime database hostname resolution is invalid",
        "runtime database hostname must resolve only to private addresses",
    }:
        raise SystemExit(18)
    raise SystemExit(10)
except Exception:
    raise SystemExit(10)
try:
    database_url_text = str(runtime_values["database_url"])
    database_pool_size = int(runtime_values["database_pool_size"])
    database_max_overflow = int(runtime_values["database_max_overflow"])
    database_pool_timeout_seconds = int(
        runtime_values["database_pool_timeout_seconds"]
    )
    database_pool_recycle_seconds = int(
        runtime_values["database_pool_recycle_seconds"]
    )
    database_connect_timeout_seconds = int(
        runtime_values["database_connect_timeout_seconds"]
    )
    database_url = make_url(database_url_text)
except Exception:
    raise SystemExit(10)
if (
    database_url.get_backend_name() != "postgresql"
    or not database_url.host
    or not database_url.query.get("hostaddr")
    or database_url.query.get("sslmode") != "verify-full"
    or not database_url.query.get("sslrootcert")
):
    raise SystemExit(16)
ca_path = Path(str(database_url.query["sslrootcert"]))
try:
    with ca_path.open("rb") as ca_file:
        ca_prefix = ca_file.read(1)
except OSError:
    raise SystemExit(17)
if not ca_prefix:
    raise SystemExit(17)
database_port = database_url.port or 5432
database_hostaddr = str(database_url.query["hostaddr"])
try:
    with socket.create_connection(
        (database_hostaddr, database_port),
        timeout=database_connect_timeout_seconds,
    ):
        pass
except OSError:
    raise SystemExit(19)
try:
    engine = get_engine(
        database_url_text,
        pool_size=database_pool_size,
        max_overflow=database_max_overflow,
        pool_timeout_seconds=database_pool_timeout_seconds,
        pool_recycle_seconds=database_pool_recycle_seconds,
        connect_timeout_seconds=database_connect_timeout_seconds,
    )
except Exception:
    raise SystemExit(11)


def connection_failure_code(error: Exception) -> int:
    current: object | None = error
    for _ in range(6):
        if current is None:
            break
        sqlstate = getattr(current, "sqlstate", None) or getattr(
            current, "pgcode", None
        )
        if sqlstate in {"28000", "28P01"}:
            return 20
        if sqlstate == "53300":
            return 21
        if sqlstate == "57P03":
            return 22
        if sqlstate == "3D000":
            return 24
        try:
            detail = str(current).casefold()
        except Exception:
            detail = ""
        if any(
            marker in detail
            for marker in (
                "certificate verify failed",
                "certificate verification failed",
                "does not match host name",
                "hostname mismatch",
            )
        ):
            return 25
        if any(
            marker in detail
            for marker in (
                "server does not support ssl",
                "ssl is not enabled on the server",
                "wrong version number",
                "no protocols available",
            )
        ):
            return 26
        if any(
            marker in detail
            for marker in (
                "server closed the connection unexpectedly",
                "connection reset by peer",
                "eof detected",
            )
        ):
            return 27
        if "timeout expired" in detail or "timed out" in detail:
            return 28
        if any(
            marker in detail
            for marker in (
                "connection refused",
                "network is unreachable",
                "no route to host",
            )
        ):
            return 29
        current = (
            getattr(current, "orig", None)
            or getattr(current, "__cause__", None)
            or getattr(current, "__context__", None)
        )
    return 14


try:
    connection_context = engine.connect()
except Exception as error:
    raise SystemExit(connection_failure_code(error))
try:
    with connection_context as connection:
        try:
            version_num = int(
                connection.execute(text("SHOW server_version_num")).scalar_one()
            )
        except Exception:
            raise SystemExit(23)
        if version_num // 10000 != 18:
            raise SystemExit(12)
        try:
            observed = {
                str(row[0])
                for row in connection.execute(text("SELECT version_num FROM alembic_version"))
            }
        except Exception:
            raise SystemExit(15)
except SystemExit:
    raise
except Exception:
    raise SystemExit(14)
try:
    require_upgradeable_revisions(
        ScriptDirectory.from_config(Config("alembic.ini")), observed
    )
except ValueError:
    raise SystemExit(13)
PY
diagnostic_status=$?
set -e

case "${diagnostic_status}" in
	0)
	echo "[runtime-database-readiness:ok] running_api_fresh_postgres_tls_and_alembic_ready."
	;;
	10) diagnostic_reason="protected_runtime_config_invalid" ;;
	11) diagnostic_reason="postgres_engine_initialization_failed" ;;
	12) diagnostic_reason="postgres_major_not_18" ;;
	13) diagnostic_reason="alembic_revision_not_upgradeable" ;;
	14) diagnostic_reason="postgres_tls_connection_failed" ;;
	15) diagnostic_reason="alembic_revision_query_failed" ;;
	16) diagnostic_reason="postgres_tls_contract_invalid" ;;
	17) diagnostic_reason="postgres_ca_file_unavailable" ;;
	18) diagnostic_reason="postgres_host_resolution_failed" ;;
	19) diagnostic_reason="postgres_tcp_connection_failed" ;;
	20) diagnostic_reason="postgres_authentication_failed" ;;
	21) diagnostic_reason="postgres_connection_capacity_exhausted" ;;
	22) diagnostic_reason="postgres_service_unavailable" ;;
		23) diagnostic_reason="postgres_server_version_query_failed" ;;
		24) diagnostic_reason="postgres_database_missing" ;;
		25) diagnostic_reason="postgres_tls_certificate_verification_failed" ;;
		26) diagnostic_reason="postgres_tls_protocol_failed" ;;
		27) diagnostic_reason="postgres_tls_handshake_terminated" ;;
		28) diagnostic_reason="postgres_connection_timeout" ;;
		29) diagnostic_reason="postgres_connection_transport_failed" ;;
	124) diagnostic_reason="runtime_database_diagnostic_timeout" ;;
	*) diagnostic_reason="running_api_diagnostic_execution_failed" ;;
esac

if [ "${diagnostic_status}" -ne 0 ]; then
	echo "[runtime-database-readiness:fail] reason=${diagnostic_reason}." >&2
	exit 1
fi
