#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/deploy/common.sh"

npcink_ai_cloud_require_cmd bash
npcink_ai_cloud_require_cmd ssh
npcink_ai_cloud_require_cmd scp
npcink_ai_cloud_require_cmd tar
npcink_ai_cloud_require_cmd python3

SSH_HOST="${NPCINK_CLOUD_DEPLOY_SSH_HOST:-}"
SSH_USER="${NPCINK_CLOUD_DEPLOY_SSH_USER:-}"
SSH_PORT="${NPCINK_CLOUD_DEPLOY_SSH_PORT:-22}"
SSH_IDENTITY_FILE="${NPCINK_CLOUD_DEPLOY_IDENTITY_FILE:-}"
SSH_CONNECT_TIMEOUT_SECONDS="${NPCINK_CLOUD_DEPLOY_SSH_CONNECT_TIMEOUT_SECONDS:-10}"
REMOTE_DIR="${NPCINK_CLOUD_DEPLOY_REMOTE_DIR:-/opt/npcink-ai-cloud}"
BUNDLE_PATH="${NPCINK_CLOUD_DEPLOY_BUNDLE_PATH:-${ROOT_DIR}/dist/deploy-bundle.tgz}"
ENV_FILE="${NPCINK_CLOUD_ENV_FILE:-}"
IMAGE_PLATFORM="${NPCINK_CLOUD_IMAGE_PLATFORM:-}"
BASE_URL="${NPCINK_CLOUD_BASE_URL:-http://127.0.0.1:${NPCINK_CLOUD_PORT:-8010}}"
REMOTE_COMPOSE_FILE="${NPCINK_CLOUD_REMOTE_COMPOSE_FILE:-}"
SITE_ID="${NPCINK_CLOUD_SITE_ID:-site_smoke}"
KEY_ID="${NPCINK_CLOUD_KEY_ID:-key_default}"
SECRET="${NPCINK_CLOUD_SECRET:-npcink-cloud-test-secret}"
SCOPES="${NPCINK_CLOUD_SCOPES:-catalog:read,runtime:resolve,runtime:execute,runtime:read,stats:read}"
PROFILE_ID="${NPCINK_CLOUD_PROFILE_ID:-text.balanced}"
ABILITY_NAME="${NPCINK_CLOUD_ABILITY_NAME:-npcink-abilities-toolkit/build-article-block-plan}"
EXECUTION_KIND="${NPCINK_CLOUD_EXECUTION_KIND:-text}"
IDEMPOTENCY_SUFFIX="${NPCINK_CLOUD_IDEMPOTENCY_SUFFIX:-}"
PROMPT_TEXT="${NPCINK_CLOUD_PROMPT_TEXT:-remote deploy smoke request}"
EXPECTED_PROVIDER_ID="${NPCINK_CLOUD_EXPECTED_PROVIDER_ID:-}"
EXPECTED_MODEL_ID="${NPCINK_CLOUD_EXPECTED_MODEL_ID:-}"
EXPECTED_INSTANCE_ID="${NPCINK_CLOUD_EXPECTED_INSTANCE_ID:-}"
MEMBER_EMAIL="${NPCINK_CLOUD_MEMBER_EMAIL:-}"
SKIP_BUNDLE_BUILD=0
SKIP_SEED=0
SKIP_SMOKE=0
WITH_PORTAL_SMOKE=0
REFRESH_PROVIDERS="${NPCINK_CLOUD_REFRESH_PROVIDERS:-0}"
WITH_OPERATIONAL_READY="${NPCINK_CLOUD_WITH_OPERATIONAL_READY:-0}"
SKIP_FRONTEND_IMAGE="${NPCINK_CLOUD_SKIP_FRONTEND_IMAGE:-0}"

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
		--remote-dir)
			REMOTE_DIR="$2"
			shift 2
			;;
		--bundle-path)
			BUNDLE_PATH="$2"
			shift 2
			;;
		--env-file)
			ENV_FILE="$2"
			shift 2
			;;
		--image-platform)
			IMAGE_PLATFORM="$2"
			shift 2
			;;
		--base-url)
			BASE_URL="$2"
			shift 2
			;;
		--remote-compose-file)
			REMOTE_COMPOSE_FILE="$2"
			shift 2
			;;
		--site-id)
			SITE_ID="$2"
			shift 2
			;;
		--key-id)
			KEY_ID="$2"
			shift 2
			;;
		--secret)
			SECRET="$2"
			shift 2
			;;
		--scopes)
			SCOPES="$2"
			shift 2
			;;
		--profile-id)
			PROFILE_ID="$2"
			shift 2
			;;
		--ability-name)
			ABILITY_NAME="$2"
			shift 2
			;;
		--execution-kind)
			EXECUTION_KIND="$2"
			shift 2
			;;
		--idempotency-suffix)
			IDEMPOTENCY_SUFFIX="$2"
			shift 2
			;;
		--prompt-text)
			PROMPT_TEXT="$2"
			shift 2
			;;
		--expected-provider-id)
			EXPECTED_PROVIDER_ID="$2"
			shift 2
			;;
		--expected-model-id)
			EXPECTED_MODEL_ID="$2"
			shift 2
			;;
		--expected-instance-id)
			EXPECTED_INSTANCE_ID="$2"
			shift 2
			;;
		--member-email)
			MEMBER_EMAIL="$2"
			shift 2
			;;
		--skip-bundle-build)
			SKIP_BUNDLE_BUILD=1
			shift
			;;
		--skip-seed)
			SKIP_SEED=1
			shift
			;;
		--skip-smoke)
			SKIP_SMOKE=1
			shift
			;;
		--with-portal-smoke)
			WITH_PORTAL_SMOKE=1
			shift
			;;
		--refresh-providers)
			REFRESH_PROVIDERS=1
			shift
			;;
		--with-operational-ready)
			WITH_OPERATIONAL_READY=1
			shift
			;;
		--skip-frontend-image)
			SKIP_FRONTEND_IMAGE=1
			shift
			;;
		*)
			echo "[fail] Unknown argument: $1" >&2
			exit 1
			;;
	esac
done

# The checksum is a sidecar of the final CLI-selected bundle path. Deriving it
# before argument parsing would silently verify/upload the wrong receipt.
BUNDLE_CHECKSUM_PATH="${BUNDLE_PATH}.sha256"

