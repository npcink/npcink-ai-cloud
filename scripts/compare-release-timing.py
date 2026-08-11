#!/usr/bin/env python3
"""Compare two compatible Npcink release timing receipts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

TIMING_SCHEMA = "npcink.release_timing.v1"
COMPARISON_SCHEMA = "npcink.release_timing_comparison.v1"


class ComparisonError(ValueError):
    """Raised when timing receipts are not comparable."""


def load_receipt(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ComparisonError(f"cannot read timing receipt: {path}") from exc
    if not isinstance(payload, dict) or payload.get("schema") != TIMING_SCHEMA:
        raise ComparisonError(f"unsupported timing receipt schema: {path}")
    return payload


def improvement_percent(baseline: int, candidate: int) -> float | None:
    if baseline <= 0:
        return None
    return round((baseline - candidate) / baseline * 100, 2)


def metric(name: str, baseline: int, candidate: int) -> dict[str, Any]:
    improvement = improvement_percent(baseline, candidate)
    if candidate < baseline:
        direction = "faster"
    elif candidate > baseline:
        direction = "slower"
    else:
        direction = "unchanged"
    return {
        "name": name,
        "baseline_seconds": baseline,
        "candidate_seconds": candidate,
        "delta_seconds": candidate - baseline,
        "improvement_percent": improvement,
        "measured_direction": direction,
    }


def require_success(payload: dict[str, Any], label: str) -> None:
    if payload.get("status") != "completed" and payload.get("kind") == "github_actions_run":
        raise ComparisonError(f"{label} GitHub Actions run is not completed")
    if payload.get("kind") == "github_actions_run":
        if payload.get("conclusion") != "success":
            raise ComparisonError(f"{label} GitHub Actions run did not succeed")
    elif payload.get("status") != "success":
        raise ComparisonError(f"{label} production deploy did not succeed")


def require_non_empty_string(payload: dict[str, Any], field: str, label: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value:
        raise ComparisonError(f"{label} {field} is missing")
    return value


def github_identity(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "run_id": payload.get("run_id"),
        "workflow_name": payload.get("workflow_name"),
        "event": payload.get("event"),
        "head_branch": payload.get("head_branch"),
        "head_sha": payload.get("head_sha"),
        "url": payload.get("url"),
    }


def production_identity(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "repository": payload.get("repository"),
        "workflow_run_id": payload.get("workflow_run_id"),
        "head_sha": payload.get("head_sha"),
        "release_lane": payload.get("release_lane"),
        "release_action": payload.get("release_action"),
    }


def github_job_map(payload: dict[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in payload.get("jobs") or []:
        if not isinstance(item, dict):
            raise ComparisonError("GitHub Actions timing job record is invalid")
        name = item.get("name")
        seconds = item.get("duration_seconds")
        conclusion = item.get("conclusion")
        if seconds is None or conclusion == "skipped":
            continue
        if conclusion != "success":
            raise ComparisonError(f"GitHub Actions job did not succeed: {name}")
        if not isinstance(name, str) or not isinstance(seconds, int) or seconds < 0:
            raise ComparisonError("GitHub Actions timing job identity is invalid")
        if name in result:
            raise ComparisonError(f"duplicate GitHub Actions job timing: {name}")
        result[name] = seconds
    return result


def compare_github(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    for label, payload in (("baseline", baseline), ("candidate", candidate)):
        require_success(payload, label)
        require_non_empty_string(payload, "workflow_name", label)
        require_non_empty_string(payload, "event", label)
        require_non_empty_string(payload, "head_sha", label)
    if baseline.get("run_id") == candidate.get("run_id"):
        raise ComparisonError("GitHub Actions run IDs must differ")
    if baseline.get("workflow_name") != candidate.get("workflow_name"):
        raise ComparisonError("GitHub Actions workflow names do not match")
    if baseline.get("event") != candidate.get("event"):
        raise ComparisonError("GitHub Actions event types do not match")
    baseline_jobs = github_job_map(baseline)
    candidate_jobs = github_job_map(candidate)
    if baseline_jobs.keys() != candidate_jobs.keys():
        raise ComparisonError("executed GitHub Actions job sets do not match")
    baseline_total = baseline.get("duration_seconds")
    candidate_total = candidate.get("duration_seconds")
    if not isinstance(baseline_total, int) or not isinstance(candidate_total, int):
        raise ComparisonError("GitHub Actions run wall time is missing")
    metrics = [metric("run_wall", baseline_total, candidate_total)]
    metrics.extend(
        metric(f"job:{name}", baseline_jobs[name], candidate_jobs[name])
        for name in sorted(baseline_jobs)
    )
    return {
        "schema": COMPARISON_SCHEMA,
        "kind": "github_actions_run",
        "baseline": github_identity(baseline),
        "candidate": github_identity(candidate),
        "primary_metric": metrics[0],
        "metrics": metrics,
    }


def category_map(payload: dict[str, Any]) -> dict[str, int]:
    categories = payload.get("category_seconds")
    if not isinstance(categories, dict):
        raise ComparisonError("production category timing is missing")
    result: dict[str, int] = {}
    for name, seconds in categories.items():
        if not isinstance(name, str) or not isinstance(seconds, int) or seconds < 0:
            raise ComparisonError("production category timing is invalid")
        result[name] = seconds
    return result


def compare_production(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    for label, payload in (("baseline", baseline), ("candidate", candidate)):
        require_success(payload, label)
        require_non_empty_string(payload, "repository", label)
        require_non_empty_string(payload, "workflow_run_id", label)
        require_non_empty_string(payload, "head_sha", label)
        require_non_empty_string(payload, "release_lane", label)
        require_non_empty_string(payload, "release_action", label)
    if baseline.get("workflow_run_id") == candidate.get("workflow_run_id"):
        raise ComparisonError("production workflow run IDs must differ")
    for field in ("repository", "release_lane", "release_action"):
        if baseline.get(field) != candidate.get(field):
            raise ComparisonError(f"production {field} values do not match")
    baseline_categories = category_map(baseline)
    candidate_categories = category_map(candidate)
    if baseline_categories.keys() != candidate_categories.keys():
        raise ComparisonError("production timing category sets do not match")
    baseline_total = baseline.get("recorded_total_seconds")
    candidate_total = candidate.get("recorded_total_seconds")
    if not isinstance(baseline_total, int) or not isinstance(candidate_total, int):
        raise ComparisonError("production recorded phase total is missing")
    baseline_remote = baseline.get("remote_sequence_seconds")
    candidate_remote = candidate.get("remote_sequence_seconds")
    if not isinstance(baseline_remote, int) or not isinstance(candidate_remote, int):
        raise ComparisonError("production remote sequence timing is missing")
    metrics = [metric("recorded_total", baseline_total, candidate_total)]
    metrics.append(metric("remote_sequence", baseline_remote, candidate_remote))
    metrics.extend(
        metric(
            f"category:{name}",
            baseline_categories[name],
            candidate_categories[name],
        )
        for name in sorted(baseline_categories)
    )
    return {
        "schema": COMPARISON_SCHEMA,
        "kind": "production_deploy_phases",
        "baseline": production_identity(baseline),
        "candidate": production_identity(candidate),
        "primary_metric": metrics[0],
        "metrics": metrics,
    }


def compare_receipts(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    if baseline.get("kind") != candidate.get("kind"):
        raise ComparisonError("timing receipt kinds do not match")
    kind = baseline.get("kind")
    if kind == "github_actions_run":
        return compare_github(baseline, candidate)
    if kind == "production_deploy_phases":
        return compare_production(baseline, candidate)
    raise ComparisonError(f"unsupported timing receipt kind: {kind}")


def format_seconds(seconds: int) -> str:
    sign = "-" if seconds < 0 else ""
    absolute = abs(seconds)
    minutes, remaining = divmod(absolute, 60)
    if minutes:
        return f"{sign}{minutes}m{remaining:02d}s"
    return f"{sign}{remaining}s"


def render_markdown(comparison: dict[str, Any]) -> str:
    primary = comparison["primary_metric"]
    improvement = primary["improvement_percent"]
    improvement_text = "n/a" if improvement is None else f"{improvement:.2f}%"
    lines = [
        "# Release Timing Comparison",
        "",
        f"- Kind: `{comparison['kind']}`",
        f"- Primary direction: `{primary['measured_direction']}`",
        f"- Primary delta: `{format_seconds(primary['delta_seconds'])}`",
        f"- Primary improvement: `{improvement_text}`",
        "",
        "| Metric | Baseline | Candidate | Delta | Improvement | Direction |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for item in comparison["metrics"]:
        item_improvement = item["improvement_percent"]
        item_improvement_text = (
            "n/a" if item_improvement is None else f"{item_improvement:.2f}%"
        )
        lines.append(
            f"| {item['name']} | {format_seconds(item['baseline_seconds'])} | "
            f"{format_seconds(item['candidate_seconds'])} | "
            f"{format_seconds(item['delta_seconds'])} | {item_improvement_text} | "
            f"{item['measured_direction']} |"
        )
    return "\n".join(lines)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--output", type=Path)
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    try:
        comparison = compare_receipts(
            load_receipt(args.baseline),
            load_receipt(args.candidate),
        )
    except ComparisonError as exc:
        parser.error(str(exc))
    if args.output is not None:
        write_json(args.output, comparison)
    if args.format == "json":
        print(json.dumps(comparison, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(comparison))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
