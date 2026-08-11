#!/usr/bin/env python3
"""Report GitHub Actions release timing from saved JSON or gh CLI output."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class JobTiming:
    name: str
    conclusion: str
    seconds: int | None


@dataclass(frozen=True)
class DeployPhaseTiming:
    label: str
    category: str
    seconds: int
    conclusion: str
    exit_status: int
    depth: int | None
    parent_label: str | None
    counted_in_category_totals: bool


DEPLOY_TIMING_PATTERN = re.compile(
    r"^\[timing\] (?P<label>.+): (?P<seconds>[0-9]+)s"
    r"(?: \(failed: (?P<exit_status>[0-9]+)\))?$"
)
DEPLOY_TIMING_START_PATTERN = re.compile(r"^\[timing\] (?P<label>.+): start$")
DEPLOY_TIMING_WRAPPER_LABELS = {
    "remote deploy sequence",
    "remote load and up",
    "stop public and write-capable application services",
    "remote start data services only",
    "remote migrate",
    "remote start new API only",
    "remote start new workers after API readiness",
    "remote restore frontend and proxy traffic last",
}
DEPLOY_CATEGORIES = (
    "bundle",
    "transfer",
    "image_load",
    "migration",
    "cutover",
    "health",
    "other",
)


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)  # noqa: UP017
    return parsed


def duration_seconds(started_at: str | None, completed_at: str | None) -> int | None:
    started = parse_timestamp(started_at)
    completed = parse_timestamp(completed_at)
    if started is None or completed is None:
        return None
    return max(0, round((completed - started).total_seconds()))


def format_duration(seconds: int | None) -> str:
    if seconds is None:
        return "n/a"
    minutes, remaining = divmod(seconds, 60)
    if minutes == 0:
        return f"{remaining}s"
    return f"{minutes}m{remaining:02d}s"


def load_run_json(path: Path | None, run_id: str | None, repo: str | None) -> dict[str, Any]:
    if path is not None:
        return json.loads(path.read_text(encoding="utf-8"))
    if not run_id:
        raise SystemExit("--run-id is required unless --from-file is used")
    command = [
        "gh",
        "run",
        "view",
        run_id,
        "--json",
        (
            "databaseId,workflowName,displayTitle,event,headBranch,headSha,url,"
            "status,conclusion,createdAt,updatedAt,jobs"
        ),
    ]
    if repo:
        command.extend(["--repo", repo])
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise SystemExit("gh CLI is required when --from-file is not used") from exc
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(exc.stderr)
        raise SystemExit(exc.returncode) from exc
    return json.loads(completed.stdout)


def collect_job_timings(run: dict[str, Any]) -> list[JobTiming]:
    jobs = run.get("jobs") or []
    timings: list[JobTiming] = []
    for job in jobs:
        timings.append(
            JobTiming(
                name=str(job.get("name") or "(unnamed)"),
                conclusion=str(job.get("conclusion") or job.get("status") or "unknown"),
                seconds=duration_seconds(job.get("startedAt"), job.get("completedAt")),
            )
        )
    return sorted(
        timings,
        key=lambda item: -1 if item.seconds is None else item.seconds,
        reverse=True,
    )


def summarize(run: dict[str, Any]) -> dict[str, Any]:
    jobs = collect_job_timings(run)
    run_seconds = duration_seconds(run.get("createdAt"), run.get("updatedAt"))
    return {
        "schema": "npcink.release_timing.v1",
        "kind": "github_actions_run",
        "run_id": run.get("databaseId"),
        "workflow_name": run.get("workflowName"),
        "display_title": run.get("displayTitle"),
        "event": run.get("event"),
        "head_branch": run.get("headBranch"),
        "head_sha": run.get("headSha"),
        "url": run.get("url"),
        "status": run.get("status") or "unknown",
        "conclusion": run.get("conclusion") or "unknown",
        "duration_seconds": run_seconds,
        "duration": format_duration(run_seconds),
        "jobs": [
            {
                "name": job.name,
                "conclusion": job.conclusion,
                "duration_seconds": job.seconds,
                "duration": format_duration(job.seconds),
            }
            for job in jobs
        ],
    }


def classify_deploy_phase(label: str) -> str:
    normalized = label.casefold()
    if label == "remote deploy sequence":
        return "wrapper"
    if "build deploy bundle" in normalized or "verify local deploy bundle" in normalized:
        return "bundle"
    if any(
        marker in normalized
        for marker in (
            "upload ",
            "transfer inventory",
            "remote directory",
            "remote architecture",
            "ssh reachability",
            "remote deploy bundle before extraction",
            "remote extract bundle",
        )
    ):
        return "transfer"
    if "remote load and up" in normalized:
        return "image_load"
    if "migrat" in normalized or "alembic" in normalized:
        return "migration"
    if any(
        marker in normalized
        for marker in (
            "stop public",
            "application services stopped",
            "start data services",
            "start new api",
            "start new workers",
            "restore frontend",
            "preserved runtime service",
            "preserved backend service",
        )
    ):
        return "cutover"
    if any(
        marker in normalized
        for marker in (
            "readiness",
            "baseline status",
            "remote smoke",
            "portal smoke",
            "refresh providers",
            "seed runtime",
        )
    ):
        return "health"
    return "other"


def collect_deploy_phase_timings(log_text: str) -> list[DeployPhaseTiming]:
    phases: list[DeployPhaseTiming] = []
    active_wrappers: list[str] = []
    active_phase_starts: dict[str, list[tuple[int, str | None]]] = {}
    for raw_line in log_text.splitlines():
        line = raw_line.strip()
        start_match = DEPLOY_TIMING_START_PATTERN.match(line)
        if start_match is not None:
            label = start_match.group("label")
            parent_label = active_wrappers[-1] if active_wrappers else None
            active_phase_starts.setdefault(label, []).append(
                (len(active_wrappers), parent_label)
            )
            if label in DEPLOY_TIMING_WRAPPER_LABELS:
                active_wrappers.append(label)
            continue
        match = DEPLOY_TIMING_PATTERN.match(line)
        if match is None:
            continue
        label = match.group("label")
        depth: int | None = None
        parent_label: str | None = None
        starts = active_phase_starts.get(label)
        if starts:
            depth, parent_label = starts.pop()
            if not starts:
                del active_phase_starts[label]
        if label in DEPLOY_TIMING_WRAPPER_LABELS:
            for index in range(len(active_wrappers) - 1, -1, -1):
                if active_wrappers[index] == label:
                    del active_wrappers[index]
                    break
        exit_status = int(match.group("exit_status") or "0")
        category = classify_deploy_phase(label)
        counted_in_category_totals = category != "wrapper" and (
            depth is None or depth == 0 or parent_label == "remote deploy sequence"
        )
        phases.append(
            DeployPhaseTiming(
                label=label,
                category=category,
                seconds=int(match.group("seconds")),
                conclusion="success" if exit_status == 0 else "failure",
                exit_status=exit_status,
                depth=depth,
                parent_label=parent_label,
                counted_in_category_totals=counted_in_category_totals,
            )
        )
    return phases


def summarize_deploy_log(
    log_text: str,
    *,
    repository: str,
    head_sha: str,
    workflow_run_id: str,
    release_lane: str,
    release_action: str,
    deploy_exit_status: int,
) -> dict[str, Any]:
    phases = collect_deploy_phase_timings(log_text)
    category_seconds = {category: 0 for category in DEPLOY_CATEGORIES}
    for phase in phases:
        if phase.counted_in_category_totals and phase.category in category_seconds:
            category_seconds[phase.category] += phase.seconds
    remote_sequence_seconds = next(
        (
            phase.seconds
            for phase in reversed(phases)
            if phase.label == "remote deploy sequence"
        ),
        None,
    )
    recorded_total_seconds = sum(category_seconds.values())
    return {
        "schema": "npcink.release_timing.v1",
        "kind": "production_deploy_phases",
        "repository": repository,
        "head_sha": head_sha,
        "workflow_run_id": workflow_run_id,
        "release_lane": release_lane,
        "release_action": release_action,
        "status": "success" if deploy_exit_status == 0 else "failure",
        "deploy_exit_status": deploy_exit_status,
        "recorded_total_seconds": recorded_total_seconds,
        "remote_sequence_seconds": remote_sequence_seconds,
        "category_seconds": category_seconds,
        "phases": [
            {
                "label": phase.label,
                "category": phase.category,
                "duration_seconds": phase.seconds,
                "conclusion": phase.conclusion,
                "exit_status": phase.exit_status,
                "depth": phase.depth,
                "parent_label": phase.parent_label,
                "counted_in_category_totals": phase.counted_in_category_totals,
            }
            for phase in phases
        ],
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Release Timing Report",
        "",
        f"- Run status: `{summary['status']}`",
        f"- Run conclusion: `{summary['conclusion']}`",
        f"- Run wall time: `{summary['duration']}`",
        "",
        "| Job | Conclusion | Duration |",
        "| --- | --- | ---: |",
    ]
    for job in summary["jobs"]:
        lines.append(f"| {job['name']} | {job['conclusion']} | {job['duration']} |")
    return "\n".join(lines)


def render_deploy_markdown(summary: dict[str, Any]) -> str:
    remote_sequence = summary["remote_sequence_seconds"]
    recorded_total = summary["recorded_total_seconds"]
    lines = [
        "# Production Deploy Phase Timing",
        "",
        f"- Release lane: {summary['release_lane']}",
        f"- Release action: {summary['release_action']}",
        f"- Deploy status: {summary['status']}",
        f"- Recorded phase total: {format_duration(recorded_total)}",
        f"- Remote sequence: {format_duration(remote_sequence)}",
        "",
        "| Category | Duration |",
        "| --- | ---: |",
    ]
    for category in DEPLOY_CATEGORIES:
        lines.append(
            f"| {category} | {format_duration(summary['category_seconds'][category])} |"
        )
    lines.extend(
        [
            "",
            "| Slowest recorded phase | Category | Counted | Conclusion | Duration |",
            "| --- | --- | --- | --- | ---: |",
        ]
    )
    slowest = sorted(
        summary["phases"],
        key=lambda phase: phase["duration_seconds"],
        reverse=True,
    )[:10]
    for phase in slowest:
        lines.append(
            f"| {phase['label']} | {phase['category']} | "
            f"{'yes' if phase['counted_in_category_totals'] else 'no'} | "
            f"{phase['conclusion']} | {format_duration(phase['duration_seconds'])} |"
        )
    if not slowest:
        lines.append("| no recorded phases | other | no | unknown | n/a |")
    return "\n".join(lines)


def write_receipt(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_id", nargs="?", help="GitHub Actions run id")
    parser.add_argument("--repo", help="owner/repo for gh run view")
    parser.add_argument("--from-file", type=Path, help="read gh run view JSON from a file")
    parser.add_argument("--deploy-log", type=Path, help="parse deploy timing lines")
    parser.add_argument("--source-repository", default="unknown")
    parser.add_argument("--source-sha", default="unknown")
    parser.add_argument("--workflow-run-id", default="unknown")
    parser.add_argument("--release-lane", default="unknown")
    parser.add_argument("--release-action", default="unknown")
    parser.add_argument("--deploy-exit-status", type=int, default=0)
    parser.add_argument("--receipt-output", type=Path)
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    if args.deploy_log is not None:
        if args.from_file is not None or args.run_id:
            parser.error("--deploy-log cannot be combined with a run id or --from-file")
        if "/" not in args.source_repository:
            parser.error("--source-repository must be an owner/repository value")
        if re.fullmatch(r"[0-9a-f]{40}", args.source_sha) is None:
            parser.error("--source-sha must be a full lowercase Git SHA")
        if not args.workflow_run_id.isdigit():
            parser.error("--workflow-run-id must be numeric")
        if args.release_lane == "unknown" or args.release_action == "unknown":
            parser.error("--release-lane and --release-action are required")
        if args.deploy_exit_status < 0:
            parser.error("--deploy-exit-status must not be negative")
        summary = summarize_deploy_log(
            args.deploy_log.read_text(encoding="utf-8"),
            repository=args.source_repository,
            head_sha=args.source_sha,
            workflow_run_id=args.workflow_run_id,
            release_lane=args.release_lane,
            release_action=args.release_action,
            deploy_exit_status=args.deploy_exit_status,
        )
        renderer = render_deploy_markdown
    else:
        run = load_run_json(args.from_file, args.run_id, args.repo)
        summary = summarize(run)
        renderer = render_markdown
    if args.receipt_output is not None:
        write_receipt(args.receipt_output, summary)
    if args.format == "json":
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(renderer(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
