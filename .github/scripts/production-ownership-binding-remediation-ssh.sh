#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
REMOTE_DIR="${NPCINK_CLOUD_DEPLOY_REMOTE_DIR:-/opt/npcink-ai-cloud}"
MODE="${NPCINK_CLOUD_OWNERSHIP_REMEDIATION_MODE:-}"
FINDING_TOKEN="${NPCINK_CLOUD_OWNERSHIP_FINDING_TOKEN:-}"
CONFIRMATION="${NPCINK_CLOUD_OWNERSHIP_REPAIR_CONFIRMATION:-}"
REMEDIATION_SCRIPT="${ROOT_DIR}/.github/scripts/production-ownership-binding-remediation.py"

fail() {
	printf '[ownership-remediation:fail] %s\n' "$*" >&2
	exit 1
}

[ -n "${SSH_HOST}" ] || fail "SSH host is required"
[ "${SSH_USER}" = "root" ] || fail "production ownership remediation requires the root SSH user"
case "${SSH_PORT}" in
	'' | *[!0-9]*) fail "SSH port must be numeric" ;;
esac
[ -f "${SSH_IDENTITY_FILE}" ] && [ ! -L "${SSH_IDENTITY_FILE}" ] || \
	fail "SSH identity file is missing or unsafe"
[[ "${REMOTE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "managed root is unsafe"
[[ "/${REMOTE_DIR#/}/" != */../* ]] || fail "managed root contains traversal"
[ "${MODE}" = "diagnose" ] || [ "${MODE}" = "release" ] || fail "mode must be diagnose or release"
if [ "${MODE}" = "release" ]; then
	[[ "${FINDING_TOKEN}" =~ ^[0-9a-f]{64}$ ]] || fail "finding token is malformed"
	[ "${CONFIRMATION}" = "Release the invalid production ownership binding." ] || \
		fail "repair confirmation is invalid"
fi
[ -f "${REMEDIATION_SCRIPT}" ] && [ ! -L "${REMEDIATION_SCRIPT}" ] || \
	fail "remediation script is missing or unsafe"

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
remote_command="bash -s -- $(remote_shell_arg "${REMOTE_DIR}") $(remote_shell_arg "${MODE}") $(remote_shell_arg "${FINDING_TOKEN}") $(remote_shell_arg "${CONFIRMATION}")"

{
	cat <<'REMOTE'
set -euo pipefail
set +x

remote_dir="$1"
mode="$2"
finding_token="$3"
confirmation="$4"
current_link="${remote_dir}/current"
[ -L "${current_link}" ] || {
	echo "[ownership-remediation:fail] current release symlink is missing" >&2
	exit 1
}
current_release="$(readlink -f -- "${current_link}" 2>/dev/null || true)"
[ -n "${current_release}" ] && [ -d "${current_release}" ] || {
	echo "[ownership-remediation:fail] current release symlink is broken" >&2
	exit 1
}
case "${current_release}" in
	"${remote_dir}"/release-*) ;;
	*) echo "[ownership-remediation:fail] current release is outside the managed root" >&2; exit 1 ;;
esac
if [ "$(dirname -- "${current_release}")" != "${remote_dir}" ] || \
	[[ ! "$(basename -- "${current_release}")" =~ ^release-[A-Za-z0-9._-]+$ ]] || \
	[ ! -f "${current_release}/deploy/common.sh" ] || \
	[ -L "${current_release}/deploy/common.sh" ]; then
	echo "[ownership-remediation:fail] current release must be a direct managed release child" >&2
	exit 1
fi
# shellcheck source=/dev/null
. "${current_release}/deploy/common.sh"
npcink_ai_cloud_compose "${current_release}" exec -T api python - "${mode}" "${finding_token}" "${confirmation}" <<'PY'
REMOTE
	cat "${REMEDIATION_SCRIPT}"
	cat <<'REMOTE'
PY
REMOTE
} | ssh "${ssh_args[@]}" "${ssh_target}" "${remote_command}"
