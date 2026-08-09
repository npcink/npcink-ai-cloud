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
    assert ["git", "diff", "--check", "origin/master...HEAD"] in plan["commands"]
    assert ["git", "diff", "--cached", "--check"] in plan["commands"]
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
    assert plan["tier"] == "L1"
    assert "admin_ui" in plan["domains"]
    assert ["pnpm", "run", "check:admin-ui"] in plan["specialized_commands"]
    assert "docs/cloud-admin-ui-standard-v1.md" in plan["documents"]
    assert any("PC browser" in item for item in plan["followups"])


def test_shared_admin_primitive_reclassifies_to_l2() -> None:
    plan = _plan("frontend/src/components/admin/AdminWorkbenchDialog.tsx")

    assert plan["tier"] == "L2"
    assert "admin_shared_primitive" in plan["domains"]
    assert any("check:admin-ui:visual" in item for item in plan["followups"])


def test_non_admin_frontend_route_defaults_to_l1() -> None:
    plan = _plan("frontend/src/app/portal/page.tsx")

    assert plan["classification"]["frontend"] is True
    assert plan["tier"] == "L1"


def test_agent_feedback_plan_selects_boundary_context_and_quality_gate() -> None:
    plan = _plan("app/domain/agent_feedback/service.py")

    assert plan["tier"] == "L2"
    assert plan["domains"] == ["agent_feedback_quality"]
    assert "docs/cloud-agent-feedback-quality-gate-v1.md" in plan["documents"]
    assert ["pnpm", "run", "check:agent-feedback-quality"] in plan["specialized_commands"]
    assert plan["commands"].count(
        ["pnpm", "run", "check:agent-feedback-quality"]
    ) == 1


def test_editor_assist_plan_selects_no_auto_mutation_gate() -> None:
    plan = _plan("app/domain/observability/editor_assist_quality.py")

    assert "editor_assist_quality" in plan["domains"]
    assert ["pnpm", "run", "check:editor-assist-quality"] in plan["specialized_commands"]
    assert any("automatic prompt" in item for item in plan["followups"])


def test_boundary_document_is_not_misclassified_as_low_risk_docs_only() -> None:
    plan = _plan("docs/cloud-content-generation-boundary-v1.md")

    assert plan["classification"]["documentation_only"] is True
    assert plan["tier"] == "L2"
    assert "cloud_boundary" in plan["domains"]
    assert ["pnpm", "run", "check:anti-drift"] in plan["specialized_commands"]


def test_all_specialized_pnpm_commands_exist() -> None:
    package_scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    plans = [
        _plan("app/domain/agent_feedback/service.py"),
        _plan("app/domain/observability/editor_assist_quality.py"),
        _plan("app/domain/agent_workflow_metadata.py"),
        _plan("docs/runtime-stability-performance-evidence-v1.md"),
        _plan("docs/cloud-content-generation-boundary-v1.md"),
        _plan("frontend/src/app/admin/accounts/page.tsx"),
    ]

    for plan in plans:
        for command in plan["specialized_commands"]:
            assert command[:2] == ["pnpm", "run"]
            assert command[2] in package_scripts


def test_build_runtime_plan_never_mutates_m4_automatically() -> None:
    plan = _plan("Dockerfile", "app/main.py")

    assert plan["tier"] == "L2"
    assert plan["classification"]["build_runtime"] is True
    assert any("runtime fingerprint" in item for item in plan["followups"])
    assert not any("m4:preview" in " ".join(command) for command in plan["commands"])


def test_frontend_build_runtime_input_promotes_plan_to_l2() -> None:
    plan = _plan("frontend/package.json")

    assert plan["classification"]["frontend"] is True
    assert plan["classification"]["build_runtime"] is True
    assert plan["tier"] == "L2"


def test_m4_fingerprint_inputs_request_deploy_followup() -> None:
    for path in (
        ".dockerignore",
        "pnpm-workspace.yaml",
        "scripts/m4-preview.sh",
        "scripts/m4-package-proxy.py",
        "scripts/redact-m4-preview-logs.py",
    ):
        plan = _plan(path)
        assert plan["classification"]["build_runtime"] is True
        assert any("m4:preview:deploy" in item for item in plan["followups"])


def test_migration_uses_source_sync_and_high_risk_evidence() -> None:
    plan = _plan("migrations/versions/20260803_example.py")

    assert plan["classification"]["migration"] is True
    assert plan["classification"]["build_runtime"] is False
    assert any("m4:preview:sync" in item for item in plan["followups"])
    assert any("migration-head" in item for item in plan["followups"])


def test_frontend_vitest_change_runs_the_changed_test() -> None:
    plan = _plan("frontend/tests/vitest/admin-create-account-form.test.ts")

    assert [
        "pnpm",
        "--dir",
        "frontend",
        "exec",
        "vitest",
        "run",
        "tests/vitest/admin-create-account-form.test.ts",
    ] in plan["commands"]


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


def test_changed_path_collection_includes_deletions() -> None:
    source = CHECKER.read_text(encoding="utf-8")

    assert source.count("--diff-filter=ACMRD") == 3
