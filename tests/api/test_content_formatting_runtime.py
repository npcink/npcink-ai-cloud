from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import pytest

from app.core.db import get_session
from app.core.models import RunRecord
from tests.api.test_media_batch_plan_runtime import _build_client, _execute


def _payload() -> dict[str, Any]:
    source = "<p>中文AI工具。</p>"
    return {
        "ability_name": "npcink-toolbox/format-content",
        "contract_version": "content_format_request.v1",
        "execution_kind": "content_format",
        "profile_id": "content-format.managed",
        "execution_pattern": "inline",
        "storage_mode": "no_store",
        "data_classification": "pii",
        "input": {
            "content": source,
            "format": "html",
            "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
        },
    }


def test_signed_formatting_is_transient_and_provider_free(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    response = _execute(client, _payload(), nonce="format-first")
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["provider_call_count"] == 0
    assert data["result"]["candidate"] == "<p>中文 AI 工具。</p>"
    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.input_json == {}
        assert run.result_json == {}
        assert run.execution_input_ciphertext is None
    replay = _execute(client, _payload(), nonce="format-second")
    assert replay.status_code == 200
    assert replay.json()["data"]["run_id"] == data["run_id"]
    assert "candidate" not in replay.json()["data"]["result"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("storage_mode", "result_only"),
        ("execution_pattern", "whole_run_offload"),
        ("contract_version", "v1"),
        ("profile_id", "some-model"),
        ("retry_max", 1),
        ("site_id", "another_site"),
    ],
)
def test_formatting_rejects_invalid_runtime_contract(
    tmp_path: Path, field: str, value: Any
) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()
    payload[field] = value
    response = _execute(client, payload)
    assert response.status_code in {400, 403}, response.json()


def test_formatting_rejects_write_fields_and_wrong_digest(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()
    payload["input"]["update_post"] = True
    response = _execute(client, payload)
    assert response.status_code == 400
    payload = _payload()
    payload["input"]["source_sha256"] = "0" * 64
    response = _execute(client, payload, nonce="digest-wrong")
    assert response.status_code == 400


def test_v2_structure_runtime_is_explicit(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()
    source = (
        "<!-- wp:paragraph -->\n<p>功能<br>* 第一项<br>* 第二项* 第三项</p>\n<!-- /wp:paragraph -->"
    )
    payload["contract_version"] = "content_format_request.v2"
    payload["input"]["content"] = source
    payload["input"]["source_sha256"] = hashlib.sha256(source.encode()).hexdigest()
    response = _execute(client, payload)
    assert response.status_code == 200
    assert response.json()["data"]["result"]["structural_changes"] == 1
    assert response.json()["data"]["provider_call_count"] == 0


def test_v2_malformed_declaration_returns_unchanged_review(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()
    source = "<!-- wp:paragraph --><p><![foo]>原文AI。</p><!-- /wp:paragraph -->"
    payload["contract_version"] = "content_format_request.v2"
    payload["input"]["content"] = source
    payload["input"]["source_sha256"] = hashlib.sha256(source.encode()).hexdigest()
    response = _execute(client, payload)
    assert response.status_code == 200
    result = response.json()["data"]["result"]
    assert result["candidate"] == source
    assert result["status"] == "REVIEW"
    assert result["structural_changes"] == 0
