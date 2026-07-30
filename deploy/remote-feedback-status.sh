#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
. "${ROOT_DIR}/deploy/common.sh"

WINDOW_HOURS="${NPCINK_CLOUD_FEEDBACK_STATUS_WINDOW_HOURS:-168}"

while [ "$#" -gt 0 ]; do
	case "$1" in
		--window-hours)
			WINDOW_HOURS="$2"
			shift 2
			;;
		*)
			echo "[fail] Unknown argument: $1" >&2
			exit 2
			;;
	esac
done

if [[ ! "${WINDOW_HOURS}" =~ ^[0-9]+$ ]] || \
	[ "${WINDOW_HOURS}" -lt 1 ] || [ "${WINDOW_HOURS}" -gt 720 ]; then
	echo "[fail] --window-hours must be an integer between 1 and 720." >&2
	exit 2
fi

npcink_ai_cloud_require_cmd docker

NPCINK_CLOUD_DIAGNOSTIC_RELEASE_NAME="$(basename "${ROOT_DIR}")"
NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION=""
MANIFEST_PATH="${ROOT_DIR}/release-bundle-manifest.json"
if [ -f "${MANIFEST_PATH}" ]; then
	RELEASE_TOOL_PYTHON="$(npcink_ai_cloud_release_tool_python)"
	npcink_ai_cloud_require_release_tool_python "${RELEASE_TOOL_PYTHON}"
	NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION="$(
		"${RELEASE_TOOL_PYTHON}" -c \
			'import json, sys; print(str(json.load(open(sys.argv[1], encoding="utf-8")).get("source", {}).get("revision", "")))' \
			"${MANIFEST_PATH}"
	)"
fi
export NPCINK_CLOUD_DIAGNOSTIC_RELEASE_NAME
export NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION

npcink_ai_cloud_compose "${ROOT_DIR}" exec -T \
	-e NPCINK_CLOUD_DIAGNOSTIC_RELEASE_NAME="${NPCINK_CLOUD_DIAGNOSTIC_RELEASE_NAME}" \
	-e NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION="${NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION}" \
	api python -m app.dev.feedback_status --window-hours "${WINDOW_HOURS}"
