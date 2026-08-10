#!/usr/bin/env python3
"""Select pytest files for a deterministic weighted shard."""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_WEIGHT_SECONDS = 1.0


@dataclass
class Shard:
    index: int
    total_seconds: float = 0.0
    selectors: list[str] = field(default_factory=list)

    def add(self, selector: str, seconds: float) -> None:
        self.selectors.append(selector)
        self.total_seconds += seconds


def normalize_repo_path(path: Path) -> str:
    value = path.as_posix()
    return value[2:] if value.startswith("./") else value


def discover_test_files(roots: list[Path]) -> list[Path]:
    files: set[Path] = set()
    for root in roots:
        if root.is_file():
            if root.name.startswith("test_") or root.name.endswith("_test.py"):
                files.add(root)
            continue
        if not root.is_dir():
            raise SystemExit(f"pytest root not found: {root}")
        files.update(root.rglob("test_*.py"))
        files.update(root.rglob("*_test.py"))
    return sorted(files, key=normalize_repo_path)


def load_duration_weights(path: Path | None) -> dict[str, float]:
    if path is None or not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_weights: Any
    if isinstance(payload, dict) and isinstance(payload.get("weights"), dict):
        raw_weights = payload["weights"]
    elif isinstance(payload, dict):
        raw_weights = payload
    else:
        raise SystemExit(f"invalid duration weights payload: {path}")

    weights: dict[str, float] = {}
    for raw_path, raw_seconds in raw_weights.items():
        try:
            seconds = max(0.0, float(raw_seconds))
        except (TypeError, ValueError):
            seconds = 0.0
        weights[str(raw_path)] = seconds
    return weights


def load_node_duration_weights(path: Path | None) -> dict[str, float]:
    if path is None or not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_weights = payload.get("node_weights") if isinstance(payload, dict) else None
    if not isinstance(raw_weights, dict):
        return {}
    weights: dict[str, float] = {}
    for raw_node_id, raw_seconds in raw_weights.items():
        try:
            seconds = max(0.0, float(raw_seconds))
        except (TypeError, ValueError):
            seconds = 0.0
        weights[str(raw_node_id)] = seconds
    return weights


def discover_static_test_nodes(path: Path) -> list[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError, UnicodeError):
        return []
    repo_path = normalize_repo_path(path)
    selectors: list[str] = []
    for statement in tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if statement.name.startswith("test_"):
                selectors.append(f"{repo_path}::{statement.name}")
            continue
        if not isinstance(statement, ast.ClassDef) or not statement.name.startswith("Test"):
            continue
        for child in statement.body:
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child.name.startswith(
                "test_"
            ):
                selectors.append(f"{repo_path}::{statement.name}::{child.name}")
    return selectors


def discover_collected_test_nodes(path: Path) -> list[str]:
    pytest_python = Path(".venv/bin/python")
    if not pytest_python.is_file():
        return []
    repo_path = normalize_repo_path(path)
    completed = subprocess.run(
        [
            str(pytest_python),
            "-m",
            "pytest",
            "--collect-only",
            "-q",
            repo_path,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return []
    prefix = f"{repo_path}::"
    return sorted(
        {
            line.strip().split("[", 1)[0]
            for line in completed.stdout.splitlines()
            if line.strip().startswith(prefix)
        }
    )


def build_weighted_selectors(
    files: list[Path],
    file_weights: dict[str, float],
    node_weights: dict[str, float],
    shard_count: int,
    collected_node_loader: Callable[[Path], list[str]] = discover_collected_test_nodes,
) -> list[tuple[float, str]]:
    weighted_files = [
        (file_weights.get(normalize_repo_path(path), DEFAULT_WEIGHT_SECONDS), path)
        for path in files
    ]
    split_threshold = sum(weight for weight, _path in weighted_files) / shard_count
    selectors: list[tuple[float, str]] = []
    for file_weight, path in weighted_files:
        repo_path = normalize_repo_path(path)
        if file_weight <= split_threshold:
            selectors.append((file_weight, repo_path))
            continue
        discovered_nodes = discover_static_test_nodes(path)
        collected_nodes = collected_node_loader(path)
        historic_nodes = {
            node_id for node_id in node_weights if node_id.startswith(f"{repo_path}::")
        }
        if (
            len(discovered_nodes) < 2
            or not historic_nodes
            or not historic_nodes.issubset(discovered_nodes)
            or set(collected_nodes) != set(discovered_nodes)
        ):
            selectors.append((file_weight, repo_path))
            continue
        selectors.extend(
            (node_weights.get(node_id, DEFAULT_WEIGHT_SECONDS), node_id)
            for node_id in discovered_nodes
        )
    return selectors


def assign_files(
    files: list[Path],
    weights: dict[str, float],
    shard_count: int,
) -> list[Shard]:
    weighted_selectors = []
    for path in files:
        repo_path = normalize_repo_path(path)
        weighted_selectors.append(
            (weights.get(repo_path, DEFAULT_WEIGHT_SECONDS), repo_path)
        )
    return assign_weighted_selectors(weighted_selectors, shard_count)


def assign_weighted_selectors(
    weighted_selectors: list[tuple[float, str]],
    shard_count: int,
) -> list[Shard]:
    shards = [Shard(index=index) for index in range(1, shard_count + 1)]
    weighted_items = sorted(
        weighted_selectors,
        key=lambda item: (-item[0], item[1]),
    )
    for seconds, selector in weighted_items:
        shard = min(shards, key=lambda item: (item.total_seconds, item.index))
        shard.add(selector, seconds)
    for shard in shards:
        shard.selectors.sort()
    return shards


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument(
        "--durations-json",
        type=Path,
        default=Path("ci/pytest-backend-durations.json"),
    )
    parser.add_argument("--shards", type=int, required=True)
    parser.add_argument("--shard", type=int, required=True)
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    if args.shards < 1:
        raise SystemExit("--shards must be greater than zero")
    if args.shard < 1 or args.shard > args.shards:
        raise SystemExit("--shard must be between 1 and --shards")

    files = discover_test_files(args.roots)
    weights = load_duration_weights(args.durations_json)
    node_weights = load_node_duration_weights(args.durations_json)
    weighted_selectors = build_weighted_selectors(
        files, weights, node_weights, args.shards
    )
    shards = assign_weighted_selectors(weighted_selectors, args.shards)
    selected = shards[args.shard - 1]
    for selector in selected.selectors:
        print(selector)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
