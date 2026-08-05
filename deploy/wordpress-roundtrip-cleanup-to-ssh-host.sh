#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
. "${ROOT_DIR}/deploy/common.sh"

npcink_ai_cloud_require_cmd ssh

SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
SSH_CONNECT_TIMEOUT_SECONDS="${NPCINK_CLOUD_DEPLOY_SSH_CONNECT_TIMEOUT_SECONDS:-10}"
REMOTE_PYTHON="${NPCINK_CLOUD_RELEASE_TOOL_PYTHON:-python3.11}"
REMOTE_ARGS=()

while [ "$#" -gt 0 ]; do
	case "$1" in
		--) shift ;;
		--ssh-host) SSH_HOST="$2"; shift 2 ;;
		--ssh-user) SSH_USER="$2"; shift 2 ;;
		--ssh-port) SSH_PORT="$2"; shift 2 ;;
		--identity-file) SSH_IDENTITY_FILE="$2"; shift 2 ;;
		*) REMOTE_ARGS+=("$1"); shift ;;
	esac
done

[ -n "${SSH_HOST}" ] || { echo "[fail] Missing --ssh-host." >&2; exit 1; }
[ -z "${SSH_IDENTITY_FILE}" ] || [ -f "${SSH_IDENTITY_FILE}" ] || {
	echo "[fail] SSH identity file not found." >&2
	exit 1
}

SSH_TARGET="${SSH_HOST}"
[ -z "${SSH_USER}" ] || SSH_TARGET="${SSH_USER}@${SSH_HOST}"
SSH_ARGS=(-p "${SSH_PORT}" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout="${SSH_CONNECT_TIMEOUT_SECONDS}")
[ -z "${SSH_IDENTITY_FILE}" ] || SSH_ARGS+=(-i "${SSH_IDENTITY_FILE}")

REMOTE_COMMAND=("${REMOTE_PYTHON}" -)
REMOTE_COMMAND+=("${REMOTE_ARGS[@]}")
printf -v REMOTE_COMMAND_QUOTED '%q ' "${REMOTE_COMMAND[@]}"

ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "${REMOTE_COMMAND_QUOTED}" \
	<"${ROOT_DIR}/scripts/production_wordpress_roundtrip_cleanup.py"