if [ "${REMOTE_DIR}" = "/" ] || [[ ! "${REMOTE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
	echo "[fail] Remote deploy directory must be a non-root absolute path using only A-Z, a-z, 0-9, dot, underscore, dash, and slash." >&2
	exit 1
fi
case "/${REMOTE_DIR#/}/" in
	*//*|*/./*|*/../*)
		echo "[fail] Remote deploy directory must use canonical path segments." >&2
		exit 1
		;;
esac

if [ -z "${SSH_HOST}" ]; then
	echo "[fail] Missing --ssh-host or NPCINK_CLOUD_DEPLOY_SSH_HOST" >&2
	exit 1
fi

if [ -n "${SSH_IDENTITY_FILE}" ] && [ ! -f "${SSH_IDENTITY_FILE}" ]; then
	echo "[fail] SSH identity file not found: ${SSH_IDENTITY_FILE}" >&2
	exit 1
fi

if [ -n "${ENV_FILE}" ] && [ ! -f "${ENV_FILE}" ]; then
	echo "[fail] Env file not found: ${ENV_FILE}" >&2
	exit 1
fi

if [ -n "${REMOTE_COMPOSE_FILE}" ]; then
	echo "[info] Requested remote compose file: ${REMOTE_COMPOSE_FILE}"
fi

SSH_TARGET="${SSH_HOST}"
if [ -n "${SSH_USER}" ]; then
	SSH_TARGET="${SSH_USER}@${SSH_HOST}"
fi

SSH_ARGS=(
	-p "${SSH_PORT}"
	-o StrictHostKeyChecking=accept-new
	-o BatchMode=yes
	-o ConnectTimeout="${SSH_CONNECT_TIMEOUT_SECONDS}"
)
SCP_ARGS=(
	-P "${SSH_PORT}"
	-o StrictHostKeyChecking=accept-new
	-o BatchMode=yes
	-o ConnectTimeout="${SSH_CONNECT_TIMEOUT_SECONDS}"
)

if [ -n "${SSH_IDENTITY_FILE}" ]; then
	SSH_ARGS+=(-i "${SSH_IDENTITY_FILE}")
	SCP_ARGS+=(-i "${SSH_IDENTITY_FILE}")
fi

resolve_remote_platform() {
	local remote_arch="$1"
	case "${remote_arch}" in
		x86_64|amd64)
			echo "linux/amd64"
			;;
		aarch64|arm64)
			echo "linux/arm64"
			;;
		*)
			echo ""
			;;
	esac
}

remote_shell_arg() {
	printf '%q' "$1"
}

npcink_ai_cloud_start_timing_summary "Deploy Step Timing"

if ! npcink_ai_cloud_run_timed "ssh reachability check" ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "true" >/dev/null 2>&1; then
	echo "[fail] SSH target is not reachable: ${SSH_TARGET}:${SSH_PORT}" >&2
	echo "[fail] Check NPCINK_CLOUD_DEPLOY_IDENTITY_FILE, firewall/security group, and sshd." >&2
	exit 1
fi
REMOTE_ARCH_STARTED_AT="$(date +%s)"
REMOTE_ARCH="$(ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "uname -m")"
REMOTE_ARCH_DURATION_SECONDS=$(($(date +%s) - REMOTE_ARCH_STARTED_AT))
echo "[timing] resolve remote architecture: ${REMOTE_ARCH_DURATION_SECONDS}s"
npcink_ai_cloud_append_timing_summary "resolve remote architecture" "${REMOTE_ARCH_DURATION_SECONDS}"
REMOTE_PLATFORM="$(resolve_remote_platform "${REMOTE_ARCH}")"
if [ -z "${REMOTE_PLATFORM}" ]; then
	echo "[fail] Unsupported remote architecture: ${REMOTE_ARCH}" >&2
	exit 1
fi
if [ -n "${IMAGE_PLATFORM}" ] && [ "${IMAGE_PLATFORM}" != "${REMOTE_PLATFORM}" ]; then
	echo "[fail] Requested image platform ${IMAGE_PLATFORM} does not match remote architecture ${REMOTE_ARCH} (${REMOTE_PLATFORM})." >&2
	exit 1
fi
IMAGE_PLATFORM="${REMOTE_PLATFORM}"
echo "[info] Remote architecture ${REMOTE_ARCH}; selected image platform ${IMAGE_PLATFORM}"

if [ "${SKIP_BUNDLE_BUILD}" -eq 0 ]; then
	echo "[info] Building deploy bundle"
	npcink_ai_cloud_run_timed "build deploy bundle" \
		env \
		NPCINK_CLOUD_IMAGE_PLATFORM="${IMAGE_PLATFORM}" \
		NPCINK_CLOUD_SKIP_FRONTEND_IMAGE="${SKIP_FRONTEND_IMAGE}" \
		bash "${ROOT_DIR}/deploy/bundle-images.sh"
fi

if [ ! -f "${BUNDLE_PATH}" ]; then
	echo "[fail] Deploy bundle not found: ${BUNDLE_PATH}" >&2
	exit 1
fi
if [ ! -f "${BUNDLE_CHECKSUM_PATH}" ]; then
	echo "[fail] Deploy bundle checksum not found: ${BUNDLE_CHECKSUM_PATH}" >&2
	exit 1
fi
npcink_ai_cloud_run_timed "verify local deploy bundle archive" \
	bash "${ROOT_DIR}/deploy/verify-release-bundle.sh" --archive \
	"${BUNDLE_PATH}" "${BUNDLE_CHECKSUM_PATH}"
BUNDLE_PLATFORM="$(
	python3 "${ROOT_DIR}/scripts/verify-release-bundle-manifest.py" archive-platform \
		--bundle "${BUNDLE_PATH}" --checksum "${BUNDLE_CHECKSUM_PATH}"
)"
if [ "${BUNDLE_PLATFORM}" != "${IMAGE_PLATFORM}" ]; then
	echo "[fail] Deploy bundle platform ${BUNDLE_PLATFORM} does not match target platform ${IMAGE_PLATFORM}." >&2
	exit 1
fi

