from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check_changed.py"
PYTHON_QUALITY = ROOT / "scripts" / "check-changed-python-quality.sh"
MYPY_TARGETED = ROOT / "scripts" / "mypy-targeted.sh"


def _plan(*paths: str) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(CHECKER), "--plan", "--format", "json", *paths],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_documentation_plan_stays_local_and_focused() -> None:
    plan = _plan("AGENTS.md", "docs/development-validation-operating-model-v1.md")

    assert plan["classification"]["documentation_only"] is True
    assert ["git", "diff", "--check"] in plan["commands"]
    assert ["bash", "scripts/check-release-policy.sh"] in plan["commands"]
    assert not any("m4:preview" in " ".join(command) for command in plan["commands"])


def test_admin_plan_selects_static_gates_and_reports_browser_followup() -> None:
    plan = _plan(
        "frontend/src/app/admin/accounts/page.tsx",
        "frontend/tests/unit/admin-account-detail-v2-contract.mjs",
    )

    assert plan["classification"]["admin"] is True
    assert ["pnpm", "--dir", "frontend", "run", "type-check"] in plan["commands"]
    assert ["node", "frontend/tests/unit/admin-account-detail-v2-contract.mjs"] in plan["commands"]
    assert any("PC browser" in item for item in plan["followups"])


def test_build_runtime_plan_never_mutates_m4_automatically() -> None:
    plan = _plan("Dockerfile", "app/main.py")

    assert plan["classification"]["build_runtime"] is True
    assert any("runtime fingerprint" in item for item in plan["followups"])
    assert not any("m4:preview" in " ".join(command) for command in plan["commands"])


def test_explicit_path_cannot_escape_repository() -> None:
    completed = subprocess.run(
        [sys.executable, str(CHECKER), "--plan", "../outside.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "outside the repository" in completed.stderr


def test_changed_python_gates_support_one_shared_worktree_environment() -> None:
    for script in (PYTHON_QUALITY, MYPY_TARGETED):
        source = script.read_text(encoding="utf-8")
        assert "NPCINK_CLOUD_PYTHON_BIN" in source
        assert '"${PYTHON_BIN}"' in source
