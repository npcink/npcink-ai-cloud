#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
DOMAIN="${NPCINK_CLOUD_DOMAIN_NAME:-}"
LOCAL_CERT_PATH="${NPCINK_CLOUD_DOMAIN_CERT_PATH:-}"
LOCAL_KEY_PATH="${NPCINK_CLOUD_DOMAIN_KEY_PATH:-}"
REMOTE_CERT_DIR="${NPCINK_CLOUD_DOMAIN_REMOTE_CERT_DIR:-}"
UPSTREAM_URL="${NPCINK_CLOUD_DOMAIN_UPSTREAM_URL:-http://127.0.0.1:8010}"
COMPOSE_PROJECT_NAME_EFFECTIVE="${NPCINK_CLOUD_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-npcink-ai-cloud}}"
PREPARE_ONLY=0

while [ "$#" -gt 0 ]; do
	case "$1" in
		--)
			shift
			;;
		--ssh-host)
			SSH_HOST="$2"
			shift 2
			;;
		--ssh-user)
			SSH_USER="$2"
			shift 2
			;;
		--ssh-port)
			SSH_PORT="$2"
			shift 2
			;;
		--identity-file)
			SSH_IDENTITY_FILE="$2"
			shift 2
			;;
		--domain)
			DOMAIN="$2"
			shift 2
			;;
		--cert-path)
			LOCAL_CERT_PATH="$2"
			shift 2
			;;
		--key-path)
			LOCAL_KEY_PATH="$2"
			shift 2
			;;
		--remote-cert-dir)
			REMOTE_CERT_DIR="$2"
			shift 2
			;;
		--upstream-url)
			UPSTREAM_URL="$2"
			shift 2
			;;
		--compose-project-name)
			COMPOSE_PROJECT_NAME_EFFECTIVE="$2"
			shift 2
			;;
		--prepare-only)
			PREPARE_ONLY=1
			shift
			;;
		*)
			echo "[fail] Unknown argument: $1" >&2
			exit 1
			;;
	esac
done

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		echo "[fail] Missing required command: $1" >&2
		exit 1
	}
}

require_cmd ssh
require_cmd scp
require_cmd python3
require_cmd openssl
require_cmd awk
require_cmd stat
require_cmd uname

[ -n "${SSH_HOST}" ] || { echo "[fail] Missing SSH host" >&2; exit 1; }
[ -n "${DOMAIN}" ] || { echo "[fail] Missing domain" >&2; exit 1; }
[ -n "${LOCAL_CERT_PATH}" ] || { echo "[fail] Missing cert path" >&2; exit 1; }
[ -n "${LOCAL_KEY_PATH}" ] || { echo "[fail] Missing key path" >&2; exit 1; }
[ -f "${LOCAL_CERT_PATH}" ] || { echo "[fail] Cert file not found: ${LOCAL_CERT_PATH}" >&2; exit 1; }
[ -f "${LOCAL_KEY_PATH}" ] || { echo "[fail] Key file not found: ${LOCAL_KEY_PATH}" >&2; exit 1; }

case "$(uname -s)" in
	Darwin)
		LOCAL_KEY_MODE="$(stat -f '%Lp' "${LOCAL_KEY_PATH}")"
		;;
	*)
		LOCAL_KEY_MODE="$(stat -c '%a' "${LOCAL_KEY_PATH}")"
		;;
esac
case "${LOCAL_KEY_MODE}" in
	"" | *[!0-7]*)
		echo "[fail] Could not determine private-key permissions." >&2
		exit 1
		;;
