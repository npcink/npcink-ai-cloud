#!/usr/bin/env bash

# Workspace-local remote deploy target loader for Npcink AI Cloud.
# Source this file before running deploy helpers:
#   source deploy/workspace-target.env.sh
#
# Resolution order (first match wins for defaults; pre-exported env always wins):
#   1) .deploy-secrets/workspace-target.env.sh  (local-only, gitignored)
#   2) placeholder defaults below (safe for public clones; not a real host)
#
# Still required before real deploy:
# - operator-held SSH password, key, or an already configured SSH agent/session
# - NPCINK_CLOUD_ENV_FILE (or .env.deploy in place)
#
# Bootstrap a local secrets file:
#   cp deploy/workspace-target.env.example .deploy-secrets/workspace-target.env.sh
#   chmod 600 .deploy-secrets/workspace-target.env.sh

_NPCINK_WORKSPACE_TARGET_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_NPCINK_WORKSPACE_TARGET_SECRETS="${_NPCINK_WORKSPACE_TARGET_ROOT}/.deploy-secrets/workspace-target.env.sh"

if [ -f "${_NPCINK_WORKSPACE_TARGET_SECRETS}" ]; then
	# shellcheck disable=SC1090
	source "${_NPCINK_WORKSPACE_TARGET_SECRETS}"
else
	# Placeholders only (RFC 5737 TEST-NET / example.test). Not a production target.
	if [ -z "${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}" ]; then
		echo "[workspace-target] missing .deploy-secrets/workspace-target.env.sh; using placeholders. See deploy/WORKSPACE_TARGET.md" >&2
	fi
	export NPCINK_CLOUD_DEPLOY_SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-203.0.113.10}"
	export NPCINK_CLOUD_DEPLOY_SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-deploy}"
	export NPCINK_CLOUD_BASE_URL="${NPCINK_CLOUD_BASE_URL:-https://cloud.example.test}"
	export NPCINK_CLOUD_DOMAIN_NAME="${NPCINK_CLOUD_DOMAIN_NAME:-cloud.example.test}"
	export NPCINK_CLOUD_DOMAIN_UPSTREAM_URL="${NPCINK_CLOUD_DOMAIN_UPSTREAM_URL:-http://127.0.0.1:8010}"
fi

unset _NPCINK_WORKSPACE_TARGET_ROOT _NPCINK_WORKSPACE_TARGET_SECRETS
