from app.domain.site_knowledge.related_content_search_quality import (
    rank_related_content_search_results,
)


def test_bounded_title_and_topic_evidence_can_break_a_close_semantic_tie() -> None:
    ranked = rank_related_content_search_results(
        "WordPress vector search",
        [
            {
                "post_id": 1,
                "chunk_index": 0,
                "title": "General AI notes",
                "score": 0.72,
                "taxonomies": {},
            },
            {
                "post_id": 2,
                "chunk_index": 0,
                "title": "WordPress vector guide",
                "score": 0.69,
                "taxonomies": {"category": ["Search"]},
            },
        ],
    )

    assert [candidate["post_id"] for candidate in ranked] == [2, 1]
    assert ranked[0]["related_content_ranking"]["title_bonus"] == 0.04


def test_bounded_evidence_does_not_overturn_a_large_semantic_gap() -> None:
    ranked = rank_related_content_search_results(
        "WordPress vector search",
        [
            {
                "post_id": 1,
                "chunk_index": 0,
                "title": "General AI notes",
                "score": 0.85,
                "taxonomies": {},
            },
            {
                "post_id": 2,
                "chunk_index": 0,
                "title": "WordPress vector guide",
                "score": 0.70,
                "taxonomies": {"category": ["vector search"]},
            },
        ],
    )

    assert [candidate["post_id"] for candidate in ranked] == [1, 2]
    assert ranked[1]["related_content_ranking"]["title_bonus"] <= 0.04
    assert ranked[1]["related_content_ranking"]["topic_bonus"] <= 0.04


def test_provider_and_vector_scores_remain_in_separate_source_groups() -> None:
    ranked = rank_related_content_search_results(
        "vector search",
        [
            {
                "post_id": 1,
                "chunk_index": 0,
                "title": "Vector search",
                "score": 0.99,
                "taxonomies": {},
            },
            {
                "post_id": 2,
                "chunk_index": 0,
                "title": "Provider result",
                "score": 0.60,
                "reranked": True,
                "rerank_score": 0.10,
                "taxonomies": {},
            },
        ],
    )

    assert [candidate["post_id"] for candidate in ranked] == [2, 1]
    assert ranked[0]["related_content_ranking"]["semantic_source"] == ("provider_rerank")
