from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.providers.base import (
    ProviderExecutionError,
    ProviderExecutionRequest,
    ProviderExecutionResult,
)
from app.adapters.providers.openai import OpenAIProviderAdapter
from app.core.db import dispose_engine, get_session
from app.core.models import ProviderCallRecord, RunRecord, UsageMeterEvent
from app.domain.article_review.contract import ABILITY, PROFILE, REQUEST_CONTRACT
from tests.api.test_runtime_execute import _build_client
from tests.conftest import build_auth_headers, merge_json_headers
from tests.domain.test_article_review_contract import finding, snapshot


class ReviewProvider(OpenAIProviderAdapter):
    def __init__(self, output: str) -> None:
        super().__init__()
        self.output = output
        self.calls: list[ProviderExecutionRequest] = []

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.calls.append(request)
        if self.output == "provider_error":
            raise ProviderExecutionError(
                "provider.timeout",
                "original-article-canary",
                usage_context={"untrusted": "original-article-canary"},
            )
        return ProviderExecutionResult(
            output={"output_text": self.output, "model_id": request.model_id},
            latency_ms=1,
            tokens_in=10,
            tokens_out=10,
            cost=0,
        )


def review_payload() -> dict:
    return {
        "site_id": "site_alpha",
        "ability_name": ABILITY,
        "contract_version": REQUEST_CONTRACT,
        "execution_kind": "text",
        "profile_id": PROFILE,
        "data_classification": "pii",
        "storage_mode": "no_store",
        "timeout_seconds": 30,
        "retry_max": 0,
        "retention_ttl": 0,
        "policy": {"allow_fallback": False},
        "input": snapshot(),
    }


@pytest.mark.parametrize("mode", ["valid", "invalid", "partial", "provider_error"])
def test_signed_review_returns_verified_hints_without_durable_text(
    tmp_path: Path,
    mode: str,
) -> None:
    item = finding()
    if mode == "invalid":
        item["replacement"] = "untrusted correction"
    if mode == "partial":
        item["evidence"][0]["quote"] = "fabricated quote"
    provider = ReviewProvider(
        "provider_error" if mode == "provider_error" else json.dumps({"findings": [item]})
    )
    database_url, client = _build_client(tmp_path, providers={"openai": provider})
    payload = review_payload()
    body = json.dumps(payload).encode()
    path = "/v1/runtime/execute"
    response = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_alpha",
                idempotency_key="review-contract-test",
                trace_id="1234567890abcdef1234567890abcdef",
                body=body,
            )
        ),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert len(provider.calls) == 1
    assert provider.calls[0].policy["allow_fallback"] is False
    assert provider.calls[0].policy["max_retries"] == 0
    assert provider.calls[0].input_payload["messages"][1]["role"] == "user"
    assert set(provider.calls[0].input_payload) == {"messages", "params"}
    if mode == "provider_error":
        assert data["status"] == "failed"
        assert data["error_code"] == "provider.timeout"
        assert "original-article-canary" not in response.text
    elif mode == "invalid":
        assert data["status"] == "failed"
        assert data["error_code"] == "article_review.invalid_output"
        assert "untrusted correction" not in response.text
    else:
        assert data["status"] == "succeeded"
        report = data["result"]
        assert "output_text" not in report
        assert report["checks"]["logic"]["status"] == "not_checked"
        if mode == "valid":
            assert report["findings"][0]["evidence"][0]["start"] == 4
            assert report["findings"][0]["action_policy"] == "operator_review_only_no_insert"
        else:
            assert report["findings"] == []
            assert report["checks"]["language"]["status"] == "partial"
    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert "original-article-canary" not in (run.error_message or "")
        assert run.input_json == {}
        assert run.execution_input_ciphertext is None
        assert run.result_json in ({"stored": False, "status": "omitted"}, {}, None)
        assert "原文" not in json.dumps(run.policy_json, ensure_ascii=False)
        calls = list(
            session.scalars(
                select(ProviderCallRecord).where(
                    ProviderCallRecord.run_id == run.run_id,
                )
            )
        )
        assert len(calls) == 1
        assert not calls[0].fallback_used
        assert calls[0].retry_count == 0
        usage = list(
            session.scalars(select(UsageMeterEvent).where(UsageMeterEvent.run_id == run.run_id))
        )
        assert usage
        assert "original-article-canary" not in json.dumps([u.payload_json for u in usage])
    if mode == "valid":
        replay = client.post(
            path,
            content=body,
            headers=merge_json_headers(
                build_auth_headers(
                    "POST",
                    path,
                    site_id="site_alpha",
                    idempotency_key="review-contract-test",
                    nonce="review-replay-nonce",
                    trace_id="1234567890abcdef1234567890abcdef",
                    body=body,
                )
            ),
        )
        assert replay.status_code == 200
        assert replay.json()["data"]["run_id"] == data["run_id"]
        assert replay.json()["data"]["idempotent_replay"] is True
        assert replay.json()["data"]["result"] == {"stored": False, "status": "omitted"}
        assert len(provider.calls) == 1
    dispose_engine(database_url)


@pytest.mark.parametrize(
    "change",
    [
        {"storage_mode": "result_only"},
        {"policy": {"allow_fallback": True}},
        {"input": {**snapshot(), "snapshot_sha256": "0" * 64}},
        {"input": {**snapshot(), "checks": ["logic"]}},
    ],
)
def test_invalid_review_rejected_before_provider(tmp_path: Path, change: dict) -> None:
    provider = ReviewProvider('{"findings":[]}')
    database_url, client = _build_client(tmp_path, providers={"openai": provider})
    body = json.dumps({**review_payload(), **change}).encode()
    path = "/v1/runtime/execute"
    response = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_alpha",
                idempotency_key="review-invalid-contract",
                trace_id="1234567890abcdef1234567890abcdef",
                body=body,
            )
        ),
    )
    assert response.status_code == 400
    assert response.json()["error_code"].startswith("article_review.")
    assert "原文" not in response.text
    assert provider.calls == []
    dispose_engine(database_url)
