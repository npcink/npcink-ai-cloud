from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

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


def test_audit_accepts_pnpm_separator() -> None:
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), "--", "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert '"mutation_performed": false' in completed.stdout
