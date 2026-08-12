#!/usr/bin/env python3
"""Summarize local release evidence without changing or re-running any gate."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

KNOWN_SCHEMAS = {
    "npcink.production-authoritative-cve-precheck.v1": ("status", "passed", "revision"),
    "npcink.production_release_preflight.v1": (
        "release_preflight",
        "ready",
        "production_sha",
    ),
}


def summarize(paths: list[Path]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    revisions: set[str] = set()
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"{path} must contain a JSON object")
        schema = payload.get("schema") or payload.get("contract_version")
        if schema not in KNOWN_SCHEMAS:
            raise ValueError(f"{path} has unsupported or missing evidence schema")
        if schema == "npcink.production-authoritative-cve-precheck.v1":
            required = ("checked_at_utc", "lock", "authoritative_file", "entries")
            if (
                any(key not in payload for key in required)
                or not isinstance(payload.get("entries"), list)
                or not payload["entries"]
            ):
                raise ValueError(f"{path} has incomplete authoritative evidence")
            if (
                not isinstance(payload.get("checked_at_utc"), str)
                or not isinstance(payload.get("lock"), str)
                or not isinstance(payload.get("authoritative_file"), str)
            ):
                raise ValueError(f"{path} has incomplete authoritative evidence")
        else:
            required = (
                "repository",
                "cloud_ci_run_id",
                "codeql_run_id",
                "release_action",
                "plan_artifact_id",
                "deploy_secrets_ready",
                "formal_smoke_secrets_ready",
                "preflight_mode",
            )
            if any(key not in payload for key in required) or not isinstance(
                payload.get("preflight_mode"), str
            ):
                raise ValueError(f"{path} has incomplete preflight evidence")
        status_key, expected_status, revision_key = KNOWN_SCHEMAS[schema]
        revision = payload.get(revision_key)
        if not isinstance(revision, str) or re.fullmatch(r"[0-9a-f]{40}", revision) is None:
            raise ValueError(f"{path} has invalid or missing release revision")
        revisions.add(revision)
        status = payload.get(status_key)
        if status != expected_status:
            state = "blocked" if status in {"failed", "blocked", False} else "unknown"
        elif schema == "npcink.production_release_preflight.v1" and payload.get(
            "preflight_mode"
        ) not in {"live", "snapshot", "dry-run"}:
            state = "unknown"
        else:
            state = "passed"
        checks.append(
            {
                "name": path.name,
                "path": str(path),
                "state": state,
                "revision": revision,
                "elapsed_seconds": next(
                    (
                        payload[key]
                        for key in ("preflight_elapsed_seconds", "duration_seconds")
                        if key in payload
                    ),
                    None,
                ),
            }
        )
    if len(revisions) != 1:
        raise ValueError("release evidence revisions do not match")
    blockers = [item["name"] for item in checks if item["state"] != "passed"]
    return {
        "schema": "npcink.release_readiness_summary.v1",
        "status": "ready" if not blockers and checks else "blocked",
        "check_count": len(checks),
        "revision": next(iter(revisions)),
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
