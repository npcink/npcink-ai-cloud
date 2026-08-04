#!/usr/bin/env python3
"""Plan or run the narrowest safe local gates for the current diff."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M4_DEPLOY_INPUTS = {
    ".dockerignore",
    "Dockerfile",
    "deploy/nginx.m4-frontend-slot.conf.template",
    "deploy/nginx.m4-preview.conf",
    "docker-compose.dev.yml",
    "docker-compose.m4-frontend-slot.yml",
    "docker-compose.m4-preview.yml",
    "frontend/Dockerfile.dev",
    "frontend/package.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "scripts/m4-package-proxy.py",
    "scripts/m4-preview.sh",
    "scripts/redact-m4-preview-logs.py",
    "uv.lock",
}


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def collect_changed_paths(base_ref: str) -> list[str]:
    if subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "--verify", "--quiet", base_ref],
        check=False,
        stdout=subprocess.DEVNULL,
    ).returncode != 0:
        raise SystemExit(f"[fail] base ref is unavailable: {base_ref}")

    merge_base = _git("merge-base", "HEAD", base_ref).strip()
    outputs = [
        _git("diff", "--name-only", "--diff-filter=ACMRD", f"{merge_base}...HEAD"),
        _git("diff", "--name-only", "--cached", "--diff-filter=ACMRD"),
        _git("diff", "--name-only", "--diff-filter=ACMRD"),
        _git("ls-files", "--others", "--exclude-standard"),
    ]
    return sorted({line for output in outputs for line in output.splitlines() if line})


def normalize_paths(paths: list[str]) -> list[str]:
    normalized: set[str] = set()
    for value in paths:
        path = Path(value)
        candidate = path if path.is_absolute() else ROOT / path
        try:
            path = candidate.resolve().relative_to(ROOT.resolve())
        except ValueError as exc:
            raise SystemExit(f"[fail] path is outside the repository: {value}") from exc
        normalized.add(path.as_posix().removeprefix("./"))
    return sorted(path for path in normalized if path)


def classify(paths: list[str]) -> dict[str, bool]:
    def any_path(predicate: Callable[[str], bool]) -> bool:
        return any(predicate(path) for path in paths)

    documentation = (
        all(
            path.endswith(".md")
            and (
                "/" not in path
                or path.startswith(("docs/", "deploy/", ".github/"))
            )
            for path in paths
        )
        if paths
        else False
    )
    frontend = any_path(lambda path: path.startswith("frontend/"))
    admin = any_path(
        lambda path: path.startswith(
            (
                "frontend/src/app/admin/",
                "frontend/src/components/admin/",
                "frontend/src/features/admin/",
                "frontend/tests/",
            )
        )
        and "admin" in path.lower()
    )
    python = any_path(lambda path: path.endswith(".py"))
    python_tests = any_path(
        lambda path: path.startswith("tests/") and path.endswith(".py")
    )
    shell = any_path(lambda path: path.endswith(".sh"))
    node_script = any_path(
        lambda path: path.startswith("scripts/")
        and path.endswith((".js", ".mjs", ".cjs"))
    )
    inventory = any_path(
        lambda path: path
        in {
            "package.json",
            "frontend/package.json",
            "config/engineering-command-inventory-v1.json",
            "scripts/check_engineering_command_inventory.py",
            "tests/contract/test_engineering_command_inventory_contract.py",
        }
    )
    migration = any_path(lambda path: path.startswith("migrations/"))
    build_runtime = any_path(
        lambda path: path in M4_DEPLOY_INPUTS
        or Path(path).name.startswith("Dockerfile")
    )
    cloud_source = any_path(
        lambda path: path.startswith(("app/", "frontend/", "migrations/"))
    )
    policy = any_path(
        lambda path: path in {"AGENTS.md", "README.md", "package.json"}
        or path.startswith(
            ("docs/", "config/", ".github/", "scripts/", "tests/contract/")
        )
    )
    return {
        "documentation_only": documentation,
        "frontend": frontend,
        "admin": admin,
        "python": python,
        "python_tests": python_tests,
        "shell": shell,
        "node_script": node_script,
        "inventory": inventory,
        "migration": migration,
        "build_runtime": build_runtime,
        "cloud_source": cloud_source,
        "policy": policy,
    }


def build_plan(paths: list[str], python_bin: str, base_ref: str) -> dict[str, object]:
    kinds = classify(paths)
    commands: list[list[str]] = [
        ["git", "diff", "--check", f"{base_ref}...HEAD"],
        ["git", "diff", "--cached", "--check"],
        ["git", "diff", "--check"],
    ]
    followups: list[str] = []

    if kinds["policy"]:
        commands.append(["bash", "scripts/check-release-policy.sh"])
    if kinds["inventory"]:
        commands.append(["python3", "scripts/check_engineering_command_inventory.py"])

    shell_paths = [
        path for path in paths if path.endswith(".sh") and (ROOT / path).is_file()
    ]
    commands.extend([["bash", "-n", path] for path in shell_paths])
    node_paths = [
        path
        for path in paths
        if path.startswith("scripts/")
        and path.endswith((".js", ".mjs", ".cjs"))
        and (ROOT / path).is_file()
    ]
    commands.extend([["node", "--check", path] for path in node_paths])

    python_paths = [
        path for path in paths if path.endswith(".py") and (ROOT / path).is_file()
    ]
    if python_paths:
        commands.append(["bash", "scripts/check-changed-python-quality.sh", *python_paths])
    python_tests = [
        path
        for path in python_paths
        if path.startswith("tests/") and Path(path).name.startswith("test_")
    ]
    if python_tests:
        commands.append([python_bin, "-m", "pytest", *python_tests, "-q"])

    if kinds["frontend"]:
        commands.append(["pnpm", "--dir", "frontend", "run", "type-check"])
        lint_paths = [
            path.removeprefix("frontend/")
            for path in paths
            if path.startswith("frontend/")
            and path.endswith((".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"))
            and (ROOT / path).is_file()
        ]
        if lint_paths:
            commands.append(
                [
                    "pnpm",
                    "--dir",
                    "frontend",
                    "exec",
                    "eslint",
                    *lint_paths,
                    "--max-warnings=0",
                ]
            )
        changed_node_contracts = [
            path
            for path in paths
            if path.startswith("frontend/tests/unit/") and path.endswith(".mjs")
        ]
        commands.extend([["node", path] for path in changed_node_contracts])
        changed_vitest_tests = [
            path.removeprefix("frontend/")
            for path in paths
            if path.startswith("frontend/tests/vitest/")
            and path.endswith((".test.ts", ".test.tsx"))
            and (ROOT / path).is_file()
        ]
        if changed_vitest_tests:
            commands.append(
                [
                    "pnpm",
                    "--dir",
                    "frontend",
                    "exec",
                    "vitest",
                    "run",
                    *changed_vitest_tests,
                ]
            )

    if kinds["admin"]:
        followups.append(
            "Run the focused target-route PC browser gate; run pnpm run check:admin-ui "
            "at closeout when the manifest or shared seam requires it."
        )
    if kinds["build_runtime"]:
        followups.append(
            "Potential build/runtime inputs changed: inspect the manifest diff, then use the "
            "L2 lane and m4:preview:deploy only when a dependency or runtime fingerprint changed."
        )
    elif kinds["cloud_source"]:
        followups.append(
            "Cloud source changed: use m4:preview:sync after local gates when runtime behavior "
            "is in scope."
        )
    if kinds["migration"]:
        followups.append(
            "Migration changed: use source sync plus migration-head, persistence, and rollback "
            "evidence; do not cold-build unless a fingerprint input also changed."
        )
    if not any(kinds.values()):
        followups.append(
            "No specialized lane matched; select one focused test for the changed seam before "
            "closeout."
        )

    return {"paths": paths, "classification": kinds, "commands": commands, "followups": followups}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--plan", action="store_true", help="print the plan without running gates"
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--base", default="origin/master")
    parser.add_argument("paths", nargs="*")
    argv = sys.argv[1:]
    if argv and argv[0] == "--":
        argv = argv[1:]
    args = parser.parse_args(argv)

    paths = normalize_paths(args.paths) if args.paths else collect_changed_paths(args.base)
    if not paths:
        print("[ok] No changed files detected.")
        return 0

    python_bin = os.environ.get(
        "NPCINK_CLOUD_PYTHON_BIN", str(ROOT / ".venv" / "bin" / "python")
    )
    plan = build_plan(paths, python_bin, args.base)
    if args.format == "json":
        print(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print("[plan] changed files:")
        for path in paths:
            print(f" - {path}")
        print("[plan] local gates:")
        for command in plan["commands"]:  # type: ignore[index]
            print(" - " + " ".join(command))
        for followup in plan["followups"]:  # type: ignore[index]
            print(f"[next] {followup}")

    if args.plan:
        return 0

    environment = os.environ.copy()
    environment["NPCINK_CLOUD_PYTHON_BIN"] = python_bin
    for command in plan["commands"]:  # type: ignore[index]
        print("[run] " + " ".join(command), flush=True)
        subprocess.run(command, cwd=ROOT, env=environment, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
