#!/usr/bin/env bash
set -euo pipefail

# Reuse the canonical source packaging, private relay, fingerprint, validation,
# SSH, and cleanup implementation. m4-preview.sh executes main only when run
# directly, so sourcing it does not touch M4.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/m4-preview.sh"

M4_SLOT_REMOTE_BASE="/Users/muze/docker-workspaces/npcink-ai-cloud-m4-ui"
M4_SLOT_STATE_BASE=".cache/npcink-ai-cloud-m4-frontend-slots"

slot_usage() {
	cat <<'EOF'
Usage:
  scripts/m4-frontend-slot.sh up --slot N --owner ID [--ttl-hours N] [--allow-third] [--allow-candidate-primary] [--dry-run]
  scripts/m4-frontend-slot.sh sync --slot N --owner ID [--ttl-hours N] [--allow-third] [--allow-candidate-primary] [--dry-run]
  scripts/m4-frontend-slot.sh status [--slot N]
  scripts/m4-frontend-slot.sh logs --slot N [--tail N] [--follow]
  scripts/m4-frontend-slot.sh tunnel --slot N [--auto] [--local-port N] [--dry-run]
  scripts/m4-frontend-slot.sh release --slot N --owner ID

Slots 1 and 2 are the normal frontend-only collaboration capacity. Slot 3
requires --allow-third because it adds avoidable memory pressure. Slots share
the accepted M4 API/database/worker stack and reject product mutations.
EOF
}

slot_log() {
	printf '[m4-frontend-slot] %s\n' "$*"
}

slot_fail() {
	printf '[m4-frontend-slot] fail: %s\n' "$*" >&2
	exit 1
}

validate_owner() {
	case "$1" in
		''|*[!A-Za-z0-9._:@/-]*) slot_fail "owner contains unsupported characters" ;;
	esac
}

validate_slot() {
	validate_number "slot" "$1"
	case "$1" in
		1|2|3) ;;
		*) slot_fail "slot must be 1, 2, or 3" ;;
	esac
}

slot_remote_port() {
	printf '%s\n' "$((8020 + $1))"
}

slot_tunnel_port() {
	printf '%s\n' "$((18020 + $1))"
}

