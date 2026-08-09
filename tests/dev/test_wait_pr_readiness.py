from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "wait-pr-readiness.py"


def _load_waiter():
    spec = importlib.util.spec_from_file_location("wait_pr_readiness", SCRIPT_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


waiter = _load_waiter()


def _pr(*checks: dict[str, str], state: str = "OPEN") -> dict[str, object]:
    return {
        "state": state,
        "mergeStateStatus": "CLEAN",
        "statusCheckRollup": list(checks),
    }


def test_waiter_reports_pending_checks() -> None:
    result = waiter.evaluate_readiness(
        _pr({"name": "backend", "status": "IN_PROGRESS", "conclusion": ""}),
        [],
    )

    assert result.state == "pending"
    assert "backend" in result.message


def test_waiter_treats_pending_status_context_as_pending() -> None:
    result = waiter.evaluate_readiness(
        _pr({"context": "legacy-ci", "state": "PENDING"}),
        [],
    )

    assert result.state == "pending"
    assert "legacy-ci" in result.message


def test_waiter_fails_early_on_unresolved_review_threads() -> None:
    result = waiter.evaluate_readiness(
        _pr({"name": "backend", "status": "IN_PROGRESS", "conclusion": ""}),
        [{
            "isResolved": False,
            "isOutdated": True,
            "comments": {"nodes": [{"path": "app/api/routes/portal.py", "body": "P1: leak"}]},
        }],
    )

    assert result.state == "review_required"
    assert "app/api/routes/portal.py" in result.message


def test_waiter_accepts_successful_and_skipped_checks() -> None:
    result = waiter.evaluate_readiness(
        _pr(
            {"name": "backend", "status": "COMPLETED", "conclusion": "SUCCESS"},
            {"name": "optional", "status": "COMPLETED", "conclusion": "SKIPPED"},
        ),
        [{"isResolved": True, "comments": {"nodes": []}}],
    )

    assert result.state == "ready"


def test_waiter_reports_failed_checks() -> None:
    result = waiter.evaluate_readiness(
        _pr({"name": "backend", "status": "COMPLETED", "conclusion": "FAILURE"}),
        [],
    )

    assert result.state == "failed"
    assert "backend=FAILURE" in result.message


def test_waiter_surfaces_a_remaining_merge_block_after_checks_pass() -> None:
    pr = _pr({"name": "backend", "status": "COMPLETED", "conclusion": "SUCCESS"})
    pr["mergeStateStatus"] = "BLOCKED"

    result = waiter.evaluate_readiness(pr, [])

    assert result.state == "blocked"
    assert "branch protection" in result.message


def test_waiter_does_not_report_unknown_merge_state_as_ready() -> None:
    pr = _pr({"name": "backend", "status": "COMPLETED", "conclusion": "SUCCESS"})
    pr["mergeStateStatus"] = "UNKNOWN"

    result = waiter.evaluate_readiness(pr, [])

    assert result.state == "pending"


def test_waiter_blocks_draft_pull_requests() -> None:
    pr = _pr({"name": "backend", "status": "COMPLETED", "conclusion": "SUCCESS"})
    pr["isDraft"] = True

    result = waiter.evaluate_readiness(pr, [])

    assert result.state == "blocked"


def test_waiter_treats_empty_check_rollup_as_pending() -> None:
    result = waiter.evaluate_readiness(_pr(), [])

    assert result.state == "pending"


def test_waiter_accepts_already_merged_pull_request() -> None:
    result = waiter.evaluate_readiness(_pr(state="MERGED"), [])

    assert result.state == "ready"


def test_cli_accepts_the_pnpm_argument_separator() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--",
            "--pr",
            "1",
            "--interval",
            "0",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )

    assert completed.returncode == 2
    assert "interval, timeout, and settle-polls must be positive" in completed.stderr
