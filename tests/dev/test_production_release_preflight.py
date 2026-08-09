from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "production-release-preflight.py"
SHA = "a" * 40


def _load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("production_release_preflight", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _snapshot() -> dict[str, Any]:
    deploy_secrets = {
        "NPCINK_CLOUD_NO_USER_INTERNAL_VALIDATION_APPROVAL",
        "PROD_SSH_HOST",
        "PROD_SSH_KEY",
        "PROD_SSH_KNOWN_HOSTS",
        "PROD_SSH_USER",
    }
    smoke_secrets = {
        "NPCINK_CLOUD_ADMIN_KEY",
        "NPCINK_CLOUD_INTERNAL_AUTH_TOKEN",
        "NPCINK_CLOUD_PORTAL_LOGIN_CODE",
        "NPCINK_CLOUD_RELEASE_KEY_ID",
        "NPCINK_CLOUD_RELEASE_KEY_SECRET",
        "NPCINK_CLOUD_RELEASE_MEMBER_EMAIL",
        "NPCINK_CLOUD_RELEASE_SITE_ID",
    }
    return {
        "repository": "npcink/npcink-ai-cloud",
        "production_sha": SHA,
        "ci_runs": {
            "workflow_runs": [
                {
                    "id": 101,
                    "head_sha": SHA,
                    "status": "completed",
                    "conclusion": "success",
                }
            ]
        },
        "codeql_runs": {
            "workflow_runs": [
                {
                    "id": 102,
                    "head_sha": SHA,
                    "status": "completed",
                    "conclusion": "success",
                }
            ]
        },
        "deploy_runs": {"workflow_runs": []},
        "artifacts": {
            "artifacts": [
                {
                    "id": 103,
                    "name": f"production-deploy-bundle-{SHA}",
                    "expired": False,
                }
            ]
        },
        "repository_secrets": sorted(deploy_secrets),
        "environment_secrets": sorted(smoke_secrets),
    }


def test_ready_snapshot_binds_exact_checks_bundle_and_secret_names() -> None:
    module = _load_module()

    result = module.evaluate_snapshot(
        _snapshot(),
        expected_sha=SHA,
        require_formal_smoke=True,
    )

    assert result == {
        "schema": "npcink.production_release_preflight.v1",
        "repository": "npcink/npcink-ai-cloud",
        "production_sha": SHA,
        "cloud_ci_run_id": 101,
        "codeql_run_id": 102,
        "bundle_artifact_id": 103,
        "deploy_secrets_ready": True,
        "formal_smoke_secrets_ready": True,
        "missing_formal_smoke_secret_names": [],
        "active_deploy_run_ids": [],
        "release_preflight": "ready",
    }
    assert "release_preflight=ready" in module.render_text(result)


def test_formal_smoke_gap_is_visible_and_optionally_fail_closed() -> None:
    module = _load_module()
    snapshot = _snapshot()
    snapshot["environment_secrets"].remove("NPCINK_CLOUD_ADMIN_KEY")
    snapshot["environment_secrets"].remove("NPCINK_CLOUD_PORTAL_LOGIN_CODE")

    advisory = module.evaluate_snapshot(
        snapshot,
        expected_sha=None,
        require_formal_smoke=False,
    )

    assert advisory["formal_smoke_secrets_ready"] is False
    assert advisory["missing_formal_smoke_secret_names"] == [
        "NPCINK_CLOUD_ADMIN_KEY",
        "NPCINK_CLOUD_PORTAL_LOGIN_CODE",
    ]
    with pytest.raises(module.PreflightError, match="missing formal smoke secret names"):
        module.evaluate_snapshot(
            snapshot,
            expected_sha=None,
            require_formal_smoke=True,
        )


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda snapshot: snapshot["ci_runs"]["workflow_runs"][0].update(
                status="in_progress", conclusion=""
            ),
            "exact production checks are not ready",
        ),
        (
            lambda snapshot: snapshot["deploy_runs"]["workflow_runs"].append(
                {"id": 104, "head_sha": SHA, "status": "waiting"}
            ),
            "Deploy Production is already active",
        ),
        (
            lambda snapshot: snapshot["repository_secrets"].remove("PROD_SSH_HOST"),
            "missing deployment secret names",
        ),
        (
            lambda snapshot: snapshot["artifacts"]["artifacts"][0].update(expired=True),
            "expected exactly one unexpired",
        ),
    ],
)
def test_preflight_fails_closed_for_incomplete_release_evidence(
    mutate: Any,
    message: str,
) -> None:
    module = _load_module()
    snapshot = _snapshot()
    mutate(snapshot)

    with pytest.raises(module.PreflightError, match=message):
        module.evaluate_snapshot(
            snapshot,
            expected_sha=None,
            require_formal_smoke=False,
        )


def test_requested_sha_must_match_current_production_branch() -> None:
    module = _load_module()

    with pytest.raises(module.PreflightError, match="does not match"):
        module.evaluate_snapshot(
            _snapshot(),
            expected_sha="b" * 40,
            require_formal_smoke=False,
        )
