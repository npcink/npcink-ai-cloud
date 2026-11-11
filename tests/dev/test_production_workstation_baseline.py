"""A reviewed workstation activation reconciles, but cannot hide later attempts."""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from test_production_deployed_baseline import BASELINE, REPOSITORY


@pytest.fixture
def observation(tmp_path, monkeypatch):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=Baseline test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "installed",
            "--allow-empty",
        ],
        cwd=tmp_path,
        check=True,
    )
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=tmp_path, text=True
    ).strip()
    tree = subprocess.check_output(
        ["git", "rev-parse", "HEAD^{tree}"], cwd=tmp_path, text=True
    ).strip()
    now = datetime.now(UTC)
    run = {
        "id": 10,
        "head_sha": "a" * 40,
        "run_attempt": 1,
        "updated_at": (now - timedelta(hours=2)).isoformat(),
        "event": "workflow_dispatch",
        "head_branch": "production",
        "conclusion": "success",
        "path": ".github/workflows/deploy-production.yml",
    }
    receipt = {
        "schema": "npcink.production_workstation_baseline.v1",
        "repository": REPOSITORY,
        "installed_sha": revision,
        "installed_tree": tree,
        "manifest_sha256": "b" * 64,
        "bundle_sha256": "c" * 64,
        "activation_log_sha256": "d" * 64,
        "observed_at_utc": (now - timedelta(hours=1)).isoformat(),
        "expires_at_utc": (now + timedelta(days=6)).isoformat(),
        "previous_workflow": {
            key: run[key] for key in ("id", "head_sha", "run_attempt", "updated_at")
        },
        "observation_file": "test-activation.json",
    }
    evidence = {
        "schema": "npcink.production_workstation_observation.v1",
        "repository": REPOSITORY,
        **{
            key: receipt[key]
            for key in (
                "installed_sha",
                "installed_tree",
                "manifest_sha256",
                "bundle_sha256",
                "activation_log_sha256",
                "observed_at_utc",
            )
        },
        "deploy_exit_status": 0,
        "remote_sequence_exit_status": 0,
        "deployment_lock_absent": True,
        "failed_cutover_marker_absent": True,
        "internal_operational_ready": True,
        "public_live_status": 200,
        "containers": [
            {
                "service": role,
                "status": "running",
                "health": "none" if role.endswith("worker") else "healthy",
                "restarts": 0,
                "OOMKilled": False,
            }
            for role in (
                "api",
                "frontend",
                "redis",
                "proxy",
                "worker",
                "callback-worker",
                "ops-worker",
            )
        ],
    }
    path = tmp_path / ".github/production-workstation-baseline.json"
    path.parent.mkdir()
    (path.parent / "production-baseline-observations").mkdir()
    monkeypatch.setattr(BASELINE, "WORKSTATION_FILE", path)
    monkeypatch.setattr(BASELINE, "RECOVERY_FILE", tmp_path / "missing.json")
    return path, receipt, evidence, run


def save(observation):
    path, receipt, evidence, _ = observation
    raw = json.dumps(evidence).encode()
    (path.parent / "production-baseline-observations/test-activation.json").write_bytes(raw)
    receipt["observation_sha256"] = hashlib.sha256(raw).hexdigest()
    path.write_text(json.dumps(receipt))
    return path


def fake_api(runs, *, missing=False, bad_timing=False, plan=None):
    def api(path):
        if "/workflows/deploy-production.yml/" in path:
            return json.dumps({"workflow_runs": runs}).encode()
        if "/workflows/ci.yml/" in path:
            return json.dumps(
                {
                    "workflow_runs": []
                    if plan is None or f"head_sha={runs[0]['head_sha']}" not in path
                    else [
                        {
                            "id": 999,
                            "head_sha": runs[0]["head_sha"],
                            "head_branch": "production",
                            "event": "push",
                            "conclusion": "success",
                            "path": ".github/workflows/ci.yml",
                        }
                    ]
                }
            ).encode()
        if "/runs/999/" in path:
            return json.dumps(
                {
                    "artifacts": [
                        {
                            "id": 999,
                            "name": "production-release-plan-" + runs[0]["head_sha"],
                            "expired": False,
                            "size_in_bytes": 1000,
                        }
                    ]
                }
            ).encode()
        for run in runs:
            if f"/runs/{run['id']}/" in path:
                return json.dumps(
                    {
                        "artifacts": []
                        if missing
                        else [
                            {
                                "id": run["id"],
                                "name": f"production-deploy-timing-{run['id']}-{run['head_sha']}",
                                "expired": False,
                                "size_in_bytes": 1000,
                            }
                        ]
                    }
                ).encode()
        run = next((run for run in runs if f"/artifacts/{run['id']}/zip" in path), None)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            if run is None:
                assert path.endswith("/artifacts/999/zip")
                bundle.writestr("production-release-plan.json", json.dumps(plan))
            else:
                bundle.writestr(
                    "production-deploy-phase-timing.json",
                    json.dumps(
                        {
                            "schema": "npcink.release_timing.v1",
                            "kind": "production_deploy_phases",
                            "repository": REPOSITORY,
                            "head_sha": run["head_sha"],
                            "workflow_run_id": str(run["id"]),
                            "release_action": "runtime",
                            "status": "failure" if bad_timing else "success",
                            "deploy_exit_status": 0,
                            "phases": [
                                {
                                    "label": "remote deploy sequence",
                                    "conclusion": "success",
                                    "exit_status": 0,
                                }
                            ],
                        }
                    ),
                )
        return archive.getvalue()

    return api