esac
if (( (8#${LOCAL_KEY_MODE}) & 0077 )); then
	echo "[fail] TLS private key must not grant any group or other permissions (expected 0600 or stricter)." >&2
	exit 1
fi

if [[ ! "${COMPOSE_PROJECT_NAME_EFFECTIVE}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
	echo "[fail] Compose project name contains unsupported characters." >&2
	exit 1
fi

python3 - "${DOMAIN}" "${UPSTREAM_URL}" <<'PY'
from __future__ import annotations

import re
import sys
from urllib.parse import urlsplit

domain = sys.argv[1].strip().lower().rstrip(".")
upstream = sys.argv[2].strip()

if len(domain) > 253 or not re.fullmatch(
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
    domain,
):
    raise SystemExit("[fail] Domain must be a valid lowercase-compatible DNS hostname.")

try:
    parsed = urlsplit(upstream)
    port = parsed.port
except ValueError as exc:
    raise SystemExit(f"[fail] Invalid upstream URL: {exc}") from exc

if parsed.scheme.lower() != "http" or parsed.hostname != "127.0.0.1" or port != 8010:
    raise SystemExit("[fail] External edge upstream must be exactly loopback HTTP on 127.0.0.1:8010.")
if parsed.username is not None or parsed.password is not None:
    raise SystemExit("[fail] External edge upstream must not contain userinfo.")
if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
    raise SystemExit("[fail] External edge upstream must be an origin without path, query, or fragment.")
PY

openssl x509 -in "${LOCAL_CERT_PATH}" -noout >/dev/null
openssl x509 -in "${LOCAL_CERT_PATH}" -checkend 86400 -noout >/dev/null || {
	echo "[fail] TLS certificate expires within 24 hours." >&2
	exit 1
}
openssl pkey -in "${LOCAL_KEY_PATH}" -check -noout >/dev/null
CERT_PUBLIC_KEY_SHA256="$(openssl x509 -in "${LOCAL_CERT_PATH}" -pubkey -noout |
	openssl pkey -pubin -outform DER 2>/dev/null |
	openssl dgst -sha256 -r |
	awk '{print $1}')"
KEY_PUBLIC_KEY_SHA256="$(openssl pkey -in "${LOCAL_KEY_PATH}" -pubout -outform DER 2>/dev/null |
	openssl dgst -sha256 -r |
	awk '{print $1}')"
if [ -z "${CERT_PUBLIC_KEY_SHA256}" ] || [ "${CERT_PUBLIC_KEY_SHA256}" != "${KEY_PUBLIC_KEY_SHA256}" ]; then
	echo "[fail] TLS certificate and private key do not match." >&2
	exit 1
fi

if [ -z "${REMOTE_CERT_DIR}" ]; then
	REMOTE_CERT_DIR="/etc/nginx/ssl/${DOMAIN}"
fi

TEMPLATE_PATH="${ROOT_DIR}/deploy/magick-domain-nginx.conf.template"
TMP_DIR="$(mktemp -d)"
REMOTE_CLEANUP_ARMED=0
SSH_TARGET=""
SSH_ARGS=()
REMOTE_TMP_DIR=""
cleanup() {
	rm -rf "${TMP_DIR}"
	if [ "${REMOTE_CLEANUP_ARMED}" = "1" ] && [ -n "${SSH_TARGET}" ] && [ -n "${REMOTE_TMP_DIR}" ]; then
		ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_TMP_DIR}" \
			>/dev/null 2>&1 <<'EOF' || true
set -euo pipefail
REMOTE_TMP_DIR="$1"
case "${REMOTE_TMP_DIR}" in
	/tmp/npcink-edge-[0-9a-f]*) ;;
	*) exit 1 ;;
esac
if [ -d "${REMOTE_TMP_DIR}" ]; then
	find "${REMOTE_TMP_DIR}" -depth -delete
fi
EOF
	fi
}
trap cleanup EXIT
TMP_CONF="${TMP_DIR}/${DOMAIN}.conf"

SSL_CERT_REMOTE="${REMOTE_CERT_DIR}/$(basename "${LOCAL_CERT_PATH}")"
SSL_KEY_REMOTE="${REMOTE_CERT_DIR}/$(basename "${LOCAL_KEY_PATH}")"

python3 - "${TEMPLATE_PATH}" "${TMP_CONF}" "${DOMAIN}" "${SSL_CERT_REMOTE}" "${SSL_KEY_REMOTE}" "${UPSTREAM_URL}" <<'PY'
from __future__ import annotations
import pathlib
import sys

template = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
target = pathlib.Path(sys.argv[2])
domain = sys.argv[3]
ssl_cert = sys.argv[4]
ssl_key = sys.argv[5]
upstream = sys.argv[6]

rendered = (
    template.replace("__DOMAIN__", domain)
    .replace("__SSL_CERT__", ssl_cert)
    .replace("__SSL_KEY__", ssl_key)
    .replace("__UPSTREAM__", upstream)
)
target.write_text(rendered, encoding="utf-8")
PY

SSH_TARGET="${SSH_HOST}"
if [ -n "${SSH_USER}" ]; then
	SSH_TARGET="${SSH_USER}@${SSH_HOST}"
fi

SSH_ARGS=(-p "${SSH_PORT}" -o StrictHostKeyChecking=accept-new)
SCP_ARGS=(-P "${SSH_PORT}" -o StrictHostKeyChecking=accept-new)
if [ -n "${SSH_IDENTITY_FILE}" ]; then
	SSH_ARGS+=(-i "${SSH_IDENTITY_FILE}")
	SCP_ARGS+=(-i "${SSH_IDENTITY_FILE}")
fi

REMOTE_TMP_TOKEN="$(python3 - <<'PY'
import secrets

