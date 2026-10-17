#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${1:-}" = '--' ]; then
	shift
fi
if [ "${1:-}" = '--critical' ]; then
	shift
	exec python3 "${SCRIPT_DIR}/verify_critical.py" "$@"
fi

# Keep the development lane explicit while preserving check_changed's normal
# option parsing and single ownership of path/risk classification.
exec python3 "${SCRIPT_DIR}/check_changed.py" "$@" --workflow-lane development
