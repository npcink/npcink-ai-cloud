from __future__ import annotations

STRONG_SEMANTIC_SCORE = 0.75
REVIEW_SEMANTIC_SCORE = 0.68


def candidate_relevance(
    *,
    semantic_score: float,
    has_supporting_evidence: bool,
    has_direct_evidence: bool = False,
) -> str:
    if semantic_score >= STRONG_SEMANTIC_SCORE:
        return "strong"
    if has_direct_evidence:
        return "review"
    if semantic_score >= REVIEW_SEMANTIC_SCORE and has_supporting_evidence:
        return "review"
    return "weak"


def internal_link_placement(
    *,
    relevance: str,
    exact_anchor_match: bool,
) -> tuple[str, list[str]]:
    if relevance == "weak":
        reason_codes = ["weak_evidence"]
        if not exact_anchor_match:
            reason_codes.append("no_natural_anchor")
        return "not_eligible", reason_codes
    if exact_anchor_match:
        return "ready", ["exact_anchor_match"]
    return "manual_only", ["no_natural_anchor"]
