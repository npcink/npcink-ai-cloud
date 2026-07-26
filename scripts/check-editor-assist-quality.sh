#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "${PYTHON_BIN}" ]; then
	if [ -x ".venv/bin/python" ]; then
		PYTHON_BIN=".venv/bin/python"
	else
		PYTHON_BIN="python3"
	fi
fi

if [ -x ".venv/bin/ruff" ]; then
	RUFF_CMD=( ".venv/bin/ruff" )
else
	RUFF_CMD=( "${PYTHON_BIN}" "-m" "ruff" )
fi

echo "[editor-assist-quality] Validating metadata-only regression fixture"
"${PYTHON_BIN}" -m json.tool \
	tests/fixtures/editor_assist_quality/quality_events.json \
	>/tmp/npcink-editor-assist-quality-events.json

echo "[editor-assist-quality] Running focused API and aggregation tests"
"${PYTHON_BIN}" -m pytest tests/api/test_editor_assist_quality_routes.py -q

echo "[editor-assist-quality] Running targeted Python lint"
"${RUFF_CMD[@]}" check \
	app/domain/observability/editor_assist_quality.py \
	app/domain/observability/plugin_events.py \
	app/api/routes/observability.py \
	app/api/routes/service.py \
	tests/api/test_editor_assist_quality_routes.py

echo "[editor-assist-quality] Checking the no-auto-mutation boundary"
rg -q '"automatic_prompt_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"automatic_model_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"automatic_router_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"raw_content_retention": False' \
	app/domain/observability/editor_assist_quality.py

echo "[editor-assist-quality] Gate passed"
