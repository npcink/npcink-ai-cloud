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
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_engine
from scripts.alembic_revision_gate import require_upgradeable_revisions

try:
    settings = get_settings()
except Exception:
    raise SystemExit(10)
try:
    engine = get_engine(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout_seconds=settings.database_pool_timeout_seconds,
        pool_recycle_seconds=settings.database_pool_recycle_seconds,
        connect_timeout_seconds=settings.database_connect_timeout_seconds,
    )
except Exception:
    raise SystemExit(11)
try:
    connection_context = engine.connect()
    with connection_context as connection:
        version_num = int(connection.execute(text("SHOW server_version_num")).scalar_one())
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
	14) diagnostic_reason="postgres_tls_or_server_version_query_failed" ;;
	15) diagnostic_reason="alembic_revision_query_failed" ;;
	124) diagnostic_reason="runtime_database_diagnostic_timeout" ;;
	*) diagnostic_reason="running_api_diagnostic_execution_failed" ;;
esac

if [ "${diagnostic_status}" -ne 0 ]; then
	echo "[runtime-database-readiness:fail] reason=${diagnostic_reason}." >&2
	exit 1
fi