BUNDLE_CHECKSUM_LINE="$(cat "${BUNDLE_CHECKSUM_PATH}")"
BUNDLE_SHA256="${BUNDLE_CHECKSUM_LINE%% *}"
if [[ ! "${BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
	echo "[fail] Deploy bundle checksum receipt is invalid." >&2
	exit 1
fi
UPLOAD_ID="${BUNDLE_SHA256:0:16}-$(date -u +%Y%m%d%H%M%S)-$$"
RELEASE_NAME="release-${UPLOAD_ID}"
REMOTE_INCOMING_DIR="${REMOTE_DIR}/.incoming/${UPLOAD_ID}"
REMOTE_BUNDLE_PATH="${REMOTE_INCOMING_DIR}/deploy-bundle.tgz"
REMOTE_BUNDLE_CHECKSUM_PATH="${REMOTE_BUNDLE_PATH}.sha256"
REMOTE_PREFLIGHT_DIR="${REMOTE_INCOMING_DIR}/preflight"
REMOTE_ENV_BASENAME=".env.deploy"
REMOTE_ENV_PATH=""

echo "[info] Preparing remote directory ${SSH_TARGET}:${REMOTE_DIR}"
npcink_ai_cloud_run_timed "prepare remote directory" \
	ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" \
		"mkdir -p $(remote_shell_arg "${REMOTE_DIR}") $(remote_shell_arg "${REMOTE_PREFLIGHT_DIR}/deploy") $(remote_shell_arg "${REMOTE_PREFLIGHT_DIR}/scripts") && chmod 0700 $(remote_shell_arg "${REMOTE_INCOMING_DIR}")"

echo "[info] Uploading deploy bundle"
npcink_ai_cloud_run_timed "upload deploy bundle" \
	scp "${SCP_ARGS[@]}" "${BUNDLE_PATH}" "${SSH_TARGET}:${REMOTE_BUNDLE_PATH}"
npcink_ai_cloud_run_timed "upload deploy bundle checksum" \
	scp "${SCP_ARGS[@]}" "${BUNDLE_CHECKSUM_PATH}" "${SSH_TARGET}:${REMOTE_BUNDLE_CHECKSUM_PATH}"
npcink_ai_cloud_run_timed "upload deploy bundle preflight" \
	scp "${SCP_ARGS[@]}" \
	"${ROOT_DIR}/deploy/verify-release-bundle.sh" \
	"${SSH_TARGET}:${REMOTE_PREFLIGHT_DIR}/deploy/verify-release-bundle.sh"
npcink_ai_cloud_run_timed "upload deploy bundle manifest verifier" \
	scp "${SCP_ARGS[@]}" \
	"${ROOT_DIR}/scripts/verify-release-bundle-manifest.py" \
	"${SSH_TARGET}:${REMOTE_PREFLIGHT_DIR}/scripts/verify-release-bundle-manifest.py"
npcink_ai_cloud_run_timed "verify remote deploy bundle before extraction" \
	ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" \
		"set +e; bash $(remote_shell_arg "${REMOTE_PREFLIGHT_DIR}/deploy/verify-release-bundle.sh") --archive $(remote_shell_arg "${REMOTE_BUNDLE_PATH}") $(remote_shell_arg "${REMOTE_BUNDLE_CHECKSUM_PATH}"); preflight_status=\$?; rm -rf $(remote_shell_arg "${REMOTE_PREFLIGHT_DIR}"); exit \${preflight_status}"

if [ -n "${ENV_FILE}" ]; then
	REMOTE_ENV_PATH="${REMOTE_INCOMING_DIR}/${REMOTE_ENV_BASENAME}"
	echo "[info] Uploading env file"
	npcink_ai_cloud_run_timed "upload env file" \
		scp "${SCP_ARGS[@]}" "${ENV_FILE}" "${SSH_TARGET}:${REMOTE_ENV_PATH}"
	npcink_ai_cloud_run_timed "restrict uploaded env file" \
		ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" \
			"chmod 0600 $(remote_shell_arg "${REMOTE_ENV_PATH}") && test \"\$(stat -c '%a' $(remote_shell_arg "${REMOTE_ENV_PATH}"))\" = 600"
fi

if [ "${WITH_OPERATIONAL_READY}" = "1" ]; then
	echo "[info] Operational readiness gate: enabled"
else
	echo "[info] Operational readiness gate: disabled"
fi

echo "[info] Running remote deploy sequence on ${SSH_TARGET}"
npcink_ai_cloud_run_timed "remote deploy sequence" \
	ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" bash -s -- \
	"$(remote_shell_arg "${REMOTE_DIR}")" \
	"$(remote_shell_arg "${RELEASE_NAME}")" \
	"$(remote_shell_arg "${REMOTE_ENV_BASENAME}")" \
	"$(remote_shell_arg "${SITE_ID}")" \
	"$(remote_shell_arg "${KEY_ID}")" \
	"$(remote_shell_arg "${SECRET}")" \
	"$(remote_shell_arg "${SCOPES}")" \
	"$(remote_shell_arg "${BASE_URL}")" \
	"$(remote_shell_arg "${PROFILE_ID}")" \
	"$(remote_shell_arg "${ABILITY_NAME}")" \
	"$(remote_shell_arg "${EXECUTION_KIND}")" \
	"$(remote_shell_arg "${IDEMPOTENCY_SUFFIX}")" \
	"$(remote_shell_arg "${PROMPT_TEXT}")" \
	"$(remote_shell_arg "${EXPECTED_PROVIDER_ID}")" \
	"$(remote_shell_arg "${EXPECTED_MODEL_ID}")" \
	"$(remote_shell_arg "${EXPECTED_INSTANCE_ID}")" \
	"$(remote_shell_arg "${MEMBER_EMAIL}")" \
	"$(remote_shell_arg "${SKIP_SEED}")" \
	"$(remote_shell_arg "${SKIP_SMOKE}")" \
	"$(remote_shell_arg "${REMOTE_ENV_PATH}")" \
	"$(remote_shell_arg "${WITH_PORTAL_SMOKE}")" \
	"$(remote_shell_arg "${SKIP_FRONTEND_IMAGE}")" \
	"$(remote_shell_arg "${REMOTE_COMPOSE_FILE}")" \
	"$(remote_shell_arg "${REFRESH_PROVIDERS}")" \
	"$(remote_shell_arg "${WITH_OPERATIONAL_READY}")" \
	"$(remote_shell_arg "${REMOTE_BUNDLE_PATH}")" \
	"$(remote_shell_arg "${REMOTE_INCOMING_DIR}")" <<'EOF'
set -euo pipefail

REMOTE_DIR="$1"
RELEASE_NAME="$2"
REMOTE_ENV_BASENAME="$3"
SITE_ID="$4"
KEY_ID="$5"
SECRET="$6"
SCOPES="$7"
BASE_URL="$8"
PROFILE_ID="${9:-text.balanced}"
ABILITY_NAME="${10:-npcink-abilities-toolkit/build-article-block-plan}"
EXECUTION_KIND="${11:-text}"
IDEMPOTENCY_SUFFIX="${12:-}"
PROMPT_TEXT="${13:-remote deploy smoke request}"
EXPECTED_PROVIDER_ID="${14:-}"
EXPECTED_MODEL_ID="${15:-}"
EXPECTED_INSTANCE_ID="${16:-}"
MEMBER_EMAIL="${17:-}"
SKIP_SEED="${18:-0}"
SKIP_SMOKE="${19:-0}"
REMOTE_ENV_PATH="${20:-}"
WITH_PORTAL_SMOKE="${21:-0}"
SKIP_FRONTEND_IMAGE="${22:-0}"
REMOTE_COMPOSE_FILE="${23:-}"
REFRESH_PROVIDERS="${24:-0}"
WITH_OPERATIONAL_READY="${25:-0}"
REMOTE_BUNDLE_PATH="${26:-}"
REMOTE_INCOMING_DIR="${27:-}"

RELEASE_DIR="${REMOTE_DIR}/${RELEASE_NAME}"
CURRENT_LINK="${REMOTE_DIR}/current"
DEPLOY_LOCK_DIR="${REMOTE_DIR}/.deploy-lock"
FAILURE_MARKER="${REMOTE_DIR}/.cutover-failed"
RELEASE_STATE_ROOT="${REMOTE_DIR}/.release-state"
RELEASE_STATE_DIR="${RELEASE_STATE_ROOT}/${RELEASE_NAME}"
RELEASE_ENV_FILE="${RELEASE_STATE_DIR}/env.deploy"
ROLLBACK_IMAGE_MAP="${RELEASE_STATE_DIR}/rollback-images.tsv"
ROLLBACK_TAG_SUFFIX="${RELEASE_NAME#release-}"
REMOTE_DIR_CANONICAL="$(readlink -f "${REMOTE_DIR}")"
PREVIOUS_RELEASE_DIR=""
PREVIOUS_ENV_FILE=""
PREVIOUS_COMPOSE_FILE=""
PREVIOUS_COMPOSE_PROJECT_NAME=""
NEW_COMPOSE_FILE=""
NEW_COMPOSE_RELATIVE=""
COMPOSE_PROJECT_NAME_EFFECTIVE="npcink-ai-cloud"
APPLICATION_SERVICES=(caddy proxy)
if [ "${SKIP_FRONTEND_IMAGE}" != "1" ]; then
	# Backend-only releases deliberately preserve the existing frontend
	# container promised by --skip-frontend-image.
	APPLICATION_SERVICES+=(frontend)
fi
APPLICATION_SERVICES+=(api worker callback-worker ops-worker jaeger otel-collector)
RECOVERY_REQUIRED_SERVICES=(proxy frontend api worker callback-worker ops-worker)
PREVIOUS_WRITER_SERVICES=(api worker callback-worker ops-worker)
APPLICATIONS_STOPPED=0
MIGRATION_STARTED=0
CUTOVER_MUTATION_STARTED=0
DEPLOY_SUCCEEDED=0
CUTOVER_PHASE="initialize"

if ! mkdir "${DEPLOY_LOCK_DIR}" 2>/dev/null; then
	echo "[fail] Another deployment is already active: ${DEPLOY_LOCK_DIR}" >&2
	exit 1
fi

remote_run_timed() {
	local label="$1"
	shift
	local started_at
	local completed_at
	local duration_seconds
	local status
	local restore_errexit=0

	case "$-" in
		*e*)
			restore_errexit=1
			;;
	esac

	started_at="$(date +%s)"
	echo "[timing] ${label}: start"
	set +e
	"$@"
	status=$?
	if [ "${restore_errexit}" -eq 1 ]; then
		set -e
	else
		set +e
	fi
	completed_at="$(date +%s)"
	duration_seconds=$((completed_at - started_at))
	if [ "${status}" -eq 0 ]; then
		echo "[timing] ${label}: ${duration_seconds}s"
	else
		echo "[timing] ${label}: ${duration_seconds}s (failed: ${status})" >&2
	fi
	return "${status}"
}

atomic_set_current() {
	local target_release="$1"
	local next_link="${CURRENT_LINK}.next.$$"
	rm -f "${next_link}"
	ln -s "${target_release}" "${next_link}"
	mv -Tf "${next_link}" "${CURRENT_LINK}"
}

restore_previous_current_pointer() {
	if [ -n "${PREVIOUS_RELEASE_DIR}" ]; then
		atomic_set_current "${PREVIOUS_RELEASE_DIR}"
	else
		rm -f "${CURRENT_LINK}"
	fi
}

assert_previous_current_pointer() {
	local resolved=""
	if [ -n "${PREVIOUS_RELEASE_DIR}" ]; then
		[ -L "${CURRENT_LINK}" ] || {
			echo "[fail] Current release pointer was not restored as a symlink." >&2
			return 1
		}
		resolved="$(readlink -f "${CURRENT_LINK}")"
		if [ "${resolved}" != "${PREVIOUS_RELEASE_DIR}" ]; then
			echo "[fail] Current release pointer does not reference the previous release." >&2
			return 1
		fi
	elif [ -e "${CURRENT_LINK}" ] || [ -L "${CURRENT_LINK}" ]; then
		echo "[fail] Current release pointer exists even though no previous release was active." >&2
		return 1
	fi
}

resolve_previous_release() {
	local resolved=""
	local resolved_parent=""
	local resolved_name=""
	if [ -L "${CURRENT_LINK}" ]; then
		resolved="$(readlink -f "${CURRENT_LINK}")"
		if [ -z "${resolved}" ] || [ ! -d "${resolved}" ]; then
			echo "[fail] The current release link is broken: ${CURRENT_LINK}" >&2
			return 1
		fi
		resolved_parent="$(dirname "${resolved}")"
		resolved_name="$(basename "${resolved}")"
		if [ "${resolved_parent}" != "${REMOTE_DIR_CANONICAL}" ] || \
			[[ ! "${resolved_name}" =~ ^release-[A-Za-z0-9._-]+$ ]]; then
			echo "[fail] The current release is not a direct managed release child: ${resolved}" >&2
			return 1
		fi
		PREVIOUS_RELEASE_DIR="${resolved}"
	elif [ -e "${CURRENT_LINK}" ]; then
		echo "[fail] The current release path must be a symbolic link: ${CURRENT_LINK}" >&2
		return 1
	fi
}

write_failure_marker() {
	local outcome="$1"
	local marker_tmp="${FAILURE_MARKER}.tmp.$$"
	(
		umask 077
		printf 'phase=%s\noutcome=%s\nfailed_release=%s\nprevious_release=%s\n' \
			"${CUTOVER_PHASE}" "${outcome}" "${RELEASE_DIR}" "${PREVIOUS_RELEASE_DIR}" \
			>"${marker_tmp}"
	)
	mv -f "${marker_tmp}" "${FAILURE_MARKER}"
	chmod 0600 "${FAILURE_MARKER}"
}

restore_release_image_tags() {
	local target_reference=""
	local rollback_reference=""
	local previous_image_id=""
	local restored_image_id=""
	local restore_failed=0

	if [ ! -f "${ROLLBACK_IMAGE_MAP}" ]; then
		return 0
	fi

	while IFS=$'\t' read -r target_reference rollback_reference previous_image_id; do
		[ -n "${target_reference}" ] || continue
		if [ "${rollback_reference}" = "-" ]; then
			if docker image inspect "${target_reference}" >/dev/null 2>&1; then
				if ! docker image rm "${target_reference}" >/dev/null 2>&1; then
					echo "[fail] Could not remove release image tag that was absent before cutover: ${target_reference}" >&2
					restore_failed=1
					continue
				fi
			elif ! docker info >/dev/null 2>&1; then
				echo "[fail] Docker could not prove the prior absence of release image tag: ${target_reference}" >&2
				restore_failed=1
				continue
			fi
			if docker image inspect "${target_reference}" >/dev/null 2>&1; then
				echo "[fail] Release image tag still exists after recovery removal: ${target_reference}" >&2
				restore_failed=1
			elif ! docker info >/dev/null 2>&1; then
				echo "[fail] Docker could not prove release image tag removal: ${target_reference}" >&2
				restore_failed=1
			fi
			continue
		fi
		if ! docker tag "${rollback_reference}" "${target_reference}"; then
			echo "[fail] Could not restore release image tag: ${target_reference}" >&2
			restore_failed=1
			continue
		fi
		if ! restored_image_id="$(docker image inspect --format '{{.Id}}' "${target_reference}")"; then
			echo "[fail] Could not verify restored release image tag: ${target_reference}" >&2
			restore_failed=1
		elif [ "${restored_image_id}" != "${previous_image_id}" ]; then
			echo "[fail] Restored release image tag has the wrong image ID: ${target_reference}" >&2
			restore_failed=1
		fi
	done <"${ROLLBACK_IMAGE_MAP}"

	return "${restore_failed}"
}

discard_rollback_image_tags() {
	local _target_reference=""
	local rollback_reference=""
	local _previous_image_id=""
	if [ ! -f "${ROLLBACK_IMAGE_MAP}" ]; then
		return 0
	fi
	while IFS=$'\t' read -r _target_reference rollback_reference _previous_image_id; do
		if [ -n "${rollback_reference}" ] && [ "${rollback_reference}" != "-" ]; then
			docker image rm "${rollback_reference}" >/dev/null 2>&1 || true
		fi
	done <"${ROLLBACK_IMAGE_MAP}"
}

application_container_ids() {
	local service_name="$1"
	docker ps -aq \
		--filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_EFFECTIVE}" \
		--filter "label=com.docker.compose.service=${service_name}"
}

