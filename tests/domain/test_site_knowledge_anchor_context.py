import time

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


def test_short_title_identifier_precedes_longer_platform_overlap():
    evidence = _source_anchor_evidence(
        ["先阅读其他内容。", "AERO 这个Typecho主题有完整的使用文档。"],
        title="AERO – 简洁的Typecho主题",
        chunk_text="unrelated chunk",
    )
    assert evidence == {
        "anchor_or_context": "AERO",
        "basis": "exact_source_target_phrase",
        "source_passage_index": 1,
        "target_field": "title",
        "exact_source_passage_match": True,
    }


@pytest.mark.parametrize("source", ["使用 aero 完成设置。", "İstanbul，使用 aero 完成设置。"])
def test_short_title_identifier_keeps_source_case_and_unicode_offsets(source):
    evidence = _source_anchor_evidence([source], title="AERO — 主题使用文档", chunk_text="")
    assert evidence["anchor_or_context"] == "aero"


def test_five_character_title_identifier_is_also_bounded_to_exact_source():
    evidence = _source_anchor_evidence(
        ["了解 AEROS 的设置。"], title="AEROS - 设置说明", chunk_text=""
    )
    assert evidence["anchor_or_context"] == "AEROS"


@pytest.mark.parametrize(
    "source",
    [
        "AEROS 主题介绍。",
        "myAERO 主题介绍。",
        "AERO_plugin 主题介绍。",
        "https://example.invalid/AERO/",
        "`AERO`",
        "<code>AERO</code>",
        '[download name="AERO"]',
    ],
)
def test_short_title_identifier_needs_whole_identifier_in_prose(source):
    assert _source_anchor_evidence([source], title="AERO – 布局介绍", chunk_text="") == {}


@pytest.mark.parametrize(
    "title",
    ["AERO", "AERO-布局介绍", "AERO 布局介绍", "Demo – 布局介绍", "DEMO – 布局介绍",
     "DOCS – 布局介绍", "CODE – 布局介绍", "GUIDE – 布局介绍", "CLOUD – 布局介绍",
     "THEME – 布局介绍", "POST – 布局介绍"],
)
def test_short_title_exception_does_not_admit_plain_titles_or_resource_labels(title):
    # Matching a bare four-letter title or a generic caption remains insufficient.
    assert _source_anchor_evidence([title.split()[0]], title=title, chunk_text="") == {}


def test_short_title_identifier_batch_clears_stale_hint_and_keeps_input():
    original = dict(title="AERO – 简洁的Typecho主题", chunk="", anchor_or_context="Typecho")
    result = _attach_source_anchor_evidence(
        [original], intent="internal_links", source_passages=["AERO 这个Typecho主题。"]
    )
    assert result[0]["anchor_or_context"] == "AERO"
    assert original["anchor_or_context"] == "Typecho"


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


def test_long_unclosed_css_selector_is_bounded():
    # Full source-passage budget: repeated colon terms formerly permitted many
    # backtracking partitions when no opening brace was found.
    source = ".selector " + "a:" * 590
    started = time.monotonic()
    assert source_prose_for_anchor(source) == source
    assert time.monotonic() - started < 1.0


def test_batch_masks_once_per_passage_not_once_per_candidate(monkeypatch):
    from app.domain.site_knowledge import service

    calls = []
    original = service.source_prose_for_anchor

    def count_mask(value):
        calls.append(value)
        return original(value)

    monkeypatch.setattr(service, "source_prose_for_anchor", count_mask)
    source = "先检查插件兼容性后再继续。"
    service._attach_source_anchor_evidence(
        [dict(title="插件兼容性检查", chunk="") for _ in range(8)],
        intent="internal_links",
        source_passages=[source],
    )
    assert calls == [source]