run_up_or_sync() {
	local mode="$1"
	shift
	local slot=""
	local owner="${NPCINK_CLOUD_M4_FRONTEND_SLOT_OWNER:-}"
	local ttl_hours="8"
	local allow_third=0
	local allow_candidate=0
	local dry_run=0
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--slot)
				[ "$#" -ge 2 ] || slot_fail "--slot requires a value"
				slot="$2"
				shift 2
				;;
			--owner)
				[ "$#" -ge 2 ] || slot_fail "--owner requires a value"
				owner="$2"
				shift 2
				;;
			--ttl-hours)
				[ "$#" -ge 2 ] || slot_fail "--ttl-hours requires a value"
				ttl_hours="$2"
				shift 2
				;;
			--allow-third)
				allow_third=1
				shift
				;;
			--allow-candidate-primary)
				allow_candidate=1
				shift
				;;
			--dry-run)
				dry_run=1
				shift
				;;
			--) shift ;;
			*) slot_fail "unknown argument: $1" ;;
		esac
	done

	validate_slot "${slot}"
	validate_owner "${owner}"
	validate_number "ttl hours" "${ttl_hours}"
	if [ "${ttl_hours}" -lt 1 ] || [ "${ttl_hours}" -gt 24 ]; then
		slot_fail "ttl hours must be between 1 and 24"
	fi
	if [ "${slot}" = "3" ] && [ "${allow_third}" != "1" ]; then
		slot_fail "slot 3 requires --allow-third"
	fi

	package_source
	local source_sha=""
	local source_revision=""
	local source_base_revision=""
	local source_branch=""
	local source_dirty=""
	local image_input_sha=""
	local config_input_sha=""
	local remote_port=""
	local tunnel_port=""
	local expires_epoch=""
	local expires_at=""
	source_sha="$(shasum -a 256 "${SOURCE_BUNDLE_PATH}" | awk '{print $1}')"
	source_revision="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
	source_base_revision="$(
		git -C "${ROOT_DIR}" merge-base HEAD refs/remotes/origin/master
	)"
	source_branch="$(git -C "${ROOT_DIR}" symbolic-ref --quiet --short HEAD || printf 'detached')"
	source_dirty="$(source_dirty_state)"
	image_input_sha="$(dependency_fingerprint)"
	config_input_sha="$(config_fingerprint)"
	remote_port="$(slot_remote_port "${slot}")"
	tunnel_port="$(slot_tunnel_port "${slot}")"
	expires_epoch="$(python3 -c 'import sys,time; print(int(time.time()) + int(sys.argv[1]) * 3600)' "${ttl_hours}")"
	expires_at="$(python3 -c 'import datetime,sys; print(datetime.datetime.fromtimestamp(int(sys.argv[1]), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))' "${expires_epoch}")"

	slot_log "operation=${mode}"
	slot_log "slot=${slot}"
	slot_log "owner=${owner}"
	slot_log "source_revision=${source_revision}"
	slot_log "source_branch=${source_branch}"
	slot_log "source_dirty=${source_dirty}"
	slot_log "source_bundle_sha256=${source_sha}"
	slot_log "expires_at_utc=${expires_at}"
	slot_log "remote_url=http://127.0.0.1:${remote_port}"
	slot_log "local_url=http://127.0.0.1:${tunnel_port}"
	slot_log "preview_mode=frontend_only_read_only"

	if [ "${dry_run}" = "1" ]; then
		slot_log "dry-run: would transfer source through the private Tailscale relay"
		slot_log "dry-run: would require the primary runtime fingerprint and accepted state"
		return 0
	fi

	require_cmd scp
	require_cmd ssh
	prepare_source_relay "${SOURCE_BUNDLE_PATH}" "${source_sha}"

	ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- \
		"${mode}" \
		"${slot}" \
		"${owner}" \
		"${expires_epoch}" \
		"${expires_at}" \
		"${remote_port}" \
		"${tunnel_port}" \
		"${source_revision}" \
		"${source_branch}" \
		"${source_dirty}" \
		"${source_sha}" \
		"${image_input_sha}" \
		"${config_input_sha}" \
		"${allow_candidate}" \
		"${SOURCE_RELAY_URL}" \
		"${M4_PRIMARY_PROJECT:-${M4_PROJECT_NAME}}" \
		"${M4_REMOTE_DIR}" \
		"${M4_SLOT_REMOTE_BASE}" \
		"${M4_SLOT_STATE_BASE}" \
		"${RUN_ID}" \
		"${source_base_revision}" <<'REMOTE_SLOT_UP'
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mode="$1"
slot="$2"
owner="$3"
expires_epoch="$4"
expires_at="$5"
remote_port="$6"
tunnel_port="$7"
source_revision="$8"
source_branch="$9"
source_dirty="${10}"
source_sha="${11}"
image_input_sha="${12}"
config_input_sha="${13}"
allow_candidate="${14}"
source_url="${15}"
primary_project="${16}"
primary_remote_dir="${17}"
slot_remote_base="${18}"
slot_state_base="${19}"
run_id="${20}"
source_base_revision="${21}"

slot_project="npcink-ai-cloud-m4-ui-${slot}"
slot_remote_dir="${slot_remote_base}-${slot}"
slot_state_dir="${HOME}/${slot_state_base}/slot-${slot}"
slot_state_file="${slot_state_dir}/state.txt"
slot_lock_dir="${slot_state_dir}/operation.lock"
primary_cache="${HOME}/.cache/${primary_project}"
primary_state_file="${primary_cache}/last-deploy.txt"
primary_lock_dir="${primary_cache}/operation.lock"
primary_network="${primary_project}_default"
dependency_volume="${primary_project}_cloud-frontend-node-modules-dev"
incoming="${slot_remote_dir}.incoming.${run_id}"
bundle="/tmp/npcink-ai-cloud-m4-ui-${slot}-${run_id}.tgz"
bundle_partial="${bundle}.partial"
lock_acquired=0
stack_touched=0

state_value() {
	sed -n "s/^$1=//p" "$2" | head -n 1
}

slot_containers() {
	docker ps -a -q \
		--filter "label=com.docker.compose.project=${slot_project}" \
		--filter "label=com.docker.compose.oneoff=False"
}

