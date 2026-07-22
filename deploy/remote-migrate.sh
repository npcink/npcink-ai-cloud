#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Shared compose/env helpers for deploy scripts.
. "${ROOT_DIR}/deploy/common.sh"
npcink_ai_cloud_require_deploy_lock_owner "${ROOT_DIR}"

npcink_ai_cloud_require_cmd docker
RELEASE_TOOL_PYTHON="$(npcink_ai_cloud_release_tool_python)"
MANIFEST_HELPER="${ROOT_DIR}/scripts/verify-release-bundle-manifest.py"
npcink_ai_cloud_require_release_tool_python "${RELEASE_TOOL_PYTHON}"
EXPECTED_API_IMAGE_ID="$(
	"${RELEASE_TOOL_PYTHON}" "${MANIFEST_HELPER}" loaded-role-daemon-id \
		--root "${ROOT_DIR}" --role api
)"

npcink_ai_cloud_run_timed "wait for configured external database" \
	npcink_ai_cloud_compose_run_with_image_proof \
	"${ROOT_DIR}" api npcink-ai-cloud-api:prod "${EXPECTED_API_IMAGE_ID}" \
	sh -ceu '
		attempt=0
		while [ "${attempt}" -lt 30 ]; do
			if alembic current >/dev/null 2>&1; then
				exit 0
			fi
			attempt=$((attempt + 1))
			sleep 2
		done
		echo "[fail] Configured external database did not become ready." >&2
		exit 1
	'
npcink_ai_cloud_run_timed "alembic upgrade" \
	npcink_ai_cloud_compose_run_with_image_proof \
	"${ROOT_DIR}" api npcink-ai-cloud-api:prod "${EXPECTED_API_IMAGE_ID}" \
	sh -ceu 'alembic upgrade head
python - <<'"'"'PY'"'"'
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_engine
from scripts.alembic_revision_gate import require_exact_candidate_heads

settings = get_settings()
engine = get_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_timeout_seconds=settings.database_pool_timeout_seconds,
    pool_recycle_seconds=settings.database_pool_recycle_seconds,
    connect_timeout_seconds=settings.database_connect_timeout_seconds,
)
with engine.connect() as connection:
    observed = {
        str(row[0])
        for row in connection.execute(text("SELECT version_num FROM alembic_version"))
    }
require_exact_candidate_heads(
    ScriptDirectory.from_config(Config("alembic.ini")), observed
)
PY'
echo "[ok] Migration completed without starting application services; exact candidate Alembic head was proved."
