#!/usr/bin/env python3
"""Summarize JSON samples from the read-only editor acceptance command."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError(f"invalid editor acceptance sample: {path}")
    return value


def summarize(samples: list[dict[str, Any]]) -> dict[str, Any]:
    results = [result for sample in samples for result in sample.get("results", [])]
    by_intent: dict[str, list[float]] = {}
    for result in results:
        intent = str(result.get("intent", "unknown"))
        by_intent.setdefault(intent, []).append(float(result.get("duration_ms", 0)))
    latency = {
        intent: {
            "count": len(values),
            "p50_ms": round(statistics.median(values), 1),
            "max_ms": round(max(values), 1),
            "mean_ms": round(statistics.mean(values), 1),
        }
        for intent, values in sorted(by_intent.items())
    }
    retrieval = {}
    for result in results:
        status = str(result.get("retrieval_status", "unknown"))
        retrieval[status] = retrieval.get(status, 0) + 1
    first_requests = [
        float(sample["results"][0]["duration_ms"])
        for sample in samples
        if sample.get("results")
    ]
    return {
        "schema": "npcink.editor_acceptance_observation.v1",
        "sample_count": len(samples),
        "post_count_total": sum(int(sample.get("post_count", 0)) for sample in samples),
        "request_count": len(results),
        "latency_ms": latency,
        "first_request_ms": {
            "count": len(first_requests),
            "p50_ms": round(statistics.median(first_requests), 1) if first_requests else None,
            "max_ms": round(max(first_requests), 1) if first_requests else None,
        },
        "retrieval_status_counts": retrieval,
        "fallback_count": sum(bool(result.get("fallback_used")) for result in results),
        "non_200_count": sum(int(result.get("http_status", 0)) != 200 for result in results),
        "write_boundary_failures": sum(
            bool(result.get("direct_wordpress_write")) for result in results
        ),
        "unchanged_sample_count": sum(
            bool(sample.get("post_snapshots_unchanged")) for sample in samples
        ),
        "failed_sample_count": sum(sample.get("status") != "passed" for sample in samples),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("samples", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        report = summarize([load(path) for path in args.samples])
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
