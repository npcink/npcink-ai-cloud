from __future__ import annotations

from app.domain.site_knowledge.text_evidence import (
    coerce_float,
    coerce_int,
    semantic_score,
    semantic_source,
    shared_text_terms,
    shared_topic_terms,
)


def rank_related_content_search_results(
    query: str,
    results: list[dict[str, object]],
) -> list[dict[str, object]]:
    ranked: list[dict[str, object]] = []
    for result in results:
        candidate = dict(result)
        title_terms = shared_text_terms(query, str(candidate.get("title") or ""), limit=2)
        topic_terms = shared_topic_terms(query, candidate.get("taxonomies"), limit=2)
        title_bonus = min(0.04, len(title_terms) * 0.02)
        topic_bonus = min(0.04, len(topic_terms) * 0.02)
        base_score = semantic_score(candidate)
        ranking_score = base_score + title_bonus + topic_bonus
        candidate["related_content_ranking"] = {
            "strategy": "semantic_plus_bounded_title_topic",
            "semantic_source": semantic_source(candidate),
            "semantic_score": round(base_score, 4),
            "title_bonus": round(title_bonus, 4),
            "topic_bonus": round(topic_bonus, 4),
            "ranking_score": round(ranking_score, 4),
            "shared_title_terms": title_terms,
            "shared_topic_terms": topic_terms,
        }
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
    ranking = candidate.get("related_content_ranking")
    if not isinstance(ranking, dict):
        return semantic_score(candidate)
    return coerce_float(ranking.get("ranking_score"))
