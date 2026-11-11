#!/usr/bin/env python3
"""Resolve the last evidenced runtime deployment, never the last promotion."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

RECOVERY_FILE = Path(__file__).resolve().parents[1] / ".github/production-baseline-recovery.json"
WORKSTATION_FILE = (
    Path(__file__).resolve().parents[1] / ".github/production-workstation-baseline.json"
)
UTC = timezone.utc  # noqa: UP017 -- operator Python may predate datetime.UTC.


def _utc_timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("workstation baseline timestamp is missing")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("workstation baseline timestamp is invalid") from exc
    if parsed.utcoffset() != timedelta(0):
        raise ValueError("workstation baseline timestamp must be UTC")
    return parsed


def workstation_baseline(
    repository: str, run: dict, path: Path, *, now=None, cancelled_upload=False
) -> str | None:
    """Reconcile a reviewed workstation activation after its exact Actions anchor.

    Validate retained artifacts before calling. Missing historical artifacts may
    use this separately reviewed observation, bound to the exact successful run.
    A later proven runtime supersedes it; unproven later attempts still stop.
    """
    if not path.is_file():
        return None
    raw = path.read_bytes()
    if len(raw) > 16_384:
        raise ValueError("workstation baseline receipt is oversized")
    receipt = json.loads(raw)
    version = (
        "v2"
        if isinstance(receipt, dict)
        and receipt.get("schema") == "npcink.production_workstation_baseline.v2"
        else "v1"
    )
    if cancelled_upload and isinstance(receipt, dict) and receipt.get("schema") != (
        "npcink.production_workstation_baseline.v2"
    ):
        return None
    if (
        not isinstance(receipt, dict)
        or receipt.get("schema") != f"npcink.production_workstation_baseline.{version}"
        or receipt.get("repository") != repository
    ):
        raise ValueError("workstation baseline receipt identity is invalid")
    observed = _utc_timestamp(receipt.get("observed_at_utc"))
    updated = _utc_timestamp(run.get("updated_at"))
    if updated > observed:
        return None
    expected = {key: run.get(key) for key in ("id", "head_sha", "run_attempt", "updated_at")}
    if cancelled_upload:
        expected.update(status=run.get("status"), conclusion=run.get("conclusion"))
    anchor = receipt.get("previous_workflow")
    if cancelled_upload:
        anchor_matches = isinstance(anchor, dict) and all(
            anchor.get(key) == value for key, value in expected.items()
        )
    else:
        anchor_matches = anchor == expected
    if not anchor_matches or type(expected["id"]) is not int or type(expected["run_attempt"]) is not int:
        raise ValueError("workstation baseline Actions anchor changed or is missing")
    expires = _utc_timestamp(receipt.get("expires_at_utc"))
    current = now or datetime.now(UTC)
    if not (
        updated <= observed <= current
        and observed < expires <= observed + timedelta(days=7)
        and current < expires
    ):
        raise ValueError("workstation baseline observation is stale or has an invalid window")
    if cancelled_upload:
        activated = _utc_timestamp(receipt.get("activation_completed_at_utc"))
        if not (
            expected["status"] == "completed"
            and expected["conclusion"] == "cancelled"
            and receipt.get("installed_sha") == run["head_sha"]
            and updated < activated <= observed
            and re.fullmatch(r"[0-9a-f]{64}", str(receipt.get("cancelled_upload_log_sha256")))
        ):
            raise ValueError("workstation baseline cancelled upload reconciliation is invalid")
    for key, length in (
        ("installed_sha", 40),
        ("installed_tree", 40),
        ("manifest_sha256", 64),
        ("bundle_sha256", 64),
        ("activation_log_sha256", 64),
        ("observation_sha256", 64),
    ):
        if re.fullmatch(r"[0-9a-f]{" + str(length) + "}", str(receipt.get(key, ""))) is None:
            raise ValueError("workstation baseline evidence identity is invalid")
    filename = receipt.get("observation_file", "")
    if (
        not isinstance(filename, str)
        or re.fullmatch(r"[a-z0-9][a-z0-9-]{0,80}\.json", filename) is None
    ):
        raise ValueError("workstation baseline observation filename is invalid")
    observation_path = path.parent / "production-baseline-observations" / filename
    evidence_raw = observation_path.read_bytes()
    if (
        len(evidence_raw) > 32_768
        or hashlib.sha256(evidence_raw).hexdigest() != receipt["observation_sha256"]
    ):
        raise ValueError("workstation baseline observation checksum mismatch")
    evidence = json.loads(evidence_raw)
    expected_evidence = {
        "schema": f"npcink.production_workstation_observation.{version}",
        "repository": repository,
        **{
            key: receipt[key]
            for key in (
                "installed_sha",
                "installed_tree",
                "manifest_sha256",
                "bundle_sha256",
                "activation_log_sha256",
                "observed_at_utc",
            )
        },
        "deploy_exit_status": 0,
        "remote_sequence_exit_status": 0,
        "deployment_lock_absent": True,
        "failed_cutover_marker_absent": True,
        "internal_operational_ready": True,
        "public_live_status": 200,
    }
    if cancelled_upload:
        expected_evidence.update(
            activation_completed_at_utc=receipt["activation_completed_at_utc"],
            installation_complete=True,
            one_off_lock_absent=True,
            public_revision=receipt["installed_sha"][:12],
            cancelled_upload={
                "workflow": expected,
                "last_phase": "upload deploy bundle",
                "remote_installation_started": False,
                "log_sha256": receipt["cancelled_upload_log_sha256"],
            },
        )
    direct_expected = {
        key: value for key, value in expected_evidence.items() if key != "cancelled_upload"
    }
    if not isinstance(evidence, dict) or any(
        type(evidence.get(key)) is not type(value) or evidence[key] != value
        for key, value in direct_expected.items()
    ):
        raise ValueError("workstation baseline observation does not prove successful activation")
    if cancelled_upload:
        cancelled_evidence = evidence.get("cancelled_upload")
        expected_cancelled = expected_evidence["cancelled_upload"]
        if (
            not isinstance(cancelled_evidence, dict)
            or not isinstance(cancelled_evidence.get("workflow"), dict)
            or any(
                cancelled_evidence["workflow"].get(key) != value
                for key, value in expected_cancelled["workflow"].items()
            )
            or any(
                cancelled_evidence.get(key) != value
                for key, value in expected_cancelled.items()
                if key != "workflow"
            )
        ):
            raise ValueError("workstation baseline cancelled upload proof types are invalid")
    containers = evidence.get("containers")
    roles = {"api", "frontend", "redis", "proxy", "worker", "callback-worker", "ops-worker"}
    if (
        not isinstance(containers, list)
        or len(containers) != 7
        or any(not isinstance(item, dict) for item in containers)
        or {item.get("service") for item in containers} != roles
        or any(
            item.get("status") != "running"
            or type(item.get("restarts")) is not int
            or item["restarts"] != 0
            or item.get("OOMKilled") is not False
            or (cancelled_upload and item.get("image_matches_exact_bundle") is not True)
            or item.get("health")
            not in ({"healthy", "none"} if item["service"].endswith("worker") else {"healthy"})
            for item in containers
        )
    ):
        raise ValueError("workstation baseline container proof is invalid")
    tree = subprocess.run(
        ["git", "rev-parse", "--verify", receipt["installed_sha"] + "^{tree}"],
        cwd=path.parent.parent,
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout.strip()
    if tree != receipt["installed_tree"]:
        raise ValueError("workstation baseline installed source tree mismatch")
    print(
        "[ok] reviewed workstation observation recovers deployed baseline "
        f"{receipt['installed_sha']}",
        file=sys.stderr,
    )
    return receipt["installed_sha"]


def recovered_baseline(repository: str, run: dict, path: Path, *, now=None) -> str | None:
    """Use a reviewed, short-lived host observation only for its exact successful run."""
    if not path.is_file():
        return None
    raw = path.read_bytes()
    if len(raw) > 16_384:
        raise ValueError("baseline recovery receipt is oversized")
    receipt = json.loads(raw)
    if (
        not isinstance(receipt, dict)
        or receipt.get("schema") != "npcink.production_baseline_recovery.v1"
    ):
        raise ValueError("baseline recovery receipt schema is invalid")
    expected = {
        "repository": repository,
        "installed_sha": run["head_sha"],
        "workflow_run_id": run["id"],
        "workflow_run_attempt": run.get("run_attempt"),
        "workflow_updated_at": run.get("updated_at"),
    }
    if any(receipt.get(key) != value for key, value in expected.items()):
        raise ValueError("baseline recovery receipt does not bind the latest runtime attempt")
    if type(receipt.get("workflow_run_attempt")) is not int:
        raise ValueError("baseline recovery run attempt is missing")
    for key, pattern in {
        "installed_tree": r"[0-9a-f]{40}",
        "manifest_sha256": r"[0-9a-f]{64}",
        "observation_sha256": r"[0-9a-f]{64}",
    }.items():
        if re.fullmatch(pattern, str(receipt.get(key, ""))) is None:
            raise ValueError("baseline recovery observation identity is invalid")
    dates = []
    for key in ("workflow_updated_at", "observed_at_utc", "expires_at_utc"):
        value = receipt.get(key)
        if not isinstance(value, str):
            raise ValueError("baseline recovery timestamp is missing")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("baseline recovery timestamp is invalid") from exc
        if parsed.utcoffset() != timedelta(0):
            raise ValueError("baseline recovery timestamp must be UTC")
        dates.append(parsed)
    updated, observed, expires = dates
    current = now or datetime.now(UTC)
    if not (
        updated <= observed <= current + timedelta(minutes=5)
        and observed < expires <= observed + timedelta(days=7)
        and current < expires
    ):
        raise ValueError("baseline recovery observation is stale or has an invalid window")
    print(
        f"[ok] reviewed host observation recovers deployed baseline {run['head_sha']}",
        file=sys.stderr,
    )
    return run["head_sha"]


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


def resolve_baseline(
    repository: str,
    api: Callable[[str], bytes] = github_api,
    *,
    recovery_path: Path | None = None,
    workstation_path: Path | None = None,
) -> str:
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
            if (
                run.get("status") == "completed"
                and run.get("conclusion") == "cancelled"
                and run.get("event") == "workflow_dispatch"
                and run.get("head_branch") == "production"
                and run.get("path") == ".github/workflows/deploy-production.yml"
                and type(run.get("id")) is int
                and re.fullmatch(r"[0-9a-f]{40}", str(run.get("head_sha")))
            ):
                # A reviewed, same-version workstation activation can fence this
                # exact cancelled upload. Never override a retained runtime receipt.
                retained = read_artifact(
                    root,
                    run["id"],
                    f"production-deploy-timing-{run['id']}-{run['head_sha']}",
                    "production-deploy-phase-timing.json",
                    api,
                )
                if retained is not None:
                    raise ValueError(
                        "cancelled upload has retained runtime evidence; review required"
                    )
                observed = workstation_baseline(
                    repository,
                    run,
                    workstation_path or WORKSTATION_FILE,
                    cancelled_upload=True,
                )
                if observed is not None:
                    return observed
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
                    if (
                        not isinstance(plan, dict)
                        or plan.get("schema") != "npcink.production_release_plan.v2"
                        or plan.get("repository") != repository
                        or plan.get("head_sha") != revision
                        or plan.get("lane")
                        not in {
                            "no_deploy",
                            "static",
                            "backend",
                            "frontend",
                            "migration",
                            "config",
                            "full",
                        }
                    ):
                        raise ValueError("retained production release plan identity is malformed")
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
                observed = workstation_baseline(
                    repository, run, workstation_path or WORKSTATION_FILE
                )
                if observed is not None:
                    return observed
                recovered = recovered_baseline(repository, run, recovery_path or RECOVERY_FILE)
                if recovered is not None:
                    return recovered
                raise ValueError("no retained runtime receipt or proven non-runtime plan")
            observed = workstation_baseline(repository, run, workstation_path or WORKSTATION_FILE)
            if observed is not None:
                return observed
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
        return (
            workstation_baseline(repository, run, workstation_path or WORKSTATION_FILE) or revision
        )
    raise ValueError(
        "no retained successful runtime deployment evidence; re-establish baseline read-only"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    try:
        revision = resolve_baseline(args.repository)
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        zipfile.BadZipFile,
        subprocess.SubprocessError,
    ) as exc:
        raise SystemExit(f"deployed baseline resolution failed: {exc}") from exc
    print(revision)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
