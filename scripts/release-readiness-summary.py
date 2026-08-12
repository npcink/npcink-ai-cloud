#!/usr/bin/env python3
"""Summarize local release evidence without changing or re-running any gate."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def summarize(paths: list[Path]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"{path} must contain a JSON object")
        status = next(
            (payload[key] for key in ("status", "release_preflight", "preflight") if key in payload),
            None,
        )
        if status in {"passed", "ready", True}:
            state = "passed"
        elif status in {"failed", "blocked", False}:
            state = "blocked"
        else:
            state = "unknown"
        checks.append({
            "name": path.name,
            "path": str(path),
            "state": state,
            "elapsed_seconds": next(
                (payload[key] for key in ("preflight_elapsed_seconds", "duration_seconds") if key in payload),
                None,
            ),
        })
    blockers = [item["name"] for item in checks if item["state"] != "passed"]
    return {
        "schema": "npcink.release_readiness_summary.v1",
        "status": "ready" if not blockers and checks else "blocked",
        "check_count": len(checks),
        "blockers": blockers,
        "checks": checks,
        "mode": "read-only-summary",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("evidence", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        result = summarize(args.evidence)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"release_readiness={result['status']}")
        print(f"checks={result['check_count']}")
        print(f"blockers={','.join(result['blockers']) or 'none'}")
    return 0 if result["status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
