from app.domain.site_knowledge.recommendation_eligibility import (
    candidate_relevance,
)
from app.domain.site_knowledge.text_evidence import (
    coerce_float,
    coerce_int,
    semantic_score,
    semantic_source,
    shared_text_terms,
    shared_topic_terms,
)


def rank_internal_link_search_results(
    query: str,
    results: list[dict[str, object]],
) -> list[dict[str, object]]:
    ranked: list[dict[str, object]] = []
    for result in results:
        candidate = dict(result)
        title = str(candidate.get("title") or "")
        chunk = str(candidate.get("chunk") or candidate.get("match_context") or "")
        shared_terms = shared_text_terms(query, f"{title} {chunk}", limit=3)
        topic_terms = shared_topic_terms(query, candidate.get("taxonomies"), limit=2)
        lexical_bonus = min(0.05, len(shared_terms) * 0.02)
        topic_bonus = min(0.04, len(topic_terms) * 0.02)
        anchor_evidence = candidate.get("anchor_evidence")
        anchor_bonus = (
            0.06
            if isinstance(anchor_evidence, dict)
            and anchor_evidence.get("exact_source_passage_match") is True
            else 0.0
        )
        base_score = semantic_score(candidate)
        ranking_score = base_score + lexical_bonus + topic_bonus + anchor_bonus
        candidate["internal_link_ranking"] = {
            "strategy": "semantic_plus_bounded_lexical_topic_anchor",
            "semantic_source": semantic_source(candidate),
            "semantic_score": round(base_score, 4),
            "lexical_bonus": round(lexical_bonus, 4),
            "topic_bonus": round(topic_bonus, 4),
            "anchor_bonus": round(anchor_bonus, 4),
            "ranking_score": round(ranking_score, 4),
            "shared_terms": shared_terms,
            "shared_topic_terms": topic_terms,
        }
        relevance = candidate_relevance(
            semantic_score=base_score,
            has_supporting_evidence=bool(
                shared_terms or topic_terms or anchor_bonus > 0
            ),
            has_direct_evidence=anchor_bonus > 0,
        )
        candidate["candidate_relevance"] = relevance
        ranked.append(candidate)

    return sorted(
        ranked,
        key=lambda item: (
            0 if bool(item.get("exact_query_match")) else 1,
            0 if item.get("reranked") is True else 1,
            -_ranking_score(item),
            -semantic_score(item),
            coerce_int(item.get("post_id")),
            coerce_int(item.get("chunk_index")),
        ),
    )


def _ranking_score(candidate: dict[str, object]) -> float:
    ranking = candidate.get("internal_link_ranking")
    if not isinstance(ranking, dict):
        return semantic_score(candidate)
    return coerce_float(ranking.get("ranking_score"))
