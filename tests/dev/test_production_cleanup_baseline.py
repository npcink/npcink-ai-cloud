"""Cleanup evidence can recover planning without making a failed deployment green."""

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from test_production_deployed_baseline import BASELINE, REPOSITORY
from test_production_workstation_baseline import observation  # noqa: F401


@pytest.fixture
def cleanup(request):
    path, receipt, evidence, run = request.getfixturevalue("observation")
    path = path.with_name("production-cleanup-baseline.json")
    run.update(status="completed", conclusion="failure", head_sha=receipt["installed_sha"])
    receipt.update(
        schema="npcink.production_cleanup_baseline.v1",
        failed_workflow=dict(run),
        failed_phase="finalize-rollback-image-tags",
        recovery_source_revision="e" * 40,
        recovery_helper_sha256="f" * 64,
        recovery_output_sha256="d" * 64,
        failed_marker_sha256="c" * 64,
        recovery_completed_at_utc=(datetime.now(UTC) - timedelta(minutes=90)).isoformat(),
    )
    timing = {
        "schema": "npcink.release_timing.v1",
        "kind": "production_deploy_phases",
        "repository": REPOSITORY,
        "head_sha": run["head_sha"],
        "workflow_run_id": str(run["id"]),
        "release_lane": "backend",
        "release_action": "runtime",
        "status": "failure",
        "deploy_exit_status": 1,
    }
    receipt["timing_sha256"] = hashlib.sha256(
        json.dumps(timing, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    for key in ("previous_workflow", "activation_log_sha256"):
        receipt.pop(key)
    evidence.update(
        {
            k: v
            for k, v in receipt.items()
            if k
            not in {
                "schema",
                "expires_at_utc",
                "observation_file",
            }
        }
    )
    evidence.update(
        schema="npcink.production_cleanup_observation.v1",
        current_release="release-test",
        one_off_lock_absent=True,
        installation_complete=True,
        public_revision=run["head_sha"][:12],
        repair={
            "schema": "npcink.production_terminalization_repair.v1",
            "status": "complete",
            "lane": "backend",
            "active_production_revision": run["head_sha"],
            "recovery_source_revision": "e" * 40,
            "release": "release-test",
            "service_switches": 0,
            "migration_attempts": 0,
            "provider_calls": 0,
            "rollback_tags_removed": 1,
            "active_services_proved": [c["service"] for c in evidence["containers"]],
        },
    )
    for c in evidence["containers"]:
        c["image_matches_intended_runtime"] = True
        c["image_matches_exact_bundle"] = c["service"] != "redis"
    return path, receipt, evidence, run, timing


def save(cleanup):
    path, receipt, evidence, _, _ = cleanup
    raw = json.dumps(evidence).encode()
    (path.parent / "production-baseline-observations/test-activation.json").write_bytes(raw)
    receipt["observation_sha256"] = hashlib.sha256(raw).hexdigest()
    path.write_text(json.dumps(receipt))


def resolve(cleanup, *, runs=None, missing=False):
    path, _, _, run, timing = cleanup

    def api(url):
        if "/workflows/deploy-production.yml/" in url:
            return json.dumps({"workflow_runs": runs or [run]}).encode()
        if "/runs/" in url:
            return json.dumps(
                {
                    "artifacts": []
                    if missing
                    else [
                        {
                            "id": 100,
                            "expired": False,
                            "size_in_bytes": 1000,
                            "name": f"production-deploy-timing-{run['id']}-{run['head_sha']}",
                        }
                    ]
                }
            ).encode()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("production-deploy-phase-timing.json", json.dumps(timing))
        return archive.getvalue()

    return BASELINE.resolve_baseline(REPOSITORY, api, cleanup_path=path)


def test_failed_deploy_with_reviewed_cleanup_is_installed_baseline(cleanup):
    save(cleanup)
    assert resolve(cleanup) == cleanup[1]["installed_sha"]
    assert cleanup[3]["conclusion"] == "failure"
    assert cleanup[2]["containers"][2]["image_matches_intended_runtime"] is True


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", 11),
        ("run_attempt", 2),
        ("head_sha", "a" * 40),
        ("updated_at", "2026-11-01T00:00:00Z"),
        ("status", "in_progress"),
        ("conclusion", "cancelled"),
        ("path", ".github/workflows/other.yml"),
    ],
)
def test_cleanup_never_hides_changed_or_later_unproven_attempt(cleanup, field, value):
    save(cleanup)
    cleanup[3][field] = value
    with pytest.raises(ValueError):
        resolve(cleanup)


