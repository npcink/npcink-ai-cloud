from copy import deepcopy

import pytest

from app.domain.site_knowledge.internal_link_context import build_internal_link_context_preview


def candidate(post_id: int = 1, anchor: str = "intro.js") -> dict:
    return {
        "post_id": post_id, "source_type": "post", "chunk_index": 0,
        "title": "intro.js practical tutorial", "url": f"https://site.test/{post_id}",
        "chunk": "Use intro.js to guide the visitor.", "score": 0.9,
        "anchor_or_context": anchor,
        "anchor_evidence": {"source_passage_index": 0},
    }


def preview(rows: list[dict], passages: list[str], body: str = "") -> dict:
    documents = {r["post_id"]: {
        "post_id": r["post_id"], "post_status": "publish", "post_type": "post",
        "title": r["title"], "url": r["url"], "content_excerpt": body,
    } for r in rows}
    return build_internal_link_context_preview(
        results=rows, source_passages=passages, target_documents=documents,
    )


def test_keeps_rank_and_original_values_and_never_grants_apply() -> None:
    rows = [candidate(9), candidate(1)]
    before = deepcopy(rows)
    result = preview(rows, ["Try intro.js."], "Use intro.js.")
    assert rows == before
    assert [c["post_id"] for c in result["candidates"]] == [9, 1]
    assert result["apply_authority"] is False
    assert result["ranking_changed"] is False
    assert all(c["semantic_support"] == "not_assessed" for c in result["candidates"])


def test_offsets_use_exact_unicode_text_including_emoji() -> None:
    source = "😀 试用 intro.js。"
    body = "前文。" * 600 + "intro.js 的使用教程。"
    c = preview([candidate()], [source], body)["candidates"][0]
    span = c["source"]["anchor_spans"][0]
    assert source[span["start"]:span["end"]] == "intro.js"
    window = c["target"]["anchor_passages"][0]
    assert window["text"] == body[window["start"]:window["end"]]
    assert "intro.js" in window["text"]
    assert len(window["text"]) <= 900


def test_title_overlap_does_not_manufacture_body_support() -> None:
    c = preview([candidate()], ["Try intro.js."], "This is another product.")["candidates"][0]
    assert c["target"]["anchor_passages"] == []
    assert c["target"]["retrieved_chunk"]["text"].startswith("Use intro.js")
    assert c["semantic_support"] == "not_assessed"


def test_source_match_flag_is_rechecked_and_repeated_occurrences_are_ambiguous() -> None:
    row = candidate()
    row["anchor_evidence"]["exact_source_passage_match"] = True
    c = preview([row], ["Different text."])["candidates"][0]
    assert c["source"]["status"] == "anchor_not_in_source"
    c = preview([row], ["intro.js then intro.js"])["candidates"][0]
    assert c["source"]["status"] == "ambiguous_occurrence"
    assert c["source"]["occurrence_count"] == 2


def test_overlapping_literal_occurrences_are_also_ambiguous() -> None:
    c = preview([candidate(anchor="aaa")], ["aaaa"])["candidates"][0]
    assert c["source"]["status"] == "ambiguous_occurrence"
    assert c["source"]["anchor_spans"] == [{"start": 0, "end": 3}, {"start": 1, "end": 4}]


@pytest.mark.parametrize("index", [-1, 1, True, "0", None])
def test_does_not_silently_relocate_invalid_source_index(index: object) -> None:
    row = candidate()
    row["anchor_evidence"]["source_passage_index"] = index
    c = preview([row], ["Try intro.js."])["candidates"][0]
    assert c["source"]["status"] == "missing_source_location"


def test_missing_target_and_anchor_preserve_candidate_as_uncertain() -> None:
    row = candidate(anchor="")
    c = build_internal_link_context_preview(
        results=[row], source_passages=[], target_documents={},
    )["candidates"][0]
    assert c["source"]["status"] == "missing_anchor"
    assert c["target"]["document_status"] == "missing_document"
    assert c["post_id"] == 1


@pytest.mark.parametrize("field,value", [
    ("post_id", 2), ("post_status", "draft"), ("post_type", "page"),
    ("title", "Stale title"), ("url", "https://site.test/different"),
])
def test_stale_or_nonpublic_document_is_not_projected(field: str, value: object) -> None:
    row = candidate()
    document = {
        "post_id": 1, "post_status": "publish", "post_type": "post",
        "title": row["title"], "url": row["url"], "content_excerpt": "private body",
    }
    document[field] = value
    c = build_internal_link_context_preview(
        results=[row], source_passages=["intro.js"], target_documents={1: document},
    )["candidates"][0]
    assert c["target"]["document_status"] == "document_identity_mismatch"
    assert "private body" not in str(c)


def test_literal_shared_reference_is_not_same_resource_proof() -> None:
    url = "https://github.com/example/project"
    c = preview([candidate()], [f"intro.js {url}"], f"intro.js {url}")["candidates"][0]
    assert c["references"]["shared_literal_urls"] == [url]
    assert c["references"]["identity_status"] == "not_established"


def test_reference_tokens_exclude_credentials_local_targets_and_query_secrets() -> None:
    text = ("intro.js https://user:secret@github.com/project "
            "http://127.0.0.1/admin https://local.test/a https://a.local/a "
            "https://github.com/project?token=secret https://github.com/project#secret")
    c = preview([candidate()], [text], text)["candidates"][0]
    assert c["references"]["source_literal_urls"] == []


@pytest.mark.parametrize("rows,passages,body", [
    ([candidate(i) for i in range(1, 12)], ["intro.js"], ""),
    ([candidate()], ["x" * 1201], ""),
    ([candidate()], ["intro.js"] * 25, ""),
    ([candidate()], ["x" * 1200] * 11, ""),
    ([candidate()], ["intro.js"], "x" * 50001),
    ([candidate(), candidate()], ["intro.js"], ""),
])
def test_limits_fail_instead_of_silently_dropping_evidence(
    rows: list[dict], passages: list[str], body: str,
) -> None:
    with pytest.raises(ValueError):
        preview(rows, passages, body)
