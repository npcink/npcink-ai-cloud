#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Readiness:
    state: str
    message: str


SUCCESS_CONCLUSIONS = {"SUCCESS", "SKIPPED", "NEUTRAL"}
FAILURE_CONCLUSIONS = {"FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STALE"}
PENDING_CONTEXT_STATES = {"EXPECTED", "PENDING"}


def evaluate_readiness(pr: dict[str, Any], threads: list[dict[str, Any]]) -> Readiness:
    pr_state = str(pr.get("state") or "").upper()
    if pr_state == "MERGED":
        return Readiness("ready", "pull request is merged")
    if pr_state not in {"OPEN", ""}:
        return Readiness("failed", f"pull request state is {pr_state.lower()}")

    unresolved = [thread for thread in threads if not bool(thread.get("isResolved"))]
    if unresolved:
        details: list[str] = []
        for thread in unresolved[:5]:
            comments = thread.get("comments", {}).get("nodes", [])
            comment = comments[0] if comments else {}
            path = str(comment.get("path") or "unknown path")
            first_line = str(comment.get("body") or "unresolved review thread").splitlines()[0]
            details.append(f"{path}: {first_line}")
        return Readiness(
            "review_required",
            f"{len(unresolved)} unresolved review thread(s): " + " | ".join(details),
        )

    checks = pr.get("statusCheckRollup") or []
    if not checks:
        return Readiness("pending", "required checks have not appeared yet")

    pending: list[str] = []
    failed: list[str] = []
    for check in checks:
        name = str(check.get("name") or check.get("context") or "unnamed check")
        context_state = str(check.get("state") or "").upper()
        if context_state in PENDING_CONTEXT_STATES:
            pending.append(name)
            continue
        status = str(
            check.get("status") or ("COMPLETED" if context_state else "")
        ).upper()
        conclusion = str(check.get("conclusion") or context_state).upper()
        if status != "COMPLETED":
            pending.append(name)
        elif conclusion in FAILURE_CONCLUSIONS or conclusion not in SUCCESS_CONCLUSIONS:
            failed.append(f"{name}={conclusion or 'UNKNOWN'}")

    if failed:
        return Readiness("failed", "failed checks: " + ", ".join(failed))
    if pending:
        return Readiness("pending", "pending checks: " + ", ".join(pending))
    merge_state = str(pr.get("mergeStateStatus") or "").upper()
    if merge_state == "UNKNOWN":
        return Readiness("pending", "checks passed but merge state is still unknown")
    if bool(pr.get("isDraft")) or merge_state in {"BEHIND", "BLOCKED", "DIRTY", "DRAFT"}:
        return Readiness(
            "blocked",
            "checks passed but merge state is "
            f"{(merge_state or 'draft').lower()}; inspect branch protection and reviews",
        )
    return Readiness("ready", "all checks passed and no review threads are unresolved")


def _run_json(command: list[str]) -> Any:
    completed = subprocess.run(command, text=True, capture_output=True, check=True)
    return json.loads(completed.stdout)


def _repo_slug(explicit_repo: str) -> str:
    if explicit_repo:
        return explicit_repo
    payload = _run_json(["gh", "repo", "view", "--json", "nameWithOwner"])
    return str(payload["nameWithOwner"])


def _load_state(pr_number: int, repo: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pr = _run_json([
        "gh", "pr", "view", str(pr_number), "--repo", repo,
        "--json", "state,isDraft,mergeStateStatus,headRefOid,url,statusCheckRollup",
    ])
    owner, name = repo.split("/", 1)
    query = """
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100){
        nodes{isResolved isOutdated comments(first:1){nodes{path body}}}
      }
    }
  }
}
"""
    payload = _run_json([
        "gh", "api", "graphql", "-f", f"query={query}",
        "-F", f"owner={owner}", "-F", f"name={name}", "-F", f"number={pr_number}",
    ])
    threads = payload["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    return pr, threads


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Wait for PR checks while failing early on unresolved review threads."
    )
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument("--repo", default="", help="OWNER/REPO; defaults to the current repository")
    parser.add_argument("--interval", type=float, default=20.0)
    parser.add_argument("--timeout", type=float, default=7200.0)
    parser.add_argument("--settle-polls", type=int, default=2)
    parser.add_argument("--once", action="store_true")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    if args.interval <= 0 or args.timeout <= 0 or args.settle_polls <= 0:
        parser.error("interval, timeout, and settle-polls must be positive")

    repo = _repo_slug(args.repo)
    deadline = time.monotonic() + args.timeout
    ready_polls = 0
    last_message = ""

    while True:
        try:
            pr, threads = _load_state(args.pr, repo)
        except (subprocess.CalledProcessError, KeyError, ValueError, json.JSONDecodeError) as error:
            print(f"[pr-wait] failed to read pull request state: {error}")
            return 1

        readiness = evaluate_readiness(pr, threads)
        if readiness.message != last_message:
            print(f"[pr-wait] {readiness.state}: {readiness.message}", flush=True)
            last_message = readiness.message

        if readiness.state == "ready":
            ready_polls += 1
            if args.once or ready_polls >= args.settle_polls:
                return 0
        else:
            ready_polls = 0
            if readiness.state == "review_required":
                return 2
            if readiness.state == "blocked":
                return 2
            if readiness.state == "failed":
                return 1
            if args.once:
                return 3

        if time.monotonic() >= deadline:
            print("[pr-wait] timed out before the pull request became ready")
            return 4
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
