#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
. "${ROOT_DIR}/deploy/common.sh"

npcink_ai_cloud_require_deploy_lock_owner "${ROOT_DIR}"
npcink_ai_cloud_require_cmd docker

RELEASE_TOOL_PYTHON="$(npcink_ai_cloud_release_tool_python)"
MANIFEST_HELPER="${ROOT_DIR}/scripts/verify-release-bundle-manifest.py"
npcink_ai_cloud_require_release_tool_python "${RELEASE_TOOL_PYTHON}"

REFRESH_MODE="${NPCINK_CLOUD_PROVIDER_REFRESH_MODE:-strict}"
case "${REFRESH_MODE}" in
	strict|best-effort)
		;;
	*)
		echo "[fail] Provider refresh mode must be strict or best-effort." >&2
		exit 64
		;;
esac

# Provider refresh mutates database projections. It is therefore a governed
# release operation, never an ad-hoc command inside the running API container.
API_DAEMON_IMAGE_ID="$("${RELEASE_TOOL_PYTHON}" "${MANIFEST_HELPER}" \
	loaded-role-daemon-id --root "${ROOT_DIR}" --role api)"
PYTHON_COMMAND=(
	npcink_ai_cloud_compose_run_with_image_proof
	"${ROOT_DIR}"
	api
	npcink-ai-cloud-api:prod
	"${API_DAEMON_IMAGE_ID}"
	python -
)

"${PYTHON_COMMAND[@]}" "${REFRESH_MODE}" <<'PY'
from __future__ import annotations

import json
import sys

from app.adapters.repositories.catalog_repository import CatalogRepository
from app.adapters.providers.registry import resolve_live_provider_adapters
from app.core.config import get_settings
from app.core.db import get_session
from app.domain.catalog.provider_refresh_release import refresh_provider_catalogs
from app.domain.catalog.service import CatalogService

mode = sys.argv[1]
settings = get_settings()
providers = resolve_live_provider_adapters(
    settings,
    include_enabled_connections=True,
    fail_on_database_error=True,
    fail_on_credential_error=True,
    include_uncredentialed_connections=True,
)
service = CatalogService(settings.database_url, providers=providers, settings=settings)

with get_session(settings.database_url) as session:
    repository = CatalogRepository(session)
    latest_revision = repository.get_latest_revision()
    historical_revision = latest_revision.revision if latest_revision is not None else "bootstrap"
    historical_catalog_available = (
        latest_revision is not None
        and latest_revision.revision != "bootstrap"
        and bool(repository.list_instances_for_provider())
    )

result = refresh_provider_catalogs(
    mode=mode,
    service=service,
    providers=providers,
    historical_catalog_available=historical_catalog_available,
    historical_revision=historical_revision,
)

print(
    json.dumps(result, ensure_ascii=True, sort_keys=True)
)
if result["status"] == "failed":
    raise SystemExit(1)
PY
