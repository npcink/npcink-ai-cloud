from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github" / "scripts" / "production-promotion-preflight.py"
SHA = "a" * 40


def _load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("production_promotion_preflight", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_release_action_maps_only_non_runtime_lanes() -> None:
    module = _load_module()

    assert module._release_action("no_deploy") == "no_deploy"
    assert module._release_action("static") == "static"
    for lane in ("frontend", "backend", "config", "migration", "full"):
        assert module._release_action(lane) == "runtime"


def test_active_deploy_detection_is_global_and_sorted() -> None:
    module = _load_module()
    payload = {
        "workflow_runs": [
            {"id": 12, "status": "completed", "head_sha": "b" * 40},
            {"id": 11, "status": "waiting", "head_sha": "b" * 40},
            {"id": 10, "status": "in_progress", "head_sha": "c" * 40},
        ]
    }

    assert module._active_deploy_ids(payload) == [10, 11]


def test_active_deploy_query_covers_each_status_and_deduplicates() -> None:
    module = _load_module()
    calls: list[str] = []

    class SourceError(RuntimeError):
        pass

    class PreflightStub:
        PreflightError = SourceError

        @staticmethod
        def _gh_api(_repo: str, _endpoint: str, **fields: str) -> object:
            calls.append(fields["status"])
            return {
                "workflow_runs": [
                    {"id": 11, "status": fields["status"]},
                ]
            }

    with pytest.raises(module.PromotionPreflightError, match="11"):
        module._require_no_active_deploy(PreflightStub, "npcink/npcink-ai-cloud")

    assert calls == sorted(module.ACTIVE_DEPLOY_STATUSES)


def test_github_metadata_error_uses_stable_preflight_error() -> None:
    module = _load_module()

    class SourceError(RuntimeError):
        pass

    class PreflightStub:
        PreflightError = SourceError

        @staticmethod
        def _gh_api(*_args: object, **_kwargs: object) -> object:
            raise SourceError("GitHub metadata unavailable")

    with pytest.raises(module.PromotionPreflightError, match="metadata unavailable"):
        module._resolve_remote_branch_sha(
            PreflightStub,
            "npcink/npcink-ai-cloud",
            "production",
        )


def test_secret_readiness_returns_count_without_exposing_names() -> None:
    module = _load_module()

    class SourceError(RuntimeError):
        pass

    class PreflightStub:
        PreflightError = SourceError
        DEPLOY_REQUIRED_SECRETS = frozenset({"DEPLOY_REQUIRED"})
        FORMAL_SMOKE_REQUIRED_SECRETS = frozenset(
            {"SMOKE_AVAILABLE", "SMOKE_MISSING"}
        )

        @staticmethod
        def _secret_names(_command: list[str]) -> set[str]:
            return {"DEPLOY_REQUIRED", "SMOKE_AVAILABLE"}

    missing_count = module._require_secret_names(
        PreflightStub,
        "npcink/npcink-ai-cloud",
    )

    assert missing_count == 1
    rendered = module.render_text(
        {
            "promotion_preflight": "ready",
            "repository": "npcink/npcink-ai-cloud",
            "candidate_branch": "master",
            "candidate_sha": SHA,
            "production_sha": "b" * 40,
            "predicted_lane": "full",
            "predicted_release_action": "runtime",
            "certificate_readiness_run_id": 321,
            "local_gates": "passed",
            "deploy_secrets_ready": True,
            "formal_smoke_secrets_ready": False,
            "missing_formal_smoke_secret_count": missing_count,
            "active_deploy_run_ids": [],
        }
    )
    assert "missing_formal_smoke_secret_count=1" in rendered
    assert "SMOKE_MISSING" not in rendered


def test_certificate_readiness_wait_binds_request_and_production_sha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    request_id = "preflight-123456789abc"
    responses: list[list[dict[str, Any]]] = [
        [],
        [
            {
                "databaseId": 321,
                "displayTitle": (
                    "Production Maintenance / certificate-readiness / " + request_id
                ),
                "status": "completed",
                "conclusion": "success",
                "headSha": SHA,
            }
        ],
    ]
    monkeypatch.setattr(module, "_run_json", lambda *_args, **_kwargs: responses.pop(0))
    monkeypatch.setattr(module.time, "sleep", lambda _seconds: None)

    run_id = module._wait_for_certificate_readiness(
        ROOT,
        repo="npcink/npcink-ai-cloud",
        request_id=request_id,
        production_sha=SHA,
        wait_seconds=30,
        poll_seconds=1,
    )

    assert run_id == 321


def test_certificate_readiness_rejects_mismatched_production_sha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    request_id = "preflight-123456789abc"
    monkeypatch.setattr(
        module,
        "_run_json",
        lambda *_args, **_kwargs: [
            {
                "databaseId": 321,
                "displayTitle": (
                    "Production Maintenance / certificate-readiness / " + request_id
                ),
                "status": "completed",
                "conclusion": "success",
                "headSha": "b" * 40,
            }
        ],
    )

    with pytest.raises(module.PromotionPreflightError, match="production SHA"):
        module._wait_for_certificate_readiness(
            ROOT,
            repo="npcink/npcink-ai-cloud",
            request_id=request_id,
            production_sha=SHA,
            wait_seconds=30,
            poll_seconds=1,
        )


def test_workflow_exposes_unique_readiness_request_contract() -> None:
    workflow = (ROOT / ".github/workflows/production-maintenance.yml").read_text(
        encoding="utf-8"
    )

    assert "run-name: Production Maintenance / ${{ inputs.action }}" in workflow
    assert "readiness_request_id:" in workflow
    assert "inputs.readiness_request_id || 'manual'" in workflow
