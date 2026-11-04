#!/usr/bin/env bash
# Operator-invoked transport only. The canonical release-smoke.sh owns all gates.
set -euo pipefail
set +x

fail() { echo "[fail] $*" >&2; exit 1; }
[ "${1:-}" = "--" ] || fail 'Expected -- followed by the smoke command'
shift
[ "$#" -gt 0 ] || fail 'Missing smoke command'

SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_KEY="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
KNOWN_HOSTS="${NPCINK_CLOUD_DEPLOY_KNOWN_HOSTS_FILE:-${HOME}/.ssh/known_hosts}"
LOCAL_PORT="${NPCINK_CLOUD_SMOKE_LOCAL_PORT:-18011}"
REMOTE_PORT="${NPCINK_CLOUD_SMOKE_REMOTE_PORT:-8010}"
EXPECTED_SHA="${NPCINK_CLOUD_EXPECTED_DEPLOYED_SHA:-}"
REMOTE_DIR="${NPCINK_CLOUD_DEPLOY_REMOTE_DIR:-/opt/npcink-ai-cloud}"
[[ "${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail 'Full expected deployed SHA is required'
[[ "${REMOTE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]] && \
	[[ "/${REMOTE_DIR#/}/" != */../* && "/${REMOTE_DIR#/}/" != */./* ]] \
	|| fail 'Safe absolute managed remote directory is required'
[[ "${SSH_HOST}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail 'Invalid smoke SSH host'
[[ "${SSH_USER}" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || fail 'Invalid smoke SSH user'
for port in "${SSH_PORT}" "${LOCAL_PORT}" "${REMOTE_PORT}"; do
	[[ "${port}" =~ ^[1-9][0-9]{0,4}$ ]] && [ "${port}" -le 65535 ] || fail 'Invalid smoke tunnel port'
done
[ -f "${SSH_KEY}" ] && [ -r "${SSH_KEY}" ] || fail 'Existing SSH identity file is required'
[ -f "${KNOWN_HOSTS}" ] && [ -r "${KNOWN_HOSTS}" ] || fail 'Pinned known-hosts file is required'

STATE_DIR="$(mktemp -d)"
chmod 0700 "${STATE_DIR}"
CONTROL="${STATE_DIR}/ssh"
SSH_ARGS=(
	-F /dev/null -p "${SSH_PORT}" -i "${SSH_KEY}"
	-o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
	-o "UserKnownHostsFile=${KNOWN_HOSTS}" -o ConnectTimeout=10
	-o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=2
	-S "${CONTROL}"
)
# Transport processes never need the runtime, admin, or mailbox credentials.
smoke_ssh() {
	env -u NPCINK_CLOUD_INTERNAL_AUTH_TOKEN -u NPCINK_CLOUD_ADMIN_KEY \
		-u NPCINK_CLOUD_RELEASE_MEMBER_EMAIL -u NPCINK_CLOUD_PORTAL_LOGIN_CODE \
		-u NPCINK_CLOUD_RELEASE_SITE_ID -u NPCINK_CLOUD_RELEASE_KEY_ID \
		-u NPCINK_CLOUD_RELEASE_KEY_SECRET -u NPCINK_CLOUD_SECRET \
		ssh "${SSH_ARGS[@]}" "$@"
}
cleanup() {
	local result="$?"
	trap - EXIT
	if [ -S "${CONTROL}" ]; then
		if ! smoke_ssh -O exit "${SSH_USER}@${SSH_HOST}" >/dev/null 2>&1; then
			echo '[fail] Smoke tunnel cleanup failed' >&2
			result=1
		fi
	fi
	rm -rf -- "${STATE_DIR}" || result=1
	exit "${result}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Bind the tool to the installed manifest, not just a historical green deploy.
# Only JSON parsing occurs remotely; no application source or config is written.
verify_installed_revision() {
	smoke_ssh "${SSH_USER}@${SSH_HOST}" bash -s -- "${REMOTE_DIR}" "${EXPECTED_SHA}" <<'REMOTE'
set -euo pipefail
python3 - "$1/current/release-bundle-manifest.json" "$2" <<'PY_SHA'
import json
import sys
with open(sys.argv[1]) as handle:
    manifest = json.load(handle)
if manifest.get("source", {}).get("revision") != sys.argv[2]:
    raise SystemExit("[fail] Installed source revision differs from expected deployed SHA")
PY_SHA
REMOTE
}
verify_installed_revision || fail 'Installed revision check failed; no smoke executed'

# No application change or public listener. SSH binds the local
# port before returning; a port collision or authentication failure stops here.
smoke_ssh -M -f -N -T \
	-L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
	"${SSH_USER}@${SSH_HOST}" 2>"${STATE_DIR}/ssh-error" \
	|| fail 'Private smoke tunnel could not be established; no smoke executed'
export NPCINK_CLOUD_INTERNAL_BASE_URL="http://127.0.0.1:${LOCAL_PORT}"
"$@"
verify_installed_revision || fail 'Installed revision changed during smoke; acceptance is invalid'
