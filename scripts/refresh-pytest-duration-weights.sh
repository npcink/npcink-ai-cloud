#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
EXPECTED_SHARDS=3
MINIMUM_RUNS=3

usage() {
	cat <<'EOF'
Usage:
  pnpm run ci:pytest:weights:refresh -- <run-id> [<run-id> ...]
  pnpm run ci:pytest:weights:refresh -- --recent-master <count>

Downloads complete backend pytest timing artifacts from successful GitHub
Actions runs and atomically regenerates ci/pytest-backend-durations.json from
the per-file mean plus population standard deviation. The recent-master mode
skips successful runs that did not execute the full backend pytest lane.
EOF
}

if [ "${1:-}" = "--" ]; then
	shift
fi
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
	usage
	exit 0
fi
if ! command -v gh >/dev/null 2>&1; then
	echo "[error] GitHub CLI (gh) is required" >&2
	exit 1
fi

PYTHON_BIN="${NPCINK_CLOUD_CI_PYTHON:-python3}"
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
	echo "[error] Python executable is unavailable: ${PYTHON_BIN}" >&2
	exit 1
fi

mode="explicit"
recent_count=0
if [ "${1:-}" = "--recent-master" ]; then
	mode="recent-master"
	recent_count="${2:-}"
	if [ "$#" -ne 2 ] || ! [[ "${recent_count}" =~ ^[1-9][0-9]*$ ]]; then
		usage >&2
		exit 2
	fi
	if [ "${recent_count}" -lt "${MINIMUM_RUNS}" ]; then
		echo "[error] at least ${MINIMUM_RUNS} runs are required" >&2
		exit 2
	fi
elif [ "$#" -lt 1 ]; then
	usage >&2
	exit 2
else
	if [ "$#" -lt "${MINIMUM_RUNS}" ]; then
		echo "[error] at least ${MINIMUM_RUNS} run ids are required" >&2
		exit 2
	fi
	seen_run_ids=" "
	for run_id in "$@"; do
		if ! [[ "${run_id}" =~ ^[0-9]+$ ]]; then
			usage >&2
			exit 2
		fi
		if [[ "${seen_run_ids}" == *" ${run_id} "* ]]; then
			echo "[error] duplicate run id: ${run_id}" >&2
			exit 2
		fi
		seen_run_ids="${seen_run_ids}${run_id} "
	done
fi

TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
TEMP_DIR="$(mktemp -d "${TEMP_ROOT}/npcink-pytest-weights.XXXXXX")"
OUTPUT_TEMP=""
cleanup() {
	rm -rf "${TEMP_DIR}"
	if [ -n "${OUTPUT_TEMP}" ]; then
		rm -f "${OUTPUT_TEMP}"
	fi
}
trap cleanup EXIT

validate_master_run() {
	local run_id="$1"
	local metadata
	if ! metadata="$(
		gh run view "${run_id}" \
			--json conclusion,event,headBranch \
			--jq '[.conclusion, .event, .headBranch] | @tsv'
	)"; then
		echo "[error] failed to inspect GitHub Actions run ${run_id}" >&2
		return 1
	fi
	if [ "${metadata}" != $'success\tpush\tmaster' ]; then
		echo "[error] run ${run_id} is not a successful master push: ${metadata}" >&2
		return 1
	fi
}

download_run() {
	local run_id="$1"
	local strict="$2"
	local run_dir="${TEMP_DIR}/${run_id}"
	local report_count
	mkdir -p "${run_dir}"
	if ! gh run download "${run_id}" \
		--dir "${run_dir}" \
		--pattern 'pytest-backend-timing-shard-*' >/dev/null 2>&1; then
		if [ "${strict}" = "true" ]; then
			echo "[error] failed to download pytest timing artifacts for run ${run_id}" >&2
			return 1
		fi
		rm -rf "${run_dir}"
		return 2
	fi
	report_count="$(
		find "${run_dir}" -type f -name 'pytest-backend-shard-*.xml' -print \
			| wc -l | tr -d ' '
	)"
	if [ "${report_count}" -ne "${EXPECTED_SHARDS}" ]; then
		if [ "${strict}" = "true" ]; then
			echo "[error] run ${run_id}: expected ${EXPECTED_SHARDS} pytest shard reports, found ${report_count}" >&2
			return 1
		fi
		rm -rf "${run_dir}"
		return 2
	fi
	return 0
}

selected_run_ids=()
if [ "${mode}" = "recent-master" ]; then
	candidate_limit=$((recent_count * 4))
	if [ "${candidate_limit}" -lt 20 ]; then
		candidate_limit=20
	fi
	if ! candidate_run_ids="$(
		gh run list \
			--workflow ci.yml \
			--branch master \
			--event push \
			--status success \
			--limit "${candidate_limit}" \
			--json databaseId \
			--jq '.[].databaseId'
	)"; then
		echo "[error] failed to list successful master runs" >&2
		exit 1
	fi
	while IFS= read -r run_id; do
		if [ -z "${run_id}" ]; then
			continue
		fi
		if download_run "${run_id}" false; then
			selected_run_ids+=("${run_id}")
			if [ "${#selected_run_ids[@]}" -eq "${recent_count}" ]; then
				break
			fi
		else
			status=$?
			if [ "${status}" -ne 2 ]; then
				exit "${status}"
			fi
		fi
	done <<< "${candidate_run_ids}"
	if [ "${#selected_run_ids[@]}" -ne "${recent_count}" ]; then
		echo "[error] expected ${recent_count} full master runs, found ${#selected_run_ids[@]}" >&2
		exit 1
	fi
else
	for run_id in "$@"; do
		validate_master_run "${run_id}"
		download_run "${run_id}" true
		selected_run_ids+=("${run_id}")
	done
fi

OUTPUT_TEMP="$(mktemp "${ROOT_DIR}/ci/.pytest-backend-durations.XXXXXX")"
writer_args=()
for run_id in "${selected_run_ids[@]}"; do
	writer_args+=(--run-root "${TEMP_DIR}/${run_id}" --source-run-id "${run_id}")
done
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/write-pytest-duration-weights.py" \
	"${writer_args[@]}" \
	--aggregation mean-plus-stddev \
	--output "${OUTPUT_TEMP}"
mv "${OUTPUT_TEMP}" "${ROOT_DIR}/ci/pytest-backend-durations.json"
OUTPUT_TEMP=""

printf '[ok] Refreshed pytest duration weights from %s runs using variance-aware weights: %s\n' \
	"${#selected_run_ids[@]}" "${selected_run_ids[*]}"
