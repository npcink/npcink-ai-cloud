#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "maintainability-inventory-v1.json"
SOURCE_SUFFIXES = {".js", ".mjs", ".py", ".sh", ".ts", ".tsx"}
DATED_DOCUMENT_PATTERN = re.compile(r"(?:19|20)\d{2}(?:-\d{2}){0,2}")
ACTIVE_STATUS_PATTERN = re.compile(
    r"^>?\s*(?:status|状态)\s*:\s*active\b",
    flags=re.IGNORECASE | re.MULTILINE,
)
FRONTEND_TEST_DECLARATION_PATTERN = re.compile(
    r"\b(?:it|test)(?:\.(?:each|fixme|only|skip|todo))?\s*\("
)


def _line_count(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for _line in handle)


def _git_line_count(root: Path, revision: str, relative_path: str) -> int | None:
    result = subprocess.run(
        ["git", "show", f"{revision}:{relative_path}"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        return None
    return len(result.stdout.splitlines())


def _python_test_functions(path: Path) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    return _python_test_functions_from_source(
        path.read_text(encoding="utf-8"), filename=str(path)
    )


def _python_test_functions_from_source(
    source: str, *, filename: str = "<inventory-test-source>"
) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    tree = ast.parse(source, filename=filename)
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name.startswith("test_")
    ]


def _is_source_text_contract(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        function = child.func
        if isinstance(function, ast.Name) and function.id in {"_read", "read_source"}:
            return True
        if isinstance(function, ast.Attribute) and function.attr in {"read_text", "read_bytes"}:
            root_names = {
                name.id
                for name in ast.walk(function.value)
                if isinstance(name, ast.Name)
            }
            called_functions = {
                call.func.id
                for call in ast.walk(function.value)
                if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
            }
            if root_names.intersection({"CLOUD_ROOT", "PROJECT_ROOT", "REPO_ROOT", "ROOT"}):
                return True
            if called_functions.intersection({"_cloud_root", "repository_root"}):
                return True
    return False


def _test_inventory(root: Path) -> dict[str, Any]:
    contract_tests = [
        test
        for path in sorted((root / "tests" / "contract").glob("test_*.py"))
        for test in _python_test_functions(path)
    ]
    behavior_tests = [
        test
        for directory in (root / "tests" / "api", root / "tests" / "domain")
        for path in sorted(directory.glob("test_*.py"))
        for test in _python_test_functions(path)
    ]
    source_text_contracts = [test for test in contract_tests if _is_source_text_contract(test)]
    frontend_contract_paths = sorted((root / "frontend" / "tests" / "unit").glob("*"))
    frontend_source_contract_files = [
        path
        for path in frontend_contract_paths
        if path.is_file()
        and path.suffix in {".js", ".mjs", ".ts"}
        and "readFileSync" in path.read_text(encoding="utf-8", errors="replace")
    ]
    frontend_behavior_paths = [
        *sorted((root / "frontend" / "tests" / "e2e").glob("*.ts")),
        *sorted((root / "frontend" / "tests" / "vitest").glob("*.ts")),
        *sorted((root / "frontend" / "tests" / "vitest").glob("*.tsx")),
    ]
    frontend_behavior_test_declarations = sum(
        len(FRONTEND_TEST_DECLARATION_PATTERN.findall(path.read_text(encoding="utf-8")))
        for path in frontend_behavior_paths
    )
    return {
        "python_source_text_contract_tests": len(source_text_contracts),
        "python_contract_tests_total": len(contract_tests),
        "python_api_domain_behavior_tests": len(behavior_tests),
        "frontend_source_text_contract_files": len(frontend_source_contract_files),
        "frontend_vitest_playwright_behavior_declarations": (
            frontend_behavior_test_declarations
        ),
        "definitions": {
            "source_text_contract": (
                "Python test functions under tests/contract that explicitly read through a "
                "repository-root helper or root path"
            ),
            "behavior_test": "Python test functions under tests/api or tests/domain",
            "frontend_source_text_contract": (
                "Frontend unit contract files that read repository source with readFileSync"
            ),
            "frontend_behavior_test": (
                "it/test declarations in frontend Playwright and Vitest TypeScript files; "
                "a parameterized declaration counts once"
            ),
        },
    }


def _document_inventory(root: Path) -> dict[str, Any]:
    documents = sorted((root / "docs").rglob("*.md"))
    active: list[str] = []
    dated_active: list[str] = []
    for path in documents:
        relative_path = path.relative_to(root).as_posix()
        heading = "\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[:20])
        if not ACTIVE_STATUS_PATTERN.search(heading):
            continue
        active.append(relative_path)
        if DATED_DOCUMENT_PATTERN.search(path.name):
            dated_active.append(relative_path)
    return {
        "active_documents": len(active),
        "dated_active_documents": len(dated_active),
        "dated_active_paths": dated_active,
    }


def _large_file_inventory(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    threshold = int(config["large_file_threshold"])
    files: list[dict[str, Any]] = []
    for source_root in config["source_roots"]:
        for path in (root / source_root).rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            line_count = _line_count(path)
            if line_count >= threshold:
                files.append(
                    {"path": path.relative_to(root).as_posix(), "lines": line_count}
                )
    files.sort(key=lambda item: (-int(item["lines"]), str(item["path"])))

    baseline_revision = str(config["baseline_revision"])
    watched: list[dict[str, Any]] = []
    for item in config["watched_files"]:
        relative_path = str(item["path"])
        current_lines = _line_count(root / relative_path)
        baseline_lines = _git_line_count(root, baseline_revision, relative_path)
        watched.append(
            {
                "path": relative_path,
                "responsibility": str(item["responsibility"]),
                "baseline_lines": baseline_lines,
                "current_lines": current_lines,
                "line_delta": None if baseline_lines is None else current_lines - baseline_lines,
            }
        )
    return {
        "threshold_lines": threshold,
        "files": files,
        "trend_baseline_revision": baseline_revision,
        "watched_file_trends": watched,
    }


def build_inventory(root: Path, config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    return {
        "revision": str(config["revision"]),
        "mode": "advisory_read_only",
        "large_files": _large_file_inventory(root, config),
        "test_evidence": _test_inventory(root),
        "documents": _document_inventory(root),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Report advisory maintainability signals.")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = parser.parse_args()
    root = args.root.resolve()
    config_path = args.config.resolve()
    print(json.dumps(build_inventory(root, config_path), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
