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

echo "[editor-assist-quality] Reporting the bounded ten-case quality sample set"
"${PYTHON_BIN}" scripts/report_ai_quality_regression_samples.py

echo "[editor-assist-quality] Running focused API and aggregation tests"
"${PYTHON_BIN}" -m pytest \
	tests/api/test_editor_assist_quality_routes.py \
	tests/workers/test_ops_cadence_worker.py::test_editor_assist_quality_detection_records_bounded_read_only_evidence \
	-q

echo "[editor-assist-quality] Running targeted Python lint"
"${RUFF_CMD[@]}" check \
	app/domain/observability/editor_assist_quality.py \
	app/domain/observability/plugin_events.py \
	app/api/routes/observability.py \
	app/api/routes/service.py \
	app/workers/ops_cadence.py \
	tests/api/test_editor_assist_quality_routes.py \
	tests/workers/test_ops_cadence_worker.py \
	scripts/report_ai_quality_regression_samples.py

echo "[editor-assist-quality] Running bounded Admin UI contract"
(
	cd frontend
	node tests/unit/admin-editor-assist-quality-contract.mjs
	node tests/unit/admin-api-route-allowlist-contract.mjs
)

echo "[editor-assist-quality] Checking the no-auto-mutation boundary"
rg -q '"automatic_prompt_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"automatic_model_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"automatic_router_mutation": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"raw_content_retention": False' \
	app/domain/observability/editor_assist_quality.py
rg -q '"automatic_evaluation_trigger": False' \
	app/workers/ops_cadence.py
rg -q 'interval_seconds=lambda _settings: 24 \* 60 \* 60' \
	app/workers/ops_cadence.py

echo "[editor-assist-quality] Gate passed"
