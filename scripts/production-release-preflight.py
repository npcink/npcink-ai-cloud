#!/usr/bin/env python3
"""Verify exact production release evidence before manual deployment dispatch."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEPLOY_REQUIRED_SECRETS = frozenset(
    {
        "NPCINK_CLOUD_NO_USER_INTERNAL_VALIDATION_APPROVAL",
        "PROD_SSH_HOST",
        "PROD_SSH_KEY",
        "PROD_SSH_KNOWN_HOSTS",
        "PROD_SSH_USER",
    }
)
FORMAL_SMOKE_REQUIRED_SECRETS = frozenset(
    {
        "NPCINK_CLOUD_ADMIN_KEY",
        "NPCINK_CLOUD_INTERNAL_AUTH_TOKEN",
        "NPCINK_CLOUD_PORTAL_LOGIN_CODE",
        "NPCINK_CLOUD_RELEASE_KEY_ID",
        "NPCINK_CLOUD_RELEASE_KEY_SECRET",
        "NPCINK_CLOUD_RELEASE_MEMBER_EMAIL",
        "NPCINK_CLOUD_RELEASE_SITE_ID",
    }
)
ACTIVE_DEPLOY_STATUSES = frozenset({"queued", "in_progress", "waiting", "requested", "pending"})


class PreflightError(RuntimeError):
    """Raised when release evidence is invalid or incomplete."""


@dataclass(frozen=True)
class ExactRun:
    workflow: str
    run_id: int
    status: str
    conclusion: str


def _require_sha(value: object, label: str) -> str:
    sha = str(value or "").strip().lower()
    if len(sha) != 40 or any(character not in "0123456789abcdef" for character in sha):
        raise PreflightError(f"{label} is not a full Git SHA")
    return sha


def _run_json(command: list[str]) -> Any:
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise PreflightError(f"required command is unavailable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "command failed"
        raise PreflightError(f"{command[0]} failed: {detail}") from exc
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise PreflightError(f"{command[0]} returned invalid JSON") from exc


def _gh_api(repo: str, endpoint: str, **fields: str) -> Any:
    command = ["gh", "api", "--method", "GET", f"repos/{repo}/{endpoint}"]
    for key, value in fields.items():
        command.extend(("-f", f"{key}={value}"))
    return _run_json(command)


def _secret_names(command: list[str]) -> set[str]:
    payload = _run_json(command)
    if not isinstance(payload, list):
        raise PreflightError("GitHub secret metadata must be a list")
    return {
        str(record.get("name") or "").strip()
        for record in payload
        if isinstance(record, dict) and record.get("name")
    }


def _select_exact_run(payload: object, sha: str, workflow: str) -> ExactRun | None:
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise PreflightError(f"{workflow} run metadata is malformed")
    matches = [
        run
        for run in payload["workflow_runs"]
        if isinstance(run, dict) and str(run.get("head_sha") or "").lower() == sha
    ]
    if not matches:
        return None
    run = matches[0]
    run_id = run.get("id")
    if not isinstance(run_id, int) or run_id <= 0:
        raise PreflightError(f"{workflow} run id is invalid")
    return ExactRun(
        workflow=workflow,
        run_id=run_id,
        status=str(run.get("status") or ""),
        conclusion=str(run.get("conclusion") or ""),
    )


def _require_successful_run(run: ExactRun | None) -> str | None:
    if run is None:
        return "run has not started"
    if run.status != "completed":
        return f"run {run.run_id} is {run.status or 'not completed'}"
    if run.conclusion != "success":
        raise PreflightError(
            f"{run.workflow} run {run.run_id} concluded {run.conclusion or 'without a result'}"
        )
    return None


def _require_artifact(payload: object, expected_name: str, label: str) -> int:
    if not isinstance(payload, dict) or not isinstance(payload.get("artifacts"), list):
        raise PreflightError("Cloud CI artifact metadata is malformed")
    matches = [
        artifact
        for artifact in payload["artifacts"]
        if isinstance(artifact, dict)
        and artifact.get("name") == expected_name
        and artifact.get("expired") is False
    ]
    if len(matches) != 1:
        raise PreflightError(
            f"expected exactly one unexpired {expected_name} artifact, found {len(matches)}"
        )
    artifact_id = matches[0].get("id")
    if not isinstance(artifact_id, int) or artifact_id <= 0:
        raise PreflightError(f"{label} artifact id is invalid")
    return artifact_id


def _require_plan_artifact(payload: object, sha: str) -> int:
    return _require_artifact(
        payload,
        f"production-release-plan-{sha}",
        "production release plan",
    )


def _require_bundle_artifact(payload: object, sha: str) -> int:
    return _require_artifact(
        payload,
        f"production-deploy-bundle-{sha}",
        "production deploy bundle",
    )


def _require_bundle_absent(payload: object, sha: str) -> None:
    if not isinstance(payload, dict) or not isinstance(payload.get("artifacts"), list):
        raise PreflightError("Cloud CI artifact metadata is malformed")
    expected_name = f"production-deploy-bundle-{sha}"
    matches = [
        artifact
        for artifact in payload["artifacts"]
        if isinstance(artifact, dict)
        and artifact.get("name") == expected_name
        and artifact.get("expired") is False
    ]
    if matches:
        raise PreflightError(
            f"non-runtime release unexpectedly produced {expected_name}"
        )


def _resolve_release_action(
    plan_path: Path,
    *,
    repository: str,
    sha: str,
    tree: str,
) -> str:
    module_path = Path(__file__).resolve().with_name(
        "resolve-production-release-action.py"
    )
    spec = importlib.util.spec_from_file_location(
        "npcink_production_release_action",
        module_path,
    )
    if spec is None or spec.loader is None:
        raise PreflightError("production release action resolver cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        payload = json.loads(plan_path.read_text(encoding="utf-8"))
        resolution = module.resolve_plan(
            payload,
            expected_repository=repository,
            expected_head_sha=sha,
            expected_head_tree=tree,
        )
    except Exception as exc:
        raise PreflightError(f"production release plan validation failed: {exc}") from exc
    finally:
        sys.modules.pop(spec.name, None)
    return str(resolution.action)


def _download_release_action(repo: str, run_id: int, sha: str, tree: str) -> str:
    with tempfile.TemporaryDirectory(prefix="npcink-production-plan-") as directory:
        try:
            subprocess.run(
                [
                    "gh",
                    "run",
                    "download",
                    str(run_id),
                    "--repo",
                    repo,
                    "--name",
                    f"production-release-plan-{sha}",
                    "--dir",
                    directory,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError) as exc:
            detail = getattr(exc, "stderr", "") or str(exc)
            raise PreflightError(
                f"production release plan artifact download failed: {detail.strip()}"
            ) from exc
        return _resolve_release_action(
            Path(directory) / "production-release-plan.json",
            repository=repo,
            sha=sha,
            tree=tree,
        )


def _active_deploy_ids(payload: object, sha: str) -> list[int]:
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise PreflightError("Deploy Production run metadata is malformed")
    active: list[int] = []
    for run in payload["workflow_runs"]:
        if not isinstance(run, dict):
            continue
        if str(run.get("head_sha") or "").lower() != sha:
            continue
        if str(run.get("status") or "") not in ACTIVE_DEPLOY_STATUSES:
            continue
        run_id = run.get("id")
        if isinstance(run_id, int) and run_id > 0:
            active.append(run_id)
    return active


def _missing(required: frozenset[str], available: set[str]) -> list[str]:
    return sorted(required - available)


def evaluate_snapshot(
    snapshot: dict[str, Any],
    *,
    expected_sha: str | None,
    require_formal_smoke: bool,
) -> dict[str, Any]:
    sha = _require_sha(snapshot.get("production_sha"), "production SHA")
    if expected_sha is not None and sha != _require_sha(expected_sha, "expected SHA"):
        raise PreflightError("requested SHA does not match the current production branch")

    ci_run = _select_exact_run(snapshot.get("ci_runs"), sha, "Cloud CI")
    codeql_run = _select_exact_run(snapshot.get("codeql_runs"), sha, "CodeQL")
    pending = [
        detail
        for detail in (_require_successful_run(ci_run), _require_successful_run(codeql_run))
        if detail is not None
    ]
    if pending:
        raise PreflightError("exact production checks are not ready: " + "; ".join(pending))
    assert ci_run is not None
    assert codeql_run is not None

    active_deploys = _active_deploy_ids(snapshot.get("deploy_runs"), sha)
    if active_deploys:
        joined = ", ".join(str(run_id) for run_id in active_deploys)
        raise PreflightError(f"Deploy Production is already active for this SHA: {joined}")

    plan_artifact_id = _require_plan_artifact(snapshot.get("artifacts"), sha)
    release_action = str(snapshot.get("release_action") or "")
    if release_action == "runtime":
        bundle_artifact_id: int | None = _require_bundle_artifact(
            snapshot.get("artifacts"), sha
        )
    elif release_action in {"no_deploy", "static"}:
        _require_bundle_absent(snapshot.get("artifacts"), sha)
        bundle_artifact_id = None
    else:
        raise PreflightError(f"unsupported production release action: {release_action}")
    if require_formal_smoke and release_action != "runtime":
        raise PreflightError("formal release smoke requires a runtime release action")
    available_secrets = set(snapshot.get("repository_secrets") or []) | set(
        snapshot.get("environment_secrets") or []
    )
    missing_deploy = _missing(DEPLOY_REQUIRED_SECRETS, available_secrets)
    if missing_deploy:
        raise PreflightError("missing deployment secret names: " + ", ".join(missing_deploy))
    missing_smoke = _missing(FORMAL_SMOKE_REQUIRED_SECRETS, available_secrets)
    if require_formal_smoke and missing_smoke:
        raise PreflightError("missing formal smoke secret names: " + ", ".join(missing_smoke))

    return {
        "schema": "npcink.production_release_preflight.v1",
        "repository": str(snapshot.get("repository") or ""),
        "production_sha": sha,
        "cloud_ci_run_id": ci_run.run_id,
        "codeql_run_id": codeql_run.run_id,
        "release_action": release_action,
        "plan_artifact_id": plan_artifact_id,
        "bundle_artifact_id": bundle_artifact_id,
        "deploy_secrets_ready": True,
        "formal_smoke_secrets_ready": not missing_smoke,
        "missing_formal_smoke_secret_names": missing_smoke,
        "active_deploy_run_ids": [],
        "release_preflight": "ready",
    }


def _live_snapshot(repo: str) -> dict[str, Any]:
    production_ref = _gh_api(repo, "git/ref/heads/production")
    if not isinstance(production_ref, dict) or not isinstance(production_ref.get("object"), dict):
        raise PreflightError("production branch metadata is malformed")
    sha = _require_sha(production_ref["object"].get("sha"), "production SHA")
    ci_runs = _gh_api(
        repo,
        "actions/workflows/ci.yml/runs",
        branch="production",
        event="push",
        per_page="30",
    )
    codeql_runs = _gh_api(
        repo,
        "actions/workflows/codeql.yml/runs",
        branch="production",
        event="push",
        per_page="30",
    )
    ci_run = _select_exact_run(ci_runs, sha, "Cloud CI")
    codeql_run = _select_exact_run(codeql_runs, sha, "CodeQL")
    checks_ready = all(
        run is not None and run.status == "completed" and run.conclusion == "success"
        for run in (ci_run, codeql_run)
    )
    deploy_runs: dict[str, Any] = {"workflow_runs": []}
    artifacts: dict[str, Any] = {"artifacts": []}
    release_action = ""
    repository_secrets: set[str] = set()
    environment_secrets: set[str] = set()
    if checks_ready:
        deploy_runs = _gh_api(
            repo,
            "actions/workflows/deploy-production.yml/runs",
            branch="production",
            per_page="30",
        )
        assert ci_run is not None
        artifacts = _gh_api(repo, f"actions/runs/{ci_run.run_id}/artifacts", per_page="100")
        _require_plan_artifact(artifacts, sha)
        commit = _gh_api(repo, f"git/commits/{sha}")
        if not isinstance(commit, dict) or not isinstance(commit.get("tree"), dict):
            raise PreflightError("production commit tree metadata is malformed")
        tree = _require_sha(commit["tree"].get("sha"), "production tree")
        release_action = _download_release_action(repo, ci_run.run_id, sha, tree)
        repository_secrets = _secret_names(
            ["gh", "secret", "list", "--repo", repo, "--json", "name"]
        )
        environment_secrets = _secret_names(
            [
                "gh",
                "secret",
                "list",
                "--repo",
                repo,
                "--env",
                "production",
                "--json",
                "name",
            ]
        )
    return {
        "repository": repo,
        "production_sha": sha,
        "ci_runs": ci_runs,
        "codeql_runs": codeql_runs,
        "deploy_runs": deploy_runs,
        "artifacts": artifacts,
        "release_action": release_action,
        "repository_secrets": sorted(repository_secrets),
        "environment_secrets": sorted(environment_secrets),
    }


def _resolve_repo(explicit_repo: str | None) -> str:
    if explicit_repo:
        return explicit_repo
    payload = _run_json(["gh", "repo", "view", "--json", "nameWithOwner"])
    if not isinstance(payload, dict) or not payload.get("nameWithOwner"):
        raise PreflightError("could not resolve the GitHub repository")
    return str(payload["nameWithOwner"])


def render_text(result: dict[str, Any]) -> str:
    missing_smoke = result["missing_formal_smoke_secret_names"]
    smoke_status = "ready" if not missing_smoke else "missing:" + ",".join(missing_smoke)
    bundle_artifact = result["bundle_artifact_id"]
    bundle_artifact_text = (
        str(bundle_artifact) if bundle_artifact is not None else "not_applicable"
    )
    return "\n".join(
        (
            f"production_sha={result['production_sha']}",
            f"dispatch_expected_sha={result['production_sha']}",
            f"cloud_ci_run_id={result['cloud_ci_run_id']}",
            f"codeql_run_id={result['codeql_run_id']}",
            f"release_action={result['release_action']}",
            f"plan_artifact_id={result['plan_artifact_id']}",
            f"bundle_artifact_id={bundle_artifact_text}",
            "deploy_secrets=ready",
            f"formal_smoke_secrets={smoke_status}",
            "active_deploy=none",
            "release_preflight=ready",
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="GitHub repository in OWNER/REPO form")
    parser.add_argument("--sha", help="expected exact production SHA")
    parser.add_argument("--wait-seconds", type=int, default=900)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--require-formal-smoke", action="store_true")
    parser.add_argument("--snapshot", type=Path, help="evaluate saved non-secret metadata")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)
    if args.wait_seconds < 0 or args.poll_seconds < 1:
        raise SystemExit("wait seconds must be non-negative and poll seconds must be positive")
    if shutil.which("gh") is None and args.snapshot is None:
        raise SystemExit("gh CLI is required for live production preflight")

    try:
        if args.snapshot is not None:
            snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
            if not isinstance(snapshot, dict):
                raise PreflightError("snapshot must be a JSON object")
            result = evaluate_snapshot(
                snapshot,
                expected_sha=args.sha,
                require_formal_smoke=args.require_formal_smoke,
            )
        else:
            repo = _resolve_repo(args.repo)
            deadline = time.monotonic() + args.wait_seconds
            while True:
                snapshot = _live_snapshot(repo)
                try:
                    result = evaluate_snapshot(
                        snapshot,
                        expected_sha=args.sha,
                        require_formal_smoke=args.require_formal_smoke,
                    )
                    break
                except PreflightError as exc:
                    message = str(exc)
                    if not message.startswith("exact production checks are not ready:"):
                        raise
                    if time.monotonic() >= deadline:
                        raise PreflightError(f"timed out waiting for {message}") from exc
                    print(f"[wait] {message}", file=sys.stderr)
                    time.sleep(args.poll_seconds)
    except (OSError, json.JSONDecodeError, PreflightError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
    else:
        print(render_text(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
