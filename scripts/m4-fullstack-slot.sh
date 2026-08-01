#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PREVIEW_SCRIPT="${ROOT_DIR}/scripts/m4-preview.sh"
PROJECT="npcink-ai-cloud-m4-fullstack-1"
REMOTE_DIR="/Users/muze/docker-workspaces/npcink-ai-cloud-m4-fullstack-1"
STATE_DIR=".cache/${PROJECT}"
REMOTE_PORT="8031"
POSTGRES_PORT="15434"
REDIS_PORT="16381"
LOCAL_PORT="18031"
RUNTIME_IMAGE="npcink-ai-cloud-runtime:m4-fullstack-1"
FRONTEND_IMAGE="npcink-ai-cloud-frontend:m4-fullstack-1"

usage() {
	cat <<'EOF'
Usage:
  scripts/m4-fullstack-slot.sh up --owner ID [--ttl-hours N] [--dry-run]
  scripts/m4-fullstack-slot.sh sync --owner ID [--ttl-hours N] [--dry-run]
  scripts/m4-fullstack-slot.sh status
  scripts/m4-fullstack-slot.sh logs [--follow] [--tail N] <service> [...]
  scripts/m4-fullstack-slot.sh tunnel [--auto] [--local-port N] [--dry-run]
  scripts/m4-fullstack-slot.sh release --owner ID

This is the single resource-limited isolated M4 slot. It owns a separate API,
PostgreSQL, Redis, frontend, proxy, images, volumes, and source directory. It
does not start runtime, callback, or ops workers.
EOF
}

fail() {
	printf '[m4-fullstack-slot] fail: %s\n' "$*" >&2
	exit 1
}

validate_owner() {
	case "$1" in
		''|*[!A-Za-z0-9._:@/-]*) fail "owner contains unsupported characters" ;;
	esac
}

configure_preview_env() {
	export NPCINK_CLOUD_M4_PROJECT_NAME="${PROJECT}"
	export NPCINK_CLOUD_M4_REMOTE_DIR="${REMOTE_DIR}"
	export NPCINK_CLOUD_M4_PORT="${REMOTE_PORT}"
	export NPCINK_CLOUD_M4_POSTGRES_PORT="${POSTGRES_PORT}"
	export NPCINK_CLOUD_M4_REDIS_PORT="${REDIS_PORT}"
	export NPCINK_CLOUD_M4_TUNNEL_LOCAL_PORT="${LOCAL_PORT}"
	export NPCINK_CLOUD_M4_STACK_MODE="isolated"
	export NPCINK_CLOUD_M4_RUNTIME_IMAGE="${RUNTIME_IMAGE}"
	export NPCINK_CLOUD_M4_FRONTEND_IMAGE="${FRONTEND_IMAGE}"
}

