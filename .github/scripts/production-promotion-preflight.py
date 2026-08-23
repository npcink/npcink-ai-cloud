#!/usr/bin/env python3
"""Run fail-closed, pre-promotion production readiness checks."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

SCHEMA = "npcink.production_promotion_preflight.v1"
ACTIVE_DEPLOY_STATUSES = frozenset(
    {"queued", "in_progress", "waiting", "requested", "pending"}
)
REQUEST_ID_PATTERN = re.compile(r"^preflight-[0-9a-f]{12}$")


class PromotionPreflightError(RuntimeError):
    """Raised when a promotion candidate is not ready."""


@dataclass(frozen=True)
class Candidate:
    branch: str
    base_sha: str
    candidate_sha: str
    candidate_tree: str
    changed_files: tuple[str, ...]
    predicted_lane: str


def _load_module(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise PromotionPreflightError(f"cannot load release helper: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise PromotionPreflightError(f"cannot load release helper {path}: {exc}") from exc
    return module


def _run(command: list[str], *, cwd: Path) -> str:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise PromotionPreflightError(f"required command is unavailable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "command failed"
        raise PromotionPreflightError(f"{command[0]} failed: {detail}") from exc
    return completed.stdout


def _run_json(command: list[str], *, cwd: Path) -> Any:
    output = _run(command, cwd=cwd)
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise PromotionPreflightError(f"{command[0]} returned invalid JSON") from exc


def _git(root: Path, *args: str) -> str:
    return _run(["git", *args], cwd=root).strip()


def inspect_candidate(root: Path, *, base_ref: str, candidate_ref: str) -> Candidate:
    if _git(root, "status", "--porcelain"):
        raise PromotionPreflightError("candidate worktree must be clean")
    branch = _git(root, "branch", "--show-current")
    if branch != "master" and not branch.startswith("release-fix/"):
        raise PromotionPreflightError("candidate branch must be master or release-fix/*")
    head_sha = _git(root, "rev-parse", "HEAD")
    candidate_sha = _git(root, "rev-parse", candidate_ref)
    if head_sha != candidate_sha:
        raise PromotionPreflightError("candidate ref must resolve to the checked-out HEAD")
    if branch == "master" and _git(root, "rev-parse", "origin/master") != head_sha:
        raise PromotionPreflightError("local master must match origin/master")
    base_sha = _git(root, "rev-parse", base_ref)
    candidate_tree = _git(root, "rev-parse", f"{candidate_ref}^{{tree}}")
    changed_files = tuple(
        line
        for line in _git(root, "diff", "--name-only", base_ref, candidate_ref).splitlines()
        if line
    )
    planner = _load_module(
        "npcink_production_release_plan_for_promotion",
        root / "scripts" / "production-release-plan.py",
    )
    lane, _, normalized_files = planner.classify_release(changed_files)
    return Candidate(
        branch=branch,
        base_sha=base_sha,
        candidate_sha=candidate_sha,
        candidate_tree=candidate_tree,
        changed_files=normalized_files,
        predicted_lane=lane,
    )


def _active_deploy_ids(payload: object) -> list[int]:
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise PromotionPreflightError("Deploy Production run metadata is malformed")
    active: list[int] = []
    for run in payload["workflow_runs"]:
        if not isinstance(run, dict):
            continue
        if str(run.get("status") or "") not in ACTIVE_DEPLOY_STATUSES:
            continue
        run_id = run.get("id")
        if isinstance(run_id, int) and run_id > 0:
            active.append(run_id)
    return sorted(active)


def _require_deploy_secret_metadata(preflight: ModuleType, repo: str) -> None:
    try:
        repository_names = preflight._secret_names(
            ["gh", "secret", "list", "--repo", repo, "--json", "name"]
        )
        environment_names = preflight._secret_names(
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
    except preflight.PreflightError as exc:
        raise PromotionPreflightError(str(exc)) from exc
    missing = sorted(
        preflight.DEPLOY_REQUIRED_SECRETS - (repository_names | environment_names)
    )
    if missing:
        raise PromotionPreflightError("required deployment secret metadata is incomplete")


def _resolve_remote_branch_sha(preflight: ModuleType, repo: str, branch: str) -> str:
    try:
        payload = preflight._gh_api(repo, f"git/ref/heads/{branch}")
    except preflight.PreflightError as exc:
        raise PromotionPreflightError(str(exc)) from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("object"), dict):
        raise PromotionPreflightError(f"{branch} branch metadata is malformed")
    try:
        return preflight._require_sha(payload["object"].get("sha"), f"{branch} SHA")
    except Exception as exc:
        raise PromotionPreflightError(str(exc)) from exc


def _require_no_active_deploy(preflight: ModuleType, repo: str) -> None:
    active: set[int] = set()
    for status in sorted(ACTIVE_DEPLOY_STATUSES):
        try:
            payload = preflight._gh_api(
                repo,
                "actions/workflows/deploy-production.yml/runs",
                event="workflow_dispatch",
                status=status,
                per_page="100",
            )
        except preflight.PreflightError as exc:
            raise PromotionPreflightError(str(exc)) from exc
        active.update(_active_deploy_ids(payload))
    if active:
        raise PromotionPreflightError(
            "Deploy Production is already active: "
            + ", ".join(map(str, sorted(active)))
        )


def _production_workflow_supports_request_id(root: Path, repo: str) -> bool:
    source = _run(
        [
            "gh",
            "api",
            "--method",
            "GET",
            "-H",
            "Accept: application/vnd.github.raw+json",
            f"repos/{repo}/contents/.github/workflows/production-maintenance.yml",
            "-f",
            "ref=production",
        ],
        cwd=root,
    )
    return "readiness_request_id:" in source and "inputs.readiness_request_id" in source


def _certificate_runs(root: Path, repo: str) -> list[dict[str, Any]]:
    payload = _run_json(
        [
            "gh",
            "run",
            "list",
            "--repo",
            repo,
            "--workflow",
            "production-maintenance.yml",
            "--event",
            "workflow_dispatch",
            "--limit",
            "30",
            "--json",
            "databaseId,displayTitle,status,conclusion,headSha",
        ],
        cwd=root,
    )
    if not isinstance(payload, list) or any(not isinstance(run, dict) for run in payload):
        raise PromotionPreflightError("certificate readiness run metadata is malformed")
    return payload


def _dispatch_certificate_readiness(
    root: Path,
    repo: str,
    request_id: str | None,
) -> None:
    if request_id is not None and REQUEST_ID_PATTERN.fullmatch(request_id) is None:
        raise PromotionPreflightError("certificate readiness request id is invalid")
    command = [
        "gh",
        "workflow",
        "run",
        "production-maintenance.yml",
        "--repo",
        repo,
        "--ref",
        "production",
        "-f",
        "action=certificate-readiness",
    ]
    if request_id is not None:
        command.extend(("-f", f"readiness_request_id={request_id}"))
    _run(command, cwd=root)


def _require_bootstrap_certificate_log(root: Path, repo: str, run_id: int) -> None:
    log = _run(
        ["gh", "run", "view", str(run_id), "--repo", repo, "--log"],
        cwd=root,
    )
    if re.search(
        r"\[certificate-preflight:(?:ok|warn)\] readiness receipt ",
        log,
    ) is None:
        raise PromotionPreflightError(
            "bootstrap maintenance run lacks certificate readiness evidence"
        )


def _wait_for_certificate_readiness(
    root: Path,
    *,
    repo: str,
    request_id: str | None,
    baseline_run_ids: set[int],
    production_sha: str,
    wait_seconds: int,
    poll_seconds: int,
) -> int:
    expected_title = (
        f"Production Maintenance / certificate-readiness / {request_id}"
        if request_id is not None
        else None
    )
    deadline = time.monotonic() + wait_seconds
    while True:
        payload = _certificate_runs(root, repo)
        matches = [
            run
            for run in payload
            if (
                run.get("displayTitle") == expected_title
                if expected_title is not None
                else run.get("databaseId") not in baseline_run_ids
                and str(run.get("headSha") or "").lower() == production_sha
            )
        ]
        if len(matches) > 1:
            raise PromotionPreflightError("certificate readiness run is not unique")
        if matches:
            run = matches[0]
            run_id = run.get("databaseId")
            if not isinstance(run_id, int) or run_id <= 0:
                raise PromotionPreflightError("certificate readiness run id is invalid")
            if str(run.get("headSha") or "").lower() != production_sha:
                raise PromotionPreflightError(
                    "certificate readiness run does not match the production SHA"
                )
            status = str(run.get("status") or "")
            if status == "completed":
                conclusion = str(run.get("conclusion") or "")
                if conclusion != "success":
                    raise PromotionPreflightError(
                        f"certificate readiness run {run_id} concluded {conclusion or 'unknown'}"
                    )
                if request_id is None:
                    _require_bootstrap_certificate_log(root, repo, run_id)
                return run_id
        if time.monotonic() >= deadline:
            raise PromotionPreflightError("timed out waiting for certificate readiness")
        time.sleep(poll_seconds)


def _run_local_gates(root: Path, python_bin: str) -> None:
    _run([python_bin, "-m", "ruff", "check", "."], cwd=root)
    _run(["bash", "scripts/check-release-policy.sh"], cwd=root)


def _release_action(lane: str) -> str:
    if lane == "no_deploy":
        return "no_deploy"
    if lane == "static":
        return "static"
    return "runtime"


def render_text(result: dict[str, Any]) -> str:
    keys = (
        "promotion_preflight",
        "repository",
        "candidate_branch",
        "candidate_sha",
        "production_sha",
        "predicted_lane",
        "predicted_release_action",
        "certificate_readiness_run_id",
        "local_gates",
        "deploy_secrets_ready",
        "active_deploy_run_ids",
    )
    return "\n".join(
        f"{key}="
        + (
            ",".join(map(str, result[key])) or "none"
            if isinstance(result[key], list)
            else "not_applicable"
            if result[key] is None
            else str(result[key])
        )
        for key in keys
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="npcink/npcink-ai-cloud")
    parser.add_argument("--base-ref", default="origin/production")
    parser.add_argument("--candidate-ref", default="HEAD")
    parser.add_argument("--python-bin")
    parser.add_argument("--wait-seconds", type=int, default=600)
    parser.add_argument("--poll-seconds", type=int, default=10)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)
    if args.wait_seconds < 1 or args.poll_seconds < 1:
        raise SystemExit("wait seconds and poll seconds must be positive")
    root = Path(__file__).resolve().parents[2]
    python_bin = args.python_bin or os.environ.get("NPCINK_CLOUD_PYTHON_BIN")
    if not python_bin:
        python_bin = str(root / ".venv" / "bin" / "python")
    if shutil.which("gh") is None:
        raise SystemExit("gh CLI is required for promotion preflight")
    if not Path(python_bin).is_file():
        raise SystemExit(f"Python environment is unavailable: {python_bin}")

    started = time.monotonic()
    try:
        candidate = inspect_candidate(
            root,
            base_ref=args.base_ref,
            candidate_ref=args.candidate_ref,
        )
        _run_local_gates(root, python_bin)
        preflight = _load_module(
            "npcink_production_release_preflight_for_promotion",
            root / "scripts" / "production-release-preflight.py",
        )
        production_sha = _resolve_remote_branch_sha(preflight, args.repo, "production")
        if production_sha != candidate.base_sha:
            raise PromotionPreflightError(
                "local production base does not match the current GitHub production SHA"
            )
        remote_candidate_sha = _resolve_remote_branch_sha(
            preflight,
            args.repo,
            candidate.branch,
        )
        if remote_candidate_sha != candidate.candidate_sha:
            raise PromotionPreflightError(
                "candidate SHA does not match the current GitHub branch"
            )
        _require_deploy_secret_metadata(preflight, args.repo)
        _require_no_active_deploy(preflight, args.repo)
        release_action = _release_action(candidate.predicted_lane)
        certificate_run_id: int | None = None
        if release_action != "no_deploy":
            supports_request_id = _production_workflow_supports_request_id(
                root,
                args.repo,
            )
            request_id = (
                f"preflight-{uuid.uuid4().hex[:12]}" if supports_request_id else None
            )
            baseline_run_ids = {
                run["databaseId"]
                for run in _certificate_runs(root, args.repo)
                if isinstance(run.get("databaseId"), int)
            }
            _dispatch_certificate_readiness(root, args.repo, request_id)
            certificate_run_id = _wait_for_certificate_readiness(
                root,
                repo=args.repo,
                request_id=request_id,
                baseline_run_ids=baseline_run_ids,
                production_sha=production_sha,
                wait_seconds=args.wait_seconds,
                poll_seconds=args.poll_seconds,
            )
        if (
            _resolve_remote_branch_sha(preflight, args.repo, "production")
            != production_sha
        ):
            raise PromotionPreflightError(
                "production SHA changed during the certificate readiness check"
            )
        if (
            _resolve_remote_branch_sha(preflight, args.repo, candidate.branch)
            != candidate.candidate_sha
        ):
            raise PromotionPreflightError(
                "candidate SHA changed during the certificate readiness check"
            )
        _require_no_active_deploy(preflight, args.repo)
        result = {
            "schema": SCHEMA,
            "promotion_preflight": "ready",
            "repository": args.repo,
            "candidate_branch": candidate.branch,
            "candidate_sha": candidate.candidate_sha,
            "candidate_tree": candidate.candidate_tree,
            "production_sha": production_sha,
            "changed_files": list(candidate.changed_files),
            "predicted_lane": candidate.predicted_lane,
            "predicted_release_action": release_action,
            "certificate_readiness_run_id": certificate_run_id,
            "local_gates": "passed",
            "deploy_secrets_ready": True,
            "active_deploy_run_ids": [],
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }
    except (OSError, PromotionPreflightError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1
    if args.format == "json":
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(render_text(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