stop_application_services() {
	local service_name=""
	local container_id=""
	# Mark the deployment as stopped before touching the first container. A
	# partial stop must take the same recovery path as a complete stop.
	APPLICATIONS_STOPPED=1
	for service_name in "${APPLICATION_SERVICES[@]}"; do
		while IFS= read -r container_id; do
			[ -n "${container_id}" ] || continue
			docker stop --time 30 "${container_id}"
			docker rm -f "${container_id}"
		done < <(application_container_ids "${service_name}")
	done
}

force_fail_closed() {
	local service_name=""
	local container_id=""
	APPLICATIONS_STOPPED=1
	for service_name in "${APPLICATION_SERVICES[@]}"; do
		while IFS= read -r container_id; do
			[ -n "${container_id}" ] || continue
			docker stop --time 10 "${container_id}" >/dev/null 2>&1 || true
			docker rm -f "${container_id}" >/dev/null 2>&1 || true
		done < <(application_container_ids "${service_name}" 2>/dev/null)
	done
}

assert_application_services_stopped() {
	local service_name=""
	local running_ids=""
	for service_name in "${APPLICATION_SERVICES[@]}"; do
		if ! running_ids="$(docker ps -q \
			--filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_EFFECTIVE}" \
			--filter "label=com.docker.compose.service=${service_name}")"; then
			echo "[fail] Docker could not prove application services are stopped." >&2
			return 1
		fi
		if [ -n "${running_ids}" ]; then
			echo "[fail] Application service is still running during atomic cutover: ${service_name}" >&2
			return 1
		fi
	done
	echo "[ok] Public and write-capable application services are stopped."
}