@pytest.mark.parametrize(
    "field,value",
    [
        ("deployment_lock_absent", False),
        ("failed_cutover_marker_absent", False),
        ("one_off_lock_absent", False),
        ("installation_complete", False),
        ("public_revision", "wrong"),
        ("internal_operational_ready", False),
    ],
)
def test_cleanup_requires_independent_healthy_completed_observation(cleanup, field, value):
    cleanup[2][field] = value
    save(cleanup)
    with pytest.raises(ValueError, match="observation is incomplete"):
        resolve(cleanup)


@pytest.mark.parametrize(
    "field,value",
    [
        ("service_switches", 1),
        ("migration_attempts", 1),
        ("provider_calls", 1),
        ("status", "failed"),
        ("lane", "full"),
        ("active_services_proved", []),
    ],
)
def test_cleanup_only_recovery_is_required(cleanup, field, value):
    cleanup[2]["repair"][field] = value
    save(cleanup)
    with pytest.raises(ValueError, match="not cleanup-only"):
        resolve(cleanup)


def test_cleanup_rejects_unproved_preserved_redis(cleanup):
    next(c for c in cleanup[2]["containers"] if c["service"] == "redis")[
        "image_matches_intended_runtime"
    ] = False
    save(cleanup)
    with pytest.raises(ValueError, match="intended-runtime proof"):
        resolve(cleanup)


@pytest.mark.parametrize("missing", [False, True])
def test_cleanup_requires_unchanged_retained_failure_timing(cleanup, missing):
    save(cleanup)
    cleanup[4]["release_lane"] = "full"
    with pytest.raises(ValueError, match="retained failed backend timing"):
        resolve(cleanup, missing=missing)


def test_cleanup_rejects_changed_timing_even_when_identity_still_matches(cleanup):
    save(cleanup)
    cleanup[4]["remote_sequence_seconds"] = 999
    with pytest.raises(ValueError, match="retained timing changed"):
        resolve(cleanup)


def test_cleanup_rejects_observation_bytes_changed_after_review(cleanup):
    save(cleanup)
    path = cleanup[0].parent / "production-baseline-observations/test-activation.json"
    path.write_text(path.read_text() + "\n")
    with pytest.raises(ValueError, match="checksum mismatch"):
        resolve(cleanup)


def test_cleanup_anchor_does_not_accept_boolean_as_attempt_one(cleanup):
    cleanup[1]["failed_workflow"]["run_attempt"] = True
    save(cleanup)
    with pytest.raises(ValueError, match="exact failed deployment"):
        resolve(cleanup)


@pytest.mark.parametrize(
    "field,value",
    [
        ("expires_at_utc", "2026-01-01T00:00:00Z"),
        ("expires_at_utc", "2099-01-01T00:00:00Z"),
        ("recovery_completed_at_utc", "2099-01-01T00:00:00Z"),
        ("installed_tree", "0" * 40),
        ("observation_file", "../invalid.json"),
        ("recovery_helper_sha256", "invalid"),
        ("failed_phase", "migration"),
    ],
)
def test_cleanup_rejects_stale_or_malformed_proof(cleanup, field, value):
    cleanup[1][field] = value
    cleanup[2][field] = value
    save(cleanup)
    with pytest.raises(ValueError):
        resolve(cleanup)


def test_newer_successful_runtime_supersedes_cleanup_observation(cleanup):
    save(cleanup)
    cleanup[1]["expires_at_utc"] = "2026-01-01T00:00:00Z"
    save(cleanup)
    later = {
        **cleanup[3],
        "id": 11,
        "head_sha": "a" * 40,
        "updated_at": datetime.now(UTC).isoformat(),
        "conclusion": "success",
    }
    cleanup[4].update(
        head_sha=later["head_sha"],
        workflow_run_id="11",
        status="success",
        deploy_exit_status=0,
        phases=[{"label": "remote deploy sequence", "conclusion": "success", "exit_status": 0}],
    )
    cleanup[3].update(later)
    assert resolve(cleanup) == later["head_sha"]
