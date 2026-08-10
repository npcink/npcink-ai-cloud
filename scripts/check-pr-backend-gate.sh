#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BASE_REF="${NPCINK_CLOUD_PR_BASE_REF:-origin/${GITHUB_BASE_REF:-master}}"
TMP_CHANGED="$(mktemp)"
TMP_TESTS="$(mktemp)"
trap 'rm -f "${TMP_CHANGED}" "${TMP_TESTS}"' EXIT

MODE="${1:-auto}"
CONTRACT_SHARD=""
case "${MODE}" in
	--classify-only)
		MODE="classify-only"
		;;
	--targeted-only)
		MODE="targeted-only"
		;;
	--targeted-static)
		MODE="targeted-static"
		;;
	--targeted-contract)
		MODE="targeted-contract"
		;;
	--targeted-contract-shard)
		[ "$#" -ge 2 ] || {
			echo "[error] --targeted-contract-shard requires a shard number" >&2
			exit 2
		}
		MODE="targeted-contract-shard"
		CONTRACT_SHARD="$2"
		case "${CONTRACT_SHARD}" in
			1|2) ;;
			*)
				echo "[error] contract shard must be 1 or 2" >&2
				exit 2
				;;
		esac
		;;
	--targeted-impacted)
		MODE="targeted-impacted"
		;;
	auto|"")
		MODE="auto"
		;;
	*)
		echo "[error] unknown mode: ${MODE}" >&2
		exit 2
		;;
esac

TARGETED_MODE=0
case "${MODE}" in
	targeted-only|targeted-static|targeted-contract|targeted-contract-shard|targeted-impacted)
		TARGETED_MODE=1
		;;
esac

emit_scope_output() {
	local value="$1"
	printf 'requires_full_backend=%s\n' "${value}"
	if [ -n "${GITHUB_OUTPUT:-}" ]; then
		printf 'requires_full_backend=%s\n' "${value}" >> "${GITHUB_OUTPUT}"
	fi
}

run_full_backend_gate() {
	echo "[info] High-risk backend surface changed; running full backend gate."
	.venv/bin/ruff check .
	.venv/bin/mypy app
	.venv/bin/python -m pytest tests/api tests/contract tests/domain -q
}

if [ -n "${GITHUB_EVENT_NAME:-}" ] && [ "${GITHUB_EVENT_NAME}" != "pull_request" ]; then
	echo "[info] Non-PR backend event; full backend gate required."
	emit_scope_output 1
	if [ "${MODE}" = "classify-only" ]; then
		exit 0
	fi
	if [ "${TARGETED_MODE}" = "1" ]; then
		echo "[error] targeted-only mode cannot run a non-PR full backend gate." >&2
		exit 1
	fi
	run_full_backend_gate
	exit 0
fi

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] && [ "${GITHUB_BASE_REF:-}" = "production" ]; then
	echo "[info] Production-promotion PR; full backend gate required."
	emit_scope_output 1
	if [ "${MODE}" = "classify-only" ]; then
		exit 0
	fi
	if [ "${TARGETED_MODE}" = "1" ]; then
		echo "[error] targeted-only mode cannot run a production-promotion full backend gate." >&2
		exit 1
	fi
	run_full_backend_gate
	exit 0
fi

if ! git -C "${ROOT_DIR}" rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
	git -C "${ROOT_DIR}" fetch origin "${GITHUB_BASE_REF:-master}" --depth=1
fi

if git -C "${ROOT_DIR}" rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
	MERGE_BASE="$(git -C "${ROOT_DIR}" merge-base HEAD "${BASE_REF}")"
	{
		git -C "${ROOT_DIR}" diff --name-only --diff-filter=ACMR "${MERGE_BASE}...HEAD"
		git -C "${ROOT_DIR}" diff --name-only --cached --diff-filter=ACMR
		git -C "${ROOT_DIR}" diff --name-only --diff-filter=ACMR
		git -C "${ROOT_DIR}" ls-files --others --exclude-standard
	} | sort -u > "${TMP_CHANGED}"