compose_previous_release() {
	local clean_env=(env -i "PATH=${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}")
	local passthrough_key=""
	# The new release env has already been loaded into this shell. Do not let
	# those values outrank --env-file while reconstructing the previous release.
	# Preserve only process/Docker transport settings needed to reach the same
	# daemon; all Compose interpolation comes from PREVIOUS_ENV_FILE.
	for passthrough_key in \
		HOME USER LOGNAME TMPDIR XDG_CONFIG_HOME XDG_RUNTIME_DIR SSH_AUTH_SOCK \
		DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH \
		DOCKER_TLS_VERIFY DOCKER_API_VERSION; do
		if [ -n "${!passthrough_key+x}" ]; then
			clean_env+=("${passthrough_key}=${!passthrough_key}")
		fi
	done

	"${clean_env[@]}" \
		COMPOSE_PROJECT_NAME="${PREVIOUS_COMPOSE_PROJECT_NAME}" \
		NPCINK_CLOUD_BACKEND_ENV_FILE="${PREVIOUS_ENV_FILE}" \
		docker compose \
		--project-directory "${PREVIOUS_RELEASE_DIR}" \
		--env-file "${PREVIOUS_ENV_FILE}" \
		-f "${PREVIOUS_COMPOSE_FILE}" "$@"
}

previous_release_is_restartable() {
	local services=""
	local images=""
	local service_name=""
	local image_reference=""

	[ -n "${PREVIOUS_RELEASE_DIR}" ] || return 1
	[ -d "${PREVIOUS_RELEASE_DIR}" ] || return 1
	[ -f "${PREVIOUS_ENV_FILE}" ] || return 1
	[ "$(stat -c '%a' "${PREVIOUS_ENV_FILE}")" = "600" ] || return 1
	[ -f "${PREVIOUS_COMPOSE_FILE}" ] || return 1

	services="$(compose_previous_release config --services 2>/dev/null)" || return 1
	while IFS= read -r service_name; do
		case "${service_name}" in
			caddy|jaeger|otel-collector)
				echo "[warn] Previous release contains a retired production service: ${service_name}" >&2
				return 1
				;;
		esac
	done <<<"${services}"

	images="$(compose_previous_release config --images 2>/dev/null)" || return 1
	while IFS= read -r image_reference; do
		[ -n "${image_reference}" ] || continue
		docker image inspect "${image_reference}" >/dev/null 2>&1 || return 1
	done <<<"${images}"
	return 0
}

