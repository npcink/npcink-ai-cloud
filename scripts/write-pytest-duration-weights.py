#!/usr/bin/env python3
"""Write per-file pytest duration weights from a JUnit XML report."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


def classname_to_path(classname: str) -> str:
    parts = [part for part in classname.strip().split(".") if part]
    while parts and parts[-1][:1].isupper():
        parts.pop()
    return f"{'/'.join(parts)}.py"


def collect_file_weights(junit_xml: Path) -> dict[str, float]:
    root = ET.parse(junit_xml).getroot()
    weights: defaultdict[str, float] = defaultdict(float)
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


def build_payload(junit_xml: Path, source_label: str) -> dict[str, object]:
    weights = collect_file_weights(junit_xml)
    return {
        "schema": "pytest-duration-weights-v1",
        "source": source_label,
        "weights": weights,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("junit_xml", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-label", default="")
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    args = parser.parse_args(argv)

    if not args.junit_xml.is_file():
        raise SystemExit(f"JUnit XML report not found: {args.junit_xml}")

    source_label = args.source_label or str(args.junit_xml)
    payload = build_payload(args.junit_xml, source_label)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