remove_exact_slot() {
	for id in $(slot_containers); do
		observed="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "${id}")"
		[ "${observed}" = "${slot_project}" ] && docker rm -f "${id}" >/dev/null
	done
	for volume in $(
		docker volume ls -q \
			--filter "label=com.docker.compose.project=${slot_project}" \
			--filter "label=com.docker.compose.volume=slot-frontend-next-cache"
	); do
		docker volume rm "${volume}" >/dev/null
	done
	for network in $(
		docker network ls -q --filter "label=com.docker.compose.project=${slot_project}"
	); do
		docker network rm "${network}" >/dev/null 2>&1 || true
	done
}

cleanup_remote() {
	status=$?
	trap - EXIT INT TERM
	rm -f "${bundle}" "${bundle_partial}"
	if [ -d "${incoming}" ]; then
		find "${incoming}" -depth -delete
	fi
	if [ "${lock_acquired}" = "1" ]; then
		rm -f "${slot_lock_dir}/owner.txt"
		rmdir "${slot_lock_dir}" >/dev/null 2>&1 || true
	fi
	if [ "${status}" -ne 0 ] && [ "${stack_touched}" = "1" ]; then
		for id in $(slot_containers); do
			docker stop "${id}" >/dev/null 2>&1 || true
		done
	fi
	exit "${status}"
}
trap cleanup_remote EXIT INT TERM

mkdir -p "${slot_state_dir}"
if ! mkdir "${slot_lock_dir}" 2>/dev/null; then
	echo "[m4-frontend-slot] another operation holds slot ${slot}" >&2
	[ ! -f "${slot_lock_dir}/owner.txt" ] || cat "${slot_lock_dir}/owner.txt" >&2
	exit 75
fi
lock_acquired=1
{
	printf 'pid=%s\n' "$$"
	printf 'run_id=%s\n' "${run_id}"
	printf 'owner=%s\n' "${owner}"
	printf 'started_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${slot_lock_dir}/owner.txt"

if [ -d "${primary_lock_dir}" ]; then
	echo '[m4-frontend-slot] primary M4 operation is active; frontend slot update refused' >&2
	[ ! -f "${primary_lock_dir}/owner.txt" ] || cat "${primary_lock_dir}/owner.txt" >&2
	exit 75
fi
test -f "${primary_state_file}" || {
	echo '[m4-frontend-slot] primary M4 deployment state is missing' >&2
	exit 66
}
primary_acceptance="$(state_value acceptance_state "${primary_state_file}")"
primary_revision="$(state_value source_revision "${primary_state_file}")"
primary_branch="$(state_value source_branch "${primary_state_file}")"
primary_dirty="$(state_value source_dirty "${primary_state_file}")"
primary_image_sha="$(state_value image_input_sha256 "${primary_state_file}")"
primary_config_sha="$(state_value config_input_sha256 "${primary_state_file}")"

if [ "${primary_acceptance}" = "accepted" ]; then
	[ "${primary_branch}" = "master" ] &&
		[ "${primary_dirty}" = "false" ] &&
		[ "${primary_revision}" = "${source_base_revision}" ] || {
		echo '[m4-frontend-slot] accepted primary metadata is inconsistent' >&2
		exit 65
	}
elif [ "${allow_candidate}" = "1" ] &&
	[ "${primary_acceptance}" = "candidate" ] &&
	[ "${primary_revision}" = "${source_revision}" ] &&
	[ "${primary_dirty}" = "false" ] &&
	[ "${source_dirty}" = "false" ]; then
	echo '[m4-frontend-slot] explicit candidate-primary validation mode enabled'
else
	echo "[m4-frontend-slot] primary runtime must be accepted; current state=${primary_acceptance:-missing}" >&2
	exit 65
fi
[ "${primary_image_sha}" = "${image_input_sha}" ] || {
	echo '[m4-frontend-slot] primary frontend dependency image does not match this worktree' >&2
	exit 42
}
[ "${primary_config_sha}" = "${config_input_sha}" ] || {
	echo '[m4-frontend-slot] primary preview configuration does not match this worktree' >&2
	exit 43
}

api_id="$(
	docker ps -q \
		--filter "label=com.docker.compose.project=${primary_project}" \
		--filter "label=com.docker.compose.service=api" \
		--filter "label=com.docker.compose.oneoff=False" |
		head -n 1
)"
test -n "${api_id}" || {
	echo '[m4-frontend-slot] primary API container is not running' >&2
	exit 69
}
api_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${api_id}")"
[ "${api_health}" = "healthy" ] || {
	echo "[m4-frontend-slot] primary API is not healthy (${api_health})" >&2
	exit 69
}
api_container="$(docker inspect -f '{{.Name}}' "${api_id}" | sed 's#^/##')"
docker network inspect "${primary_network}" >/dev/null
docker volume inspect "${dependency_volume}" >/dev/null
docker image inspect npcink-ai-cloud-frontend:m4-dev >/dev/null

