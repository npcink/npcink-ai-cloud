#!/usr/bin/env python3
"""Read-only inventory for this repository's linked Git worktrees."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
LONG_LIVED_MARKERS = (
    "m4",
    "preview",
    "production",
    "acceptance",
    "runtime",
    "ops",
)


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command, cwd=ROOT, check=False, capture_output=True, text=True
    )


def load_pull_requests() -> tuple[dict[str, list[dict[str, Any]]], str | None]:
    completed = run_command(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "all",
            "--limit",
            "1000",
            "--json",
            "number,state,isDraft,url,mergedAt,updatedAt,baseRefName,headRefName",
        ]
    )
    if completed.returncode != 0:
        return {}, completed.stderr.strip() or "GitHub PR lookup unavailable"
    try:
        rows = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        return {}, f"GitHub PR lookup returned invalid JSON: {exc}"
    by_branch: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        branch = row.get("headRefName")
        if branch:
            by_branch[str(branch)].append(row)
    lookup_error = (
        "GitHub PR lookup reached its 1000-row safety limit"
        if len(rows) == 1000
        else None
    )
    return dict(by_branch), lookup_error


def select_pull_request(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None
    ordered = sorted(
        rows,
        key=lambda row: (
            row.get("state") == "OPEN",
            row.get("mergedAt") is not None,
            row.get("updatedAt") or "",
        ),
        reverse=True,
    )
    return ordered[0]


def git_text(path: Path, *args: str) -> tuple[str | None, str | None]:
    completed = run_command(["git", "-C", str(path), *args])
    if completed.returncode != 0:
        return None, completed.stderr.strip() or f"git {' '.join(args)} failed"
    return completed.stdout.strip(), None


def branch_reconciliation(
    path: Path,
    branch: str,
    pull_requests: dict[str, list[dict[str, Any]]],
    pull_request_lookup_error: str | None,
) -> dict[str, Any]:
    if branch == "detached":
        upstream = None
        ahead = None
        behind = None
        tracking_error = "detached HEAD has no branch upstream"
    else:
        upstream, tracking_error = git_text(
            path, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"
        )
        ahead = None
        behind = None
        if upstream:
            counts, counts_error = git_text(
                path, "rev-list", "--left-right", "--count", f"{upstream}...HEAD"
            )
            if counts_error:
                tracking_error = counts_error
            elif counts:
                behind, ahead = (int(value) for value in counts.split())

    cherry_text, unique_error = git_text(path, "cherry", "origin/master", "HEAD")
    cherry_lines = cherry_text.splitlines() if cherry_text is not None else []
    unique_commits = (
        sum(line.startswith("+") for line in cherry_lines)
        if cherry_text is not None
        else None
    )
    represented_commits = (
        sum(line.startswith("-") for line in cherry_lines)
        if cherry_text is not None
        else None
    )
    pull_request = select_pull_request(pull_requests.get(branch, []))
    return {
        "upstream": upstream,
        "ahead": ahead,
        "behind": behind,
        "tracking_error": tracking_error,
        "unique_commits_vs_origin_master": unique_commits,
        "represented_commits_vs_origin_master": represented_commits,
        "unique_commit_error": unique_error,
        "pull_request": pull_request,
        "pull_request_evidence_error": pull_request_lookup_error,
    }


def parse_porcelain(source: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in [*source.splitlines(), ""]:
        if not line:
            if current:
                entries.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        if key in {"detached", "bare"}:
            current[key] = True
        elif key == "locked":
            current["locked"] = True
            current["lock_reason"] = value
        elif key == "prunable":
            current["prunable"] = True
            current["prunable_reason"] = value
        else:
            current[key] = value
    return entries


def classify_entry(
    entry: dict[str, Any],
    *,
    current_path: Path,
    primary_path: Path,
    pull_requests: dict[str, list[dict[str, Any]]],
    pull_request_lookup_error: str | None,
) -> dict[str, Any]:
    path = Path(entry["worktree"])
    exists = path.is_dir()
    dirty: bool | None = None
    status_error: str | None = None
    if exists:
        completed = run_command(
            [
                "git",
                "-C",
                str(path),
                "status",
                "--porcelain=v1",
                "--untracked-files=normal",
            ]
        )
        if completed.returncode == 0:
            dirty = bool(completed.stdout.strip())
        else:
            status_error = completed.stderr.strip() or "git status failed"

    is_current = path.resolve() == current_path.resolve() if exists else False
    is_primary = (
        path.resolve() == primary_path.resolve() if exists else path == primary_path
    )
    branch = str(entry.get("branch", "detached")).removeprefix("refs/heads/")
    protected_role_markers = sorted(
        marker
        for marker in LONG_LIVED_MARKERS
        if marker in f"{path} {branch}".lower()
    )
    long_lived = bool(protected_role_markers)
    reconciliation = (
        branch_reconciliation(
            path, branch, pull_requests, pull_request_lookup_error
        )
        if exists and not status_error
        else {
            "upstream": None,
            "ahead": None,
            "behind": None,
            "tracking_error": status_error or "worktree path is unavailable",
            "unique_commits_vs_origin_master": None,
            "represented_commits_vs_origin_master": None,
            "unique_commit_error": status_error or "worktree path is unavailable",
            "pull_request": select_pull_request(pull_requests.get(branch, [])),
            "pull_request_evidence_error": pull_request_lookup_error,
        }
    )
    pull_request = reconciliation["pull_request"]
    has_open_pr = bool(pull_request and pull_request.get("state") == "OPEN")

    if is_current:
        classification = "current_task"
        reason = "current audit worktree"
    elif is_primary:
        classification = "protected"
        reason = "primary worktree"
    elif entry.get("locked"):
        classification = "protected"
        reason = "worktree lock"
    elif not exists or status_error:
        classification = "protected"
        reason = "missing or unreadable registration requires manual recovery"
    elif dirty:
        classification = "protected"
        reason = "dirty worktree"
    elif long_lived:
        classification = "protected"
        reason = "long-lived runtime or operations role"
    elif pull_request_lookup_error:
        classification = "protected"
        reason = "pull request evidence unavailable"
    elif has_open_pr:
        classification = "protected"
        reason = "open pull request"
    elif reconciliation["unique_commits_vs_origin_master"] not in (0, None):
        classification = "protected"
        reason = "branch has commits absent from origin/master"
    elif reconciliation["unique_commits_vs_origin_master"] is None:
        classification = "protected"
        reason = "unique-commit evidence unavailable"
    else:
        classification = "manual_review"
        reason = (
            "clean unlocked auxiliary with no detected unique commit or open PR; "
            "task ownership and inactivity evidence still require human review"
        )

    recommendation = "manual_review" if classification == "manual_review" else "retain"

    return {
        "path": str(path),
        "branch": branch,
        "head": entry.get("HEAD"),
        "exists": exists,
        "dirty": dirty,
        "locked": bool(entry.get("locked")),
        "lock_reason": entry.get("lock_reason", ""),
        "prunable": bool(entry.get("prunable")),
        "classification": classification,
        "recommended_disposition": recommendation,
        "reason": reason,
        "status_error": status_error,
        "protected_role_markers": protected_role_markers,
        **reconciliation,
    }


def audit() -> dict[str, Any]:
    completed = subprocess.run(
        ["git", "-C", str(ROOT), "worktree", "list", "--porcelain"],
        check=True,
        capture_output=True,
        text=True,
    )
    raw_entries = parse_porcelain(completed.stdout)
    if not raw_entries:
        raise SystemExit("[fail] git returned no worktree entries")
    current_path = ROOT
    primary_path = Path(raw_entries[0]["worktree"])
    pull_requests, pull_request_error = load_pull_requests()
    entries = [
        classify_entry(
            entry,
            current_path=current_path,
            primary_path=primary_path,
            pull_requests=pull_requests,
            pull_request_lookup_error=pull_request_error,
        )
        for entry in raw_entries
    ]
    counts = {
        key: sum(entry["classification"] == key for entry in entries)
        for key in ("current_task", "protected", "manual_review")
    }
    return {
        "schema_version": 2,
        "repository": str(ROOT),
        "total": len(entries),
        "counts": counts,
        "mutation_performed": False,
        "pull_request_lookup_error": pull_request_error,
        "entries": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    argv = sys.argv[1:]
    if argv and argv[0] == "--":
        argv = argv[1:]
    args = parser.parse_args(argv)
    payload = audit()
    if args.format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    counts = payload["counts"]
    print(
        "[audit] worktrees: "
        f"total={payload['total']} current={counts['current_task']} "
        f"protected={counts['protected']} manual_review={counts['manual_review']}"
    )
    for entry in payload["entries"]:
        print(
            f"[{entry['classification']}] {entry['path']} "
            f"branch={entry['branch']} dirty={entry['dirty']} "
            f"locked={entry['locked']} upstream={entry['upstream']} "
            f"ahead={entry['ahead']} behind={entry['behind']} "
            f"unique={entry['unique_commits_vs_origin_master']} "
            f"pr={entry['pull_request']['number'] if entry['pull_request'] else 'none'} "
            f"disposition={entry['recommended_disposition']} reason={entry['reason']}"
        )
    if payload["pull_request_lookup_error"]:
        print(f"[audit] PR evidence unavailable: {payload['pull_request_lookup_error']}")
    print("[audit] read-only: no worktree was unlocked, removed, pruned, or changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
