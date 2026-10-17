#!/usr/bin/env python3
"""Resolve the last evidenced runtime deployment, never the last promotion."""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import zipfile
from collections.abc import Callable


def github_api(path: str) -> bytes:
    return subprocess.run(["gh", "api", path], check=True, capture_output=True, timeout=60).stdout


def read_artifact(root, run_id, name, filename, api):
    artifacts = json.loads(api(f"{root}/runs/{run_id}/artifacts?per_page=100"))["artifacts"]
    matches = [item for item in artifacts if item["name"] == name and not item["expired"]]
    if not matches:
        return None
    if len(matches) != 1 or matches[0]["size_in_bytes"] > 1_000_000:
        raise ValueError("deployment artifact is ambiguous or oversized")
    with zipfile.ZipFile(io.BytesIO(api(f"{root}/artifacts/{matches[0]['id']}/zip"))) as bundle:
        members = bundle.infolist()
        if len(members) != 1 or members[0].filename != filename or members[0].file_size > 1_000_000:
            raise ValueError("deployment artifact archive is invalid")
        return json.loads(bundle.read(members[0]))


def resolve_baseline(repository: str, api: Callable[[str], bytes] = github_api) -> str:
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) is None:
        raise ValueError("repository must use owner/name format")
    root = f"repos/{repository}/actions"
    runs = json.loads(
        api(
            f"{root}/workflows/deploy-production.yml/runs"
            "?branch=production&event=workflow_dispatch&per_page=20"
        )
    )["workflow_runs"]
    # Host mutation is serialized. Completion order also handles reruns of old SHAs.
    for run in sorted(runs, key=lambda item: item["updated_at"], reverse=True):
        if run.get("conclusion") != "success":
            raise ValueError(
                "later deployment attempt is not successful; confirm installed baseline read-only"
            )
        revision = run["head_sha"]
        run_id = run["id"]
        if (
            run.get("event") != "workflow_dispatch"
            or run.get("head_branch") != "production"
            or run.get("path") != ".github/workflows/deploy-production.yml"
            or re.fullmatch(r"[0-9a-f]{40}", revision) is None
            or type(run_id) is not int
        ):
            raise ValueError("deployment run identity is invalid")
        receipt = read_artifact(
            root,
            run_id,
            f"production-deploy-timing-{run_id}-{revision}",
            "production-deploy-phase-timing.json",
            api,
        )
        if receipt is None:
            # Missing timing alone cannot distinguish a no-op from lost runtime evidence.
            ci_runs = json.loads(
                api(
                    f"{root}/workflows/ci.yml/runs?branch=production&event=push"
                    f"&status=success&head_sha={revision}&per_page=10"
                )
            )["workflow_runs"]
            no_runtime = False
            for ci_run in ci_runs:
                if (
                    ci_run.get("head_sha") != revision
                    or ci_run.get("head_branch") != "production"
                    or ci_run.get("event") != "push"
                    or ci_run.get("conclusion") != "success"
                    or ci_run.get("path") != ".github/workflows/ci.yml"
                ):
                    raise ValueError("production CI run identity is invalid")
                plan = read_artifact(
                    root,
                    ci_run["id"],
                    f"production-release-plan-{revision}",
                    "production-release-plan.json",
                    api,
                )
                if plan is not None:
                    no_runtime = (
                        plan.get("schema") == "npcink.production_release_plan.v2"
                        and plan.get("repository") == repository
                        and plan.get("head_sha") == revision
                        and plan.get("lane") in {"no_deploy", "static"}
                        and plan.get("backend_image_required") is False
                        and plan.get("frontend_image_required") is False
                        and plan.get("migration_required") is False
                        and plan.get("runtime_config_required") is False
                    )
                    break
            if not no_runtime:
                raise ValueError("no retained runtime receipt or proven non-runtime plan")
            continue
        expected = {
            "schema": "npcink.release_timing.v1",
            "kind": "production_deploy_phases",
            "repository": repository,
            "head_sha": revision,
            "workflow_run_id": str(run_id),
            "release_action": "runtime",
            "status": "success",
            "deploy_exit_status": 0,
        }
        if any(receipt.get(key) != value for key, value in expected.items()):
            raise ValueError("deployment receipt does not bind the successful runtime run")
        if not any(
            phase.get("label") == "remote deploy sequence"
            and phase.get("conclusion") == "success"
            and phase.get("exit_status") == 0
            for phase in receipt.get("phases", [])
        ):
            raise ValueError("deployment receipt has no successful remote sequence")
        print(f"[ok] deployed baseline {revision}; deployment run {run_id}", file=sys.stderr)
        return revision
    raise ValueError(
        "no retained successful runtime deployment evidence; re-establish baseline read-only"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    try:
        revision = resolve_baseline(args.repository)
    except (ValueError, KeyError, TypeError, zipfile.BadZipFile, subprocess.SubprocessError) as exc:
        raise SystemExit(f"deployed baseline resolution failed: {exc}") from exc
    print(revision)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