now_epoch="$(date +%s)"
existing_owner=""
existing_expiry="0"
if [ -f "${slot_state_file}" ]; then
	existing_owner="$(state_value owner "${slot_state_file}")"
	existing_expiry="$(state_value expires_at_epoch "${slot_state_file}")"
	case "${existing_expiry}" in
		''|*[!0-9]*) existing_expiry=0 ;;
	esac
fi
if [ "${mode}" = "sync" ]; then
	[ -f "${slot_state_file}" ] || {
		echo "[m4-frontend-slot] slot ${slot} is not claimed; use up first" >&2
		exit 66
	}
	[ "${existing_owner}" = "${owner}" ] || {
		echo "[m4-frontend-slot] slot ${slot} is owned by ${existing_owner}" >&2
		exit 75
	}
elif [ -f "${slot_state_file}" ] &&
	[ "${existing_expiry}" -gt "${now_epoch}" ] &&
	[ "${existing_owner}" != "${owner}" ]; then
	echo "[m4-frontend-slot] slot ${slot} is owned by ${existing_owner} until $(state_value expires_at_utc "${slot_state_file}")" >&2
	exit 75
elif [ -f "${slot_state_file}" ] &&
	[ "${existing_expiry}" -le "${now_epoch}" ] &&
	[ "${existing_owner}" != "${owner}" ]; then
	remove_exact_slot
fi

curl --fail --location --silent --show-error \
	--retry 3 --retry-all-errors --retry-delay 1 \
	--connect-timeout 10 --max-time 120 \
	--speed-limit 1024 --speed-time 20 \
	--output "${bundle_partial}" "${source_url}"
mv "${bundle_partial}" "${bundle}"
[ "$(shasum -a 256 "${bundle}" | awk '{print $1}')" = "${source_sha}" ] || {
	echo '[m4-frontend-slot] source bundle checksum mismatch' >&2
	exit 65
}

test ! -e "${incoming}"
mkdir -p "${incoming}"
tar -xzf "${bundle}" -C "${incoming}"
test -d "${incoming}/frontend"
test -f "${incoming}/docker-compose.m4-frontend-slot.yml"
test -f "${incoming}/deploy/nginx.m4-frontend-slot.conf.template"
mkdir -p "${slot_remote_dir}"
test ! -L "${slot_remote_dir}"
rsync -a --delete \
	--exclude 'frontend/node_modules' \
	--exclude 'frontend/.next' \
	"${incoming}/frontend" \
	"${incoming}/docker-compose.m4-frontend-slot.yml" \
	"${incoming}/deploy" \
	"${slot_remote_dir}/"

export NPCINK_CLOUD_M4_SLOT_NUMBER="${slot}"
export NPCINK_CLOUD_M4_SLOT_PORT="${remote_port}"
export NPCINK_CLOUD_M4_SLOT_TUNNEL_PORT="${tunnel_port}"
export NPCINK_CLOUD_M4_SLOT_OWNER="${owner}"
export NPCINK_CLOUD_M4_SLOT_EXPIRES_AT="${expires_at}"
export NPCINK_CLOUD_M4_SLOT_SOURCE_REVISION="${source_revision}"
export NPCINK_CLOUD_M4_SLOT_API_CONTAINER="${api_container}"
export NPCINK_CLOUD_M4_SLOT_PRIMARY_NETWORK="${primary_network}"
export NPCINK_CLOUD_M4_SLOT_DEPENDENCY_VOLUME="${dependency_volume}"
cd "${slot_remote_dir}"
compose=(
	docker compose
	-p "${slot_project}"
	--env-file "${primary_remote_dir}/.env"
	--env-file "${primary_remote_dir}/.env.local"
	-f docker-compose.m4-frontend-slot.yml
)
"${compose[@]}" config --quiet
stack_touched=1
"${compose[@]}" up -d --no-build --pull never