assert_previous_writer_project_alignment() {
	local service_name=""
	local required_services=("${PREVIOUS_WRITER_SERVICES[@]}")
	local container_ids=""
	local container_count=0
	local container_id=""
	local observed_project=""
	local running=""

	if [ -z "${PREVIOUS_RELEASE_DIR}" ]; then
		if [ "${SKIP_FRONTEND_IMAGE}" = "1" ]; then
			echo "[fail] --skip-frontend-image requires an existing managed release with a running frontend to preserve." >&2
			return 1
		fi
		return 0
	fi
	if [ "${SKIP_FRONTEND_IMAGE}" = "1" ]; then
		required_services+=(frontend)
	fi
	for service_name in "${required_services[@]}"; do
		if ! container_ids="$(compose_previous_release ps -q "${service_name}")"; then
			echo "[fail] Could not inspect the previous ${service_name} container before cutover." >&2
			return 1
		fi
		container_count="$(printf '%s\n' "${container_ids}" | awk 'NF { count += 1 } END { print count + 0 }')"
		if [ "${container_count}" -ne 1 ]; then
			echo "[fail] Previous release must have exactly one running ${service_name} container under Compose project ${PREVIOUS_COMPOSE_PROJECT_NAME}; found ${container_count}." >&2
			return 1
		fi
		container_id="${container_ids}"
		if ! observed_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "${container_id}")"; then
			echo "[fail] Could not inspect the previous ${service_name} container labels." >&2
			return 1
		fi
		if ! running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"; then
			echo "[fail] Could not inspect the previous ${service_name} container state." >&2
			return 1
		fi
		if [ "${observed_project}" != "${PREVIOUS_COMPOSE_PROJECT_NAME}" ] || [ "${running}" != "true" ]; then
			echo "[fail] Previous ${service_name} container is not a running member of expected Compose project ${PREVIOUS_COMPOSE_PROJECT_NAME}." >&2
			return 1
		fi
	done
	echo "[ok] Previous write-capable containers belong to the expected Compose project."
}

assert_previous_release_services_running() {
	local service_name=""
	local container_ids=""
	local container_id=""
	local container_state=""
	local container_count=0

	for service_name in "${RECOVERY_REQUIRED_SERVICES[@]}"; do
		container_ids="$(compose_previous_release ps -q "${service_name}")" || return 1
		container_count="$(printf '%s\n' "${container_ids}" | awk 'NF { count += 1 } END { print count + 0 }')"
		if [ "${container_count}" -ne 1 ]; then
			echo "[fail] Previous release service must have exactly one container after recovery: ${service_name} (found ${container_count})" >&2
			return 1
		fi
		while IFS= read -r container_id; do
			[ -n "${container_id}" ] || continue
			container_state="$(docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.RestartCount}}' "${container_id}")" || return 1
			if [ "${container_state}" != "true false 0" ]; then
				echo "[fail] Previous release service is not stably running: ${service_name}" >&2
				return 1
			fi
		done <<<"${container_ids}"
	done
}

restart_previous_release() {
	if ! remote_run_timed "restore previous release services" \
		compose_previous_release up -d --pull never --no-build --force-recreate --remove-orphans; then
		echo "[fail] Previous release Compose start failed." >&2
		return 1
	fi
	if ! assert_previous_release_services_running; then
		echo "[fail] Previous release containers could not be proven running." >&2
		return 1
	fi
	if ! npcink_ai_cloud_wait_for_ready "${BASE_URL}" 20 2; then
		echo "[fail] Previous release did not become healthy after recovery." >&2
		return 1
	fi
	atomic_set_current "${PREVIOUS_RELEASE_DIR}"
	assert_previous_current_pointer
	APPLICATIONS_STOPPED=0
	echo "[ok] Previous release restored after pre-migration failure."
}

prove_fail_closed_recovery() {
	local proven_outcome="$1"
	local success_message="$2"
	local recovery_failed=0

	force_fail_closed
	if ! assert_application_services_stopped; then
		recovery_failed=1
	fi
	if ! restore_previous_current_pointer; then
		recovery_failed=1
	elif ! assert_previous_current_pointer; then
		recovery_failed=1
	fi
	if [ "${recovery_failed}" -eq 0 ]; then
		if ! write_failure_marker "${proven_outcome}"; then
			recovery_failed=1
		fi
	fi
	if [ "${recovery_failed}" -ne 0 ]; then
		write_failure_marker "recovery_incomplete" >/dev/null 2>&1 || true
		echo "[fail] Recovery could not prove services stopped, pointer restored, and failure evidence written; deploy lock retained." >&2
		return 1
	fi
	echo "${success_message}" >&2
}

recover_failed_cutover() {
	local image_restore_status=0

	echo "[warn] Recovering failed production cutover at phase: ${CUTOVER_PHASE}" >&2
	if [ "${CUTOVER_MUTATION_STARTED}" != "1" ]; then
		if ! write_failure_marker "validation_failed_before_mutation"; then
			write_failure_marker "recovery_incomplete" >/dev/null 2>&1 || true
			return 1
		fi
		echo "[ok] Validation failed before any image/container mutation; running services were untouched." >&2
		return 0
	fi
	restore_release_image_tags || image_restore_status=$?
	if [ "${image_restore_status}" -ne 0 ]; then
		# Tag restoration is part of the pre-migration recovery point. Even when
		# stopped services and the pointer can be proven, leave the lock in place
		# so a later deploy cannot snapshot the wrong image set as its baseline.
		prove_fail_closed_recovery \
			"recovery_incomplete" \
			"[fail] Image-tag recovery is incomplete; public/write services remain stopped and the deploy lock is retained." || true
		return 1
	fi

	if [ "${MIGRATION_STARTED}" = "1" ]; then
		# Database compatibility with the old application is no longer proven.
		# Never manufacture a rollback by starting the old API after this point.
		prove_fail_closed_recovery \
			"fail_closed_after_migration_started" \
			"[fail] Migration had started; public/write services remain stopped for operator recovery."
		return $?
	fi

	if [ "${APPLICATIONS_STOPPED}" = "0" ] && [ -n "${PREVIOUS_RELEASE_DIR}" ]; then
		if ! atomic_set_current "${PREVIOUS_RELEASE_DIR}" || \
			! assert_previous_current_pointer || \
			! write_failure_marker "previous_release_remained_running"; then
			write_failure_marker "recovery_incomplete" >/dev/null 2>&1 || true
			return 1
		fi
		echo "[ok] Previous release remained running; image tags were restored."
		return 0
	fi

	if previous_release_is_restartable; then
		if restart_previous_release; then
			if write_failure_marker "previous_release_restored"; then
				return 0
			fi
			write_failure_marker "recovery_incomplete" >/dev/null 2>&1 || true
			return 1
		fi
	fi

	prove_fail_closed_recovery \
		"fail_closed_without_safe_rollback" \
		"[fail] A safe previous release could not be proven; public/write services remain stopped."
}

