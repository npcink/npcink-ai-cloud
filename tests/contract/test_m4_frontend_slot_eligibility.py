from __future__ import annotations

from scripts.m4_frontend_slot_eligibility import evaluate

BASE = {
    "acceptance_state": "accepted",
    "source_branch": "master",
    "source_dirty": "false",
    "source_revision": "master-revision",
    "backend_input_sha256": "backend-stable",
    "image_input_sha256": "image-stable",
    "config_input_sha256": "config-stable",
}


def check(state: dict[str, str], **overrides: str | bool) -> dict[str, str]:
    inputs: dict[str, str | bool] = {
        "primary_lock_active": False,
        "api_health": "healthy",
        "source_base_revision": "master-revision",
        "backend_input_sha": "backend-stable",
        "image_input_sha": "image-stable",
        "config_input_sha": "config-stable",
    }
    inputs.update(overrides)
    return evaluate(state, **inputs)  # type: ignore[arg-type]


def test_clean_accepted_primary_is_startable() -> None:
    result = check(BASE)
    assert result == {
        "primary_acceptance_state": "accepted",
        "backend_compatibility": "accepted",
        "primary_startable": "true",
        "primary_block_reason": "none",
    }


def test_frontend_only_candidate_can_reuse_the_accepted_backend() -> None:
    candidate = {
        **BASE,
        "acceptance_state": "candidate",
        "source_branch": "codex/ui-task",
        "source_dirty": "true",
        "accepted_source_revision": "master-revision",
        "accepted_backend_input_sha256": "backend-stable",
    }
    result = check(candidate)
    assert result["primary_startable"] == "true"
    assert result["backend_compatibility"] == "candidate_compatible"
    assert result["primary_block_reason"] == "none"


def test_backend_candidate_still_fails_closed() -> None:
    candidate = {
        **BASE,
        "acceptance_state": "candidate",
        "backend_input_sha256": "backend-candidate",
        "accepted_source_revision": "master-revision",
        "accepted_backend_input_sha256": "backend-stable",
    }
    result = check(candidate)
    assert result["primary_startable"] == "false"
    assert result["backend_compatibility"] == "incompatible"
    assert result["primary_block_reason"] == "primary_candidate_backend_changed"


def test_frontend_slot_rejects_a_worktree_with_backend_changes() -> None:
    result = check(BASE, backend_input_sha="backend-worktree")
    assert result["primary_startable"] == "false"
    assert result["primary_block_reason"] == "worktree_backend_changed"


def test_status_reasons_are_specific_and_fail_closed() -> None:
    assert check({}, api_health="missing")["primary_block_reason"] == "primary_state_missing"
    assert (
        check(BASE, primary_lock_active=True)["primary_block_reason"] == "primary_operation_active"
    )
    assert check(BASE, api_health="unhealthy")["primary_block_reason"] == "primary_api_unhealthy"
    assert (
        check(BASE, image_input_sha="other")["primary_block_reason"]
        == "dependency_fingerprint_mismatch"
    )
    assert (
        check(BASE, config_input_sha="other")["primary_block_reason"]
        == "config_fingerprint_mismatch"
    )
