#!/usr/bin/env bash

npcink_ai_cloud_require_cmd() {
	local cmd="$1"
	command -v "${cmd}" >/dev/null 2>&1 || {
		echo "[fail] Missing required command: ${cmd}" >&2
		exit 1
	}
}

npcink_ai_cloud_append_timing_summary() {
	local label="$1"
	local duration_seconds="$2"

	if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
		return 0
	fi

	printf '| `%s` | %ss |\n' "${label}" "${duration_seconds}" >> "${GITHUB_STEP_SUMMARY}"
}

npcink_ai_cloud_start_timing_summary() {
	local title="${1:-Deploy Timing}"

	if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
		return 0
	fi

	{
		printf '## %s\n\n' "${title}"
		printf '| Step | Duration |\n'
		printf '| --- | ---: |\n'
	} >> "${GITHUB_STEP_SUMMARY}"
}

npcink_ai_cloud_run_timed() {
	local label="$1"
	shift
	local started_at
	local completed_at
	local duration_seconds
	local status
	local restore_errexit=0

	case "$-" in
		*e*)
			restore_errexit=1
			;;
	esac

	started_at="$(date +%s)"
	echo "[timing] ${label}: start"
	set +e
	"$@"
	status=$?
	if [ "${restore_errexit}" -eq 1 ]; then
		set -e
	else
		set +e
	fi
	completed_at="$(date +%s)"
	duration_seconds=$((completed_at - started_at))
	if [ "${status}" -eq 0 ]; then
		echo "[timing] ${label}: ${duration_seconds}s"
	else
		echo "[timing] ${label}: ${duration_seconds}s (failed: ${status})" >&2
	fi
	npcink_ai_cloud_append_timing_summary "${label}" "${duration_seconds}"
	return "${status}"
}