on_deploy_exit() {
	local exit_status="$?"
	local recovery_status=0
	trap - EXIT
	set +e
	if [ "${exit_status}" -ne 0 ] && [ "${DEPLOY_SUCCEEDED}" != "1" ]; then
		recover_failed_cutover || recovery_status=$?
	fi
	if [ "${recovery_status}" -eq 0 ]; then
		rmdir "${DEPLOY_LOCK_DIR}" >/dev/null 2>&1 || true
	else
		echo "[fail] Deployment lock retained for operator recovery: ${DEPLOY_LOCK_DIR}" >&2
	fi
	exit "${exit_status}"
}
trap on_deploy_exit EXIT

resolve_previous_release

# Archive integrity, schema, complete payload hashes, and tar paths were checked
# on the remote host before this extraction. The extracted directory is checked
# again by remote-load-and-up before the first docker load.
mkdir -p "${RELEASE_DIR}"
remote_run_timed "remote extract bundle" tar xzf "${REMOTE_BUNDLE_PATH}" -C "${RELEASE_DIR}"

. "${RELEASE_DIR}/deploy/common.sh"

install -d -m 0700 "${RELEASE_STATE_ROOT}" "${RELEASE_STATE_DIR}"
if [ "$(stat -c '%a' "${RELEASE_STATE_ROOT}")" != "700" ] || \
	[ "$(stat -c '%a' "${RELEASE_STATE_DIR}")" != "700" ]; then
	echo "[fail] Release state directories must have mode 700." >&2
	exit 1
fi

if [ -n "${PREVIOUS_RELEASE_DIR}" ]; then
	PREVIOUS_ENV_FILE="$(NPCINK_CLOUD_ENV_FILE= npcink_ai_cloud_resolve_env_file "${PREVIOUS_RELEASE_DIR}")"
	if [ -z "${PREVIOUS_ENV_FILE}" ] || [ ! -f "${PREVIOUS_ENV_FILE}" ]; then
		echo "[fail] Previous release env file is missing." >&2
		exit 1
	fi
	PREVIOUS_COMPOSE_PROJECT_NAME="$(npcink_ai_cloud_compose_project_name_from_env "${PREVIOUS_ENV_FILE}")"
fi

NEW_ENV_SOURCE=""
if [ -n "${REMOTE_ENV_PATH}" ] && [ -f "${REMOTE_ENV_PATH}" ]; then
	NEW_ENV_SOURCE="${REMOTE_ENV_PATH}"
elif [ -n "${PREVIOUS_ENV_FILE}" ]; then
	NEW_ENV_SOURCE="${PREVIOUS_ENV_FILE}"
elif [ -f "${REMOTE_DIR}/${REMOTE_ENV_BASENAME}" ]; then
	NEW_ENV_SOURCE="${REMOTE_DIR}/${REMOTE_ENV_BASENAME}"
fi
if [ -z "${NEW_ENV_SOURCE}" ]; then
	echo "[fail] No deployment env source is available for ${RELEASE_NAME}." >&2
	exit 1
fi
if [ "${NEW_ENV_SOURCE}" != "${RELEASE_ENV_FILE}" ]; then
	install -m 0600 "${NEW_ENV_SOURCE}" "${RELEASE_ENV_FILE}"
else
	chmod 0600 "${RELEASE_ENV_FILE}"
fi
if [ "$(stat -c '%a' "${RELEASE_ENV_FILE}")" != "600" ]; then
	echo "[fail] Per-release env file mode must be 600." >&2
	exit 1
fi
export NPCINK_CLOUD_ENV_FILE="${RELEASE_ENV_FILE}"
export NPCINK_CLOUD_BACKEND_ENV_FILE="${RELEASE_ENV_FILE}"
COMPOSE_PROJECT_NAME_EFFECTIVE="$(npcink_ai_cloud_compose_project_name_from_env "${RELEASE_ENV_FILE}")"
if [ -n "${PREVIOUS_RELEASE_DIR}" ] && \
	[ "${PREVIOUS_COMPOSE_PROJECT_NAME}" != "${COMPOSE_PROJECT_NAME_EFFECTIVE}" ]; then
	echo "[fail] Compose project rename is not supported during ordinary deployment: ${PREVIOUS_COMPOSE_PROJECT_NAME} -> ${COMPOSE_PROJECT_NAME_EFFECTIVE}." >&2
	exit 1
fi
export NPCINK_CLOUD_COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME_EFFECTIVE}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME_EFFECTIVE}"

export NPCINK_CLOUD_SKIP_FRONTEND_IMAGE="${SKIP_FRONTEND_IMAGE}"
if [ -n "${REMOTE_COMPOSE_FILE}" ]; then
	export NPCINK_CLOUD_COMPOSE_FILE="${RELEASE_DIR}/${REMOTE_COMPOSE_FILE}"
	if [ ! -f "${NPCINK_CLOUD_COMPOSE_FILE}" ]; then
		echo "[fail] Remote compose file not found: ${NPCINK_CLOUD_COMPOSE_FILE}" >&2
		exit 1
	fi
	echo "[info] Remote compose file: ${NPCINK_CLOUD_COMPOSE_FILE}"
fi

npcink_ai_cloud_load_env_file "${RELEASE_DIR}"
npcink_ai_cloud_require_cmd docker
npcink_ai_cloud_require_cmd curl
npcink_ai_cloud_require_cmd python3

