#!/usr/bin/env python3
"""Create, verify, and summarize one bounded AI development task."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import check_changed  # noqa: E402 - sibling CLI module after scripts path setup

ROOT = Path(__file__).resolve().parents[1]
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
UTC = getattr(dt, "UTC", dt.timezone.utc)  # noqa: UP017 - system Python may be 3.9


def now_iso() -> str:
    return dt.datetime.now(UTC).isoformat(timespec="seconds")


def git_text(*args: str, check: bool = True) -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=check,
        capture_output=True,
        text=True,
    ).stdout.strip()


def repository_state() -> dict[str, Any]:
    return {
        "branch": git_text("branch", "--show-current") or "detached",
        "head": git_text("rev-parse", "HEAD"),
        "status_short": git_text("status", "--short"),
        "clean": not bool(git_text("status", "--porcelain=v1")),
    }


def validate_task_worktree(base_ref: str) -> None:
    branch = git_text("branch", "--show-current")
    if not branch.startswith("codex/"):
        raise SystemExit(
            "[fail] task planning requires a dedicated codex/* branch; "
            "create a fresh task worktree from the current base"
        )

    upstream = git_text(
        "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}", check=False
    )
    if upstream and upstream != base_ref:
        raise SystemExit(
            f"[fail] task branch already tracks {upstream}; create a fresh unpublished "
            f"codex/* branch from {base_ref} instead of reusing a published task branch"
        )

    if subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", base_ref, "HEAD"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ).returncode != 0:
        raise SystemExit(
            f"[fail] task branch does not contain current {base_ref}; refresh the task "
            "worktree before planning so validation is based on the current integration truth"
        )


def source_fingerprint(paths: list[str]) -> str:
    digest = hashlib.sha256()
    for path in check_changed.normalize_paths(paths):
        candidate = ROOT / path
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        if candidate.is_file():
            digest.update(f"mode:{candidate.stat().st_mode & 0o777:o}".encode("ascii"))
            digest.update(b"\0")
            digest.update(candidate.read_bytes())
        else:
            digest.update(b"<deleted-or-missing>")
        digest.update(b"\0")
    return digest.hexdigest()


def validate_task_id(task_id: str) -> str:
    if not TASK_ID_PATTERN.fullmatch(task_id):
        raise SystemExit(
            "[fail] task id must be 1-80 characters using letters, digits, "
            "dot, underscore, or hyphen"
        )
    return task_id


def default_envelope_path(task_id: str) -> Path:
    return ROOT / ".runtime" / "ai-tasks" / f"{validate_task_id(task_id)}.json"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def read_envelope(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"[fail] unable to read task envelope {path}: {exc}") from exc
    if payload.get("schema_version") != 1:
        raise SystemExit("[fail] task envelope must use schema_version=1")
    return payload


def create_envelope(args: argparse.Namespace) -> tuple[Path, dict[str, Any]]:
    task_id = validate_task_id(args.task_id)
    validate_task_worktree(args.base)
    paths = (
        check_changed.normalize_paths(args.paths)
        if args.paths
        else check_changed.collect_changed_paths(args.base)
    )
    if not paths:
        raise SystemExit("[fail] no changed files detected for the task envelope")
    python_bin = os.environ.get(
        "NPCINK_CLOUD_PYTHON_BIN", str(ROOT / ".venv" / "bin" / "python")
    )
    workflow_lane = getattr(args, "workflow_lane", "development")
    plan = check_changed.build_plan(paths, python_bin, args.base, workflow_lane)
    state = repository_state()
    elapsed_minutes = (
        args.elapsed_minutes
        if args.elapsed_minutes is not None
        else int(plan["target_elapsed_minutes"])
    )
    budgets = {
        "elapsed_minutes": elapsed_minutes,
        "provider_calls": args.provider_calls,
        "full_gate_executions": args.full_gate_executions,
        "image_builds": args.image_builds,
        "shared_runtime_operations": args.shared_runtime_operations,
    }
    if budgets["elapsed_minutes"] <= 0 or any(
        value < 0 for key, value in budgets.items() if key != "elapsed_minutes"
    ):
        raise SystemExit("[fail] elapsed budget must be positive and resource budgets non-negative")
    payload: dict[str, Any] = {
        "schema_version": 1,
        "task_id": task_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "repository": str(ROOT),
        "base_ref": args.base,
        "base_revision": git_text("rev-parse", args.base),
        "source_state": state,
        "source_fingerprint": source_fingerprint(paths),
        "change": {
            "focused_module": args.module or ", ".join(plan["domains"]) or "unclassified",
            "intended_outcome": args.outcome,
            "non_goals": args.non_goal,
            "public_contracts": args.public_contract,
            "expected_files": paths,
            "rollback": args.rollback,
        },
        "budgets": budgets,
        "plan": plan,
        "verification_runs": [],
        "verification_reuses": [],
    }
    output = Path(args.output).resolve() if args.output else default_envelope_path(task_id)
    write_json(output, payload)
    return output, payload


def rebuild_and_validate_plan(
    envelope: dict[str, Any], python_bin: str
) -> dict[str, Any]:
    base_ref = str(envelope["base_ref"])
    if git_text("rev-parse", base_ref) != envelope.get("base_revision"):
        raise SystemExit("[fail] task base revision changed; regenerate the plan")
    current_paths = check_changed.collect_changed_paths(base_ref)
    planned_paths = list(envelope["plan"]["paths"])
    if current_paths != planned_paths:
        added = sorted(set(current_paths) - set(planned_paths))
        removed = sorted(set(planned_paths) - set(current_paths))
        details = []
        if added:
            details.append("added=" + ",".join(added))
        if removed:
            details.append("removed=" + ",".join(removed))
        raise SystemExit(
            "[fail] task plan is stale; regenerate it before verification"
            + (": " + "; ".join(details) if details else "")
        )
    workflow_lane = str(envelope["plan"].get("workflow_lane", "development"))
    current_plan = check_changed.build_plan(
        current_paths, python_bin, base_ref, workflow_lane
    )
    for key in (
        "classification",
        "tier",
        "tier_reasons",
        "domains",
        "documents",
        "commands",
        "specialized_commands",
        "workflow_lane",
        "target_elapsed_minutes",
        "pr_required",
        "production_required",
        "closeout_authority",
        "runtime_lane",
        "stop_conditions",
        "followups",
    ):
        if current_plan[key] != envelope["plan"].get(key):
            raise SystemExit(
                f"[fail] task plan definition changed at {key}; regenerate it before verification"
            )
    return current_plan


def reusable_verification(
    envelope: dict[str, Any], current_plan: dict[str, Any], current_fingerprint: str
) -> dict[str, Any] | None:
    """Return the latest successful run only for an exact plan/source identity."""
    runs = envelope.get("verification_runs", [])
    if not runs:
        return None
    latest = runs[-1]
    if (
        latest.get("status") == "passed"
        and latest.get("base_revision") == envelope.get("base_revision")
        and latest.get("source_fingerprint_after") == current_fingerprint
        and [item.get("command") for item in latest.get("commands", [])]
        == current_plan.get("commands")
    ):
        return latest
    return None


def plan_source_is_current(envelope: dict[str, Any]) -> bool:
    try:
        return bool(
            git_text("rev-parse", str(envelope["base_ref"]))
            == envelope.get("base_revision")
            and check_changed.collect_changed_paths(str(envelope["base_ref"]))
            == list(envelope["plan"]["paths"])
        )
    except (KeyError, subprocess.SubprocessError, SystemExit):
        return False


def verify_envelope(path: Path, *, reuse_current_evidence: bool = False) -> int:
    envelope = read_envelope(path)
    python_bin = os.environ.get(
        "NPCINK_CLOUD_PYTHON_BIN", str(ROOT / ".venv" / "bin" / "python")
    )
    current_plan = rebuild_and_validate_plan(envelope, python_bin)
    current_fingerprint = source_fingerprint(envelope["plan"]["paths"])
    if reuse_current_evidence:
        reusable = reusable_verification(envelope, current_plan, current_fingerprint)
        if reusable:
            event = {
                "reused_at": now_iso(),
                "base_revision": envelope["base_revision"],
                "source_fingerprint": current_fingerprint,
                "verification_started_at": reusable.get("started_at"),
                "reason": "base revision, source fingerprint, and command plan are unchanged",
            }
            envelope.setdefault("verification_reuses", []).append(event)
            envelope["updated_at"] = now_iso()
            write_json(path, envelope)
            print(
                "[reuse] current successful verification retained; "
                "caller confirmed the environment and risk question are unchanged"
            )
            return 0
    state_before = repository_state()
    run: dict[str, Any] = {
        "started_at": now_iso(),
        "base_revision": envelope["base_revision"],
        "source_state_before": state_before,
        "source_fingerprint_before": current_fingerprint,
        "commands": [],
        "status": "running",
    }
    envelope["verification_runs"].append(run)
    write_json(path, envelope)
    environment = os.environ.copy()
    environment["NPCINK_CLOUD_PYTHON_BIN"] = python_bin

    for command in current_plan["commands"]:
        started = time.monotonic()
        print("[run] " + " ".join(command), flush=True)
        completed = subprocess.run(command, cwd=ROOT, env=environment, check=False)
        result = {
            "command": command,
            "exit_code": completed.returncode,
            "duration_seconds": round(time.monotonic() - started, 3),
            "status": "passed" if completed.returncode == 0 else "failed",
        }
        run["commands"].append(result)
        envelope["updated_at"] = now_iso()
        write_json(path, envelope)
        if completed.returncode != 0:
            run["status"] = "failed"
            run["finished_at"] = now_iso()
            run["source_state_after"] = repository_state()
            run["source_fingerprint_after"] = source_fingerprint(
                envelope["plan"]["paths"]
            )
            write_json(path, envelope)
            return completed.returncode

    run["status"] = "passed"
    run["finished_at"] = now_iso()
    run["source_state_after"] = repository_state()
    run["source_fingerprint_after"] = source_fingerprint(envelope["plan"]["paths"])
    envelope["updated_at"] = now_iso()
    write_json(path, envelope)
    return 0


def receipt_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    current_state = repository_state()
    runs = envelope.get("verification_runs", [])
    latest = runs[-1] if runs else None
    current_fingerprint = source_fingerprint(envelope["plan"]["paths"])
    plan_current = plan_source_is_current(envelope)
    verification_current = bool(
        latest
        and latest.get("status") == "passed"
        and latest.get("base_revision") == envelope.get("base_revision")
        and latest.get("source_fingerprint_after") == current_fingerprint
        and plan_current
    )
    highest_state = "local verified" if verification_current else "not verified"
    return {
        "task_id": envelope["task_id"],
        "tier": envelope["plan"]["tier"],
        "tier_reasons": envelope["plan"]["tier_reasons"],
        "focused_module": envelope["change"]["focused_module"],
        "intended_outcome": envelope["change"]["intended_outcome"],
        "non_goals": envelope["change"]["non_goals"],
        "public_contracts": envelope["change"]["public_contracts"],
        "expected_files": envelope["change"]["expected_files"],
        "documents": envelope["plan"]["documents"],
        "domains": envelope["plan"]["domains"],
        "workflow_lane": envelope["plan"].get("workflow_lane", "development"),
        "target_elapsed_minutes": envelope["plan"].get("target_elapsed_minutes"),
        "pr_required": envelope["plan"].get("pr_required", False),
        "production_required": envelope["plan"].get("production_required", False),
        "closeout_authority": envelope["plan"].get(
            "closeout_authority", "local"
        ),
        "runtime_lane": envelope["plan"].get("runtime_lane", "unclassified"),
        "budgets": envelope["budgets"],
        "latest_verification": latest,
        "latest_verification_reuse": (
            envelope.get("verification_reuses", [])[-1]
            if envelope.get("verification_reuses")
            else None
        ),
        "verification_current": verification_current,
        "plan_current": plan_current,
        "highest_evidence_state": highest_state,
        "current_source_state": current_state,
        "current_source_fingerprint": current_fingerprint,
        "stop_conditions": envelope["plan"].get("stop_conditions", []),
        "followups": envelope["plan"]["followups"],
        "rollback": envelope["change"]["rollback"],
    }


def receipt_markdown(receipt: dict[str, Any]) -> str:
    latest = receipt["latest_verification"]
    gate_lines = ["- not run"]
    if latest:
        gate_lines = [
            f"- `{' '.join(item['command'])}`: {item['status']} ({item['duration_seconds']}s)"
            for item in latest["commands"]
        ]
    return "\n".join(
        [
            "AI_TASK_RECEIPT",
            f"- task: {receipt['task_id']}",
            f"- module: {receipt['focused_module']}",
            f"- tier: {receipt['tier']}",
            f"- workflow lane: {receipt['workflow_lane']}",
            f"- target elapsed minutes: {receipt['target_elapsed_minutes']}",
            f"- closeout authority: {receipt['closeout_authority']}",
            f"- runtime lane: {receipt['runtime_lane']}",
            "- source: "
            f"{receipt['current_source_state']['head']} "
            f"({receipt['current_source_state']['branch']})",
            f"- clean: {str(receipt['current_source_state']['clean']).lower()}",
            f"- highest evidence state: {receipt['highest_evidence_state']}",
            f"- plan current: {str(receipt['plan_current']).lower()}",
            "- files:",
            *[f"  - {item}" for item in receipt["expected_files"]],
            f"- budgets: {json.dumps(receipt['budgets'], ensure_ascii=False, sort_keys=True)}",
            "- gates:",
            *[f"  {line}" for line in gate_lines],
            "- followups:",
            *[f"  - {item}" for item in receipt["followups"]],
            "- stop conditions:",
            *[f"  - {item}" for item in receipt["stop_conditions"]],
            f"- rollback: {receipt['rollback']}",
        ]
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("plan", help="create a structured task envelope")
    plan.add_argument("--task-id", required=True)
    plan.add_argument("--module", default="")
    plan.add_argument("--outcome", required=True)
    plan.add_argument("--non-goal", action="append", default=[])
    plan.add_argument("--public-contract", action="append", default=[])
    plan.add_argument("--rollback", required=True)
    plan.add_argument("--base", default="origin/master")
    plan.add_argument(
        "--workflow-lane",
        choices=tuple(check_changed.WORKFLOW_LANE_TARGET_MINUTES),
        default="development",
        help="declare development, merge, or release closeout without authorizing it",
    )
    plan.add_argument("--output")
    plan.add_argument(
        "--elapsed-minutes",
        type=int,
        help="override the selected workflow lane's target elapsed budget",
    )
    plan.add_argument("--provider-calls", type=int, default=0)
    plan.add_argument("--full-gate-executions", type=int, default=0)
    plan.add_argument("--image-builds", type=int, default=0)
    plan.add_argument("--shared-runtime-operations", type=int, default=0)
    plan.add_argument("paths", nargs="*")

    verify = subparsers.add_parser("verify", help="run and record the planned local gates")
    verify.add_argument("envelope", type=Path)
    verify.add_argument(
        "--reuse-current-evidence",
        action="store_true",
        help=(
            "reuse the latest successful run only when the base revision, source "
            "fingerprint, and command plan are unchanged; the caller remains responsible "
            "for confirming the environment and risk question are unchanged"
        ),
    )

    receipt = subparsers.add_parser("receipt", help="render a closeout receipt")
    receipt.add_argument("envelope", type=Path)
    receipt.add_argument("--format", choices=("markdown", "json"), default="markdown")
    receipt.add_argument("--output")
    return parser


def main() -> int:
    argv = sys.argv[1:]
    if len(argv) > 1 and argv[1] == "--":
        argv.pop(1)
    args = build_parser().parse_args(argv)
    if args.command == "plan":
        output, payload = create_envelope(args)
        print(f"[ok] task envelope written: {output}")
        print(json.dumps(payload["plan"], ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    if args.command == "verify":
        return verify_envelope(
            args.envelope.resolve(),
            reuse_current_evidence=args.reuse_current_evidence,
        )
    envelope = read_envelope(args.envelope.resolve())
    receipt = receipt_payload(envelope)
    rendered = (
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True)
        if args.format == "json"
        else receipt_markdown(receipt)
    )
    if args.output:
        output = Path(args.output).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
        print(f"[ok] receipt written: {output}")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
