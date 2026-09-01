from app.domain.site_knowledge.backends import SiteKnowledgeBackendError, VectorSearchHit
from app.domain.site_knowledge.related_content_search_quality import (
    rank_related_content_search_results,
)
from app.domain.site_knowledge.service import SiteKnowledgeService


def _vector_hit(post_id: int, chunk_index: int) -> VectorSearchHit:
    return VectorSearchHit(
        post_id=post_id,
        source_type="post",
        source_id=post_id,
        parent_post_id=0,
        chunk_index=chunk_index,
        post_type="post",
        post_status="publish",
        title=f"Post {post_id}",
        url=f"https://example.test/{post_id}",
        chunk_text=f"Chunk {chunk_index}",
        score=0.9 - (chunk_index / 1000),
    )


def test_related_content_expands_vector_window_when_chunks_hide_unique_documents() -> None:
    class FakeBackend:
        def __init__(self) -> None:
            self.limits: list[int] = []

        def search(self, **kwargs: object) -> list[VectorSearchHit]:
            limit = int(kwargs["limit"])
            self.limits.append(limit)
            if limit < 80:
                return [_vector_hit(1, index) for index in range(limit)]
            return [
                *[_vector_hit(1, index) for index in range(32)],
                *[_vector_hit(post_id, 0) for post_id in range(2, 10)],
            ]

    service = SiteKnowledgeService.__new__(SiteKnowledgeService)
    backend = FakeBackend()
    service.vector_backend = backend

    results = service._search_vector_backend(
        site_id="site_alpha",
        query_embedding=[0.1, 0.2],
        post_types=["post"],
        statuses=["publish"],
        source_types=["post"],
        current_post_id=0,
        max_results=8,
        intent="related_content",
        query="WordPress vector search",
    )

    assert backend.limits == [32, 80]
    assert results is not None
    assert len({result["post_id"] for result in results}) == 9


def test_related_content_keeps_initial_hits_when_window_expansion_fails() -> None:
    class FakeBackend:
        def __init__(self) -> None:
            self.limits: list[int] = []

        def search(self, **kwargs: object) -> list[VectorSearchHit]:
            limit = int(kwargs["limit"])
            self.limits.append(limit)
            if limit == 80:
                raise SiteKnowledgeBackendError(
                    "site_knowledge.search_failed",
                    "Expanded search failed",
                )
            return [_vector_hit(1, index) for index in range(limit)]

    service = SiteKnowledgeService.__new__(SiteKnowledgeService)
    backend = FakeBackend()
    service.vector_backend = backend

    results = service._search_vector_backend(
        site_id="site_alpha",
        query_embedding=[0.1, 0.2],
        post_types=["post"],
        statuses=["publish"],
        source_types=["post"],
        current_post_id=0,
        max_results=8,
        intent="related_content",
        query="WordPress vector search",
    )

    assert backend.limits == [32, 80]
    assert results is not None
    assert len(results) == 32
    assert {result["post_id"] for result in results} == {1}


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
    assert ranked[0]["candidate_relevance"] == "review"
    assert "placement_eligibility" not in ranked[0]


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
