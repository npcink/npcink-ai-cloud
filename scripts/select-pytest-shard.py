#!/usr/bin/env python3
"""Select pytest files for a deterministic weighted shard."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_WEIGHT_SECONDS = 1.0


@dataclass
class Shard:
    index: int
    total_seconds: float = 0.0
    files: list[Path] = field(default_factory=list)

    def add(self, path: Path, seconds: float) -> None:
        self.files.append(path)
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


def assign_files(
    files: list[Path],
    weights: dict[str, float],
    shard_count: int,
) -> list[Shard]:
    shards = [Shard(index=index) for index in range(1, shard_count + 1)]
    weighted_files = sorted(
        (
            (
                weights.get(normalize_repo_path(path), DEFAULT_WEIGHT_SECONDS),
                normalize_repo_path(path),
                path,
            )
            for path in files
        ),
        key=lambda item: (-item[0], item[1]),
    )
    for seconds, _repo_path, path in weighted_files:
        shard = min(shards, key=lambda item: (item.total_seconds, item.index))
        shard.add(path, seconds)
    for shard in shards:
        shard.files.sort(key=normalize_repo_path)
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
    shards = assign_files(files, weights, args.shards)
    selected = shards[args.shard - 1]
    for path in selected.files:
        print(normalize_repo_path(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
