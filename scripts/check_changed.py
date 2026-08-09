#!/usr/bin/env python3
"""Plan or run the narrowest safe local gates for the current diff."""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATION_RULES_PATH = ROOT / "config" / "ai-development-validation-rules-v1.json"
TIER_RANK = {"documentation-only": 0, "L0": 1, "L1": 2, "L2": 3}
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


def load_validation_rules() -> list[dict[str, object]]:
    try:
        payload = json.loads(VALIDATION_RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(
            f"[fail] unable to load validation rules: {VALIDATION_RULES_PATH}: {exc}"
        ) from exc
    if payload.get("schema_version") != 1 or not isinstance(payload.get("rules"), list):
        raise SystemExit("[fail] validation rules must use schema_version=1 and a rules list")
    rules = payload["rules"]
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            raise SystemExit(f"[fail] validation rule {index} must be an object")
        required = {"id", "tier", "reason", "match_any", "documents", "commands", "followups"}
        missing = sorted(required - set(rule))
        if missing:
            raise SystemExit(
                f"[fail] validation rule {index} is missing: {', '.join(missing)}"
            )
        if rule["tier"] not in TIER_RANK:
            raise SystemExit(f"[fail] validation rule {rule['id']} has an invalid tier")
        for key in ("match_any", "documents", "commands", "followups"):
            if not isinstance(rule[key], list):
                raise SystemExit(
                    f"[fail] validation rule {rule['id']} field {key} must be a list"
                )
        if not all(isinstance(value, str) and value for value in rule["match_any"]):
            raise SystemExit(
                f"[fail] validation rule {rule['id']} match_any values must be non-empty strings"
            )
        if not all(isinstance(value, str) and value for value in rule["documents"]):
            raise SystemExit(
                f"[fail] validation rule {rule['id']} documents must be non-empty strings"
            )
        if not all(isinstance(value, str) and value for value in rule["followups"]):
            raise SystemExit(
                f"[fail] validation rule {rule['id']} followups must be non-empty strings"
            )
        if not all(
            isinstance(command, list)
            and command
            and all(isinstance(part, str) and part for part in command)
            for command in rule["commands"]
        ):
            raise SystemExit(
                f"[fail] validation rule {rule['id']} commands must be non-empty string arrays"
            )
    return rules


def _matches_rule(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def select_validation_rules(paths: list[str]) -> list[dict[str, object]]:
    selected: list[dict[str, object]] = []
    for rule in load_validation_rules():
        patterns = [str(value) for value in rule["match_any"]]  # type: ignore[index]
        if any(_matches_rule(path, patterns) for path in paths):
            selected.append(rule)
    return selected


def _deduplicate_commands(commands: list[list[str]]) -> list[list[str]]:
    seen: set[tuple[str, ...]] = set()
    result: list[list[str]] = []
    for command in commands:
        key = tuple(command)
        if key not in seen:
            seen.add(key)
            result.append(command)
    return result


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


def classify_tier(
    paths: list[str], kinds: dict[str, bool], rules: list[dict[str, object]]
) -> tuple[str, list[str]]:
    tier = "documentation-only" if kinds["documentation_only"] else "L2"
    reasons: list[str] = []
    if kinds["documentation_only"]:
        reasons.append("All changed paths are documentation or repository-policy Markdown.")
    elif kinds["admin"]:
        tier = "L1"
        reasons.append("Admin route or route-local interaction work is at least L1.")
    elif kinds["frontend"]:
        tier = "L1"
        reasons.append("Frontend composition work is at least L1.")
    else:
        reasons.append(
            "Shared engineering, backend, test, configuration, or runtime-sensitive "
            "work is L2."
        )

    if kinds["build_runtime"]:
        tier = "L2"
        reasons.append(
            "A dependency, image, Compose, proxy, or deployment fingerprint input "
            "requires L2."
        )
    if kinds["migration"]:
        tier = "L2"
        reasons.append("Migration and persistence behavior requires L2.")

    for rule in rules:
        rule_tier = str(rule["tier"])
        reasons.append(str(rule["reason"]))
        if TIER_RANK[rule_tier] > TIER_RANK[tier]:
            tier = rule_tier
    return tier, list(dict.fromkeys(reasons))


def build_plan(paths: list[str], python_bin: str, base_ref: str) -> dict[str, object]:
    kinds = classify(paths)
    rules = select_validation_rules(paths)
    tier, tier_reasons = classify_tier(paths, kinds, rules)
    commands: list[list[str]] = [
        ["git", "diff", "--check", f"{base_ref}...HEAD"],
        ["git", "diff", "--cached", "--check"],
        ["git", "diff", "--check"],
    ]
    followups: list[str] = []
    specialized_commands: list[list[str]] = []
    documents: list[str] = []

    for rule in rules:
        documents.extend(str(value) for value in rule["documents"])  # type: ignore[index]
        specialized_commands.extend(
            [str(part) for part in command]
            for command in rule["commands"]  # type: ignore[index]
        )
        followups.extend(str(value) for value in rule["followups"])  # type: ignore[index]

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
        documents.extend(
            [
                "docs/cloud-admin-ui-standard-v1.md",
                "docs/cloud-admin-frontend-engineering-standard-v1.md",
                "frontend/admin-ui-manifest.json",
            ]
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

    specialized_commands = _deduplicate_commands(specialized_commands)
    commands = _deduplicate_commands([*commands, *specialized_commands])
    return {
        "paths": paths,
        "classification": kinds,
        "tier": tier,
        "tier_reasons": tier_reasons,
        "domains": [str(rule["id"]) for rule in rules],
        "documents": sorted(set(documents)),
        "commands": commands,
        "specialized_commands": specialized_commands,
        "followups": list(dict.fromkeys(followups)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--plan", action="store_true", help="print the plan without running gates"
    )
    parser.add_argument(
        "--specialized-only",
        action="store_true",
        help="run only specialized domain gates selected by the current diff",
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
        print(f"[plan] tier: {plan['tier']}")
        for reason in plan["tier_reasons"]:  # type: ignore[index]
            print(f" - {reason}")
        if plan["domains"]:  # type: ignore[index]
            print("[plan] matched domains:")
            for domain in plan["domains"]:  # type: ignore[index]
                print(f" - {domain}")
        if plan["documents"]:  # type: ignore[index]
            print("[plan] required context:")
            for document in plan["documents"]:  # type: ignore[index]
                print(f" - {document}")
        selected_commands = (
            plan["specialized_commands"] if args.specialized_only else plan["commands"]
        )
        print("[plan] local gates:")
        for command in selected_commands:  # type: ignore[assignment]
            print(" - " + " ".join(command))
        for followup in plan["followups"]:  # type: ignore[index]
            print(f"[next] {followup}")

    if args.plan:
        return 0

    environment = os.environ.copy()
    environment["NPCINK_CLOUD_PYTHON_BIN"] = python_bin
    selected_commands = (
        plan["specialized_commands"] if args.specialized_only else plan["commands"]
    )
    if args.specialized_only and not selected_commands:
        print("[ok] No specialized domain gates selected.")
        return 0
    for command in selected_commands:  # type: ignore[assignment]
        print("[run] " + " ".join(command), flush=True)
        subprocess.run(command, cwd=ROOT, env=environment, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