for attempt in $(seq 1 60); do
	code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${remote_port}/" || true)"
	case "${code}" in
		200|301|302|303|307|308) break ;;
	esac
	if [ "${attempt}" = "60" ]; then
		echo "[m4-frontend-slot] slot ${slot} did not become ready; last HTTP=${code}" >&2
		exit 69
	fi
	sleep 2
done

proxy_id="$("${compose[@]}" ps -q proxy-slot)"
frontend_id="$("${compose[@]}" ps -q frontend-slot)"
test -n "${proxy_id}" && test -n "${frontend_id}"
for id in "${proxy_id}" "${frontend_id}"; do
	[ "$(docker inspect -f '{{.State.Status}}' "${id}")" = "running" ]
	[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "${id}")" = "no" ]
done
[ "$(docker port "${proxy_id}" 8080/tcp)" = "127.0.0.1:${remote_port}" ]

{
	printf 'state=active\n'
	printf 'preview_mode=frontend_only_read_only\n'
	printf 'slot=%s\n' "${slot}"
	printf 'owner=%s\n' "${owner}"
	printf 'expires_at_epoch=%s\n' "${expires_epoch}"
	printf 'expires_at_utc=%s\n' "${expires_at}"
	printf 'source_revision=%s\n' "${source_revision}"
	printf 'source_base_revision=%s\n' "${source_base_revision}"
	printf 'source_branch=%s\n' "${source_branch}"
	printf 'source_dirty=%s\n' "${source_dirty}"
	printf 'source_bundle_sha256=%s\n' "${source_sha}"
	printf 'primary_acceptance_state=%s\n' "${primary_acceptance}"
	printf 'primary_source_revision=%s\n' "${primary_revision}"
	printf 'remote_port=%s\n' "${remote_port}"
	printf 'tunnel_port=%s\n' "${tunnel_port}"
	printf 'updated_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${slot_state_file}"
"${compose[@]}" ps
stack_touched=0
REMOTE_SLOT_UP

	cleanup_source_relay || fail "source relay cleanup failed; inspect ${SOURCE_RELAY_LOCK_DIR}"
	slot_log "slot ${slot} is ready; open: pnpm run m4:frontend:tunnel -- --slot ${slot} --auto"
}

run_status() {
	local slot=""
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--slot)
				[ "$#" -ge 2 ] || slot_fail "--slot requires a value"
				slot="$2"
				shift 2
				;;
			--) shift ;;
			*) slot_fail "unknown argument: $1" ;;
		esac
	done
	[ -z "${slot}" ] || validate_slot "${slot}"
	require_cmd ssh
	ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- \
		"${slot:-all}" "${M4_SLOT_STATE_BASE}" "${M4_PROJECT_NAME}" <<'REMOTE_SLOT_STATUS'
set -euo pipefail
requested="$1"
state_base="${HOME}/$2"
primary_state_file="${HOME}/.cache/$3/last-deploy.txt"
now_epoch="$(date +%s)"
for slot in 1 2 3; do
	[ "${requested}" = "all" ] || [ "${requested}" = "${slot}" ] || continue
	project="npcink-ai-cloud-m4-ui-${slot}"
	state_file="${state_base}/slot-${slot}/state.txt"
	echo "[m4-frontend-slot] slot ${slot}"
	if [ ! -f "${state_file}" ]; then
		echo 'state=available'
		continue
	fi
	cat "${state_file}"
	expires="$(sed -n 's/^expires_at_epoch=//p' "${state_file}" | head -n 1)"
	case "${expires}" in
		''|*[!0-9]*) expires=0 ;;
	esac
	[ "${expires}" -gt "${now_epoch}" ] && echo 'lease_status=active' || echo 'lease_status=expired'
	recorded_primary="$(sed -n 's/^primary_source_revision=//p' "${state_file}" | head -n 1)"
	current_acceptance=""
	current_primary=""
	if [ -f "${primary_state_file}" ]; then
		current_acceptance="$(sed -n 's/^acceptance_state=//p' "${primary_state_file}" | head -n 1)"
		current_primary="$(sed -n 's/^source_revision=//p' "${primary_state_file}" | head -n 1)"
	fi
	if [ "${current_acceptance}" = "accepted" ] &&
		[ "${current_primary}" = "${recorded_primary}" ]; then
		echo 'backend_lease_status=stable'
	else
		echo 'backend_lease_status=drifted'
	fi
	docker ps -a \
		--filter "label=com.docker.compose.project=${project}" \
		--format 'container={{.Names}}|status={{.Status}}|ports={{.Ports}}'
	port="$(sed -n 's/^remote_port=//p' "${state_file}" | head -n 1)"
	code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/" || true)"
	echo "http_root=${code}"
