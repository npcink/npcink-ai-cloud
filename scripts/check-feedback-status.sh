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

echo "[feedback-status] Running focused tests"
"${PYTHON_BIN}" -m pytest \
	tests/domain/test_feedback_status.py \
	tests/dev/test_feedback_status_cli.py \
	-q

echo "[feedback-status] Running targeted Python lint"
"${RUFF_CMD[@]}" check \
	app/domain/feedback_status \
	app/dev/feedback_status.py \
	tests/domain/test_feedback_status.py \
	tests/dev/test_feedback_status_cli.py

echo "[feedback-status] Validating remote command syntax"
bash -n deploy/remote-feedback-status.sh

echo "[feedback-status] Feedback status gate passed"
