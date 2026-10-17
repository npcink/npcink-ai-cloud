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
	tests/dev/test_editor_assist_quality_status_cli.py \
	tests/workers/test_ops_cadence_worker.py::test_editor_assist_quality_detection_records_bounded_read_only_evidence \
	tests/workers/test_ops_cadence_worker.py::test_optional_diagnostics_default_to_hourly_without_changing_core_cadences \
	tests/workers/test_ops_cadence_worker.py::test_due_tasks_obey_hourly_schedule_and_never_auto_run_quality \
	tests/workers/test_ops_cadence_worker.py::test_manual_quality_is_reported_separately_without_stale_health_failure \
	tests/workers/test_ops_cadence_worker.py::test_manual_quality_command_executes_once_without_worker_heartbeat \
	tests/workers/test_ops_cadence_worker.py::test_manual_command_rejects_scheduled_tasks_before_loading_runtime \
	tests/workers/test_ops_cadence_worker.py::test_degradation_window_covers_schedule_and_preserves_legacy_override_cost \
	-q

echo "[editor-assist-quality] Running targeted Python lint"
"${RUFF_CMD[@]}" check \
	app/domain/observability/editor_assist_quality.py \
	app/domain/observability/plugin_events.py \
	app/api/routes/observability.py \
	app/api/routes/service.py \
	app/workers/ops_cadence.py \
	app/ops/editor_assist_quality_status.py \
	tests/api/test_editor_assist_quality_routes.py \
	tests/dev/test_editor_assist_quality_status_cli.py \
	tests/workers/test_ops_cadence_worker.py \
	scripts/report_ai_quality_regression_samples.py

echo "[editor-assist-quality] Running bounded Admin UI contract"
(
	cd frontend
	node tests/unit/admin-editor-assist-quality-contract.mjs
	node tests/unit/admin-api-route-allowlist-contract.mjs
)

echo "[editor-assist-quality] Checking the no-auto-mutation boundary"
grep -Fq '"automatic_prompt_mutation": False' \
	app/domain/observability/editor_assist_quality.py
grep -Fq '"automatic_model_mutation": False' \
	app/domain/observability/editor_assist_quality.py
grep -Fq '"automatic_router_mutation": False' \
	app/domain/observability/editor_assist_quality.py
grep -Fq '"raw_content_retention": False' \
	app/domain/observability/editor_assist_quality.py
grep -Fq '"automatic_evaluation_trigger": False' \
	app/workers/ops_cadence.py

echo "[editor-assist-quality] Gate passed"
