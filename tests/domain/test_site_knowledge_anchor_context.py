import pytest

from app.domain.site_knowledge.anchor_context import (
    is_reserved_smoke_document,
    source_prose_for_anchor,
)
from app.domain.site_knowledge.recommendation_quality import (
    apply_recommendation_quality_controls_v2,
)
from app.domain.site_knowledge.service import (
    _attach_source_anchor_evidence,
    _source_anchor_evidence,
)


@pytest.mark.parametrize(
    "source",
    [
        "Demo：https://example.invalid/contact/",
        "Demo：http : //example.invalid/contact/，随后再看说明",
        "示例 `contact`。",
        "```python\ncontact = True\n```",
        "<code>contact</code>",
        ".yarpp-related h3 { color: #657487; padding-bottom:10px; }",
        '.yarpp-related ol li:before { content: ""; display: inline-block; }',
        '[zrz_file name="contact" link="https://example.invalid/file.zip"]',
    ],
)
def test_non_prose_cannot_be_anchor_evidence(source):
    assert len(source_prose_for_anchor(source)) == len(source)
    assert _source_anchor_evidence([source], title="contact related guide", chunk_text="") == {}


def test_real_prose_after_url_is_preserved_and_selected():
    source = "Demo：https://example.invalid/contact/，与联系表格7兼容"
    evidence = _source_anchor_evidence(
        [source], title="Contact Form 7", chunk_text="联系表格7需要支持"
    )
    assert evidence["anchor_or_context"] == "联系表格7"
    assert evidence["source_passage_index"] == 0
    assert source_prose_for_anchor(source).endswith("，与联系表格7兼容")


def test_function_and_file_identifiers_in_prose_are_not_blanket_rejected():
    source = "style.css 记录主题信息，wp_get_theme() 获取主题信息。"
    assert source_prose_for_anchor(source) == source
    assert (
        _source_anchor_evidence([source], title="主要样式表（style.css）", chunk_text="")[
            "anchor_or_context"
        ]
        == "style.css"
    )


def test_reenrichment_clears_stale_hint_without_mutating_input():
    candidate = dict(
        title="contact guide",
        chunk="",
        anchor_or_context="contact",
        anchor_evidence={"exact_source_passage_match": True},
    )
    results = _attach_source_anchor_evidence(
        [candidate], intent="internal_links", source_passages=["https://example.invalid/contact/"]
    )
    assert "anchor_evidence" not in results[0] and "anchor_or_context" not in results[0]
    assert "anchor_evidence" in candidate


def test_only_reserved_uuid_smoke_namespace_is_suppressed_from_recommendations():
    title = "Npcink Abilities Toolkit Smoke dc616b07-d36d-45db-9e37-60d61f530745 Candidate"
    assert is_reserved_smoke_document(title)
    assert not is_reserved_smoke_document("WordPress smoke testing 教程")
    assert not is_reserved_smoke_document("Npcink Abilities Toolkit Smoke 使用教程")
    rows, receipt = apply_recommendation_quality_controls_v2(
        [
            dict(post_id=1, title=title, score=0.99, candidate_relevance="strong"),
            dict(
                post_id=2,
                title="WordPress smoke testing 教程",
                score=0.99,
                candidate_relevance="strong",
            ),
        ],
        query="smoke testing",
        max_results=8,
    )
    assert [row["post_id"] for row in rows] == [2]
    assert receipt["reserved_test_documents_suppressed"] == 1
