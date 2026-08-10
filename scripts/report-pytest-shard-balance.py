#!/usr/bin/env python3
"""Compare predicted and actual pytest shard durations."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_WEIGHT_SECONDS = 1.0
SHARD_REPORT_PATTERN = re.compile(r"pytest-backend-shard-(\d+)\.xml$")
SHARD_FILES_PATTERN = re.compile(r"pytest-files-shard-(\d+)\.txt$")


@dataclass(frozen=True)
class ShardBalance:
    index: int
    file_count: int
    predicted_seconds: float
    actual_seconds: float


@dataclass(frozen=True)
class FileDrift:
    path: str
    predicted_seconds: float
    actual_seconds: float
    absolute_drift_seconds: float
    relative_drift: float


def classname_to_path(classname: str) -> str:
    parts = [part for part in classname.strip().split(".") if part]
    while parts and parts[-1][:1].isupper():
        parts.pop()
    return f"{'/'.join(parts)}.py"


def collect_file_weights(junit_xml: Path) -> dict[str, float]:
    weights: defaultdict[str, float] = defaultdict(float)
    root = ET.parse(junit_xml).getroot()
    for case in root.iter("testcase"):
        classname = case.attrib.get("classname", "").strip()
        if not classname:
            continue
        try:
            seconds = max(0.0, float(case.attrib.get("time", "0")))
        except ValueError:
            seconds = 0.0
        weights[classname_to_path(classname)] += seconds
    return dict(weights)


def collect_node_weights(junit_xml: Path) -> dict[str, float]:
    weights: defaultdict[str, float] = defaultdict(float)
    root = ET.parse(junit_xml).getroot()
    for case in root.iter("testcase"):
        classname = case.attrib.get("classname", "").strip()
        name = case.attrib.get("name", "").strip()
        if not classname or not name:
            continue
        parts = [part for part in classname.split(".") if part]
        class_parts: list[str] = []
        while parts and parts[-1][:1].isupper():
            class_parts.insert(0, parts.pop())
        path = f"{'/'.join(parts)}.py"
        node_id = "::".join((path, *class_parts, name.split("[", 1)[0]))
        try:
            seconds = max(0.0, float(case.attrib.get("time", "0")))
        except ValueError:
            seconds = 0.0
        weights[node_id] += seconds
    return dict(weights)


def load_duration_payload(
    path: Path,
) -> tuple[dict[str, float], dict[str, float], dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_weights = payload.get("weights")
    if not isinstance(raw_weights, dict):
        raise ValueError(f"duration weights are missing from: {path}")
    weights: dict[str, float] = {}
    for raw_path, raw_seconds in raw_weights.items():
        try:
            weights[str(raw_path)] = max(0.0, float(raw_seconds))
        except (TypeError, ValueError):
            weights[str(raw_path)] = 0.0
    raw_node_weights = payload.get("node_weights", {})
    node_weights: dict[str, float] = {}
    if isinstance(raw_node_weights, dict):
        for raw_node_id, raw_seconds in raw_node_weights.items():
            try:
                node_weights[str(raw_node_id)] = max(0.0, float(raw_seconds))
            except (TypeError, ValueError):
                node_weights[str(raw_node_id)] = 0.0
    return weights, node_weights, payload


def discover_shard_artifacts(root: Path) -> dict[int, tuple[Path, Path]]:
    reports: dict[int, Path] = {}
    file_lists: dict[int, Path] = {}
    for path in root.rglob("pytest-backend-shard-*.xml"):
        match = SHARD_REPORT_PATTERN.search(path.name)
        if match:
            index = int(match.group(1))
            if index in reports:
                raise ValueError(f"duplicate pytest shard report for shard {index}")
            reports[index] = path
    for path in root.rglob("pytest-files-shard-*.txt"):
        match = SHARD_FILES_PATTERN.search(path.name)
        if match:
            index = int(match.group(1))
            if index in file_lists:
                raise ValueError(f"duplicate pytest file list for shard {index}")
            file_lists[index] = path
    if not reports:
        raise ValueError(f"no pytest shard reports found under: {root}")
    if reports.keys() != file_lists.keys():
        raise ValueError("pytest shard reports and selected-file lists do not match")
    return {index: (reports[index], file_lists[index]) for index in sorted(reports)}


def _selected_files(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def summarize(
    artifact_root: Path,
    durations_json: Path,
    *,
    ratio_warning: float,
    file_drift_seconds: float,
    file_drift_ratio: float,
) -> dict[str, Any]:
    weights, node_weights, payload = load_duration_payload(durations_json)
    artifacts = discover_shard_artifacts(artifact_root)
    shards: list[ShardBalance] = []
    drifts: list[FileDrift] = []

    for index, (report_path, files_path) in artifacts.items():
        selected_files = _selected_files(files_path)
        actual_weights = collect_file_weights(report_path)
        actual_node_weights = collect_node_weights(report_path)
        predicted_seconds = sum(
            node_weights.get(selector, weights.get(selector, DEFAULT_WEIGHT_SECONDS))
            for selector in selected_files
        )
        actual_seconds = sum(actual_weights.values())
        shards.append(
            ShardBalance(
                index=index,
                file_count=len(selected_files),
                predicted_seconds=predicted_seconds,
                actual_seconds=actual_seconds,
            )
        )
        for selector in selected_files:
            if "::" in selector:
                actual = actual_node_weights.get(selector, 0.0)
                predicted = node_weights.get(selector, DEFAULT_WEIGHT_SECONDS)
            else:
                actual = actual_weights.get(selector, 0.0)
                predicted = weights.get(selector, DEFAULT_WEIGHT_SECONDS)
            absolute = abs(actual - predicted)
            relative = absolute / max(predicted, 0.001)
            if absolute > file_drift_seconds and relative > file_drift_ratio:
                drifts.append(
                    FileDrift(
                        path=selector,
                        predicted_seconds=predicted,
                        actual_seconds=actual,
                        absolute_drift_seconds=absolute,
                        relative_drift=relative,
                    )
                )

    actual_values = [shard.actual_seconds for shard in shards]
    predicted_values = [shard.predicted_seconds for shard in shards]
    actual_ratio = max(actual_values) / max(min(actual_values), 0.001)
    predicted_ratio = max(predicted_values) / max(min(predicted_values), 0.001)
    return {
        "source": payload.get("source", ""),
        "aggregation": payload.get("aggregation", "single-run"),
        "shards": shards,
        "predicted_max_min_ratio": predicted_ratio,
        "actual_max_min_ratio": actual_ratio,
        "ratio_warning": actual_ratio > ratio_warning,
        "file_drifts": sorted(
            drifts,
            key=lambda item: item.absolute_drift_seconds,
            reverse=True,
        ),
    }


def render_markdown(summary: dict[str, Any], top_drifts: int) -> str:
    lines = [
        "## Pytest Shard Balance",
        "",
        f"- Weight source: `{summary['source']}`",
        f"- Weight aggregation: `{summary['aggregation']}`",
        (f"- Predicted max/min ratio: `{summary['predicted_max_min_ratio']:.2f}`"),
        f"- Actual max/min ratio: `{summary['actual_max_min_ratio']:.2f}`",
        f"- Material file drifts: `{len(summary['file_drifts'])}`",
        "",
        "| Shard | Files | Predicted seconds | Actual seconds |",
        "| ---: | ---: | ---: | ---: |",
    ]
    for shard in summary["shards"]:
        lines.append(
            f"| {shard.index} | {shard.file_count} | "
            f"{shard.predicted_seconds:.3f} | {shard.actual_seconds:.3f} |"
        )

    if summary["file_drifts"]:
        lines.extend(
            [
                "",
                "### Largest material file drifts",
                "",
                "| File | Predicted seconds | Actual seconds | Drift |",
                "| --- | ---: | ---: | ---: |",
            ]
        )
        for drift in summary["file_drifts"][:top_drifts]:
            lines.append(
                f"| `{drift.path}` | {drift.predicted_seconds:.3f} | "
                f"{drift.actual_seconds:.3f} | "
                f"{drift.relative_drift * 100:.1f}% |"
            )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact_root", type=Path)
    parser.add_argument(
        "--durations-json",
        type=Path,
        default=Path("ci/pytest-backend-durations.json"),
    )
    parser.add_argument("--ratio-warning", type=float, default=1.30)
    parser.add_argument("--file-drift-seconds", type=float, default=10.0)
    parser.add_argument("--file-drift-ratio", type=float, default=0.25)
    parser.add_argument("--top-drifts", type=int, default=10)
    args = parser.parse_args()

    if args.ratio_warning <= 1:
        raise SystemExit("--ratio-warning must be greater than one")
    if args.file_drift_seconds < 0 or args.file_drift_ratio < 0:
        raise SystemExit("file drift thresholds must not be negative")
    if args.top_drifts < 1:
        raise SystemExit("--top-drifts must be greater than zero")

    try:
        summary = summarize(
            args.artifact_root,
            args.durations_json,
            ratio_warning=args.ratio_warning,
            file_drift_seconds=args.file_drift_seconds,
            file_drift_ratio=args.file_drift_ratio,
        )
    except (OSError, ValueError, ET.ParseError, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc)) from exc

    print(render_markdown(summary, args.top_drifts))
    warnings: list[str] = []
    if summary["ratio_warning"]:
        warnings.append(f"actual shard max/min ratio is {summary['actual_max_min_ratio']:.2f}")
    if summary["file_drifts"]:
        warnings.append(f"{len(summary['file_drifts'])} files exceeded drift thresholds")
    if warnings:
        print(
            "::warning title=Pytest shard balance drift::" + "; ".join(warnings),
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