print(secrets.token_hex(16))
PY
)"
REMOTE_TMP_DIR="/tmp/npcink-edge-${REMOTE_TMP_TOKEN}"
REMOTE_TMP_CONF="${REMOTE_TMP_DIR}/edge.conf"
REMOTE_TMP_CERT="${REMOTE_TMP_DIR}/edge.crt"
REMOTE_TMP_KEY="${REMOTE_TMP_DIR}/edge.key"

ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_TMP_DIR}" <<'EOF'
set -euo pipefail
umask 077
REMOTE_TMP_DIR="$1"
case "${REMOTE_TMP_DIR}" in
	/tmp/npcink-edge-[0-9a-f]*) ;;
	*) exit 1 ;;
esac
install -d -m 700 -- "${REMOTE_TMP_DIR}"
EOF
REMOTE_CLEANUP_ARMED=1

echo "[info] Uploading certs and nginx config to ${SSH_TARGET}"
scp "${SCP_ARGS[@]}" "${LOCAL_CERT_PATH}" "${SSH_TARGET}:${REMOTE_TMP_CERT}"
scp "${SCP_ARGS[@]}" "${LOCAL_KEY_PATH}" "${SSH_TARGET}:${REMOTE_TMP_KEY}"
scp "${SCP_ARGS[@]}" "${TMP_CONF}" "${SSH_TARGET}:${REMOTE_TMP_CONF}"

ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" bash -s -- \
	"${DOMAIN}" \
	"${REMOTE_CERT_DIR}" \
	"${REMOTE_TMP_CERT}" \
	"${REMOTE_TMP_KEY}" \
	"${REMOTE_TMP_CONF}" \
	"${UPSTREAM_URL}" \
	"${SSL_CERT_REMOTE}" \
	"${SSL_KEY_REMOTE}" \
	"${REMOTE_TMP_DIR}" \
	"${PREPARE_ONLY}" \
	"${COMPOSE_PROJECT_NAME_EFFECTIVE}" <<'EOF'
set -euo pipefail

DOMAIN="$1"
REMOTE_CERT_DIR="$2"
REMOTE_TMP_CERT="$3"
REMOTE_TMP_KEY="$4"
REMOTE_TMP_CONF="$5"
UPSTREAM_URL="$6"
SSL_CERT_REMOTE="$7"
SSL_KEY_REMOTE="$8"
REMOTE_TMP_DIR="$9"
PREPARE_ONLY="${10}"
COMPOSE_PROJECT_NAME_EFFECTIVE="${11}"

SITE_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
DEFAULT_ENABLED="/etc/nginx/sites-enabled/default"
ROLLBACK_DIR="${REMOTE_TMP_DIR}/rollback"
TRANSACTION_COMMITTED=0
NGINX_WAS_ACTIVE=0
NGINX_WAS_ENABLED=0
CERT_EXISTED=0
KEY_EXISTED=0
SITE_AVAILABLE_EXISTED=0
SITE_ENABLED_EXISTED=0
DEFAULT_ENABLED_EXISTED=0

backup_target() {
	local source="$1"
	local backup_name="$2"
	local marker_name="$3"
	if [ -e "${source}" ] || [ -L "${source}" ]; then
		cp -a -- "${source}" "${ROLLBACK_DIR}/${backup_name}"
		printf -v "${marker_name}" '%s' 1
	fi
}

restore_target() {
	local target="$1"
	local backup_name="$2"
	local existed="$3"
	rm -f -- "${target}"
	if [ "${existed}" = "1" ]; then
		cp -a -- "${ROLLBACK_DIR}/${backup_name}" "${target}"
	fi
}

rollback_remote_changes() {
	restore_target "${SSL_CERT_REMOTE}" cert "${CERT_EXISTED}"
	restore_target "${SSL_KEY_REMOTE}" key "${KEY_EXISTED}"
	restore_target "${SITE_AVAILABLE}" site-available "${SITE_AVAILABLE_EXISTED}"
	restore_target "${SITE_ENABLED}" site-enabled "${SITE_ENABLED_EXISTED}"
	restore_target "${DEFAULT_ENABLED}" default-enabled "${DEFAULT_ENABLED_EXISTED}"
	if [ "${NGINX_WAS_ACTIVE}" = "1" ]; then
		nginx -t >/dev/null 2>&1 && systemctl restart nginx >/dev/null 2>&1 || true
	else
		systemctl stop nginx >/dev/null 2>&1 || true
	fi
	if [ "${NGINX_WAS_ENABLED}" != "1" ]; then
		systemctl disable nginx >/dev/null 2>&1 || true
	fi
}

cleanup_remote_tmp() {
	if [ -d "${REMOTE_TMP_DIR}" ]; then
		find "${REMOTE_TMP_DIR}" -depth -delete
	fi
}

