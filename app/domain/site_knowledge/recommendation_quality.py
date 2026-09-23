from __future__ import annotations


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