NEW_COMPOSE_FILE="${NPCINK_CLOUD_COMPOSE_FILE:-${RELEASE_DIR}/docker-compose.prod.yml}"
if [[ "${NEW_COMPOSE_FILE}" != /* ]]; then
	NEW_COMPOSE_FILE="${RELEASE_DIR}/${NEW_COMPOSE_FILE#./}"
fi
if [ ! -f "${NEW_COMPOSE_FILE}" ]; then
	echo "[fail] New release Compose file not found: ${NEW_COMPOSE_FILE}" >&2
	exit 1
fi
NEW_COMPOSE_FILE="$(readlink -f "${NEW_COMPOSE_FILE}")"
case "${NEW_COMPOSE_FILE}" in
	"${RELEASE_DIR}"/*)
		NEW_COMPOSE_RELATIVE="${NEW_COMPOSE_FILE#"${RELEASE_DIR}"/}"
		;;
	*)
		echo "[fail] New release Compose file must come from the exact release bundle." >&2
		exit 1
		;;
esac
export NPCINK_CLOUD_COMPOSE_FILE="${NEW_COMPOSE_FILE}"
if [ -n "${PREVIOUS_RELEASE_DIR}" ]; then
	PREVIOUS_COMPOSE_FILE="${PREVIOUS_RELEASE_DIR}/${NEW_COMPOSE_RELATIVE}"
fi
assert_previous_writer_project_alignment

cd "${RELEASE_DIR}"
CUTOVER_PHASE="prepare-release-images"
CUTOVER_MUTATION_STARTED=1
remote_run_timed "remote load and up" \
	env \
	NPCINK_CLOUD_LOAD_MODE=prepare-only \
	NPCINK_CLOUD_ROLLBACK_IMAGE_MAP="${ROLLBACK_IMAGE_MAP}" \
	NPCINK_CLOUD_ROLLBACK_TAG_SUFFIX="${ROLLBACK_TAG_SUFFIX}" \
	bash deploy/remote-load-and-up.sh </dev/null

CUTOVER_PHASE="stop-old-application-services"
remote_run_timed "stop public and write-capable application services" stop_application_services
remote_run_timed "assert application services stopped" assert_application_services_stopped

CUTOVER_PHASE="start-data-services"
remote_run_timed "remote start data services only" \
	env NPCINK_CLOUD_LOAD_MODE=data-only \
	bash deploy/remote-load-and-up.sh </dev/null

CUTOVER_PHASE="migrate-with-staged-image"
# From this assignment forward the old application is never auto-started: a
# failed/partial migration may have made the database incompatible with it.
MIGRATION_STARTED=1
remote_run_timed "remote migrate" \
	env NPCINK_CLOUD_MIGRATION_ONLY=1 \
	bash deploy/remote-migrate.sh </dev/null

if [ "${REFRESH_PROVIDERS}" = "1" ]; then
	CUTOVER_PHASE="refresh-provider-projections-with-staged-image"
	remote_run_timed "remote refresh providers" \
		env NPCINK_CLOUD_REFRESH_PROVIDERS_ONE_OFF=1 \
		bash deploy/remote-refresh-providers.sh </dev/null
fi

CUTOVER_PHASE="activate-new-release-pointer"
atomic_set_current "${RELEASE_DIR}"

CUTOVER_PHASE="start-new-api"
remote_run_timed "remote start new API only" \
	env NPCINK_CLOUD_LOAD_MODE=api-only \
	bash deploy/remote-load-and-up.sh </dev/null

CUTOVER_PHASE="start-new-workers"
WORKER_CUTOFF="$(python3 - <<'PY'
from datetime import datetime, timezone

print(datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"))
PY
)"
remote_run_timed "remote start new workers after API readiness" \
	env NPCINK_CLOUD_LOAD_MODE=workers-only \
	bash deploy/remote-load-and-up.sh </dev/null

CUTOVER_PHASE="verify-worker-operational-readiness"
remote_run_timed "remote internal operational readiness before traffic" \
	env NPCINK_CLOUD_OPERATIONAL_READY_INTERNAL=1 \
	bash deploy/remote-operational-ready.sh \
		--base-url "${BASE_URL}" \
		--worker-cutoff "${WORKER_CUTOFF}" </dev/null

CUTOVER_PHASE="restore-frontend-and-proxy-traffic"
remote_run_timed "remote restore frontend and proxy traffic last" \
	env NPCINK_CLOUD_LOAD_MODE=traffic-only \
	bash deploy/remote-load-and-up.sh </dev/null

CUTOVER_PHASE="validate-new-application-version"
remote_run_timed "remote baseline status" bash deploy/remote-baseline-status.sh </dev/null

if [ "${SKIP_SEED}" != "1" ]; then
	remote_run_timed "remote seed runtime" bash deploy/remote-seed-runtime.sh \
		--site-id "${SITE_ID}" \
		--key-id "${KEY_ID}" \
		--secret "${SECRET}" \
		--scopes "${SCOPES}" \
		</dev/null
fi

if [ "${SKIP_SMOKE}" != "1" ]; then
	SMOKE_ARGS=(
		--base-url "${BASE_URL}"
		--site-id "${SITE_ID}"
		--key-id "${KEY_ID}"
		--secret "${SECRET}"
		--profile-id "${PROFILE_ID}"
		--ability-name "${ABILITY_NAME}"
		--execution-kind "${EXECUTION_KIND}"
		--prompt-text "${PROMPT_TEXT}"
	)
	if [ -n "${IDEMPOTENCY_SUFFIX}" ]; then
		SMOKE_ARGS+=(--idempotency-suffix "${IDEMPOTENCY_SUFFIX}")
	fi
	if [ -n "${EXPECTED_PROVIDER_ID}" ]; then
		SMOKE_ARGS+=(--expected-provider-id "${EXPECTED_PROVIDER_ID}")
	fi
	if [ -n "${EXPECTED_MODEL_ID}" ]; then
		SMOKE_ARGS+=(--expected-model-id "${EXPECTED_MODEL_ID}")
	fi
	if [ -n "${EXPECTED_INSTANCE_ID}" ]; then
		SMOKE_ARGS+=(--expected-instance-id "${EXPECTED_INSTANCE_ID}")
	fi
	remote_run_timed "remote smoke" bash deploy/remote-smoke.sh "${SMOKE_ARGS[@]}" </dev/null
fi

if [ "${WITH_PORTAL_SMOKE}" = "1" ]; then
	if [ -z "${MEMBER_EMAIL}" ]; then
		echo "[fail] --with-portal-smoke requires --member-email or NPCINK_CLOUD_MEMBER_EMAIL" >&2
		exit 1
	fi
	remote_run_timed "remote bootstrap portal site" bash deploy/remote-bootstrap-portal-site.sh \
		--base-url "${BASE_URL}" \
		--site-id "${SITE_ID}" \
		--member-email "${MEMBER_EMAIL}" \
		</dev/null
	remote_run_timed "remote portal smoke" bash deploy/remote-portal-smoke.sh \
		--base-url "${BASE_URL}" \
		--site-id "${SITE_ID}" \
		--member-email "${MEMBER_EMAIL}" \
		</dev/null
fi

if [ "${WITH_OPERATIONAL_READY}" = "1" ]; then
	echo "[info] Running remote operational readiness gate"
	remote_run_timed "remote operational readiness" bash deploy/remote-operational-ready.sh --base-url "${BASE_URL}" </dev/null
	echo "[ok] Remote operational readiness gate passed"
fi

CUTOVER_PHASE="finalize-current-release"
DEPLOY_SUCCEEDED=1
if ! rm -rf "${REMOTE_INCOMING_DIR}"; then
	echo "[warn] Release succeeded but incoming upload cleanup failed: ${REMOTE_INCOMING_DIR}" >&2
fi
discard_rollback_image_tags || true
if ! rm -f "${ROLLBACK_IMAGE_MAP}"; then
	echo "[warn] Release succeeded but rollback map cleanup failed: ${ROLLBACK_IMAGE_MAP}" >&2
fi
rm -f "${FAILURE_MARKER}" >/dev/null 2>&1 || true
echo "[ok] Remote release ready at ${RELEASE_DIR}"
EOF

echo "[ok] Remote deploy completed: ${SSH_TARGET}:${REMOTE_DIR}/current"
