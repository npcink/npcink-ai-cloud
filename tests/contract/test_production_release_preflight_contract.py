from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "production-release-preflight.py"


def _module():
    spec = importlib.util.spec_from_file_location("production_release_preflight", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _snapshot() -> dict[str, object]:
    sha = "a" * 40
    return {
        "repository": "npcink/npcink-ai-cloud",
        "production_sha": sha,
        "release_action": "no_deploy",
        "ci_runs": {"workflow_runs": [{"head_sha": sha, "id": 11, "status": "completed", "conclusion": "success"}]},
        "codeql_runs": {"workflow_runs": [{"head_sha": sha, "id": 12, "status": "completed", "conclusion": "success"}]},
        "deploy_runs": {"workflow_runs": []},
        "artifacts": {"artifacts": [{"name": f"production-release-plan-{sha}", "id": 21, "expired": False}]},
        "repository_secrets": [
            "NPCINK_CLOUD_NO_USER_INTERNAL_VALIDATION_APPROVAL",
            "PROD_SSH_HOST", "PROD_SSH_KEY", "PROD_SSH_KNOWN_HOSTS", "PROD_SSH_USER",
        ],
        "environment_secrets": [],
    }


def test_dry_run_requires_snapshot_and_does_not_need_gh(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _module()
    monkeypatch.setattr(module.shutil, "which", lambda _: None)
    assert module.evaluate_snapshot(_snapshot(), expected_sha="a" * 40, require_formal_smoke=False)["release_preflight"] == "ready"


def test_snapshot_result_contains_elapsed_stage_and_mode() -> None:
    result = _module().evaluate_snapshot(_snapshot(), expected_sha="a" * 40, require_formal_smoke=False)
    assert result["preflight_mode"] == "snapshot"
    assert isinstance(result["preflight_elapsed_seconds"], float)
    assert result["preflight_elapsed_seconds"] >= 0


def test_dry_run_cli_rejects_missing_snapshot() -> None:
    module = _module()
    with pytest.raises(SystemExit, match="requires --snapshot"):
        # Exercise the same argument contract without invoking GitHub.
        module.main.__globals__["sys"].argv = [str(SCRIPT), "--dry-run"]
        module.main()