@pytest.mark.parametrize("missing", [False, True])
def test_workstation_proof_replaces_older_actions_runtime(observation, missing):
    save(observation)
    assert (
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], missing=missing))
        == observation[1]["installed_sha"]
    )


@pytest.mark.parametrize(
    "change",
    [
        {"repository": "wrong/repo"},
        {"schema": "wrong"},
        {"installed_sha": "invalid"},
        {"installed_tree": "0" * 40},
        {"manifest_sha256": "invalid"},
        {"observation_file": "../test-activation.json"},
        {"observed_at_utc": "2099-01-01T00:00:00Z"},
        {"observed_at_utc": "2026-11-10T01:00:00"},
        {"expires_at_utc": "2026-01-01T00:00:00Z"},
        {"expires_at_utc": "2099-01-01T00:00:00Z"},
        {"previous_workflow": {}},
    ],
)
def test_invalid_reviewed_receipt_stops_planning(observation, change):
    observation[1].update(change)
    path = save(observation)
    with pytest.raises((ValueError, subprocess.SubprocessError)):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], path)


@pytest.mark.parametrize(
    "field,value",
    [
        ("internal_operational_ready", False),
        ("deploy_exit_status", False),
        ("remote_sequence_exit_status", 1),
        ("deployment_lock_absent", False),
        ("failed_cutover_marker_absent", False),
        ("public_live_status", 503),
        ("manifest_sha256", "0" * 64),
        ("containers", []),
    ],
)
def test_checksums_do_not_make_failed_observations_valid(observation, field, value):
    observation[2][field] = value
    path = save(observation)
    with pytest.raises(ValueError):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], path)


@pytest.mark.parametrize(
    "field,value",
    [
        ("status", "exited"),
        ("health", "unhealthy"),
        ("restarts", 1),
        ("restarts", False),
        ("OOMKilled", True),
        ("service", "unknown"),
    ],
)
def test_container_failures_stop_planning(observation, field, value):
    observation[2]["containers"][0][field] = value
    with pytest.raises(ValueError, match="container proof"):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], save(observation))


def test_tree_must_match_real_installed_commit(observation):
    observation[1]["installed_tree"] = observation[2]["installed_tree"] = "0" * 40
    with pytest.raises(ValueError, match="source tree"):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], save(observation))


def test_corrupt_or_missing_evidence_stops_planning(observation):
    path = save(observation)
    evidence = path.parent / "production-baseline-observations/test-activation.json"
    evidence.write_text("{}")
    with pytest.raises(ValueError, match="checksum"):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], path)
    evidence.unlink()
    with pytest.raises(OSError):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], path)


def test_oversized_receipt_stops_planning(observation):
    path = save(observation)
    path.write_text(" " * 16_385)
    with pytest.raises(ValueError, match="oversized"):
        BASELINE.workstation_baseline(REPOSITORY, observation[3], path)


@pytest.mark.parametrize(
    "field,value", [("id", 11), ("run_attempt", 2), ("updated_at", "2026-11-09T00:00:00Z")]
)
def test_changed_or_missing_anchor_is_not_silently_ignored(observation, field, value):
    save(observation)
    observation[3][field] = value
    with pytest.raises(ValueError, match="anchor"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]]))


@pytest.mark.parametrize("conclusion", [None, "failure", "cancelled"])
def test_later_unproven_attempt_is_never_hidden(observation, conclusion):
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "updated_at": datetime.now(UTC).isoformat(),
        "conclusion": conclusion,
    }
    with pytest.raises(ValueError, match="later deployment attempt"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3], later]))


def test_later_proven_runtime_supersedes_even_expired_observation(observation):
    observation[1]["expires_at_utc"] = "2026-01-01T00:00:00Z"
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "updated_at": datetime.now(UTC).isoformat(),
        "head_sha": "e" * 40,
    }
    assert (
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3], later]))
        == later["head_sha"]
    )


def test_malformed_retained_runtime_is_not_overridden(observation):
    save(observation)
    with pytest.raises(ValueError, match="does not bind"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], bad_timing=True))