lease_action() {
	local action="$1"
	local owner="${2:-none}"
	local ttl_hours="${3:-8}"
	bash -c 'source "$1"; ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- "$2" "$3" "$4" "$5" "$6"' \
		_ "${PREVIEW_SCRIPT}" "${action}" "${owner}" "${ttl_hours}" "${STATE_DIR}" "${REMOTE_DIR}" <<'REMOTE_LEASE'
set -euo pipefail
action="$1"
owner="$2"
ttl_hours="$3"
state_dir="${HOME}/$4"
remote_dir="$5"
primary_remote_dir="/Users/muze/docker-workspaces/npcink-ai-cloud-m4-dev"
lease_file="${state_dir}/lease.txt"
lease_lock="${state_dir}/lease.lock"
primary_lock="${HOME}/.cache/npcink-ai-cloud-m4-dev/operation.lock"
now_epoch="$(date +%s)"
lease_lock_acquired=0

cleanup_lease_lock() {
	status=$?
	trap - EXIT
	if [ "${lease_lock_acquired}" = "1" ]; then
		rm -f "${lease_lock}/owner.txt"
		rmdir "${lease_lock}" >/dev/null 2>&1 || true
	fi
	exit "${status}"
}
trap cleanup_lease_lock EXIT

value() {
	[ -f "$2" ] || return 0
	sed -n "s/^$1=//p" "$2" | head -n 1
}

case "${action}" in
	claim)
		[ ! -d "${primary_lock}" ] || {
			echo '[m4-fullstack-slot] primary preview operation is active' >&2
			exit 75
		}
		mkdir -p "${state_dir}" "${remote_dir}"
		if ! mkdir "${lease_lock}" 2>/dev/null; then
			echo '[m4-fullstack-slot] another lease operation is active' >&2
			exit 75
		fi
		lease_lock_acquired=1
		printf 'pid=%s\nowner=%s\n' "$$" "${owner}" > "${lease_lock}/owner.txt"
		test ! -L "${remote_dir}"
		for env_file in .env .env.local; do
			test -f "${primary_remote_dir}/${env_file}"
			if [ ! -e "${remote_dir}/${env_file}" ]; then
				ln -s "${primary_remote_dir}/${env_file}" "${remote_dir}/${env_file}"
			fi
		done
		existing_owner="$(value owner "${lease_file}")"
		existing_expiry="$(value expires_at_epoch "${lease_file}")"
		case "${existing_expiry}" in ''|*[!0-9]*) existing_expiry=0 ;; esac
		if [ "${existing_expiry}" -gt "${now_epoch}" ] && [ "${existing_owner}" != "${owner}" ]; then
			echo "[m4-fullstack-slot] owned by ${existing_owner} until $(value expires_at_utc "${lease_file}")" >&2
			exit 75
		fi
		expires_epoch="$((now_epoch + ttl_hours * 3600))"
		expires_at="$(date -u -r "${expires_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
		{
			printf 'owner=%s\n' "${owner}"
			printf 'expires_at_epoch=%s\n' "${expires_epoch}"
			printf 'expires_at_utc=%s\n' "${expires_at}"
		} > "${lease_file}"
		;;
	status)
		if [ ! -f "${lease_file}" ]; then
			echo 'state=available'
			echo 'lease_state=available'
		else
			owner_value="$(value owner "${lease_file}")"
			expires_at_value="$(value expires_at_utc "${lease_file}")"
			echo "owner=${owner_value}"
			echo "expires_at_utc=${expires_at_value}"
			expires="$(value expires_at_epoch "${lease_file}")"
			case "${expires}" in ''|*[!0-9]*) expires=0 ;; esac
			if [ "${expires}" -gt "${now_epoch}" ]; then
				echo 'state=active'
				echo 'lease_state=active'
			else
				echo 'state=available'
				echo 'lease_state=expired'
			fi
		fi
		docker ps -a --filter 'label=com.docker.compose.project=npcink-ai-cloud-m4-fullstack-1' \
			--format 'container={{.Names}}|status={{.Status}}|ports={{.Ports}}'
		container_ids="$(docker ps -q --filter 'label=com.docker.compose.project=npcink-ai-cloud-m4-fullstack-1')"
		if [ -n "${container_ids}" ]; then
			docker stats --no-stream \
				--format 'resource={{.Name}}|memory={{.MemUsage}}|cpu={{.CPUPerc}}' \
				${container_ids}
		fi
		;;
esac
REMOTE_LEASE
}

