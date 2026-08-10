#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
REMOTE_DIR="${NPCINK_CLOUD_DEPLOY_REMOTE_DIR:-/opt/npcink-ai-cloud}"
HOST_PYTHON="${NPCINK_CLOUD_DEPLOY_HOST_PYTHON:-/usr/bin/python3.11}"
EXPECTED_ACTIVE_SHA=""
RECOVERY_SOURCE_SHA=""
CONFIRMATION=""

while [ "$#" -gt 0 ]; do
	case "$1" in
		--expected-active-production-sha)
			EXPECTED_ACTIVE_SHA="$2"
			shift 2
			;;
		--recovery-source-sha)
			RECOVERY_SOURCE_SHA="$2"
			shift 2
			;;
		--confirmation)
			CONFIRMATION="$2"
			shift 2
			;;
		*)
			echo "[terminalization-repair:fail] Unknown argument: $1" >&2
			exit 1
			;;
	esac
done

[[ "${EXPECTED_ACTIVE_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
	echo "[terminalization-repair:fail] Expected active production SHA is invalid." >&2
	exit 1
}
[[ "${RECOVERY_SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
	echo "[terminalization-repair:fail] Recovery source SHA is invalid." >&2
	exit 1
}
[ "${CONFIRMATION}" = "Approved for production terminalization repair by operator." ] || {
	echo "[terminalization-repair:fail] Exact operator confirmation is required." >&2
	exit 1
}
[ -n "${SSH_HOST}" ] && [ "${SSH_USER}" = "root" ] && [ -n "${SSH_IDENTITY_FILE}" ] || {
	echo "[terminalization-repair:fail] Protected root SSH configuration is incomplete." >&2
	exit 1
}
[ -f "${SSH_IDENTITY_FILE}" ] || {
	echo "[terminalization-repair:fail] SSH identity file is unavailable." >&2
	exit 1
}
case "${REMOTE_DIR}" in
	/|''|*[!A-Za-z0-9._/-]*)
		echo "[terminalization-repair:fail] Managed root is invalid." >&2
		exit 1
		;;
esac

SSH_ARGS=(
	-p "${SSH_PORT}"
	-i "${SSH_IDENTITY_FILE}"
	-o BatchMode=yes
	-o IdentitiesOnly=yes
	-o StrictHostKeyChecking=yes
	-o UserKnownHostsFile="${HOME}/.ssh/known_hosts"
	-o ConnectTimeout=10
)

REMOTE_COMMAND_ARGS=(
	"${HOST_PYTHON}"
	-
	--managed-root "${REMOTE_DIR}"
	--expected-active-production-sha "${EXPECTED_ACTIVE_SHA}"
	--recovery-source-sha "${RECOVERY_SOURCE_SHA}"
	--confirmation "${CONFIRMATION}"
)
printf -v REMOTE_COMMAND '%q ' "${REMOTE_COMMAND_ARGS[@]}"
ssh "${SSH_ARGS[@]}" "${SSH_USER}@${SSH_HOST}" "${REMOTE_COMMAND}" \
	<"${ROOT_DIR}/deploy/repair-post-commit-cleanup.py"