def test_later_noop_keeps_workstation_baseline_and_bad_plan_stops(observation):
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "updated_at": datetime.now(UTC).isoformat(),
        "head_sha": "e" * 40,
    }
    plan = {
        "schema": "npcink.production_release_plan.v2",
        "repository": REPOSITORY,
        "head_sha": later["head_sha"],
        "lane": "no_deploy",
        "backend_image_required": False,
        "frontend_image_required": False,
        "migration_required": False,
        "runtime_config_required": False,
    }
    assert (
        BASELINE.resolve_baseline(
            REPOSITORY, fake_api([later, observation[3]], missing=True, plan=plan)
        )
        == observation[1]["installed_sha"]
    )
    plan["repository"] = "other/repo"
    with pytest.raises(ValueError, match="plan identity"):
        BASELINE.resolve_baseline(
            REPOSITORY, fake_api([later, observation[3]], missing=True, plan=plan)
        )


def test_later_success_without_runtime_proof_still_blocks(observation):
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "updated_at": datetime.now(UTC).isoformat(),
        "head_sha": "e" * 40,
    }
    with pytest.raises(ValueError, match="no retained runtime"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([later, observation[3]], missing=True))


def test_missing_actions_anchor_cannot_use_workstation_observation(observation):
    save(observation)
    with pytest.raises(ValueError, match="no retained successful runtime"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([]))


@pytest.fixture
def cancelled_upload_observation(observation):
    _, receipt, evidence, run = observation
    run.update(status="completed", conclusion="cancelled", head_sha=receipt["installed_sha"])
    anchor = {
        key: run[key]
        for key in ("id", "head_sha", "run_attempt", "updated_at", "status", "conclusion")
    }
    activated = (
        datetime.fromisoformat(receipt["observed_at_utc"]) - timedelta(minutes=1)
    ).isoformat()
    receipt.update(
        schema="npcink.production_workstation_baseline.v2",
        previous_workflow=anchor,
        activation_completed_at_utc=activated,
        cancelled_upload_log_sha256="f" * 64,
    )
    evidence.update(
        schema="npcink.production_workstation_observation.v2",
        activation_completed_at_utc=activated,
        installation_complete=True,
        one_off_lock_absent=True,
        public_revision=receipt["installed_sha"][:12],
        cancelled_upload={
            "workflow": anchor,
            "last_phase": "upload deploy bundle",
            "remote_installation_started": False,
            "log_sha256": "f" * 64,
        },
    )
    for container in evidence["containers"]:
        container["image_matches_exact_bundle"] = True
    return observation


def test_reviewed_workstation_activation_reconciles_exact_cancelled_upload(
    cancelled_upload_observation,
):
    observation = cancelled_upload_observation
    save(observation)
    assert (
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], missing=True))
        == observation[1]["installed_sha"]
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", 11),
        ("run_attempt", 2),
        ("head_sha", "e" * 40),
        ("updated_at", "2026-11-09T00:00:00Z"),
        ("status", "in_progress"),
        ("conclusion", "failure"),
        ("path", ".github/workflows/other.yml"),
    ],
)
def test_cancelled_upload_anchor_drift_still_blocks(cancelled_upload_observation, field, value):
    observation = cancelled_upload_observation
    save(observation)
    observation[3][field] = value
    with pytest.raises(ValueError):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], missing=True))


@pytest.mark.parametrize(
    "field,value",
    [
        ("installation_complete", False),
        ("one_off_lock_absent", False),
        ("public_revision", "wrong"),
        ("cancelled_upload", {}),
    ],
)
def test_cancelled_upload_requires_complete_installed_proof(
    cancelled_upload_observation, field, value
):
    observation = cancelled_upload_observation
    observation[2][field] = value
    save(observation)
    with pytest.raises(ValueError, match="successful activation|proof types"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], missing=True))


def test_cancellation_after_activation_is_not_reconciled_by_a_later_observation(
    cancelled_upload_observation,
):
    observation = cancelled_upload_observation
    observation[1]["activation_completed_at_utc"] = observation[3]["updated_at"]
    observation[2]["activation_completed_at_utc"] = observation[3]["updated_at"]
    save(observation)
    with pytest.raises(ValueError, match="cancelled upload reconciliation"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]], missing=True))


def test_cancelled_upload_cannot_override_retained_runtime_evidence(cancelled_upload_observation):
    observation = cancelled_upload_observation
    save(observation)
    with pytest.raises(ValueError, match="retained runtime evidence"):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([observation[3]]))


@pytest.mark.parametrize("conclusion", [None, "failure", "cancelled", "success"])
def test_later_unproven_attempt_still_blocks_cancelled_upload_recovery(
    cancelled_upload_observation, conclusion
):
    observation = cancelled_upload_observation
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "updated_at": datetime.now(UTC).isoformat(),
        "conclusion": conclusion,
    }
    with pytest.raises(ValueError):
        BASELINE.resolve_baseline(REPOSITORY, fake_api([later, observation[3]], missing=True))


def test_later_runtime_supersedes_cancelled_upload_reconciliation(cancelled_upload_observation):
    observation = cancelled_upload_observation
    save(observation)
    later = {
        **observation[3],
        "id": 11,
        "head_sha": "e" * 40,
        "updated_at": datetime.now(UTC).isoformat(),
        "conclusion": "success",
    }
    assert (
        BASELINE.resolve_baseline(REPOSITORY, fake_api([later, observation[3]]))
        == later["head_sha"]
    )
