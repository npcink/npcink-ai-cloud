from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path
from typing import Any

import pytest

from app.core.db import get_session
from app.core.models import RunRecord
from app.domain.content_formatting.code_preview import RUNNER
from tests.api.test_media_batch_plan_runtime import _build_client, _execute


def payload(code: str = "a{color:red}", language: str = "css") -> dict[str, Any]:
    return {
        "ability_name": "npcink-toolbox/format-code-block",
        "contract_version": "code_format_request.v1",
        "execution_kind": "content_format",
        "profile_id": "content-format.managed",
        "channel": "editor",
        "execution_pattern": "inline",
        "storage_mode": "no_store",
        "data_classification": "pii",
        "timeout_seconds": 10,
        "input": {
            "code": code,
            "language": language,
            "source_sha256": hashlib.sha256(code.encode()).hexdigest(),
        },
    }


@pytest.fixture
def pilot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NPCINK_CODE_FORMAT_PILOT", "1")
    if not shutil.which("node") or not (RUNNER.parent / "node_modules/prettier").is_dir():
        if os.environ.get("NPCINK_TEST_CODE_FORMAT_PILOT") == "1":
            pytest.fail("install the locked formatter before running the opt-in gate")
        pytest.skip("optional formatter dependencies not installed")


@pytest.mark.parametrize(
    "source,language,expected,status",
    [
        ("a{color:red}", "css", "a {\n  color: red;\n}\n", "CHANGED"),
        ("const demo=()=>1", "javascript", "const demo = () => 1;\n", "CHANGED"),
        ('{"a":1}', "json", '{ "a": 1 }\n', "CHANGED"),
        ('{ "a": 1 }\n', "json", '{ "a": 1 }\n', "UNCHANGED"),
        ('{"a":}', "json", '{"a":}', "SKIPPED"),
        ("// prettier-ignore\nconst a=1", "javascript", "// prettier-ignore\nconst a=1", "SKIPPED"),
        ("a{\r\ncolor:red\n}", "css", "a{\r\ncolor:red\n}", "SKIPPED"),
    ],
)
def test_signed_code_preview_is_transient_and_provider_free(
    tmp_path: Path, pilot: None, source: str, language: str, expected: str, status: str
) -> None:
    database, client = _build_client(tmp_path)
    request = payload(source, language)
    preview = _execute(client, request, nonce="code-first")
    assert preview.status_code == 200, preview.json()
    data = preview.json()["data"]
    assert data["provider_call_count"] == 0
    assert data["result"] == {
        "contract_version": "code_format_candidate.v1",
        "language": language,
        "status": status,
        "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
        "candidate": expected,
        "candidate_sha256": hashlib.sha256(expected.encode()).hexdigest(),
        "direct_wordpress_write": False,
    }
    with get_session(database) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.input_json == run.result_json == {}
        assert run.execution_input_ciphertext is None
    replay = _execute(client, request, nonce="code-second").json()["data"]
    assert replay["run_id"] == data["run_id"]
    assert "candidate" not in replay["result"]


def test_code_preview_is_opt_in(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NPCINK_CODE_FORMAT_PILOT", raising=False)
    _, client = _build_client(tmp_path)
    response = _execute(client, payload())
    assert response.status_code == 400
    assert "code_format.unavailable" in response.text


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_code_preview_rejects_non_development_environments(
    tmp_path: Path, pilot: None, environment: str
) -> None:
    _, client = _build_client(tmp_path)
    # Keep the signed test transport, while exercising the runtime environment gate.
    client.app.state.services.settings.environment = environment
    response = _execute(client, payload())
    assert response.status_code == 400
    assert "code_format.unavailable" in response.text


@pytest.mark.parametrize(
    "changes",
    [
        {"ability_name": "npcink-toolbox/format-content"},
        {"storage_mode": "result_only"},
        {"retry_max": 1},
        {"input": {"language": "php"}},
        {"input": {"source_sha256": "invalid"}},
        {"input": {"post_id": 1}},
    ],
)
def test_code_preview_rejects_outside_contract(tmp_path: Path, changes: dict[str, Any]) -> None:
    _, client = _build_client(tmp_path)
    request = payload()
    for key, value in changes.items():
        if key == "input":
            request["input"].update(value)
        else:
            request[key] = value
    response = _execute(client, request)
    assert response.status_code == 400
    assert "unavailable" not in response.text
