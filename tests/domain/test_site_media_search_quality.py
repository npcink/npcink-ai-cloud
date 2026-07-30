from types import SimpleNamespace

from app.domain.site_knowledge.media_search_quality import (
    collapse_media_search_duplicates,
    rank_media_search_results,
)
from app.domain.site_knowledge.service import SiteKnowledgeService


def test_partial_cjk_subject_match_can_promote_a_close_semantic_candidate() -> None:
    ranked = rank_media_search_results(
        "猫咪",
        [
            {
                "source_id": 10,
                "title": "Abstract poster",
                "chunk": "Red geometric poster on a dark desk",
                "score": 0.77,
            },
            {
                "source_id": 20,
                "title": "小猫舔毛",
                "chunk": "宠物在室内整理毛发",
                "score": 0.72,
            },
        ],
    )

    assert ranked[0]["source_id"] == 20
    assert ranked[0]["media_ranking"] == {
        "lexical_score": 0.08,
        "exact_phrase_match": False,
        "query_unit_matches": 0,
        "query_unit_count": 1,
        "strategy": "semantic_plus_bounded_lexical",
        "semantic_score": 0.72,
        "hybrid_score": 0.8,
    }


def test_unmatched_query_preserves_semantic_order_without_inventing_evidence() -> None:
    ranked = rank_media_search_results(
        "火箭发射台",
        [
            {
                "source_id": 10,
                "title": "Mountain sunset",
                "chunk": "Clouds over distant hills",
                "score": 0.73,
            },
            {
                "source_id": 20,
                "title": "City street",
                "chunk": "Cars moving through an intersection",
                "score": 0.69,
            },
        ],
    )

    assert [result["source_id"] for result in ranked] == [10, 20]
    assert all(
        result["media_ranking"]["lexical_score"] == 0.0
        for result in ranked
    )


def test_existing_exact_query_match_keeps_priority_over_hybrid_score() -> None:
    ranked = rank_media_search_results(
        "猫咪",
        [
            {
                "source_id": 10,
                "title": "Poster",
                "chunk": "Geometric design",
                "score": 0.95,
                "exact_query_match": False,
            },
            {
                "source_id": 20,
                "title": "Pet",
                "chunk": "一只猫咪坐在窗台上",
                "score": 0.55,
                "exact_query_match": True,
            },
        ],
    )

    assert [result["source_id"] for result in ranked] == [20, 10]


def test_wordpress_derivative_urls_collapse_to_one_media_candidate() -> None:
    unique, collapsed = collapse_media_search_duplicates(
        [
            {
                "source_id": 101,
                "url": "https://example.test/uploads/2026/07/newspaper-1200x800.jpg",
                "score": 0.81,
            },
            {
                "source_id": 102,
                "url": "https://example.test/uploads/2026/07/newspaper.jpg?ver=2",
                "score": 0.79,
            },
            {
                "source_id": 103,
                "url": "https://example.test/uploads/2026/07/city.jpg",
                "score": 0.7,
            },
        ]
    )

    assert [result["source_id"] for result in unique] == [101, 103]
    assert collapsed == 1


def test_unparseable_or_relative_urls_are_not_collapsed() -> None:
    unique, collapsed = collapse_media_search_duplicates(
        [
            {"source_id": 1, "url": "", "score": 0.8},
            {"source_id": 2, "url": "/uploads/image.jpg", "score": 0.7},
        ]
    )

    assert [result["source_id"] for result in unique] == [1, 2]
    assert collapsed == 0


def test_case_sensitive_wordpress_media_paths_remain_distinct() -> None:
    unique, collapsed = collapse_media_search_duplicates(
        [
            {
                "source_id": 1,
                "url": "https://EXAMPLE.test/uploads/Cat-300x200.jpg",
                "score": 0.8,
            },
            {
                "source_id": 2,
                "url": "https://example.test/uploads/cat.jpg",
                "score": 0.7,
            },
        ]
    )

    assert [result["source_id"] for result in unique] == [1, 2]
    assert collapsed == 0


def test_service_applies_media_ranking_and_duplicate_grouping_only_for_media_intent() -> None:
    service = object.__new__(SiteKnowledgeService)
    service.reranker = None
    service.settings = SimpleNamespace(site_knowledge_rerank_provider="disabled")

    returned, rerank, grouping = service._prepare_search_results(
        intent="media_library_search",
        query="猫咪",
        results=[
            {
                "post_id": 10,
                "source_type": "media",
                "source_id": 10,
                "chunk_index": 0,
                "title": "Poster",
                "chunk": "Red geometric design",
                "url": "https://example.test/uploads/poster.jpg",
                "score": 0.77,
                "exact_query_match": False,
                "match_count": 0,
            },
            {
                "post_id": 20,
                "source_type": "media",
                "source_id": 20,
                "chunk_index": 0,
                "title": "小猫舔毛",
                "chunk": "室内宠物",
                "url": "https://example.test/uploads/cat-300x200.jpg",
                "score": 0.72,
                "exact_query_match": False,
                "match_count": 0,
            },
            {
                "post_id": 21,
                "source_type": "media",
                "source_id": 21,
                "chunk_index": 0,
                "title": "Cat thumbnail",
                "chunk": "室内宠物",
                "url": "https://example.test/uploads/cat.jpg",
                "score": 0.71,
                "exact_query_match": False,
                "match_count": 0,
            },
        ],
        evidence_policy={
            "min_score": 0.0,
            "required_sources": 1,
            "no_hit_policy": "return_empty",
        },
        max_results=8,
        result_granularity="document",
    )

    assert [result["source_id"] for result in returned] == [20, 10]
    assert rerank == {
        "status": "disabled",
        "provider": "disabled",
        "candidate_count": 3,
    }
    assert grouping == {
        "strategy": "best_ranked_chunk_per_document",
        "candidate_count": 3,
        "returned_count": 2,
        "duplicate_chunks_collapsed": 0,
        "duplicate_media_collapsed": 1,
        "ranking_strategy": "semantic_plus_bounded_lexical",
    }
