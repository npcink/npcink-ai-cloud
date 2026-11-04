from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any

import pytest

from app.domain.article_review.contract import (
    ABILITY,
    PROFILE,
    REQUEST_CONTRACT,
    build_provider_input,
    build_result,
    validate_policy,
    validate_request,
    validate_snapshot,
)
from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.runtime.models import RuntimeRequest
from app.domain.runtime.provider_execution import ProviderOutputFinalizationError


def snapshot(text: str = "😀原文，，保留。") -> dict[str, Any]:
    canonical = [REQUEST_CONTRACT, "zh-CN", ["language"], [["b1", "body", text]]]
    return {
        "snapshot_sha256": hashlib.sha256(
            json.dumps(canonical, ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest(),
        "language": "zh-CN",
        "checks": ["language"],
        "offset_unit": "utf16_code_units",
        "blocks": [{"block_ref": "b1", "kind": "body", "text": text}],
    }


def finding(quote: str = "，，", occurrence: int = 0) -> dict[str, Any]:
    return {
        "kind": "punctuation",
        "evidence": [{"block_ref": "b1", "quote": quote, "occurrence": occurrence}],
        "reason": "重复标点疑点。",
        "review_direction": "请作者核对是否有意。",
    }


def result(items: list[dict[str, Any]], text: str = "😀原文，，保留。") -> dict[str, Any]:
    return build_result(
        {"output_text": json.dumps({"findings": items})}, snapshot(text)
    )


def test_aligns_utf16_and_second_exact_occurrence_without_normalization() -> None:
    report = result([finding()])
    assert report["findings"][0]["evidence"][0] == {
        "block_ref": "b1",
        "quote": "，，",
        "start": 4,
        "end": 6,
    }
    repeated = result([finding("，，", 1)], "，，😀，，")
    assert repeated["findings"][0]["evidence"][0]["start"] == 4
    combined = result([finding("é")], "e\u0301")
    assert combined["checks"]["language"]["status"] == "partial"
    assert combined["findings"] == []


def test_missing_quote_or_block_is_partial_and_never_silently_completed() -> None:
    bad = finding()
    bad["evidence"][0]["block_ref"] = "b999"
    report = result([finding(), finding("不存在"), bad])
    assert len(report["findings"]) == 1
    assert report["invalid_finding_count"] == 2
    assert report["checks"]["language"] == {"status": "partial", "reason_code": "invalid_output"}
    assert report["checks"]["logic"]["status"] == "not_checked"
    assert report["checks"]["content_risk"]["status"] == "not_checked"


@pytest.mark.parametrize("field", ["replacement", "fix", "html", "url", "apply"])
def test_extra_action_or_unknown_field_rejects_entire_result(field: str) -> None:
    bad = finding()
    bad[field] = "untrusted"
    with pytest.raises(ProviderOutputFinalizationError) as error:
        result([bad])
    assert error.value.error_code == "article_review.invalid_output"
    assert "untrusted" not in str(error.value)


@pytest.mark.parametrize("value", [True, "0", -1, 0.5])
def test_occurrence_never_coerces_bool_string_or_float(value: object) -> None:
    bad = finding()
    bad["evidence"][0]["occurrence"] = value
    with pytest.raises(ProviderOutputFinalizationError):
        result([bad])


@pytest.mark.parametrize(
    "raw",
    [
        '{"findings":[],"findings":[]}',
        '{"findings":[],"replacement":"x"}',
        '{"findings":NaN}',
        '```json\n{"findings":[]}\n```',
        '{"findings":',
        '{"findings":' + '[' * 2000 + ']' * 2000 + '}',
    ],
)
def test_malformed_or_ambiguous_json_is_failure(raw: str) -> None:
    with pytest.raises(ProviderOutputFinalizationError):
        build_result({"output_text": raw}, snapshot())


def test_empty_result_limit_and_text_limits() -> None:
    assert result([])["checks"]["language"]["status"] == "completed"
    assert result([finding()] * 12)["result_limit_reached"] is True
    with pytest.raises(ProviderOutputFinalizationError):
        result([finding()] * 13)
    too_long = finding()
    too_long["reason"] = "长" * 601
    assert result([too_long])["invalid_finding_count"] == 1


@pytest.mark.parametrize(
    "change",
    [
        {"snapshot_sha256": "0" * 64},
        {"checks": ["logic"]},
        {"language": "en"},
        {"offset_unit": "codepoints"},
        {"url": "https://invalid.example"},
        {"blocks": [{"block_ref": "b1", "kind": "body", "text": "😀" * 801}]},
        {"blocks": [{"block_ref": "b1", "kind": "body", "text": "\ud800"}]},
    ],
)
def test_snapshot_failures_have_content_free_errors(change: dict[str, Any]) -> None:
    payload = {**snapshot(), **change}
    with pytest.raises(RuntimeExecutionContractError) as error:
        validate_snapshot(payload)
    assert str(error.value) == "article review snapshot is invalid"
    assert error.value.__suppress_context__ is True


def test_snapshot_rejects_duplicate_blocks_and_aggregate_limits() -> None:
    payload = snapshot()
    payload["blocks"] *= 2
    with pytest.raises(RuntimeExecutionContractError):
        validate_snapshot(payload)
    payload = snapshot()
    payload["blocks"] = [
        {"block_ref": f"b{i}", "kind": "body", "text": "字" * 1600} for i in range(1, 21)
    ]
    with pytest.raises(RuntimeExecutionContractError):
        validate_snapshot(payload)


def test_request_requires_privacy_no_retry_and_exact_policy() -> None:
    request = RuntimeRequest(
        site_id="site_alpha",
        ability_name=ABILITY,
        channel="openapi",
        execution_kind="text",
        profile_id=PROFILE,
        input_payload=snapshot(),
        contract_version=REQUEST_CONTRACT,
        execution_pattern="inline",
        data_classification="pii",
        storage_mode="no_store",
        timeout_seconds=30,
        policy={"allow_fallback": False},
    )
    assert validate_request(request).snapshot_sha256 == request.input_payload["snapshot_sha256"]
    for field, value in [
        ("storage_mode", "result_only"),
        ("retention_ttl", 1),
        ("retry_max", 1),
        ("execution_pattern", "whole_run_offload"),
        ("policy", {"allow_fallback": True}),
        ("ability_name", "other"),
        ("profile_id", "text.ai"),
        ("timeout_seconds", 0),
    ]:
        altered = deepcopy(request)
        setattr(altered, field, value)
        with pytest.raises(RuntimeExecutionContractError):
            validate_request(altered)


@pytest.mark.parametrize(
    "change",
    [
        {"allow_fallback": True},
        {"max_retries": 1},
        {"retention_ttl": 1},
        {"runtime_callback": {"url": "https://invalid.example"}},
        {"task_backend": {"enabled": True}},
        {"storage_mode": "result_only"},
    ],
)
def test_profile_and_commercial_overrides_cannot_widen_policy(change: dict[str, Any]) -> None:
    with pytest.raises(RuntimeExecutionContractError):
        validate_policy({"allow_fallback": False, "storage_mode": "no_store", **change})


def test_provider_receives_only_bounded_messages_and_fixed_params() -> None:
    original = snapshot()
    prepared = build_provider_input(original)
    assert set(prepared) == {"messages", "params"}
    blocks = json.loads(prepared["messages"][1]["content"])["blocks"]
    assert blocks == original["blocks"]
    assert prepared["params"]["temperature"] == 0
