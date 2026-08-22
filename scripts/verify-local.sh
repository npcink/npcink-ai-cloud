#!/usr/bin/env bash
set -euo pipefail

# Keep the development lane explicit while preserving check_changed's normal
# option parsing and single ownership of path/risk classification.
exec python3 scripts/check_changed.py "$@" --workflow-lane development