npcink_ai_cloud_normalize_path() {
	local root_dir="$1"
	local path="$2"

	if [[ "${path}" = /* ]]; then
		printf '%s' "${path}"
	else
		printf '%s/%s' "${root_dir%/}" "${path#./}"
	fi
}

npcink_ai_cloud_release_state_dir() {
	local root_dir="$1"
	local resolved_root=""
	local release_name=""

	resolved_root="$(cd "${root_dir}" 2>/dev/null && pwd -P)" || return 1
	release_name="$(basename "${resolved_root}")"
	if [[ ! "${release_name}" =~ ^release-[A-Za-z0-9._-]+$ ]]; then
		return 1
	fi
	printf '%s/.release-state/%s' "$(dirname "${resolved_root}")" "${release_name}"
}

npcink_ai_cloud_release_state_env_file() {
	local state_dir=""
	state_dir="$(npcink_ai_cloud_release_state_dir "$1")" || return 1
	printf '%s/env.deploy' "${state_dir}"
}

npcink_ai_cloud_read_env_value() {
	local env_file="$1"
	local requested_key="$2"

	[ -f "${env_file}" ] || return 1
	awk -v requested_key="${requested_key}" '
		$0 ~ "^[[:space:]]*" requested_key "[[:space:]]*=" {
			value = $0
			sub("^[[:space:]]*" requested_key "[[:space:]]*=[[:space:]]*", "", value)
			sub("[[:space:]]+$", "", value)
			if (value ~ /^\047.*\047$/ || value ~ /^\".*\"$/) {
				value = substr(value, 2, length(value) - 2)
			}
			found = value
		}
		END {
			if (found != "") {
				print found
			}
		}
	' "${env_file}"
}

npcink_ai_cloud_compose_project_name_from_env() {
	local env_file="$1"
	local project_name=""

	project_name="$(npcink_ai_cloud_read_env_value "${env_file}" NPCINK_CLOUD_COMPOSE_PROJECT_NAME || true)"
	if [ -z "${project_name}" ]; then
		project_name="$(npcink_ai_cloud_read_env_value "${env_file}" COMPOSE_PROJECT_NAME || true)"
	fi
	project_name="${project_name:-npcink-ai-cloud}"
	if [[ ! "${project_name}" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
		echo "[fail] Invalid Compose project name in ${env_file}: ${project_name}" >&2
		return 1
	fi
	printf '%s' "${project_name}"
}

npcink_ai_cloud_require_env_value() {
	local key="$1"
	local description="${2:-${key}}"
	local value="${!key:-}"
	if [ -z "${value}" ]; then
		echo "[fail] ${description} is required" >&2
		exit 1
	fi
}

npcink_ai_cloud_require_internal_token() {
	npcink_ai_cloud_require_env_value \
		"NPCINK_CLOUD_INTERNAL_AUTH_TOKEN" \
		"NPCINK_CLOUD_INTERNAL_AUTH_TOKEN for internal-only perimeter checks"
}

npcink_ai_cloud_resolve_env_file() {
	local root_dir="$1"
	local env_file="${NPCINK_CLOUD_ENV_FILE:-}"
	local state_env_file=""

	if [ -n "${env_file}" ]; then
		npcink_ai_cloud_normalize_path "${root_dir}" "${env_file}"
		return 0
	fi
	state_env_file="$(npcink_ai_cloud_release_state_env_file "${root_dir}" 2>/dev/null || true)"
	if [ -n "${state_env_file}" ] && [ -f "${state_env_file}" ]; then
		env_file="${state_env_file}"
	elif [ -f "${root_dir}/.env.deploy" ]; then
		env_file="${root_dir}/.env.deploy"
	fi
	printf '%s' "${env_file}"
}

npcink_ai_cloud_load_env_file() {
	local root_dir="$1"
	local env_file
	env_file="$(npcink_ai_cloud_resolve_env_file "${root_dir}")"
	if [ -z "${env_file}" ] || [ ! -f "${env_file}" ]; then
		return 0
	fi
	export NPCINK_CLOUD_ENV_FILE="${env_file}"
	if [ -z "${NPCINK_CLOUD_BACKEND_ENV_FILE:-}" ]; then
		export NPCINK_CLOUD_BACKEND_ENV_FILE="${env_file}"
	fi
	local line=""
	local key=""
	while IFS= read -r line || [ -n "${line}" ]; do
		case "${line}" in
			'' | '#'*)
				continue
				;;
		esac
		if [[ "${line}" != *=* ]]; then
			continue
		fi
		key="${line%%=*}"
		if [[ ! "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
			continue
		fi
		if [ -n "${!key+x}" ]; then
			continue
		fi
		eval "export ${line}"
	done < "${env_file}"
}

npcink_ai_cloud_compose() {
	local root_dir="$1"
	shift

	local compose_file="${NPCINK_CLOUD_COMPOSE_FILE:-${root_dir}/docker-compose.prod.yml}"
	local env_file=""
	local backend_env_file="${NPCINK_CLOUD_BACKEND_ENV_FILE:-}"
	local compose_project_name="${NPCINK_CLOUD_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-}}"

	env_file="$(npcink_ai_cloud_resolve_env_file "${root_dir}")"
	if [ -n "${backend_env_file}" ]; then
		backend_env_file="$(npcink_ai_cloud_normalize_path "${root_dir}" "${backend_env_file}")"
	elif [ -n "${env_file}" ]; then
		backend_env_file="${env_file}"
	fi
	if [ -z "${compose_project_name}" ] && [ -n "${env_file}" ]; then
		compose_project_name="$(npcink_ai_cloud_compose_project_name_from_env "${env_file}")"
	fi
	compose_project_name="${compose_project_name:-npcink-ai-cloud}"
	if [[ ! "${compose_project_name}" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
		echo "[fail] Invalid Compose project name: ${compose_project_name}" >&2
		return 1
	fi

	if [ -n "${env_file}" ]; then
		COMPOSE_PROJECT_NAME="${compose_project_name}" \
			NPCINK_CLOUD_BACKEND_ENV_FILE="${backend_env_file}" \
			docker compose --env-file "${env_file}" -f "${compose_file}" "$@"
		return
	fi

	COMPOSE_PROJECT_NAME="${compose_project_name}" \
		NPCINK_CLOUD_BACKEND_ENV_FILE="${backend_env_file}" \
		docker compose -f "${compose_file}" "$@"
}

npcink_ai_cloud_wait_for_ready() {
	local base_url="$1"
	local attempts="${2:-20}"
	local sleep_seconds="${3:-2}"
	local health_url="${base_url%/}/health/live"
	local attempt=0
	local curl_args=(
		-fsS
		--connect-timeout 3
		--max-time 10
	)

	if [ -n "${NPCINK_CLOUD_HEALTH_HOST_HEADER:-}" ]; then
		curl_args+=(-H "Host: ${NPCINK_CLOUD_HEALTH_HOST_HEADER}")
	fi
	if [ -n "${NPCINK_CLOUD_HEALTH_FORWARDED_PROTO:-}" ]; then
		curl_args+=(-H "X-Forwarded-Proto: ${NPCINK_CLOUD_HEALTH_FORWARDED_PROTO}")
	fi

	while [ "${attempt}" -lt "${attempts}" ]; do
		if curl "${curl_args[@]}" "${health_url}" >/dev/null 2>&1; then
			return 0
		fi
		attempt=$((attempt + 1))
		sleep "${sleep_seconds}"
	done

	return 1
}

npcink_ai_cloud_wait_for_internal_endpoint() {
	local root_dir="$1"
	local endpoint_path="$2"
	local success_message="$3"

	npcink_ai_cloud_compose "${root_dir}" exec -T api python - \
		"${endpoint_path}" "${success_message}" <<'PY'
from __future__ import annotations

import os
import re
import sys
import time
import urllib.error
import urllib.request

endpoint_path = sys.argv[1]
success_message = sys.argv[2]
domain_name = os.getenv("NPCINK_CLOUD_DOMAIN_NAME", "").strip()
trusted_hosts = os.getenv("NPCINK_CLOUD_TRUSTED_HOST_ALLOWLIST", "")
trusted_host = next((item.strip() for item in trusted_hosts.split(",") if item.strip()), "")
host = domain_name or trusted_host or "127.0.0.1"
if host.startswith("*."):
    host = host[2:]
if not re.fullmatch(r"[A-Za-z0-9.-]+(?::[0-9]+)?", host):
    print("[fail] Internal readiness Host is invalid.", file=sys.stderr)
    raise SystemExit(1)

request = urllib.request.Request(
    f"http://127.0.0.1:8000{endpoint_path}",
    headers={
        "Host": host,
        "X-Npcink-Internal-Token": os.environ["NPCINK_CLOUD_INTERNAL_AUTH_TOKEN"],
    },
)
last_error: Exception | None = None
for _ in range(30):
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status == 200:
                print(success_message)
                raise SystemExit(0)
    except (OSError, urllib.error.URLError) as exc:
        last_error = exc
    time.sleep(2)

print(f"[fail] Internal readiness probe did not pass: {last_error}", file=sys.stderr)
raise SystemExit(1)
PY
}
