#!/usr/bin/env python3
"""Select fail-closed contract tests for an ordinary backend pull request."""

from __future__ import annotations

import argparse
import ast
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_ROOT = Path("tests/contract")
APP_PATH_PATTERN = re.compile(
    r"app/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+[.]py"
)
ORDINARY_TEST_PREFIXES = (
    "tests/api/",
    "tests/core/",
    "tests/dev/",
    "tests/domain/",
)
GLOBAL_APP_SCAN_CONTRACTS = {
    "tests/contract/test_cloud_bulk_article_contract.py",
    "tests/contract/test_commercial_repository_retirement_contract.py",
    "tests/contract/test_legacy_media_delivery_removal.py",
    "tests/contract/test_media_delivery_observability_contract.py",
    "tests/contract/test_portal_account_authorization_contract.py",
}


class SelectionError(ValueError):
    """Raised when dependency evidence cannot be constructed safely."""


@dataclass(frozen=True)
class ModuleRecord:
    module: str
    is_package: bool
    path: Path


@dataclass(frozen=True)
class ContractDependency:
    imported_modules: frozenset[str]
    source_paths: frozenset[str]


@dataclass(frozen=True)
class ContractSelection:
    mode: str
    tests: tuple[str, ...]
    reason: str


def normalize_paths(paths: Iterable[str]) -> tuple[str, ...]:
    normalized: set[str] = set()
    for raw_path in paths:
        path = str(raw_path or "").strip().replace("\\", "/")
        if not path or path.startswith("/") or ".." in Path(path).parts:
            raise SelectionError(f"changed path is invalid: {raw_path!r}")
        normalized.add(path.removeprefix("./"))
    return tuple(sorted(normalized))


def all_contract_tests(root: Path = ROOT) -> tuple[str, ...]:
    return tuple(
        path.relative_to(root).as_posix()
        for path in sorted((root / CONTRACT_ROOT).glob("test_*.py"))
        if path.is_file()
    )


def is_ordinary_backend_path(path: str) -> bool:
    if path.startswith("app/") and path.endswith(".py"):
        return True
    return path.endswith(".py") and path.startswith(ORDINARY_TEST_PREFIXES)


def module_record(root: Path, path: Path) -> ModuleRecord:
    relative = path.relative_to(root)
    parts = list(relative.with_suffix("").parts)
    is_package = parts[-1] == "__init__"
    if is_package:
        parts.pop()
    return ModuleRecord(module=".".join(parts), is_package=is_package, path=path)


def app_modules(root: Path) -> tuple[dict[str, ModuleRecord], dict[str, str]]:
    by_module: dict[str, ModuleRecord] = {}
    by_path: dict[str, str] = {}
    for path in sorted((root / "app").rglob("*.py")):
        if not path.is_file():
            continue
        record = module_record(root, path)
        if not record.module or record.module in by_module:
            raise SelectionError("application module paths are ambiguous")
        relative = path.relative_to(root).as_posix()
        by_module[record.module] = record
        by_path[relative] = record.module
    if "app" not in by_module:
        raise SelectionError("application package root is missing")
    return by_module, by_path


def resolve_import_base(record: ModuleRecord, node: ast.ImportFrom) -> str:
    if node.level == 0:
        return node.module or ""
    package_parts = record.module.split(".") if record.is_package else record.module.split(".")[:-1]
    remove = node.level - 1
    if remove > len(package_parts):
        return ""
    prefix = package_parts[: len(package_parts) - remove]
    if node.module:
        prefix.extend(node.module.split("."))
    return ".".join(prefix)


def record_imported_module(
    imported: set[str],
    module: str,
    known_modules: set[str],
) -> None:
    imported.add(module)
    parts = module.split(".")
    for length in range(1, len(parts)):
        package = ".".join(parts[:length])
        if package in known_modules:
            imported.add(package)