else
	{
		git -C "${ROOT_DIR}" diff --name-only --diff-filter=ACMR HEAD~1...HEAD
		git -C "${ROOT_DIR}" diff --name-only --cached --diff-filter=ACMR
		git -C "${ROOT_DIR}" diff --name-only --diff-filter=ACMR
		git -C "${ROOT_DIR}" ls-files --others --exclude-standard
	} | sort -u > "${TMP_CHANGED}"
fi

echo "[info] PR backend changed files:"
if [ -s "${TMP_CHANGED}" ]; then
	sed 's/^/ - /' "${TMP_CHANGED}"
else
	echo " - (none)"
fi

requires_full_backend=0
while IFS= read -r path; do
	[ -n "${path}" ] || continue
	case "${path}" in
		pyproject.toml|uv.lock|Makefile|docker-compose*.yml|Dockerfile*|*/Dockerfile*)
			requires_full_backend=1
			;;
		deploy/image-lock/*|deploy/image-lock/**/*|scripts/production-python-extras-smoke.sh|scripts/verify-production-python-lock.py)
			requires_full_backend=1
			;;
		scripts/production-application-image-inputs.py|scripts/production-image-supply.py|scripts/scan-production-images.sh|scripts/verify-production-images.sh)
			requires_full_backend=1
			;;
		.github/workflows/ci.yml|ci/pytest-backend-durations.json|tests/conftest.py|tests/fixtures/*|migrations/*|migrations/**/*)
			requires_full_backend=1
			;;
		app/core/config.py|app/core/db.py|app/core/models.py|app/api/auth.py)
			requires_full_backend=1
			;;
	esac
done < "${TMP_CHANGED}"

emit_scope_output "${requires_full_backend}"
if [ "${MODE}" = "classify-only" ]; then
	exit 0
fi

if [ "${requires_full_backend}" = "1" ]; then
	if [ "${TARGETED_MODE}" = "1" ]; then
		echo "[error] targeted-only mode received a high-risk backend change." >&2
		exit 1
	fi
	run_full_backend_gate
	exit 0
fi

echo "[info] Running targeted PR backend gate."

run_targeted_static() {
	bash scripts/check-release-policy.sh
	pnpm run test:anti-drift
	bash scripts/check-changed-python-quality.sh
}

run_targeted_contract() {
	echo "[run] pytest contract gate"
	.venv/bin/python -m pytest tests/contract -q --durations=25
}

run_targeted_contract_shard() {
	local shard="$1"
	python3 scripts/select-pytest-shard.py \
		--shards 2 \
		--shard "${shard}" \
		tests/contract > "${TMP_TESTS}"
	contract_tests=()
	while IFS= read -r test_path; do
		[ -n "${test_path}" ] && contract_tests+=("${test_path}")
	done < "${TMP_TESTS}"
	[ "${#contract_tests[@]}" -gt 0 ] || {
		echo "[error] contract shard ${shard} selected no tests" >&2
		exit 1
	}
	echo "[run] pytest contract shard ${shard}/2 (${#contract_tests[@]} files)"
	.venv/bin/python -m pytest "${contract_tests[@]}" -q --durations=25
}

run_targeted_impacted() {
	changed_paths=()
	while IFS= read -r changed_path; do
		[ -n "${changed_path}" ] && changed_paths+=("${changed_path}")
	done < "${TMP_CHANGED}"
	python3 scripts/select-pr-backend-tests.py "${changed_paths[@]}" > "${TMP_TESTS}"
	if [ -s "${TMP_TESTS}" ]; then
		impacted_tests=()
		while IFS= read -r test_path; do
			[ -n "${test_path}" ] && impacted_tests+=("${test_path}")
		done < "${TMP_TESTS}"
		echo "[run] pytest impacted test files (${#impacted_tests[@]} files)"
		.venv/bin/python -m pytest "${impacted_tests[@]}" -q --durations=25
	else
		echo "[ok] No additional impacted pytest files detected; contract shards are already covered."
	fi
}

case "${MODE}" in
	targeted-static)
		run_targeted_static
		;;
	targeted-contract)
		run_targeted_contract
		;;
	targeted-contract-shard)
		run_targeted_contract_shard "${CONTRACT_SHARD}"
		;;
	targeted-impacted)
		run_targeted_impacted
		;;
	targeted-only|auto)
		run_targeted_static
		run_targeted_contract
		run_targeted_impacted
		;;
esac
