#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CLOUD_REPO_ROOT="${ROOT_DIR}"
source "${ROOT_DIR}/scripts/mini-cloud-env.sh"
REMOTE_HOST="${REMOTE_HOST:-${MINI_CLOUD_REMOTE_HOST}}"
REMOTE_ROOT="${REMOTE_ROOT:-${MINI_CLOUD_REMOTE_ROOT}}"
REMOTE_PROJECT_DIR="${REMOTE_PROJECT_DIR:-${MINI_CLOUD_REMOTE_PROJECT_DIR}}"
REMOTE_PROJECT_DIR_SCRIPT="\$HOME${REMOTE_PROJECT_DIR#\~}"
REMOTE_SYNC="${REMOTE_SYNC:-1}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
	cat <<'EOF'
Usage: scripts/mini-cloud-deploy.sh [--dry-run] [deploy args...]

Sync the local Cloud repo to the remote Mac mini, then run the formal
cloud SSH deploy from the mini as a jump host.

Defaults:
  REMOTE_HOST from scripts/mini-cloud.env
  REMOTE_ROOT from scripts/mini-cloud.env
  REMOTE_SYNC=1

Notes:
  - This script runs the production deploy path on the mini:
    deploy/deploy-to-ssh-host.sh
  - It does not use the mini dev preview compose as a release path.
  - SSH agent forwarding is enabled by default so the mini can reach the
    actual cloud host without depending on a local-path identity file.
EOF
}

log() {
	printf '[mini-cloud-deploy] %s\n' "$*"
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		printf '[mini-cloud-deploy] missing required command: %s\n' "$1" >&2
		exit 1
	}
}

run_remote() {
	local script="$1"
	if [ "${DRY_RUN}" = "1" ]; then
		log "dry-run remote(${REMOTE_HOST}): ${script}"
		return 0
	fi
	ssh -A "${REMOTE_HOST}" "bash -lc $(printf '%q' "${script}")"
}

sync_repo() {
	if [ "${REMOTE_SYNC}" != "1" ]; then
		log "skipping repo sync because REMOTE_SYNC=${REMOTE_SYNC}"
		return 0
	fi
	log "syncing repo to ${REMOTE_HOST}:${REMOTE_PROJECT_DIR}"
	if [ "${DRY_RUN}" = "1" ]; then
		log "dry-run local: rsync -az --delete --exclude .git --exclude node_modules --exclude .next --exclude build --exclude dist --exclude .pnpm-store --exclude .pytest_cache --exclude .deploy-secrets ${CLOUD_REPO_ROOT}/ ${REMOTE_HOST}:${REMOTE_PROJECT_DIR}/"
		if [ -f "${CLOUD_REPO_ROOT}/.deploy-secrets/workspace-target.env.sh" ]; then
			log "dry-run local: also sync .deploy-secrets/workspace-target.env.sh to mini"
		fi
		return 0
	fi
	rsync -az --delete \
		--exclude '.git' \
		--exclude 'node_modules' \
		--exclude '.next' \
		--exclude 'build' \
		--exclude 'dist' \
		--exclude '.pnpm-store' \
		--exclude '.pytest_cache' \
		--exclude '.deploy-secrets' \
		"${CLOUD_REPO_ROOT}/" \
		"${REMOTE_HOST}:${REMOTE_PROJECT_DIR}/"
	# Keep local-only deploy target on the mini without syncing the whole secrets dir.
	if [ -f "${CLOUD_REPO_ROOT}/.deploy-secrets/workspace-target.env.sh" ]; then
		ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_PROJECT_DIR_SCRIPT}/.deploy-secrets && chmod 700 ${REMOTE_PROJECT_DIR_SCRIPT}/.deploy-secrets"
		rsync -az \
			"${CLOUD_REPO_ROOT}/.deploy-secrets/workspace-target.env.sh" \
			"${REMOTE_HOST}:${REMOTE_PROJECT_DIR}/.deploy-secrets/workspace-target.env.sh"
		ssh "${REMOTE_HOST}" "chmod 600 ${REMOTE_PROJECT_DIR_SCRIPT}/.deploy-secrets/workspace-target.env.sh"
	fi
}

main() {
	local passthrough=()
	local passthrough_escaped=""
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--)
				shift
				;;
			--help|-h)
				usage
				exit 0
				;;
			--dry-run)
				DRY_RUN=1
				shift
				;;
			*)
				passthrough+=("$1")
				shift
				;;
		esac
	done

	require_cmd rsync
	require_cmd ssh

	if [ "${#passthrough[@]}" -gt 0 ]; then
		printf -v passthrough_escaped '%q ' "${passthrough[@]}"
	fi

	sync_repo
	log "running formal cloud deploy on mini via SSH jump host"
	run_remote "
set -euo pipefail
cd ${REMOTE_PROJECT_DIR_SCRIPT}
test -S \"\${SSH_AUTH_SOCK:-}\" || {
  echo '[fail] SSH agent forwarding is not available on the mini. Load the deploy key locally or configure a key on the mini.' >&2
  exit 1
}
test -f deploy/workspace-target.env.sh || {
  echo '[fail] Missing deploy/workspace-target.env.sh on the mini.' >&2
  exit 1
}
# Loader prefers .deploy-secrets/workspace-target.env.sh when present on the mini.
source deploy/workspace-target.env.sh
if [ -z "${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}" ] || [ "${NPCINK_CLOUD_DEPLOY_SSH_HOST}" = "203.0.113.10" ]; then
  echo '[fail] Deploy SSH host is unset or still the placeholder. Copy deploy/workspace-target.env.example to .deploy-secrets/workspace-target.env.sh on the authoring Mac (synced by this script) or export NPCINK_CLOUD_DEPLOY_SSH_HOST.' >&2
  exit 1
fi
unset NPCINK_CLOUD_DEPLOY_IDENTITY_FILE
export NPCINK_CLOUD_ENV_FILE=\"${REMOTE_PROJECT_DIR_SCRIPT}/.env.deploy\"
bash deploy/deploy-to-ssh-host.sh ${passthrough_escaped}
"
}

main "$@"
