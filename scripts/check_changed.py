#!/usr/bin/env python3
"""Plan or run the narrowest safe local gates for the current diff."""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import shutil
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
    elif kinds["frontend"] and all(path.startswith("frontend/") for path in paths):
        # L1 is valid only for a frontend-only change. A mixed frontend/backend,
        # script, migration, or runtime-input diff must retain the higher-risk L2
        # baseline before any path-specific rule is applied.
        if kinds["admin"]:
            reasons.append("Admin route or route-local interaction work is at least L1.")
        else:
            reasons.append("Frontend-only composition work is at least L1.")
        tier = "L1"
    else:
        reasons.append(
            "Shared engineering, backend, test, configuration, or runtime-sensitive "
            "work, including mixed frontend changes, is L2."
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
    domain_ids = [str(rule["id"]) for rule in rules]
    if kinds["build_runtime"]:
        runtime_lane = "m4:preview:deploy"
    elif kinds["cloud_source"] or kinds["migration"]:
        runtime_lane = "m4:preview:sync"
    elif "engineering_validation_tooling" in domain_ids:
        runtime_lane = "github-actions"
    else:
        runtime_lane = "none"
    return {
        "paths": paths,
        "classification": kinds,
        "tier": tier,
        "tier_reasons": tier_reasons,
        "domains": domain_ids,
        "documents": sorted(set(documents)),
        "commands": commands,
        "specialized_commands": specialized_commands,
        "runtime_lane": runtime_lane,
        "followups": list(dict.fromkeys(followups)),
    }


def environment_checks(
    plan: dict[str, object],
    python_bin: str,
    *,
    executable_lookup: Callable[[str], str | None] = shutil.which,
) -> list[dict[str, object]]:
    """Report local prerequisites without installing or mutating anything."""
    classification = plan["classification"]
    planned_commands = plan["commands"]
    checks: list[dict[str, object]] = []

    def add(
        check_id: str,
        status: str,
        required: bool,
        detail: str,
    ) -> None:
        checks.append(
            {
                "id": check_id,
                "status": status,
                "required": required,
                "detail": detail,
            }
        )

    def executable_path(command: str) -> str | None:
        candidate = Path(command)
        if candidate.is_absolute() or "/" in command:
            return (
                str(candidate)
                if candidate.is_file() and os.access(candidate, os.X_OK)
                else None
            )
        return executable_lookup(command)

    python_commands = sorted(
        {
            str(command[0])
            for command in planned_commands
            if command and Path(str(command[0])).name.startswith("python")
        }
    )
    if classification["python"] or classification["python_tests"]:
        python_commands = sorted({*python_commands, python_bin})
    if python_commands:
        resolved_python = {
            command: executable_path(command) for command in python_commands
        }
        missing_python = [
            command for command, resolved in resolved_python.items() if not resolved
        ]
        if missing_python:
            add(
                "python",
                "missing",
                True,
                "unavailable planned interpreter(s): " + ", ".join(missing_python),
            )
        else:
            add(
                "python",
                "ready",
                True,
                ", ".join(str(value) for value in resolved_python.values()),
            )
    else:
        add("python", "not_required", False, "No changed Python path requires a local Python gate.")

    if classification["frontend"]:
        pnpm = executable_path("pnpm")
        add(
            "pnpm",
            "ready" if pnpm else "missing",
            True,
            pnpm or "pnpm is unavailable on PATH",
        )
        tsc = ROOT / "frontend" / "node_modules" / ".bin" / "tsc"
        add(
            "frontend_node_modules",
            "ready" if tsc.exists() else "missing",
            True,
            str(tsc) if tsc.exists() else f"{tsc} is unavailable; run the repository bootstrap first",
        )
    else:
        add("frontend", "not_required", False, "No changed frontend path requires frontend tooling.")

    if any(command and command[0] == "node" for command in planned_commands):
        node = executable_path("node")
        add(
            "node",
            "ready" if node else "missing",
            True,
            node or "node is unavailable on PATH",
        )
    else:
        add("node", "not_required", False, "No changed Node script requires node syntax checks.")

    runtime_lane = str(plan["runtime_lane"])
    if runtime_lane.startswith("m4:preview:"):
        add(
            "local_docker",
            "not_required",
            False,
            "M4 owns routine Docker build and runtime validation; do not substitute local Docker.",
        )
        env_file = ROOT / ".env"
        add(
            "m4_environment",
            "ready" if env_file.is_file() else "operator_required",
            False,
            str(env_file) if env_file.is_file() else "M4/runtime environment must be supplied by the operator",
        )
    else:
        add("m4", "not_required", False, f"Runtime lane is {runtime_lane}.")

    if runtime_lane == "github-actions":
        gh = executable_lookup("gh")
        add(
            "github_cli",
            "ready" if gh else "operator_required",
            False,
            gh or "gh is unavailable; GitHub Actions remains the remote runtime",
        )
    else:
        add("github_cli", "not_required", False, "No GitHub PR operation is part of the local plan.")

    return checks


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
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="report local prerequisites for the selected plan without running gates",
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
    if args.doctor:
        checks = environment_checks(plan, python_bin)
        if args.format == "json":
            print(
                json.dumps(
                    {"plan": plan, "environment_checks": checks},
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print(f"[doctor] runtime lane: {plan['runtime_lane']}")
            for check in checks:
                required = "required" if check["required"] else "advisory"
                print(
                    f"[doctor] {check['status']} ({required}) "
                    f"{check['id']}: {check['detail']}"
                )
        missing_required = any(
            item["required"] and item["status"] == "missing" for item in checks
        )
        return 1 if missing_required else 0

    if args.format == "json":
        print(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print("[plan] changed files:")
        for path in paths:
            print(f" - {path}")
        print(f"[plan] tier: {plan['tier']}")
        print(f"[plan] runtime lane: {plan['runtime_lane']}")
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
