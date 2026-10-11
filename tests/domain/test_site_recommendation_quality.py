from app.domain.site_knowledge.recommendation_quality import (
    apply_recommendation_quality_controls,
)


def test_recommendation_controls_collapse_documents_and_suppress_weak_tail() -> None:
    results, metrics = apply_recommendation_quality_controls(
        [
            {
                "source_type": "post",
                "source_id": 10,
                "candidate_relevance": "strong",
            },
            {
                "source_type": "post",
                "source_id": 10,
                "candidate_relevance": "strong",
            },
            {
                "source_type": "post",
                "source_id": 11,
                "candidate_relevance": "weak",
            },
        ],
        max_results=5,
    )

    assert [item["source_id"] for item in results] == [10]
    assert metrics == {
        "document_duplicates_collapsed": 1,
        "weak_candidates_suppressed": 1,
        "strong_or_review_candidates": 1,
    }


def test_recommendation_controls_keep_weak_candidates_when_no_strong_evidence_exists() -> None:
    results, metrics = apply_recommendation_quality_controls(
        [
            {"source_type": "post", "source_id": 11, "candidate_relevance": "weak"},
            {"source_type": "post", "source_id": 12, "candidate_relevance": "weak"},
        ],
        max_results=5,
    )

    assert [item["source_id"] for item in results] == [11, 12]
    assert metrics["weak_candidates_suppressed"] == 0