on_exit() {
	local status="$?"
	trap - EXIT
	if [ "${status}" -ne 0 ] && [ "${TRANSACTION_COMMITTED}" != "1" ] && [ -d "${ROLLBACK_DIR}" ]; then
		echo "[warn] Edge activation failed; restoring the previous host NGINX files and service state." >&2
		rollback_remote_changes
	fi
	cleanup_remote_tmp
	exit "${status}"
}
trap on_exit EXIT

test "$(stat -c '%a' "${REMOTE_TMP_DIR}")" = "700"
chmod 600 "${REMOTE_TMP_KEY}"

for required_command in nginx curl stat install find cp systemctl; do
	if ! command -v "${required_command}" >/dev/null 2>&1; then
		echo "[fail] Host prerequisite is missing: ${required_command}. Install prerequisites before running the migration helper." >&2
		exit 1
	fi
done

# The loopback-only bundle proxy must already be healthy. This prevents the
# external edge from being activated against a missing or remotely exposed app.
curl -fsS --connect-timeout 3 --max-time 10 \
	-H "Host: ${DOMAIN}" \
	-H "X-Forwarded-Host: ${DOMAIN}" \
	-H "X-Forwarded-Proto: https" \
	-H "X-Forwarded-Port: 443" \
	"${UPSTREAM_URL%/}/health/live" >/dev/null

if [ "${PREPARE_ONLY}" != "1" ]; then
	if ! command -v docker >/dev/null 2>&1; then
		echo "[fail] Docker is required to prove that the retired project Caddy is stopped." >&2
		exit 1
	fi
	RUNNING_CADDY_IDS="$(docker ps -q \
		--filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_EFFECTIVE}" \
		--filter "label=com.docker.compose.service=caddy")"
	if [ -n "${RUNNING_CADDY_IDS}" ]; then
		echo "[fail] Retired Caddy is still running for Compose project ${COMPOSE_PROJECT_NAME_EFFECTIVE}: ${RUNNING_CADDY_IDS//$'\n'/ }." >&2
		echo "[fail] Run --prepare-only first, stop only these exact container IDs, then rerun without --prepare-only." >&2
		exit 1
	fi
fi

mkdir -p "${REMOTE_CERT_DIR}"
install -d -m 700 -- "${ROLLBACK_DIR}"
systemctl is-active --quiet nginx && NGINX_WAS_ACTIVE=1 || true
systemctl is-enabled --quiet nginx && NGINX_WAS_ENABLED=1 || true
backup_target "${SSL_CERT_REMOTE}" cert CERT_EXISTED
backup_target "${SSL_KEY_REMOTE}" key KEY_EXISTED
backup_target "${SITE_AVAILABLE}" site-available SITE_AVAILABLE_EXISTED
backup_target "${SITE_ENABLED}" site-enabled SITE_ENABLED_EXISTED
backup_target "${DEFAULT_ENABLED}" default-enabled DEFAULT_ENABLED_EXISTED

install -m 644 "${REMOTE_TMP_CERT}" "${SSL_CERT_REMOTE}"
install -m 600 "${REMOTE_TMP_KEY}" "${SSL_KEY_REMOTE}"
install -m 644 "${REMOTE_TMP_CONF}" "${SITE_AVAILABLE}"
ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"

nginx -t

if [ "${PREPARE_ONLY}" = "1" ]; then
	TRANSACTION_COMMITTED=1
	echo "[ok] External Edge files are prepared and nginx -t passed; NGINX was not started or restarted."
	exit 0
fi

rm -f "${DEFAULT_ENABLED}"
systemctl enable nginx
systemctl restart nginx

# Resolve the public hostname to loopback so the check proves this exact host
# edge, its certificate, and the loopback upstream without depending on DNS.
curl -fsS --connect-timeout 3 --max-time 10 \
	--resolve "${DOMAIN}:443:127.0.0.1" \
	"https://${DOMAIN}/health/live" >/dev/null
TRANSACTION_COMMITTED=1
EOF
REMOTE_CLEANUP_ARMED=0

if [ "${PREPARE_ONLY}" = "1" ]; then
	echo "[ok] Domain binding prepared for https://${DOMAIN}; public traffic was not switched."
	echo "[next] Record and stop only the retired Caddy container IDs for Compose project ${COMPOSE_PROJECT_NAME_EFFECTIVE}, then rerun without --prepare-only."
else
	echo "[ok] Domain binding applied for https://${DOMAIN}"
	echo "[ok] External edge is healthy; set NPCINK_CLOUD_EXTERNAL_EDGE_READY=true in the formal deploy env."
fi
