#!/usr/bin/env python3
"""Enforce narrow, reviewable maintainability guardrails."""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "maintainability-inventory-v1.json"
SERVICE_ROUTER = "app/api/routes/service.py"
BEHAVIOR_PREFIXES = (
    "tests/api/",
    "tests/domain/",
    "frontend/tests/e2e/",
    "frontend/tests/vitest/",
)
SOURCE_PREFIXES = ("app/", "frontend/src/")


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def _changed_entries(base_ref: str) -> list[tuple[str, str]]:
    outputs = [
        _git("diff", "--name-status", "--diff-filter=ACMRD", f"{base_ref}...HEAD"),
        _git("diff", "--name-status", "--diff-filter=ACMRD"),
        _git("diff", "--name-status", "--cached", "--diff-filter=ACMRD"),
    ]
    entries: set[tuple[str, str]] = set()
    for output in outputs:
        for line in output.splitlines():
            fields = line.split("\t")
            if len(fields) >= 2:
                entries.add((fields[0][0], fields[-1]))
    for path in _git("ls-files", "--others", "--exclude-standard").splitlines():
        if path:
            entries.add(("A", path))
    return sorted(entries)


def _route_family(path: str) -> str | None:
    if not path.startswith("/"):
        return None
    segments = [segment for segment in path.split("/") if segment]
    return segments[0] if segments else None


def _service_route_families(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    families: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call) or not isinstance(
                decorator.func, ast.Attribute
            ):
                continue
            if not isinstance(decorator.func.value, ast.Name) or (
                decorator.func.value.id != "router"
            ):
                continue
            path_node: ast.AST | None = decorator.args[0] if decorator.args else None
            if path_node is None:
                for keyword in decorator.keywords:
                    if keyword.arg == "path":
                        path_node = keyword.value
                        break
            if not isinstance(path_node, ast.Constant):
                continue
            value = path_node.value
            if isinstance(value, str):
                family = _route_family(value)
                if family:
                    families.add(family)
    return families


def _has_behavior_test_change(entries: list[tuple[str, str]]) -> bool:
    return any(
        status in {"A", "C", "M", "R"}
        and path.startswith(BEHAVIOR_PREFIXES)
        and path.endswith((".py", ".ts", ".tsx"))
        for status, path in entries
    )


def _active_dated_documents(root: Path) -> set[str]:
    import re

    dated = re.compile(r"(?:19|20)\d{2}(?:-\d{2}){0,2}")
    active = re.compile(r"^>?\s*(?:status|状态)\s*:\s*active\b", re.I | re.M)
    paths: set[str] = set()
    for path in (root / "docs").rglob("*.md"):
        relative = path.relative_to(root).as_posix()
        heading = "\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[:20])
        if dated.search(path.name) and active.search(heading):
            paths.add(relative)
    return paths


def check(root: Path, base_ref: str) -> list[str]:
    config: dict[str, Any] = json.loads(
        (root / CONFIG.relative_to(ROOT)).read_text(encoding="utf-8")
    )
    errors: list[str] = []
    changed_entries = _changed_entries(base_ref)

    allowed_families = {str(value) for value in config["service_router_route_families"]}
    actual_families = _service_route_families(root / SERVICE_ROUTER)
    new_families = sorted(actual_families - allowed_families)
    if new_families:
        errors.append(
            f"service router adds unapproved route family/families: {', '.join(new_families)}; "
            "extract the route family or update the reviewed maintainability baseline"
        )

    changed_behavior = bool(changed_entries) and any(
        path.startswith(SOURCE_PREFIXES) for _status, path in changed_entries
    )
    if changed_behavior and not _has_behavior_test_change(changed_entries):
        errors.append(
            "application behavior changed without a changed backend or frontend behavior "
            "test; "
            "source-text contract tests alone cannot prove the behavior"
        )

    authority = {
        str(path): str(reason).strip()
        for path, reason in dict(config["dated_active_authority"]).items()
    }
    active_dated = _active_dated_documents(root)
    missing = sorted(active_dated - authority.keys())
    empty = sorted(path for path in active_dated if not authority.get(path))
    stale = sorted(set(authority) - active_dated)
    if missing:
        errors.append(
            "dated-active documents missing a current-authority reason: " + ", ".join(missing)
        )
    if empty:
        errors.append("dated-active authority reasons must be non-empty: " + ", ".join(empty))
    if stale:
        errors.append(
            "maintainability authority lists documents that are not dated-active: "
            + ", ".join(stale)
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-ref", default="origin/master")
    args = parser.parse_args()
    errors = check(ROOT, args.base_ref)
    if errors:
        for error in errors:
            print(f"[fail] {error}", file=sys.stderr)
        return 1
    print("[ok] maintainability policy gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
