#!/usr/bin/env python3
"""Prepare a local, reviewed-tree production integration without publishing."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

SCHEMA = "npcink.production_reviewed_tree_integration.v1"


class IntegrationError(ValueError):
    pass


def git(root: Path, *args: str, input_text: str | None = None) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, input=input_text, capture_output=True, text=True
    )
    if result.returncode:
        raise IntegrationError(result.stderr.strip() or f"git {args[0]} failed")
    return result.stdout.strip()


def full_commit(root: Path, value: str) -> str:
    if re.fullmatch(r"[0-9a-f]{40}", value) is None:
        raise IntegrationError("inputs must be full commit SHAs")
    if git(root, "rev-parse", f"{value}^{{commit}}") != value:
        raise IntegrationError("input must identify a commit")
    return value


def reviewed_paths(path: Path) -> tuple[list[str], str]:
    raw = path.read_bytes()
    paths = raw.decode("utf-8").splitlines()
    if not paths or len(paths) != len(set(paths)):
        raise IntegrationError("reviewed paths must be nonempty and unique")
    for name in paths:
        pure = PurePosixPath(name)
        if (
            not name
            or pure.is_absolute()
            or pure.as_posix() != name
            or ".." in pure.parts
            or "\\" in name
        ):
            raise IntegrationError("reviewed paths must be repository-relative")
    return sorted(paths), hashlib.sha256(raw).hexdigest()


def prepare(
    root: Path,
    *,
    production: str,
    source: str,
    equivalent_master: str,
    paths_file: Path,
    branch: str,
    apply: bool = False,
) -> dict[str, object]:
    production = full_commit(root, production)
    source = full_commit(root, source)
    equivalent_master = full_commit(root, equivalent_master)
    if git(root, "rev-parse", "--is-shallow-repository") != "false":
        raise IntegrationError("complete Git history is required")
    if production != git(root, "rev-parse", "refs/remotes/origin/production"):
        raise IntegrationError("production input differs from fetched origin/production")
    master = git(root, "rev-parse", "refs/remotes/origin/master")
    git(root, "merge-base", "--is-ancestor", source, master)
    git(root, "merge-base", "--is-ancestor", equivalent_master, source)
    production_tree = git(root, "rev-parse", f"{production}^{{tree}}")
    if production_tree != git(root, "rev-parse", f"{equivalent_master}^{{tree}}"):
        raise IntegrationError("production tree is not equivalent to the master baseline")
    source_tree = git(root, "rev-parse", f"{source}^{{tree}}")
    if source_tree == production_tree:
        raise IntegrationError("production already has the reviewed source tree")
    paths, paths_sha256 = reviewed_paths(paths_file)
    actual = git(root, "diff", "--name-only", "-z", production, source).split("\0")
    if paths != sorted(name for name in actual if name):
        raise IntegrationError("changed paths differ from the reviewed scope")
    if not branch.startswith("release-fix/"):
        raise IntegrationError("integration branch must be release-fix/*")
    ref = f"refs/heads/{branch}"
    git(root, "check-ref-format", ref)
    if git(root, "for-each-ref", "--format=%(refname)", ref, f"refs/remotes/origin/{branch}"):
        raise IntegrationError("integration branch already exists; choose a fresh name")
    result: dict[str, object] = {
        "schema": SCHEMA,
        "state": "planned",
        "production_sha": production,
        "production_tree": production_tree,
        "reviewed_master_sha": source,
        "reviewed_master_tree": source_tree,
        "fetched_master_sha": master,
        "equivalent_master_baseline": equivalent_master,
        "reviewed_paths_sha256": paths_sha256,
        "changed_paths": paths,
        "branch": branch,
        "candidate_sha": None,
        "production_authorized": False,
        "network_operations": 0,
    }
    if apply:
        message = (
            "release: integrate the reviewed master tree on production\n\n"
            f"Reviewed-master: {source}\n"
            f"Production-base: {production}\n"
            f"Equivalent-master-baseline: {equivalent_master}\n"
            f"Reviewed-paths-sha256: {paths_sha256}\n\n"
            "Resolve historical conflicts to the exact reviewed tree.\n"
            "Local preparation only; production approval and checks remain required.\n"
        )
        candidate = git(
            root,
            "commit-tree",
            source_tree,
            "-p",
            production,
            input_text=message,
        )
        # Verify fetched inputs and create the new ref in one atomic transaction.
        # Existing refs are only verified; another session's update is never undone.
        git(
            root,
            "update-ref",
            "--stdin",
            input_text=(
                "start\n"
                f"verify refs/remotes/origin/production {production}\n"
                f"verify refs/remotes/origin/master {master}\n"
                f"create {ref} {candidate}\nprepare\ncommit\n"
            ),
        )
        result.update(state="local_candidate", candidate_sha=candidate)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production-sha", required=True)
    parser.add_argument("--reviewed-master-sha", required=True)
    parser.add_argument("--equivalent-master-sha", required=True)
    parser.add_argument("--reviewed-paths-file", required=True, type=Path)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel"))
        result = prepare(
            root,
            production=args.production_sha,
            source=args.reviewed_master_sha,
            equivalent_master=args.equivalent_master_sha,
            paths_file=args.reviewed_paths_file,
            branch=args.branch,
            apply=args.apply,
        )
    except (OSError, UnicodeError, IntegrationError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