done
REMOTE_SLOT_STATUS
}

run_logs() {
	local slot=""
	local tail_lines="200"
	local follow=0
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--slot)
				[ "$#" -ge 2 ] || slot_fail "--slot requires a value"
				slot="$2"
				shift 2
				;;
			--tail)
				[ "$#" -ge 2 ] || slot_fail "--tail requires a value"
				tail_lines="$2"
				shift 2
				;;
			--follow|-f)
				follow=1
				shift
				;;
			--) shift ;;
			*) slot_fail "unknown argument: $1" ;;
		esac
	done
	validate_slot "${slot}"
	validate_number "tail lines" "${tail_lines}"
	require_cmd ssh
	ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- \
		"${slot}" "${tail_lines}" "${follow}" "${M4_REMOTE_DIR}" <<'REMOTE_SLOT_LOGS'
set -euo pipefail
slot="$1"
tail_lines="$2"
follow="$3"
primary_remote_dir="$4"
project="npcink-ai-cloud-m4-ui-${slot}"
ids="$(docker ps -a -q --filter "label=com.docker.compose.project=${project}")"
test -n "${ids}" || {
	echo "[m4-frontend-slot] slot ${slot} has no containers" >&2
	exit 66
}
args=(docker logs --tail "${tail_lines}")
[ "${follow}" = "1" ] && args+=(--follow)
for id in ${ids}; do
	"${args[@]}" "${id}" 2>&1
done | python3 -u "${primary_remote_dir}/scripts/redact-m4-preview-logs.py" \
	--env-file "${primary_remote_dir}/.env" \
	--env-file "${primary_remote_dir}/.env.local"
REMOTE_SLOT_LOGS
}

run_release() {
	local slot=""
	local owner="${NPCINK_CLOUD_M4_FRONTEND_SLOT_OWNER:-}"
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--slot)
				[ "$#" -ge 2 ] || slot_fail "--slot requires a value"
				slot="$2"
				shift 2
				;;
			--owner)
				[ "$#" -ge 2 ] || slot_fail "--owner requires a value"
				owner="$2"
				shift 2
				;;
			--) shift ;;
			*) slot_fail "unknown argument: $1" ;;
		esac
	done
	validate_slot "${slot}"
	validate_owner "${owner}"
	require_cmd ssh
	ssh "${SSH_ARGS[@]}" "${M4_SSH_HOST}" bash -s -- \
		"${slot}" "${owner}" "${M4_SLOT_REMOTE_BASE}" "${M4_SLOT_STATE_BASE}" <<'REMOTE_SLOT_RELEASE'
set -euo pipefail
slot="$1"
owner="$2"
remote_base="$3"
state_base="$4"
project="npcink-ai-cloud-m4-ui-${slot}"
remote_dir="${remote_base}-${slot}"
state_dir="${HOME}/${state_base}/slot-${slot}"
state_file="${state_dir}/state.txt"
lock_dir="${state_dir}/operation.lock"
test -f "${state_file}" || {
	echo "[m4-frontend-slot] slot ${slot} is already available"
	exit 0
}
existing_owner="$(sed -n 's/^owner=//p' "${state_file}" | head -n 1)"
[ "${existing_owner}" = "${owner}" ] || {
	echo "[m4-frontend-slot] slot ${slot} is owned by ${existing_owner}" >&2
	exit 75
}
mkdir "${lock_dir}" 2>/dev/null || {
	echo "[m4-frontend-slot] another operation holds slot ${slot}" >&2
	exit 75
}
cleanup_lock() {
	rm -f "${lock_dir}/owner.txt"
	rmdir "${lock_dir}" >/dev/null 2>&1 || true
}
trap cleanup_lock EXIT
printf 'owner=%s\n' "${owner}" > "${lock_dir}/owner.txt"
for id in $(
	docker ps -a -q \
		--filter "label=com.docker.compose.project=${project}" \
		--filter "label=com.docker.compose.oneoff=False"
); do
	observed="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "${id}")"
	[ "${observed}" = "${project}" ] && docker rm -f "${id}" >/dev/null
