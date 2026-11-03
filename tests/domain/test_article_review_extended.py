"""Extended review keeps old language callers and strict author-only evidence."""

import hashlib
import json
from copy import deepcopy

import pytest

from app.domain.article_review.contract import (
    REQUEST_CONTRACT,
    build_provider_input,
    build_result,
    validate_snapshot,
)
from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.runtime.provider_execution import ProviderOutputFinalizationError


def extended_snapshot(checks=None, blocks=None):
    checks = checks if checks is not None else ["language", "logic", "content_risk"]
    blocks = (
        blocks
        if blocks is not None
        else [
            {"block_ref": "b1", "kind": "body", "text": "2025年总支出是10万元。"},
            {"block_ref": "b2", "kind": "body", "text": "上述同一年同一项目的总支出是12万元。"},
        ]
    )
    return dict(
        snapshot_sha256=hashlib.sha256(
            json.dumps(
                [
                    REQUEST_CONTRACT,
                    "zh-CN",
                    checks,
                    [[b["block_ref"], b["kind"], b["text"]] for b in blocks],
                ],
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode()
        ).hexdigest(),
        language="zh-CN",
        checks=checks,
        offset_unit="utf16_code_units",
        blocks=blocks,
    )


def model_report(payload=None, findings=None):
    payload = payload or extended_snapshot()
    return {
        "checks": {c: {"status": "completed", "reason_code": "none"} for c in payload["checks"]},
        "findings": findings or [],
    }


def logic_finding():
    return dict(
        kind="contradiction",
        scope="across_blocks",
        evidence=[
            dict(block_ref="b1", quote="总支出是10万元", occurrence=0),
            dict(block_ref="b2", quote="总支出是12万元", occurrence=0),
        ],
        reason="相同项目、时期及单位下的总支出口径不同，需核对。",
        review_direction="请作者核对项目和总支出记录。",
    )


def finalize(report, payload=None):
    return build_result({"output_text": json.dumps(report)}, payload or extended_snapshot())


def test_distinct_cross_paragraph_claims_get_verified_read_only_evidence():
    report = finalize(model_report(findings=[logic_finding()]))
    assert report["checks"]["logic"]["status"] == "completed"
    finding = report["findings"][0]
    assert finding["check"] == "logic" and finding["scope"] == "across_blocks"
    assert len(finding["evidence"]) == 2
    assert finding["action_policy"] == "operator_review_only_no_insert"
    prompt = build_provider_input(extended_snapshot())
    assert json.loads(prompt["messages"][1]["content"])["checks"] == [
        "language",
        "logic",
        "content_risk",
    ]
    assert "搭配偏好" in prompt["messages"][0]["content"]


@pytest.mark.parametrize("mutation", ["duplicate", "same_block", "title", "forged", "within_scope"])
def test_unproven_logic_evidence_is_hidden_and_only_logic_is_partial(mutation):
    payload = extended_snapshot()
    item = logic_finding()
    if mutation == "duplicate":
        item["evidence"][1] = deepcopy(item["evidence"][0])
    elif mutation == "same_block":
        item["evidence"][1] = dict(block_ref="b1", quote="2025年", occurrence=0)
    elif mutation == "title":
        blocks = deepcopy(payload["blocks"])
        blocks[1]["kind"] = "title"
        payload = extended_snapshot(blocks=blocks)
    elif mutation == "forged":
        item["evidence"][1]["quote"] = "伪造"
    else:
        item["scope"] = "within_block"
    report = finalize(model_report(payload, [item]), payload)
    assert report["findings"] == [] and report["invalid_finding_count"] == 1
    assert report["checks"]["logic"] == {"status": "partial", "reason_code": "invalid_output"}
    assert report["checks"]["language"]["status"] == "completed"
    assert report["checks"]["content_risk"]["status"] == "completed"


def test_risk_requires_context_without_a_publication_verdict():
    item = dict(
        kind="sexual_context_review",
        context="commercial",
        evidence=[dict(block_ref="b1", quote="总支出", occurrence=0)],
        reason="合成协议测试，非实际风险判断。",
        review_direction="由作者核对语境。",
    )
    report = finalize(model_report(findings=[item]))
    assert report["findings"][0]["context"] == "commercial"
    assert report["findings"][0]["check"] == "content_risk"
    del item["context"]
    with pytest.raises(ProviderOutputFinalizationError):
        finalize(model_report(findings=[item]))


def test_partial_and_refused_are_independent_not_empty_success():
    raw = model_report()
    raw["checks"]["logic"] = dict(status="partial", reason_code="analysis_incomplete")
    raw["checks"]["content_risk"] = dict(status="refused", reason_code="provider_refused")
    report = finalize(raw)
    assert report["checks"] == raw["checks"]
    item = dict(
        kind="sexual_context_review",
        context="unknown",
        evidence=[],
        reason="r",
        review_direction="d",
    )
    raw["findings"] = [item]
    with pytest.raises(ProviderOutputFinalizationError):
        finalize(raw)


@pytest.mark.parametrize("checks", [[], ["logic", "language"], ["logic", "logic"], ["unknown"]])
def test_checks_are_known_unique_canonical_and_hash_bound(checks):
    with pytest.raises(RuntimeExecutionContractError):
        validate_snapshot(extended_snapshot(checks))


def test_subset_cannot_report_an_unrequested_category_or_omit_coverage():
    payload = extended_snapshot(["content_risk"])
    raw = model_report(payload, [logic_finding()])
    with pytest.raises(ProviderOutputFinalizationError):
        finalize(raw, payload)
    raw = model_report(payload)
    report = finalize(raw, payload)
    assert report["checks"]["language"]["status"] == "not_checked"
    raw["checks"] = {}
    with pytest.raises(ProviderOutputFinalizationError):
        finalize(raw, payload)


@pytest.mark.parametrize("extra", ["replacement", "apply", "html", "safe_to_publish"])
def test_unknown_action_or_policy_fields_still_reject_whole_output(extra):
    item = logic_finding()
    item[extra] = "untrusted"
    with pytest.raises(ProviderOutputFinalizationError):
        finalize(model_report(findings=[item]))
