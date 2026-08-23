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


def test_deploy_secret_readiness_does_not_expose_metadata() -> None:
    module = _load_module()

    class SourceError(RuntimeError):
        pass

    class PreflightStub:
        PreflightError = SourceError
        DEPLOY_REQUIRED_SECRETS = frozenset({"DEPLOY_REQUIRED"})

        @staticmethod
        def _secret_names(_command: list[str]) -> set[str]:
            return set()

    with pytest.raises(
        module.PromotionPreflightError,
        match="metadata is incomplete",
    ) as error:
        module._require_deploy_secret_metadata(
            PreflightStub,
            "npcink/npcink-ai-cloud",
        )

    assert "DEPLOY_REQUIRED" not in str(error.value)


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
        baseline_run_ids=set(),
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
            baseline_run_ids=set(),
            production_sha=SHA,
            wait_seconds=30,
            poll_seconds=1,
        )


def test_bootstrap_certificate_wait_binds_unique_new_production_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    monkeypatch.setattr(
        module,
        "_certificate_runs",
        lambda *_args, **_kwargs: [
            {
                "databaseId": 100,
                "displayTitle": "Production Maintenance",
                "status": "completed",
                "conclusion": "success",
                "headSha": SHA,
            },
            {
                "databaseId": 99,
                "displayTitle": "Production Maintenance",
                "status": "completed",
                "conclusion": "success",
                "headSha": SHA,
            },
        ],
    )
    monkeypatch.setattr(
        module,
        "_run",
        lambda *_args, **_kwargs: (
            "maintenance [certificate-preflight:ok] readiness receipt age_seconds=0"
        ),
    )

    run_id = module._wait_for_certificate_readiness(
        ROOT,
        repo="npcink/npcink-ai-cloud",
        request_id=None,
        baseline_run_ids={99},
        production_sha=SHA,
        wait_seconds=30,
        poll_seconds=1,
    )

    assert run_id == 100


def test_bootstrap_certificate_wait_rejects_other_maintenance_action(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    monkeypatch.setattr(
        module,
        "_certificate_runs",
        lambda *_args, **_kwargs: [
            {
                "databaseId": 100,
                "displayTitle": "Production Maintenance",
                "status": "completed",
                "conclusion": "success",
                "headSha": SHA,
            }
        ],
    )
    monkeypatch.setattr(module, "_run", lambda *_args, **_kwargs: "disk report only")

    with pytest.raises(module.PromotionPreflightError, match="lacks certificate"):
        module._wait_for_certificate_readiness(
            ROOT,
            repo="npcink/npcink-ai-cloud",
            request_id=None,
            baseline_run_ids=set(),
            production_sha=SHA,
            wait_seconds=30,
            poll_seconds=1,
        )


def test_bootstrap_dispatch_omits_unknown_workflow_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    commands: list[list[str]] = []
    monkeypatch.setattr(
        module,
        "_run",
        lambda command, **_kwargs: commands.append(command) or "",
    )

    module._dispatch_certificate_readiness(
        ROOT,
        "npcink/npcink-ai-cloud",
        None,
    )

    assert "action=certificate-readiness" in commands[0]
    assert all("readiness_request_id=" not in argument for argument in commands[0])


def test_production_workflow_contract_selects_bootstrap_only_when_needed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    monkeypatch.setattr(
        module,
        "_run",
        lambda *_args, **_kwargs: "name: Production Maintenance\naction:\n",
    )
    assert (
        module._production_workflow_supports_request_id(
            ROOT,
            "npcink/npcink-ai-cloud",
        )
        is False
    )

    monkeypatch.setattr(
        module,
        "_run",
        lambda *_args, **_kwargs: (
            "readiness_request_id:\nrun-name: ${{ inputs.readiness_request_id }}\n"
        ),
    )
    assert (
        module._production_workflow_supports_request_id(
            ROOT,
            "npcink/npcink-ai-cloud",
        )
        is True
    )


def test_workflow_exposes_unique_readiness_request_contract() -> None:
    workflow = (ROOT / ".github/workflows/production-maintenance.yml").read_text(
        encoding="utf-8"
    )

    assert "run-name: Production Maintenance / ${{ inputs.action }}" in workflow
    assert "readiness_request_id:" in workflow
    assert "inputs.readiness_request_id || 'manual'" in workflow
