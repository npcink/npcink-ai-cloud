import json

import pytest

from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.wordpress_ai_connector.grounded_context import (
    build_evidence_pack,
    normalize_grounded_output,
    render_evidence_pack,
)

PASSAGE = "蓝鲸计划将在明年启动，首批覆盖三个城市。"


def evidence_fixture(complete=True):
    result = {
        "status": "ready",
        "evidence_gate": {"status": "passed"},
        "results": [
            {
                "post_id": 42,
                "source_type": "post",
                "chunk_index": 2,
                "chunk": PASSAGE,
                "score": 0.9,
            }
        ],
    }
    metadata = {
        42: {
            "source_type": "post",
            "title": "蓝鲸计划",
            "url": "https://example.test/42",
            "content_hash": "revision-1",
            "modified_gmt": "2026-10-30",
            "delivery_evidence": {"truncated": not complete},
            "truncated": not complete,
            "chunks": {2: PASSAGE},
        }
    }
    return result, metadata


@pytest.mark.parametrize("complete,status", [(True, "available"), (False, "partial")])
def test_grounded_answer_returns_only_verified_citation_sources(complete, status):
    result, metadata = evidence_fixture(complete)
    pack = build_evidence_pack(result, metadata)
    source = pack["sources"][0]
    text = json.dumps({"answer": PASSAGE, "citations": [{"id": source["id"], "quote": PASSAGE}]})
    normalized = normalize_grounded_output(
        {"output_text": text, "grounded_evidence": {"status": "forged"}}, text, pack
    )
    assert normalized["grounded_evidence"]["status"] == status
    assert normalized["grounded_evidence"]["sources"][0]["content_hash"] == "revision-1"
    assert "text" not in normalized["grounded_evidence"]["sources"][0]
    assert "untrusted" in render_evidence_pack(pack)


@pytest.mark.parametrize(
    "citation",
    [
        {"id": "forged", "quote": PASSAGE},
        {"id": "valid", "quote": "这是模型编造的来源原文，不属于知识库。"},
        {"id": "valid", "quote": "明年"},
        {"id": "valid", "quote": PASSAGE, "url": "https://forged.test"},
    ],
)
def test_forged_or_empty_grounding_is_rejected(citation):
    result, metadata = evidence_fixture()
    pack = build_evidence_pack(result, metadata)
    if citation["id"] == "valid":
        citation = {**citation, "id": pack["sources"][0]["id"]}
    text = json.dumps({"answer": "蓝鲸计划明年启动。", "citations": [citation]})
    assert normalize_grounded_output({}, text, pack) == {}
    assert normalize_grounded_output({}, '{"answer":"无依据的回答","citations":[]}', pack) == {}


@pytest.mark.parametrize(
    "status,gate,error",
    [
        ("ready", "insufficient_evidence", "grounded_answer.no_evidence"),
        ("not_ready", "insufficient_evidence", "grounded_answer.retrieval_unavailable"),
    ],
)
def test_absence_and_unavailable_are_distinct(status, gate, error):
    with pytest.raises(RuntimeExecutionContractError) as exc:
        build_evidence_pack({"status": status, "evidence_gate": {"status": gate}}, {})
    assert exc.value.error_code == error


def test_stale_vector_hit_or_other_site_metadata_cannot_supply_evidence():
    result, metadata = evidence_fixture()
    for current in ({}, {42: {**metadata[42], "chunks": {2: "已经更新的正文。"}}}):
        with pytest.raises(RuntimeExecutionContractError, match="No usable public evidence"):
            build_evidence_pack(result, current)


def test_context_is_bounded_and_deduplicated():
    result, metadata = evidence_fixture()
    result["results"] *= 20
    pack = build_evidence_pack(result, metadata)
    assert len(pack["sources"]) == 1


def test_forged_source_type_cannot_relabel_a_current_chunk():
    result, metadata = evidence_fixture()
    result["results"][0]["source_type"] = "page"
    with pytest.raises(RuntimeExecutionContractError, match="No usable public evidence"):
        build_evidence_pack(result, metadata)
