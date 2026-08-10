#!/usr/bin/env python3
"""Write per-file pytest duration weights from a JUnit XML report."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path


def classname_to_path(classname: str) -> str:
    parts = [part for part in classname.strip().split(".") if part]
    while parts and parts[-1][:1].isupper():
        parts.pop()
    return f"{'/'.join(parts)}.py"


def testcase_to_node_id(classname: str, name: str) -> str:
    parts = [part for part in classname.strip().split(".") if part]
    class_parts: list[str] = []
    while parts and parts[-1][:1].isupper():
        class_parts.insert(0, parts.pop())
    path = f"{'/'.join(parts)}.py"
    test_name = name.split("[", 1)[0]
    return "::".join((path, *class_parts, test_name))


def _report_paths(junit_xml: Path | Iterable[Path]) -> list[Path]:
    if isinstance(junit_xml, Path):
        return [junit_xml]
    return list(junit_xml)


def collect_file_weights(junit_xml: Path | Iterable[Path]) -> dict[str, float]:
    weights: defaultdict[str, float] = defaultdict(float)
    for report_path in _report_paths(junit_xml):
        root = ET.parse(report_path).getroot()
        for case in root.iter("testcase"):
            classname = case.attrib.get("classname", "").strip()
            if not classname:
                continue
            try:
                seconds = max(0.0, float(case.attrib.get("time", "0")))
            except ValueError:
                seconds = 0.0
            weights[classname_to_path(classname)] += seconds
    return {path: round(seconds, 3) for path, seconds in sorted(weights.items())}


def collect_node_weights(junit_xml: Path | Iterable[Path]) -> dict[str, float]:
    weights: defaultdict[str, float] = defaultdict(float)
    for report_path in _report_paths(junit_xml):
        root = ET.parse(report_path).getroot()
        for case in root.iter("testcase"):
            classname = case.attrib.get("classname", "").strip()
            name = case.attrib.get("name", "").strip()
            if not classname or not name:
                continue
            try:
                seconds = max(0.0, float(case.attrib.get("time", "0")))
            except ValueError:
                seconds = 0.0
            weights[testcase_to_node_id(classname, name)] += seconds
    return {node_id: round(seconds, 3) for node_id, seconds in sorted(weights.items())}


def build_payload(
    junit_xml: Path | Iterable[Path],
    source_label: str,
) -> dict[str, object]:
    weights = collect_file_weights(junit_xml)
    node_weights = collect_node_weights(junit_xml)
    return {
        "schema": "pytest-duration-weights-v3",
        "source": source_label,
        "node_weights": node_weights,
        "weights": weights,
    }


def aggregate_run_weights(
    run_weights: Iterable[dict[str, float]],
    aggregation: str = "mean-plus-stddev",
) -> dict[str, float]:
    samples: defaultdict[str, list[float]] = defaultdict(list)
    for weights in run_weights:
        for path, seconds in weights.items():
            samples[path].append(seconds)

    if aggregation not in {"mean-plus-stddev", "median"}:
        raise ValueError(f"unsupported aggregation: {aggregation}")

    aggregated: dict[str, float] = {}
    for path, seconds in sorted(samples.items()):
        if aggregation == "median":
            value = statistics.median(seconds)
        else:
            value = statistics.mean(seconds) + statistics.pstdev(seconds)
        aggregated[path] = round(value, 3)
    return aggregated


def build_aggregate_payload(
    run_reports: Iterable[Iterable[Path]],
    source_run_ids: Iterable[str],
    aggregation: str = "mean-plus-stddev",
) -> dict[str, object]:
    report_groups = [list(reports) for reports in run_reports]
    run_ids = list(source_run_ids)
    if not report_groups:
        raise ValueError("at least one run report group is required")
    if len(report_groups) != len(run_ids):
        raise ValueError("source run ids must match run report groups")

    weights = aggregate_run_weights(
        (collect_file_weights(reports) for reports in report_groups),
        aggregation=aggregation,
    )
    node_weights = aggregate_run_weights(
        (collect_node_weights(reports) for reports in report_groups),
        aggregation=aggregation,
    )
    return {
        "schema": "pytest-duration-weights-v3",
        "source": f"GitHub Actions runs {', '.join(run_ids)} pytest-backend timing shards",
        "aggregation": aggregation,
        "node_weights": node_weights,
        "source_run_ids": run_ids,
        "weights": weights,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("junit_xml", type=Path, nargs="*")
    parser.add_argument(
        "--run-root",
        action="append",
        type=Path,
        default=[],
        help="root containing all shard JUnit XML reports for one CI run",
    )
    parser.add_argument(
        "--source-run-id",
        action="append",
        default=[],
        help="GitHub Actions run id corresponding to each --run-root",
    )
    parser.add_argument(
        "--aggregation",
        choices=("mean-plus-stddev", "median"),
        default="mean-plus-stddev",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-label", default="")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    if args.run_root and args.junit_xml:
        raise SystemExit("use either positional JUnit XML reports or --run-root")
    if args.run_root:
        if len(args.run_root) != len(args.source_run_id):
            raise SystemExit("each --run-root requires one --source-run-id")
        run_reports: list[list[Path]] = []
        for run_root in args.run_root:
            reports = sorted(run_root.rglob("pytest-backend-shard-*.xml"))
            if not reports:
                raise SystemExit(f"no pytest shard reports found under: {run_root}")
            run_reports.append(reports)
        payload = build_aggregate_payload(
            run_reports,
            args.source_run_id,
            aggregation=args.aggregation,
        )
    else:
        if not args.junit_xml:
            raise SystemExit("at least one JUnit XML report or --run-root is required")
        for report_path in args.junit_xml:
            if not report_path.is_file():
                raise SystemExit(f"JUnit XML report not found: {report_path}")
        source_label = args.source_label or ",".join(str(path) for path in args.junit_xml)
        payload = build_payload(args.junit_xml, source_label)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
