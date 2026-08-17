#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
REMOTE_DIR="${NPCINK_CLOUD_DEPLOY_REMOTE_DIR:-/opt/npcink-ai-cloud}"
INVENTORY_SCRIPT="${ROOT_DIR}/scripts/production_ownership_inventory.py"

fail() {
	printf '[ownership-inventory:fail] %s\n' "$*" >&2
	exit 1
}

[ -n "${SSH_HOST}" ] || fail "SSH host is required"
[ "${SSH_USER}" = "root" ] || fail "production ownership inventory requires the root SSH user"
case "${SSH_PORT}" in
	'' | *[!0-9]*) fail "SSH port must be numeric" ;;
esac
[ -f "${SSH_IDENTITY_FILE}" ] && [ ! -L "${SSH_IDENTITY_FILE}" ] || \
	fail "SSH identity file is missing or unsafe"
[[ "${REMOTE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "managed root is unsafe"
[[ "/${REMOTE_DIR#/}/" != */../* ]] || fail "managed root contains traversal"
[ -f "${INVENTORY_SCRIPT}" ] && [ ! -L "${INVENTORY_SCRIPT}" ] || \
	fail "inventory script is missing or unsafe"

remote_shell_arg() {
	printf '%q' "$1"
}

ssh_args=(
	-p "${SSH_PORT}"
	-i "${SSH_IDENTITY_FILE}"
	-o StrictHostKeyChecking=yes
	-o BatchMode=yes
	-o ConnectTimeout=10
)
ssh_target="${SSH_USER}@${SSH_HOST}"
remote_command="bash -s -- $(remote_shell_arg "${REMOTE_DIR}")"

{
	cat <<'REMOTE'
set -euo pipefail
set +x

remote_dir="$1"
current_link="${remote_dir}/current"
[ -L "${current_link}" ] || {
	echo "[ownership-inventory:fail] current release symlink is missing" >&2
	exit 1
}
current_release="$(readlink -f -- "${current_link}" 2>/dev/null || true)"
[ -n "${current_release}" ] && [ -d "${current_release}" ] || {
	echo "[ownership-inventory:fail] current release symlink is broken" >&2
	exit 1
}
case "${current_release}" in
	"${remote_dir}"/release-*) ;;
	*) echo "[ownership-inventory:fail] current release is outside the managed root" >&2; exit 1 ;;
esac
if [ "$(dirname -- "${current_release}")" != "${remote_dir}" ] || \
	[[ ! "$(basename -- "${current_release}")" =~ ^release-[A-Za-z0-9._-]+$ ]] || \
	[ ! -f "${current_release}/deploy/common.sh" ] || \
	[ -L "${current_release}/deploy/common.sh" ]; then
	echo "[ownership-inventory:fail] current release must be a direct managed release child" >&2
	exit 1
fi
# shellcheck source=/dev/null
. "${current_release}/deploy/common.sh"
npcink_ai_cloud_compose "${current_release}" exec -T api python - <<'PY'
REMOTE
	cat "${INVENTORY_SCRIPT}"
	cat <<'REMOTE'
PY
REMOTE
} | ssh "${ssh_args[@]}" "${ssh_target}" "${remote_command}"