run_up_or_sync() {
	local mode="$1"
	shift
	local owner="${NPCINK_CLOUD_M4_FULLSTACK_SLOT_OWNER:-}"
	local ttl_hours="8"
	local dry_run=0
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--owner) owner="$2"; shift 2 ;;
			--ttl-hours) ttl_hours="$2"; shift 2 ;;
			--dry-run) dry_run=1; shift ;;
			--) shift ;;
			*) fail "unknown argument: $1" ;;
		esac
	done
	validate_owner "${owner}"
	case "${ttl_hours}" in ''|*[!0-9]*) fail "ttl hours must be numeric" ;; esac
	[ "${ttl_hours}" -ge 1 ] && [ "${ttl_hours}" -le 24 ] || fail "ttl hours must be between 1 and 24"
	configure_preview_env
	if [ "${dry_run}" = "1" ]; then
		if [ "${mode}" = "up" ]; then
			"${PREVIEW_SCRIPT}" deploy --dry-run
		else
			"${PREVIEW_SCRIPT}" sync --dry-run
		fi
		return
	fi
	lease_action claim "${owner}" "${ttl_hours}"
	if [ "${mode}" = "up" ]; then
		"${PREVIEW_SCRIPT}" deploy
	else
		"${PREVIEW_SCRIPT}" sync
	fi
}

run_release() {
	local owner=""
	if [ "${1:-}" = "--" ]; then
		shift
	fi
	[ "${1:-}" = "--owner" ] && [ "$#" -eq 2 ] || fail "release requires --owner ID"
	owner="$2"
	validate_owner "${owner}"
	bash -c 'source "$1"; ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- "$2" "$3" "$4"' \
		_ "${PREVIEW_SCRIPT}" "${PROJECT}" "${STATE_DIR}" "${owner}" <<'REMOTE_RELEASE'
set -euo pipefail
project="$1"
state_dir="${HOME}/$2"
owner="$3"
lease_file="${state_dir}/lease.txt"
lease_lock="${state_dir}/lease.lock"
operation_lock="${state_dir}/operation.lock"
value() {
	sed -n "s/^$1=//p" "$2" | head -n 1
}
test -f "${lease_file}" || { echo '[m4-fullstack-slot] slot is not claimed' >&2; exit 66; }
if ! mkdir "${lease_lock}" 2>/dev/null; then
	echo '[m4-fullstack-slot] another lease operation is active' >&2
	exit 75
fi
cleanup_release_lock() {
	status=$?
	trap - EXIT
	rm -f "${lease_lock}/owner.txt"
	rmdir "${lease_lock}" >/dev/null 2>&1 || true
	exit "${status}"
}
trap cleanup_release_lock EXIT
printf 'pid=%s\nowner=%s\n' "$$" "${owner}" > "${lease_lock}/owner.txt"
[ "$(value owner "${lease_file}")" = "${owner}" ] || {
	echo "[m4-fullstack-slot] slot is owned by $(value owner "${lease_file}")" >&2
	exit 75
}
[ ! -d "${operation_lock}" ] || {
	echo '[m4-fullstack-slot] slot deployment operation is active' >&2
	exit 75
}
for id in $(docker ps -a -q --filter "label=com.docker.compose.project=${project}"); do
	[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "${id}")" = "${project}" ]
	docker rm -f "${id}" >/dev/null
done
for volume in $(docker volume ls -q --filter "label=com.docker.compose.project=${project}"); do
	docker volume rm "${volume}" >/dev/null
done
for network in $(docker network ls -q --filter "label=com.docker.compose.project=${project}"); do
	docker network rm "${network}" >/dev/null 2>&1 || true
done
rm -f "${state_dir}/lease.txt" "${state_dir}/last-deploy.txt"
echo '[m4-fullstack-slot] released'
REMOTE_RELEASE
}

command="${1:-}"
[ -n "${command}" ] || { usage; exit 64; }
shift
case "${command}" in
	up) run_up_or_sync up "$@" ;;
	sync) run_up_or_sync sync "$@" ;;
	status) [ "$#" -eq 0 ] || fail "status takes no arguments"; lease_action status ;;
	logs|tunnel) configure_preview_env; "${PREVIEW_SCRIPT}" "${command}" "$@" ;;
	release) run_release "$@" ;;
	--help|-h|help) usage ;;
	*) fail "unknown command: ${command}" ;;
esac
