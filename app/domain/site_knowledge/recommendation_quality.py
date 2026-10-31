from __future__ import annotations

import math

from app.domain.site_knowledge.anchor_context import is_reserved_smoke_document
from app.domain.site_knowledge.recommendation_task_match import reading_task_evidence
from app.domain.site_knowledge.text_evidence import coerce_float, semantic_score

RECOMMENDATION_POLICY_VERSION = "reading_task_abstention.v3"
MIN_RECOMMENDATION_SCORE = 0.75


def apply_recommendation_quality_controls_v2(
    results: list[dict[str, object]],
    *,
    query: str,
    max_results: int,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    """Filter before dedup/Top K; never fill an empty list with weak matches.

    The frozen v1 function below remains available for read-only evaluation.
    v2 is a stable subsequence of the existing scorer, with no weight changes.
    """
    eligible: list[dict[str, object]] = []
    rejected_score = rejected_task = rejected_test = 0
    for result in results:
        if is_reserved_smoke_document(str(result.get("title") or "")):
            rejected_test += 1
            continue
        raw_score = coerce_float(
            result.get("rerank_score") if result.get("reranked") is True else result.get("score")
        )
        score = semantic_score(result)
        if not math.isfinite(raw_score) or score < MIN_RECOMMENDATION_SCORE:
            rejected_score += 1
            continue
        evidence = reading_task_evidence(query, result)
        if evidence == "insufficient_task_evidence":
            rejected_task += 1
            continue
        eligible.append({**result, "reading_task_evidence": evidence})
    selected, metrics = apply_recommendation_quality_controls(eligible, max_results=max_results)
    return selected, {
        **metrics,
        "policy_version": RECOMMENDATION_POLICY_VERSION,
        "reserved_test_documents_suppressed": rejected_test,
        "below_evidence_floor": rejected_score,
        "insufficient_task_evidence": rejected_task,
        "abstained": not selected,
        "reason": "insufficient_recommendation_evidence"
        if not selected
        else "evidence_candidates_available",
    }


def apply_recommendation_quality_controls(
    results: list[dict[str, object]],
    *,
    max_results: int,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    """Apply the small, observable quality controls used by editor suggestions.

    A document may contribute many vector chunks. Keep the best candidate per
    source document, prefer candidates with evidence, and retain weak results
    only when no stronger candidate exists. This keeps the current scorer and
    baseline intact while preventing a weak/duplicated tail from dominating a
    bounded response.
    """
    unique: list[dict[str, object]] = []
    seen_documents: set[str] = set()
    duplicate_count = 0
    for result in results:
        key = _document_key(result)
        if key and key in seen_documents:
            duplicate_count += 1
            continue
        if key:
            seen_documents.add(key)
        unique.append(result)

    strong = [item for item in unique if item.get("candidate_relevance") in {"strong", "review"}]
    weak_suppressed = 0
    if strong:
        filtered = []
        for item in unique:
            if item.get("candidate_relevance") == "weak":
                weak_suppressed += 1
                continue
            filtered.append(item)
        unique = filtered

    return unique[: max(1, max_results)], {
        "document_duplicates_collapsed": duplicate_count,
        "weak_candidates_suppressed": weak_suppressed,
        "strong_or_review_candidates": len(strong),
    }


def _document_key(result: dict[str, object]) -> str:
    source_type = str(result.get("source_type") or "").strip()
    source_id = result.get("source_id") or result.get("post_id")
    if not source_id:
        return ""
    return f"{source_type}:{source_id}"
