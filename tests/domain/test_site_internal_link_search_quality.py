from app.domain.site_knowledge.internal_link_search_quality import (
    rank_internal_link_search_results,
)
from app.domain.site_knowledge.recommendation_eligibility import (
    internal_link_placement,
)


def test_bounded_lexical_topic_and_anchor_evidence_can_promote_a_close_candidate() -> None:
    ranked = rank_internal_link_search_results(
        "WordPress 向量检索与站点知识",
        [
            {
                "post_id": 10,
                "title": "Generic AI notes",
                "chunk": "A broad overview of hosted AI tools.",
                "score": 0.78,
            },
            {
                "post_id": 20,
                "title": "WordPress 站点知识向量检索",
                "chunk": "介绍语义搜索和文章内链候选。",
                "score": 0.70,
                "taxonomies": {"category": ["WordPress"], "post_tag": ["向量检索"]},
                "anchor_evidence": {"exact_source_passage_match": True},
            },
        ],
    )

    assert [result["post_id"] for result in ranked] == [20, 10]
    assert ranked[0]["internal_link_ranking"] == {
        "strategy": "semantic_plus_bounded_lexical_topic_anchor",
        "semantic_source": "vector",
        "semantic_score": 0.7,
        "lexical_bonus": 0.05,
        "topic_bonus": 0.04,
        "anchor_bonus": 0.06,
        "ranking_score": 0.85,
        "shared_terms": ["wordpress", "向量检索", "站点知识"],
        "shared_topic_terms": ["wordpress", "向量检索"],
    }
    assert ranked[0]["candidate_relevance"] == "review"
    assert ranked[0]["placement_eligibility"] == "ready"
    assert ranked[0]["placement_reason_codes"] == ["exact_anchor_match"]


def test_provider_rerank_and_vector_scores_are_not_compared_across_sources() -> None:
    ranked = rank_internal_link_search_results(
        "站点知识",
        [
            {
                "post_id": 20,
                "title": "B",
                "chunk": "Also unmatched",
                "score": 0.9,
                "reranked": True,
                "rerank_score": 0.68,
            },
            {"post_id": 10, "title": "A", "chunk": "Unmatched", "score": 0.99},
        ],
    )

    assert [result["post_id"] for result in ranked] == [20, 10]
    assert ranked[0]["internal_link_ranking"]["semantic_source"] == "provider_rerank"
    assert ranked[0]["internal_link_ranking"]["semantic_score"] == 0.68
    assert ranked[0]["internal_link_ranking"]["ranking_score"] == 0.68


def test_exact_query_match_partition_is_not_overturned_by_evidence_bonus() -> None:
    ranked = rank_internal_link_search_results(
        "WordPress 站点知识",
        [
            {
                "post_id": 10,
                "title": "Exact match",
                "chunk": "",
                "score": 0.52,
                "exact_query_match": True,
            },
            {
                "post_id": 20,
                "title": "WordPress 站点知识",
                "chunk": "WordPress 站点知识",
                "score": 0.5,
                "anchor_evidence": {"exact_source_passage_match": True},
            },
        ],
    )

    assert [result["post_id"] for result in ranked] == [10, 20]


def test_bounded_evidence_does_not_overturn_a_large_semantic_gap() -> None:
    ranked = rank_internal_link_search_results(
        "WordPress 向量检索与站点知识",
        [
            {"post_id": 10, "title": "Semantic leader", "chunk": "", "score": 0.91},
            {
                "post_id": 20,
                "title": "WordPress 站点知识向量检索",
                "chunk": "站点知识与向量检索",
                "score": 0.68,
                "taxonomies": {"category": ["WordPress"], "post_tag": ["向量检索"]},
                "anchor_evidence": {"exact_source_passage_match": True},
            },
        ],
    )

    assert [result["post_id"] for result in ranked] == [10, 20]
    assert ranked[1]["internal_link_ranking"]["ranking_score"] == 0.83


def test_relevance_is_independent_from_placement_eligibility() -> None:
    ranked = rank_internal_link_search_results(
        "在网页上添加一个效果",
        [
            {
                "post_id": 7112,
                "title": "会移动的笑脸",
                "chunk": "网页动画效果",
                "score": 0.7171,
            },
            {
                "post_id": 18890,
                "title": "Neumorphism 在线制作轻拟物 UI 设计按钮",
                "chunk": "网页上的按钮设计",
                "score": 0.7045,
            },
            {
                "post_id": 6949,
                "title": "小苏打能量饮料模型",
                "chunk": "饮料包装模型",
                "score": 0.7041,
            },
        ],
    )

    by_post_id = {candidate["post_id"]: candidate for candidate in ranked}
    for post_id in (7112, 18890):
        assert by_post_id[post_id]["candidate_relevance"] == "review"
        assert by_post_id[post_id]["placement_eligibility"] == "manual_only"
        assert by_post_id[post_id]["placement_reason_codes"] == [
            "no_natural_anchor"
        ]
    assert by_post_id[6949]["candidate_relevance"] == "weak"
    assert by_post_id[6949]["placement_eligibility"] == "not_eligible"
    assert by_post_id[6949]["placement_reason_codes"] == [
        "weak_evidence",
        "no_natural_anchor",
    ]


def test_weak_candidate_with_exact_anchor_reports_only_weak_evidence() -> None:
    eligibility, reason_codes = internal_link_placement(
        relevance="weak",
        exact_anchor_match=True,
    )

    assert eligibility == "not_eligible"
    assert reason_codes == ["weak_evidence"]
