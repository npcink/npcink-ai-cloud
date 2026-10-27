"""Replay evidence projection over frozen Eval Lab development results, no I/O services.

Run from the Cloud root: python -m scripts.preview_internal_link_context --help.
Article text stays in the explicitly named local output, never stdout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

from app.domain.site_knowledge.internal_link_context import (
    build_internal_link_context_preview,
    text_sha256,
)
from app.domain.site_knowledge.service import _normalize_public_document


def read_frozen(path: Path, expected_sha256: str) -> dict[str, Any]:
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError("frozen_input_sha256_mismatch")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise ValueError("frozen_input_object_required")
    return value


def source_revision(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        raise ValueError("projection_revision_unavailable") from None


def replay(probes: dict[str, Any], baseline: dict[str, Any], probe_sha: str) -> dict[str, Any]:
    if (
        probes.get("contract") != "retrieval_probe_input.v4"
        or probes.get("split") != "development"
        or baseline.get("split") != "development"
        or baseline.get("provenance", {}).get("probe_input_sha256") != probe_sha
        or baseline.get("shared_index_mutated") is not False
        or baseline.get("wordpress_write") is not False
    ):
        raise ValueError("frozen_development_baseline_required")
    input_cases = [c for c in probes["cases"] if c["payload"]["intent"] == "internal_links"]
    inputs = {c["case_id"]: c for c in input_cases}
    cases = [c for c in baseline["cases"] if c["intent"] == "internal_links"]
    if (
        len(input_cases) != 20 or len(inputs) != 20 or len(cases) != 20
        or [c["case_id"] for c in cases] != list(inputs)
    ):
        raise ValueError("complete_ordered_development_cases_required")
    documents: dict[int, dict[str, Any]] = {}
    for item in probes["corpus_documents"]:
        # Frozen fingerprints must be recomputed, never accepted from an input hash field.
        raw = {k: v for k, v in item["document"].items() if k != "content_hash"}
        document = _normalize_public_document(raw)
        if document is None:
            raise ValueError("unique_public_corpus_required")
        post_id = document["post_id"]
        if type(post_id) is not int or post_id in documents:
            raise ValueError("unique_public_corpus_required")
        documents[post_id] = document
    indexed = {d["post_id"]: d["content_hash"] for d in baseline["index"]["document_fingerprints"]}
    if (
        len(documents) != baseline["index"]["documents"]
        or {i: d["content_hash"] for i, d in documents.items()} != indexed
    ):
        raise ValueError("normalized_corpus_does_not_match_baseline")
    projected = []
    for case in cases:
        source = inputs[case["case_id"]]["payload"]
        if (
            case["source_post_id"] != source["current_post_id"]
            or case["query_sha256"] != text_sha256(source["query"])
            or case["source_passage_count"] != len(source["source_passages"])
        ):
            raise ValueError("source_identity_mismatch")
        response = case["response"]
        if response.get("intent") != "internal_links" or response.get("status") != "ready":
            raise ValueError("completed_internal_link_baseline_required")
        projected.append({
            "case_id": case["case_id"],
            "source_post_id": case["source_post_id"],
            "preview": build_internal_link_context_preview(
                results=response["results"],
                source_passages=source["source_passages"],
                target_documents=documents,
            ),
        })
    return {
        "contract_version": "internal_link_context_replay.v1",
        "evidence_kind": "offline_projection_of_historical_candidates",
        "new_retrieval": False,
        "human_gold": False,
        "wordpress_write": False,
        "baseline_cloud_source_sha256": baseline["cloud_source_sha256"],
        "corpus_documents": len(documents),
        "cases": projected,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probes", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--probes-sha256", required=True)
    parser.add_argument("--baseline-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("new_output_required")
    probes = read_frozen(args.probes, args.probes_sha256)
    baseline = read_frozen(args.baseline, args.baseline_sha256)
    report = replay(probes, baseline, args.probes_sha256)
    root = Path(__file__).resolve().parents[1]
    report["provenance"] = {
        "probe_input_sha256": args.probes_sha256,
        "baseline_sha256": args.baseline_sha256,
        "projection_source_revision": source_revision(root),
        "source_hashes": {
            name: hashlib.sha256((root / name).read_bytes()).hexdigest()
            for name in (
                "app/domain/site_knowledge/internal_link_context.py",
                "app/domain/site_knowledge/service.py",
                "scripts/preview_internal_link_context.py",
            )
        },
    }
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({"cases": len(report["cases"]), "new_retrieval": False}))


if __name__ == "__main__":
    main()