def imported_app_modules(
    source: str,
    record: ModuleRecord,
    known_modules: set[str],
) -> set[str]:
    try:
        tree = ast.parse(source, filename=str(record.path))
    except SyntaxError as exc:
        raise SelectionError(f"cannot parse Python dependency source: {record.path}") from exc
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "app" or alias.name.startswith("app."):
                    record_imported_module(imported, alias.name, known_modules)
        elif isinstance(node, ast.ImportFrom):
            base = resolve_import_base(record, node)
            if base == "app" or base.startswith("app."):
                record_imported_module(imported, base, known_modules)
                for alias in node.names:
                    candidate = f"{base}.{alias.name}"
                    if candidate in known_modules:
                        record_imported_module(imported, candidate, known_modules)
    return imported


def dependency_closure(
    seeds: Iterable[str],
    graph: dict[str, set[str]],
) -> frozenset[str]:
    visited: set[str] = set()
    pending = list(seeds)
    while pending:
        module = pending.pop()
        if module in visited:
            continue
        visited.add(module)
        pending.extend(graph.get(module, ()))
    return frozenset(visited)


def literal_app_paths(source: str) -> frozenset[str]:
    return frozenset(APP_PATH_PATTERN.findall(source))


def build_contract_dependencies(
    root: Path = ROOT,
) -> tuple[dict[str, ContractDependency], dict[str, str]]:
    modules, module_by_path = app_modules(root)
    known_modules = set(modules)
    graph: dict[str, set[str]] = {}
    for module, record in modules.items():
        source = record.path.read_text(encoding="utf-8")
        graph[module] = imported_app_modules(source, record, known_modules)

    dependencies: dict[str, ContractDependency] = {}
    for relative in all_contract_tests(root):
        path = root / relative
        record = ModuleRecord(
            module=".".join(path.relative_to(root).with_suffix("").parts),
            is_package=False,
            path=path,
        )
        source = path.read_text(encoding="utf-8")
        direct = imported_app_modules(source, record, known_modules)
        dependencies[relative] = ContractDependency(
            imported_modules=dependency_closure(direct, graph),
            source_paths=literal_app_paths(source),
        )
    return dependencies, module_by_path


def select_contract_tests(
    changed_paths: Iterable[str],
    *,
    root: Path = ROOT,
) -> ContractSelection:
    all_tests = all_contract_tests(root)
    try:
        normalized = normalize_paths(changed_paths)
    except SelectionError as exc:
        return ContractSelection("full", all_tests, str(exc))
    if not normalized:
        return ContractSelection("full", all_tests, "changed path set is empty")
    unsafe = [path for path in normalized if not is_ordinary_backend_path(path)]
    if unsafe:
        return ContractSelection(
            "full",
            all_tests,
            f"non-ordinary backend path requires all contracts: {unsafe[0]}",
        )

    changed_app_paths = tuple(path for path in normalized if path.startswith("app/"))
    if not changed_app_paths:
        return ContractSelection(
            "none",
            (),
            "only focused backend test files changed",
        )
    if any(not (root / path).is_file() for path in changed_app_paths):
        return ContractSelection(
            "full",
            all_tests,
            "changed application source is missing or deleted",
        )

    try:
        dependencies, module_by_path = build_contract_dependencies(root)
    except (OSError, UnicodeError, SelectionError) as exc:
        return ContractSelection("full", all_tests, str(exc))

    changed_modules: set[str] = set()
    for path in changed_app_paths:
        module = module_by_path.get(path)
        if module is None:
            return ContractSelection(
                "full",
                all_tests,
                f"changed application module cannot be resolved: {path}",
            )
        changed_modules.add(module)

    selected = set(GLOBAL_APP_SCAN_CONTRACTS)
    for contract, dependency in dependencies.items():
        if changed_modules.intersection(dependency.imported_modules):
            selected.add(contract)
        if set(changed_app_paths).intersection(dependency.source_paths):
            selected.add(contract)
    missing_contracts = selected - set(all_tests)
    if missing_contracts:
        return ContractSelection(
            "full",
            all_tests,
            "global application contract inventory is stale",
        )
    return ContractSelection(
        "targeted",
        tuple(sorted(selected)),
        f"selected dependency closure for {len(changed_app_paths)} application file(s)",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="Changed repository-relative paths")
    args = parser.parse_args()
    selection = select_contract_tests(args.paths)
    print(f"[contract-selection] mode={selection.mode} reason={selection.reason}", file=sys.stderr)
    for path in selection.tests:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