done
for volume in $(
	docker volume ls -q \
		--filter "label=com.docker.compose.project=${project}" \
		--filter "label=com.docker.compose.volume=slot-frontend-next-cache"
); do
	docker volume rm "${volume}" >/dev/null
done
for network in $(docker network ls -q --filter "label=com.docker.compose.project=${project}"); do
	docker network rm "${network}" >/dev/null 2>&1 || true
done
rm -f "${state_file}"
find "${remote_dir}" -depth -delete 2>/dev/null || true
echo "[m4-frontend-slot] released slot ${slot}"
REMOTE_SLOT_RELEASE
}

probe_slot_host() {
	ssh "${TUNNEL_PROBE_SSH_ARGS[@]}" \
		-o ConnectTimeout="$3" -o ConnectionAttempts=1 \
		"$1" \
		"/usr/bin/curl --fail --silent --show-error --max-time 5 http://127.0.0.1:$2/ >/dev/null" \
		>/dev/null 2>&1
}

run_tunnel() {
	local slot=""
	local auto=0
	local dry_run=0
	local local_port=""
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--slot)
				[ "$#" -ge 2 ] || slot_fail "--slot requires a value"
				slot="$2"
				shift 2
				;;
			--auto)
				auto=1
				shift
				;;
			--local-port)
				[ "$#" -ge 2 ] || slot_fail "--local-port requires a value"
				local_port="$2"
				shift 2
				;;
			--dry-run)
				dry_run=1
				shift
				;;
			--) shift ;;
			*) slot_fail "unknown argument: $1" ;;
		esac
	done
	validate_slot "${slot}"
	local remote_port=""
	remote_port="$(slot_remote_port "${slot}")"
	[ -n "${local_port}" ] || local_port="$(slot_tunnel_port "${slot}")"
	validate_port "local port" "${local_port}"
	local ssh_host="${M4_SSH_HOST}"
	local route="configured"
	if [ "${auto}" = "1" ]; then
		if [ "${dry_run}" = "1" ]; then
			ssh_host="${M4_LAN_SSH_HOST}"
			route="lan-dry-run"
		elif probe_slot_host "${M4_LAN_SSH_HOST}" "${remote_port}" 2; then
			ssh_host="${M4_LAN_SSH_HOST}"
			route="lan"
		elif probe_slot_host "${M4_SSH_HOST}" "${remote_port}" 5; then
			route="tailscale"
		else
			slot_fail "slot ${slot} is unavailable through both LAN and Tailscale"
		fi
	fi
	slot_log "slot=${slot}"
	slot_log "selected_route=${route}"
	slot_log "local_url=http://127.0.0.1:${local_port}"
	slot_log "the tunnel stays in the foreground; press Ctrl+C to close it"
	local forward="127.0.0.1:${local_port}:127.0.0.1:${remote_port}"
	if [ "${dry_run}" = "1" ]; then
		printf '[m4-frontend-slot] dry-run: ssh'
		printf ' %q' \
			"${SSH_ARGS[@]}" \
			-o ExitOnForwardFailure=yes \
			-o ServerAliveInterval=15 \
			-o ServerAliveCountMax=3 \
			-N -L "${forward}" "${ssh_host}"
		printf '\n'
		return 0
	fi
	require_cmd ssh
	exec ssh \
		"${SSH_ARGS[@]}" \
		-o ExitOnForwardFailure=yes \
		-o ServerAliveInterval=15 \
		-o ServerAliveCountMax=3 \
		-N -L "${forward}" "${ssh_host}"
}

main() {
	validate_target
	local command="${1:-}"
	[ -n "${command}" ] || {
		slot_usage
		exit 64
	}
	shift
	case "${command}" in
		up|sync) run_up_or_sync "${command}" "$@" ;;
		status) run_status "$@" ;;
		logs) run_logs "$@" ;;
		tunnel) run_tunnel "$@" ;;
		release) run_release "$@" ;;
		help|--help|-h) slot_usage ;;
		*) slot_fail "unsupported command: ${command}" ;;
	esac
}

main "$@"
