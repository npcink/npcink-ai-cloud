from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from scripts.provider_call_ledger import (
    LedgerError,
    claim_dispatch,
    close_ledger,
    initialize_ledger,
    read_status,
    resolve_state_directory,
)

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "provider_call_ledger.py"


def test_initialize_claim_and_close_fail_closed(tmp_path: Path) -> None:
    state_dir = tmp_path / "shared"
    initialized = initialize_ledger(
        state_dir,
        experiment_id="provider-trial-001",
        max_calls=3,
        item_budgets={"title-e2e": 1, "browser-cohort": 2},
    )

    assert initialized["remaining_calls"] == 3
    assert initialized["idempotent_replay"] is False
    assert (state_dir / "provider-trial-001.json").stat().st_mode & 0o777 == 0o600

    first = claim_dispatch(
        state_dir,
        experiment_id="provider-trial-001",
        item_id="title-e2e",
        dispatch_id="title-dispatch-001",
    )
    replay = claim_dispatch(
        state_dir,
        experiment_id="provider-trial-001",
        item_id="title-e2e",
        dispatch_id="title-dispatch-001",
    )

    assert first["provider_dispatch_allowed"] is True
    assert first["experiment_remaining_calls"] == 2
    assert replay["idempotent_replay"] is True
    assert replay["experiment_claimed_calls"] == 1

    with pytest.raises(LedgerError, match="item call budget exhausted"):
        claim_dispatch(
            state_dir,
            experiment_id="provider-trial-001",
            item_id="title-e2e",
            dispatch_id="title-dispatch-002",
        )

    closed = close_ledger(
        state_dir,
        experiment_id="provider-trial-001",
        reason_code="operator-stop",
    )
    assert closed["status"] == "closed"

    with pytest.raises(LedgerError, match="ledger is closed"):
        claim_dispatch(
            state_dir,
            experiment_id="provider-trial-001",
            item_id="browser-cohort",
            dispatch_id="browser-dispatch-001",
        )


def test_initialization_requires_exact_reserved_total_and_is_idempotent(
    tmp_path: Path,
) -> None:
    state_dir = tmp_path / "shared"
    with pytest.raises(LedgerError, match="add up exactly"):
        initialize_ledger(
            state_dir,
            experiment_id="provider-trial-002",
            max_calls=3,
            item_budgets={"title-e2e": 1},
        )

    first = initialize_ledger(
        state_dir,
        experiment_id="provider-trial-002",
        max_calls=3,
        item_budgets={"title-e2e": 1, "browser-cohort": 2},
    )
    replay = initialize_ledger(
        state_dir,
        experiment_id="provider-trial-002",
        max_calls=3,
        item_budgets={"browser-cohort": 2, "title-e2e": 1},
    )

    assert first["idempotent_replay"] is False
    assert replay["idempotent_replay"] is True

    with pytest.raises(LedgerError, match="different budget"):
        initialize_ledger(
            state_dir,
            experiment_id="provider-trial-002",
            max_calls=4,
            item_budgets={"title-e2e": 1, "browser-cohort": 3},
        )


def test_concurrent_cli_claims_never_exceed_the_shared_budget(tmp_path: Path) -> None:
    state_dir = tmp_path / "shared"
    initialize_ledger(
        state_dir,
        experiment_id="provider-trial-003",
        max_calls=7,
        item_budgets={"real-provider": 7},
    )

    def claim(index: int) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--state-dir",
                str(state_dir),
                "claim",
                "--experiment-id",
                "provider-trial-003",
                "--item-id",
                "real-provider",
                "--dispatch-id",
                f"dispatch-{index:03d}",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

    with ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(claim, range(20)))

    successes = [result for result in results if result.returncode == 0]
    failures = [result for result in results if result.returncode != 0]
    status = read_status(state_dir, experiment_id="provider-trial-003")

    assert len(successes) == 7
    assert len(failures) == 13
    assert status["claimed_calls"] == 7
    assert status["remaining_calls"] == 0
    assert status["items"]["real-provider"]["remaining_calls"] == 0
    assert all("budget exhausted" in result.stderr for result in failures)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("raw_prompt", "must never be accepted", "unknown or missing fields"),
        ("experiment_id", "different-experiment", "identity does not match"),
    ],
)
def test_corrupt_or_expanded_ledger_fails_closed(
    tmp_path: Path,
    field: str,
    value: str,
    message: str,
) -> None:
    state_dir = tmp_path / "shared"
    initialize_ledger(
        state_dir,
        experiment_id="provider-trial-004",
        max_calls=1,
        item_budgets={"real-provider": 1},
    )
    path = state_dir / "provider-trial-004.json"
    payload = json.loads(path.read_text())
    payload[field] = value
    path.write_text(json.dumps(payload))

    with pytest.raises(LedgerError, match=message):
        claim_dispatch(
            state_dir,
            experiment_id="provider-trial-004",
            item_id="real-provider",
            dispatch_id="dispatch-001",
        )


def test_symbolic_link_lock_and_ledger_are_rejected(tmp_path: Path) -> None:
    state_dir = tmp_path / "shared"
    state_dir.mkdir()
    unrelated = tmp_path / "unrelated"
    unrelated.write_text("{}")
    (state_dir / "provider-trial-005.lock").symlink_to(unrelated)

    with pytest.raises(LedgerError, match="lock is unsafe"):
        initialize_ledger(
            state_dir,
            experiment_id="provider-trial-005",
            max_calls=1,
            item_budgets={"real-provider": 1},
        )

    (state_dir / "provider-trial-005.lock").unlink()
    (state_dir / "provider-trial-005.json").symlink_to(unrelated)
    with pytest.raises(LedgerError, match="must not be a symbolic link"):
        initialize_ledger(
            state_dir,
            experiment_id="provider-trial-005",
            max_calls=1,
            item_budgets={"real-provider": 1},
        )


def test_default_state_directory_is_shared_by_git_worktrees(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    worktree = tmp_path / "worktree"
    repository.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repository, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--allow-empty",
            "-qm",
            "init",
        ],
        cwd=repository,
        check=True,
    )
    subprocess.run(
        ["git", "worktree", "add", "-q", "-b", "test-worktree", str(worktree)],
        cwd=repository,
        check=True,
    )

    assert resolve_state_directory(repository) == resolve_state_directory(worktree)
