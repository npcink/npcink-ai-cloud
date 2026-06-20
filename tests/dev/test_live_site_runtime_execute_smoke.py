from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.dev.live_site_runtime_execute_smoke import (
    APPROVAL_TEXT,
    GuardError,
    approval_matches,
    build_execute_smoke_report,
    build_runtime_execute_payload,
)


def _acceptance_report(path: Path, *, ready: bool = True) -> Path:
    path.write_text(
        json.dumps(
            {
                "ready_for_runtime_smoke_approval": ready,
                "boundary": {
                    "cloud_runtime_execution": False,
                    "site_knowledge_sync": False,
                    "content_writes": False,
                },
                "checks": [] if ready else [{"name": "cloud_addon_verified", "ok": False}],
            }
        )
        + "\n"
    )
    return path


def _stage_report(path: Path, secret_file: Path) -> Path:
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    secret_file.write_text(
        json.dumps(
            {
                "site_id": "site_live",
                "key_id": "key_live",
                "secret": "secret_live",
                "cloud_api_key": "mak1_fake",
            }
        )
        + "\n"
    )
    path.write_text(
        json.dumps(
            {
                "outputs": {"secret_file": str(secret_file)},
                "identity_provision": {"target": {"site_id": "site_live"}},
            }
        )
        + "\n"
    )
    return path


def _resolve_smoke_report(path: Path, *, ok: bool = True) -> Path:
    path.write_text(
        json.dumps(
            {
                "mode": "execute" if ok else "prepare",
                "ok": ok,
                "boundary": {
                    "runtime_resolve_smoke": ok,
                    "runtime_execute": False,
                    "site_knowledge_sync": False,
                },
                "response_failures": [] if ok else ["not ready"],
            }
        )
        + "\n"
    )
    return path


def _paths(tmp_path: Path) -> dict[str, Path]:
    return {
        "acceptance_report_path": _acceptance_report(tmp_path / "acceptance.json"),
        "stage_report_path": _stage_report(
            tmp_path / "stage1-report.json",
            tmp_path / "identity" / "cloud-api-key.secret.json",
        ),
        "resolve_smoke_report_path": _resolve_smoke_report(tmp_path / "resolve.json"),
    }


def test_approval_matches_expected_text_with_whitespace_normalization() -> None:
    assert approval_matches(APPROVAL_TEXT.replace("；", "；\n")) is True
    assert approval_matches("同意") is False


def test_execute_payload_uses_execute_canonical_run_id() -> None:
    payload = build_runtime_execute_payload(site_id="site_live", trace_id="abcdef")

    assert payload["site_id"] == "site_live"
    assert str(payload["canonical_run_id"]).startswith("npcink_runtime_execute_smoke_")
    assert payload["execution_pattern"] == "inline"
    assert payload["storage_mode"] == "result_only"


def test_execute_requires_exact_approval_before_http(tmp_path) -> None:
    calls: list[str] = []

    with pytest.raises(GuardError, match="exact approval"):
        build_execute_smoke_report(
            **_paths(tmp_path),
            output_dir=tmp_path / "out",
            base_url="http://127.0.0.1:8010",
            timeout_seconds=1,
            execute=True,
            approval_text="同意",
            http_post=lambda *_: calls.append("http") or {"ok": True},
        )

    assert calls == []


def test_execute_blocks_when_resolve_smoke_is_not_ok(tmp_path) -> None:
    calls: list[str] = []
    paths = _paths(tmp_path)
    paths["resolve_smoke_report_path"] = _resolve_smoke_report(tmp_path / "resolve.json", ok=False)

    with pytest.raises(GuardError, match="resolve"):
        build_execute_smoke_report(
            **paths,
            output_dir=tmp_path / "out",
            base_url="http://127.0.0.1:8010",
            timeout_seconds=1,
            execute=True,
            approval_text=APPROVAL_TEXT,
            http_post=lambda *_: calls.append("http") or {"ok": True},
        )

    assert calls == []


def test_execute_smoke_writes_redacted_report(tmp_path) -> None:
    calls = []

    def fake_post(url, payload, headers, timeout_seconds):
        calls.append((url, payload, headers, timeout_seconds))
        return {
            "ok": True,
            "status_code": 200,
            "response": {
                "status": "ok",
                "data": {
                    "run_id": "run_live",
                    "canonical_run_id": payload["canonical_run_id"],
                    "status": "succeeded",
                    "trace_id": payload["trace_id"],
                    "profile_id": "text.balanced",
                    "provider_id": "test",
                    "model_id": "test-model",
                    "execution_context": {
                        "execution_pattern": "inline",
                        "storage_mode": "result_only",
                    },
                    "task_backend": {},
                    "run_lifecycle": {},
                    "result": {"text": "magick cloud runtime smoke ok"},
                },
            },
        }

    report = build_execute_smoke_report(
        **_paths(tmp_path),
        output_dir=tmp_path / "out",
        base_url="http://127.0.0.1:8010",
        timeout_seconds=1,
        execute=True,
        approval_text=APPROVAL_TEXT,
        http_post=fake_post,
    )
    encoded = json.dumps(report)

    assert report["ok"] is True
    assert len(calls) == 1
    assert calls[0][0].endswith("/v1/runtime/execute")
    assert calls[0][1]["site_id"] == "site_live"
    assert "secret_live" not in encoded
    assert "mak1_fake" not in encoded
    assert (tmp_path / "out" / "runtime-execute-smoke-report.json").exists()
