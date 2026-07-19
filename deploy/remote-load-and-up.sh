#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DIST_DIR="${ROOT_DIR}/dist"
SKIP_FRONTEND_IMAGE="${NPCINK_CLOUD_SKIP_FRONTEND_IMAGE:-0}"
MANIFEST_HELPER="${ROOT_DIR}/scripts/verify-release-bundle-manifest.py"
RELEASE_VERIFIER="${ROOT_DIR}/deploy/verify-release-bundle.sh"
RETIRED_BUNDLE_SERVICES=(caddy jaeger otel-collector)

# Shared compose/env helpers for deploy scripts.
. "${ROOT_DIR}/deploy/common.sh"
npcink_ai_cloud_load_env_file "${ROOT_DIR}"
BASE_URL="${NPCINK_CLOUD_BASE_URL:-http://127.0.0.1:${NPCINK_CLOUD_PORT:-8010}}"
COMPOSE_FILE="${NPCINK_CLOUD_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME_EFFECTIVE="${NPCINK_CLOUD_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-npcink-ai-cloud}}"

npcink_ai_cloud_require_cmd docker
npcink_ai_cloud_require_cmd curl
npcink_ai_cloud_require_cmd python3
npcink_ai_cloud_require_internal_token

require_external_edge_for_formal_runtime() {
	if [ "$(basename "${COMPOSE_FILE}")" != "docker-compose.runtime.yml" ] &&
		[[ "${BASE_URL}" != https://* ]]; then
		return 0
	fi

	if [ "${NPCINK_CLOUD_EXTERNAL_EDGE_READY:-false}" != "true" ]; then
		echo "[fail] docker-compose.runtime.yml requires NPCINK_CLOUD_EXTERNAL_EDGE_READY=true after the external TLS edge is ready." >&2
		exit 1
	fi
	if [ -z "${NPCINK_CLOUD_BASE_URL:-}" ]; then
		echo "[fail] docker-compose.runtime.yml requires an explicit NPCINK_CLOUD_BASE_URL." >&2
		exit 1
	fi
	if [ -z "${NPCINK_CLOUD_DOMAIN_NAME:-}" ]; then
		echo "[fail] docker-compose.runtime.yml requires NPCINK_CLOUD_DOMAIN_NAME for the external TLS edge." >&2
		exit 1
	fi

	python3 - "${BASE_URL}" "${NPCINK_CLOUD_DOMAIN_NAME}" <<'PY'
from __future__ import annotations

import sys
from urllib.parse import urlsplit

base_url = sys.argv[1].strip()
expected_host = sys.argv[2].strip().lower().rstrip(".")
try:
    parsed = urlsplit(base_url)
    port = parsed.port
except ValueError as exc:
    raise SystemExit(f"[fail] NPCINK_CLOUD_BASE_URL is invalid: {exc}") from exc

actual_host = str(parsed.hostname or "").lower().rstrip(".")
if parsed.scheme.lower() != "https":
    raise SystemExit("[fail] Formal runtime requires an https:// NPCINK_CLOUD_BASE_URL.")
if not actual_host or actual_host != expected_host:
    raise SystemExit(
        "[fail] NPCINK_CLOUD_BASE_URL host must match NPCINK_CLOUD_DOMAIN_NAME."
    )
if parsed.username is not None or parsed.password is not None:
    raise SystemExit("[fail] NPCINK_CLOUD_BASE_URL must not contain userinfo.")
if port not in (None, 443):
    raise SystemExit("[fail] Formal runtime external edge must own HTTPS port 443.")
if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
    raise SystemExit("[fail] NPCINK_CLOUD_BASE_URL must be an origin without path, query, or fragment.")
PY

	echo "[ok] External TLS edge contract acknowledged for ${BASE_URL}"
}

assert_retired_bundle_services_absent() {
	local service_name=""
	local container_ids=""
	for service_name in "${RETIRED_BUNDLE_SERVICES[@]}"; do
		container_ids="$(docker ps -aq \
			--filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_EFFECTIVE}" \
			--filter "label=com.docker.compose.service=${service_name}")"
		if [ -n "${container_ids}" ]; then
			echo "[fail] Retired bundle service container still exists: ${service_name}" >&2
			exit 1
		fi
	done
	echo "[ok] Retired bundle services are absent: ${RETIRED_BUNDLE_SERVICES[*]}"
}

require_external_edge_for_formal_runtime

configure_ready_origin_headers() {
	if [ -n "${NPCINK_CLOUD_HEALTH_HOST_HEADER:-}" ] ||
		[ -n "${NPCINK_CLOUD_HEALTH_FORWARDED_PROTO:-}" ]; then
		return
	fi

	local origin="${NPCINK_CLOUD_READY_ORIGIN:-}"
	local proto=""
	local without_scheme=""
	local host=""

	if [ -z "${origin}" ]; then
		origin="${NPCINK_CLOUD_BROWSER_ORIGIN_ALLOWLIST:-}"
		origin="${origin%%,*}"
	fi
	origin="${origin#"${origin%%[![:space:]]*}"}"
	origin="${origin%"${origin##*[![:space:]]}"}"

	case "${origin}" in
		http://*|https://*)
			proto="${origin%%://*}"
			without_scheme="${origin#*://}"
			host="${without_scheme%%/*}"
			;;
		*)
			return
			;;
	esac

	if [ -n "${host}" ]; then
		export NPCINK_CLOUD_HEALTH_HOST_HEADER="${host}"
	fi
	if [ -n "${proto}" ]; then
		export NPCINK_CLOUD_HEALTH_FORWARDED_PROTO="${proto}"
	fi
}

configure_ready_origin_headers

echo "[info] Using compose file: ${COMPOSE_FILE}"

[ -x "${RELEASE_VERIFIER}" ] || {
	echo "[fail] Exact release-bundle verifier is missing or not executable." >&2
	exit 1
}
[ -f "${MANIFEST_HELPER}" ] || {
	echo "[fail] Exact release-bundle manifest helper is missing." >&2
	exit 1
}

# This is deliberately before the first docker load and before compose up.
npcink_ai_cloud_run_timed "verify exact bundle before load" \
	bash "${RELEASE_VERIFIER}" --pre-load "${ROOT_DIR}"

while IFS=$'\t' read -r image_archive image_role image_reference; do
	[ -n "${image_archive}" ] || continue
	npcink_ai_cloud_run_timed "load ${image_role} image archive" \
		bash -c 'gzip -dc "$1" | docker load' _ "${ROOT_DIR}/${image_archive}"
done < <(python3 "${MANIFEST_HELPER}" load-plan --root "${ROOT_DIR}")

# Worker/callback/ops roles are aliases of the one API image archive. The
# manifest controls the aliases; no role may silently rebuild or load another
# archive.
while IFS=$'\t' read -r source_reference alias_reference; do
	[ -n "${source_reference}" ] || continue
	docker tag "${source_reference}" "${alias_reference}"
done < <(python3 "${MANIFEST_HELPER}" alias-plan --root "${ROOT_DIR}")

npcink_ai_cloud_run_timed "verify loaded image IDs" \
	bash "${RELEASE_VERIFIER}" --post-load "${ROOT_DIR}"

SERVICES=(postgres redis)
SERVICES+=(api)
if [ "${SKIP_FRONTEND_IMAGE}" != "1" ]; then
	SERVICES+=(frontend)
fi
SERVICES+=(proxy)

echo "[info] Starting services: ${SERVICES[*]}"
npcink_ai_cloud_run_timed "compose up services" \
	npcink_ai_cloud_compose "${ROOT_DIR}" up -d --pull never --no-build --remove-orphans "${SERVICES[@]}"

# This check must run before public health. Otherwise a stale Caddy container
# from the same Compose project could keep serving 80/443 and hide the cutover.
assert_retired_bundle_services_absent

if ! npcink_ai_cloud_run_timed "wait for live health" npcink_ai_cloud_wait_for_ready "${BASE_URL}" 20 2; then
	echo "[fail] Cloud API did not become ready at ${BASE_URL}" >&2
	exit 1
fi

echo "[ok] Cloud API is ready at ${BASE_URL}"
