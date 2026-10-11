from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "audit_worktrees.py"


def _module():
    spec = importlib.util.spec_from_file_location("audit_worktrees", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_porcelain_parser_preserves_lock_reason_and_branch() -> None:
    module = _module()
    entries = module.parse_porcelain(
        "worktree /tmp/main\nHEAD abc\nbranch refs/heads/master\n\n"
        "worktree /tmp/task\nHEAD def\nbranch refs/heads/codex/task\nlocked codex:task-1\n\n"
    )

    assert entries[0]["branch"] == "refs/heads/master"
    assert entries[1]["locked"] is True
    assert entries[1]["lock_reason"] == "codex:task-1"


def test_audit_script_contains_no_worktree_mutation_command() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    for forbidden in (
        '"worktree", "remove"',
        '"worktree", "unlock"',
        '"worktree", "prune"',
        '"branch", "-D"',
    ):
        assert forbidden not in source
    assert '"mutation_performed": False' in source


def test_branch_reconciliation_reports_tracking_unique_commits_and_pr(monkeypatch) -> None:
    module = _module()
    responses = iter(
        [
            SimpleNamespace(returncode=0, stdout="origin/codex/task\n", stderr=""),
            SimpleNamespace(returncode=0, stdout="2\t3\n", stderr=""),
            SimpleNamespace(
                returncode=0,
                stdout="+ aaa\n- bbb\n+ ccc\n- ddd\n+ eee\n+ fff\n",
                stderr="",
            ),
        ]
    )
    monkeypatch.setattr(module, "run_command", lambda _command: next(responses))

    result = module.branch_reconciliation(
        Path("/tmp/task"),
        "codex/task",
        {
            "codex/task": [
                {
                    "number": 42,
                    "state": "OPEN",
                    "updatedAt": "2026-08-13T00:00:00Z",
                }
            ]
        },
        None,
    )

    assert result["upstream"] == "origin/codex/task"
    assert result["behind"] == 2
    assert result["ahead"] == 3
    assert result["unique_commits_vs_origin_master"] == 4
    assert result["represented_commits_vs_origin_master"] == 2
    assert result["pull_request"]["number"] == 42


def test_pull_request_lookup_failure_is_evidence_gap(monkeypatch) -> None:
    module = _module()
    monkeypatch.setattr(
        module,
        "run_command",
        lambda _command: SimpleNamespace(
            returncode=1, stdout="", stderr="authentication required"
        ),
    )

    pull_requests, error = module.load_pull_requests()

    assert pull_requests == {}
    assert error == "authentication required"


def test_pull_request_lookup_limit_is_evidence_gap(monkeypatch) -> None:
    module = _module()
    rows = [
        {"headRefName": f"codex/task-{index}", "number": index, "state": "MERGED"}
        for index in range(1000)
    ]
    monkeypatch.setattr(
        module,
        "run_command",
        lambda _command: SimpleNamespace(
            returncode=0, stdout=json.dumps(rows), stderr=""
        ),
    )

    pull_requests, error = module.load_pull_requests()

    assert len(pull_requests) == 1000
    assert error == "GitHub PR lookup reached its 1000-row safety limit"


def test_select_pull_request_prefers_open_over_merged() -> None:
    module = _module()

    selected = module.select_pull_request(
        [
            {
                "number": 10,
                "state": "MERGED",
                "mergedAt": "2026-08-13T02:00:00Z",
                "updatedAt": "2026-08-13T02:00:00Z",
            },
            {
                "number": 11,
                "state": "OPEN",
                "mergedAt": None,
                "updatedAt": "2026-08-13T01:00:00Z",
            },
        ]
    )

    assert selected["number"] == 11


@pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="worktree audit integration requires repository Git metadata",
)
def test_audit_accepts_pnpm_separator() -> None:
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), "--", "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    payload = json.loads(completed.stdout)

    assert payload["schema_version"] == 2
    assert payload["mutation_performed"] is False
    assert payload["entries"]
    assert {
        "upstream",
        "ahead",
        "behind",
        "unique_commits_vs_origin_master",
        "represented_commits_vs_origin_master",
        "pull_request",
        "pull_request_evidence_error",
        "protected_role_markers",
        "recommended_disposition",
    } <= payload["entries"][0].keys()
