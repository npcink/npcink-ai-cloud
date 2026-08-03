#!/usr/bin/env python3
"""Read-only inventory for this repository's linked Git worktrees."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
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
    entry: dict[str, Any], *, current_path: Path, primary_path: Path
) -> dict[str, Any]:
    path = Path(entry["worktree"])
    exists = path.is_dir()
    dirty: bool | None = None
    status_error: str | None = None
    if exists:
        completed = subprocess.run(
            [
                "git",
                "-C",
                str(path),
                "status",
                "--porcelain=v1",
                "--untracked-files=normal",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0:
            dirty = bool(completed.stdout.strip())
        else:
            status_error = completed.stderr.strip() or "git status failed"

    lowered = str(path).lower()
    long_lived = any(marker in lowered for marker in LONG_LIVED_MARKERS)
    is_current = path.resolve() == current_path.resolve() if exists else False
    is_primary = (
        path.resolve() == primary_path.resolve() if exists else path == primary_path
    )

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
    else:
        classification = "manual_review"
        reason = "clean unlocked auxiliary; ancestry, PR, task, and inactivity evidence still required"

    return {
        "path": str(path),
        "branch": str(entry.get("branch", "detached")).removeprefix("refs/heads/"),
        "head": entry.get("HEAD"),
        "exists": exists,
        "dirty": dirty,
        "locked": bool(entry.get("locked")),
        "lock_reason": entry.get("lock_reason", ""),
        "prunable": bool(entry.get("prunable")),
        "classification": classification,
        "reason": reason,
        "status_error": status_error,
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
    entries = [
        classify_entry(entry, current_path=current_path, primary_path=primary_path)
        for entry in raw_entries
    ]
    counts = {
        key: sum(entry["classification"] == key for entry in entries)
        for key in ("current_task", "protected", "manual_review")
    }
    return {
        "schema_version": 1,
        "repository": str(ROOT),
        "total": len(entries),
        "counts": counts,
        "mutation_performed": False,
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
            f"locked={entry['locked']} reason={entry['reason']}"
        )
    print("[audit] read-only: no worktree was unlocked, removed, pruned, or changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
