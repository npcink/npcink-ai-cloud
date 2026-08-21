from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check_changed.py"
PYTHON_QUALITY = ROOT / "scripts" / "check-changed-python-quality.sh"
MYPY_TARGETED = ROOT / "scripts" / "mypy-targeted.sh"


def _plan(
    *paths: str, workflow_lane: str = "development"
) -> dict[str, object]:
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--plan",
            "--format",
            "json",
            "--workflow-lane",
            workflow_lane,
            *paths,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


@pytest.mark.parametrize(
    ("workflow_lane", "pr_required", "production_required"),
    [("development", False, False), ("merge", True, False), ("release", True, True)],
)
def test_empty_json_plan_is_machine_readable(
    monkeypatch, capsys, workflow_lane, pr_required, production_required
) -> None:
    spec = importlib.util.spec_from_file_location("check_changed", CHECKER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "collect_changed_paths", lambda _base: [])
    monkeypatch.setattr(
        sys,
        "argv",
        [str(CHECKER), "--plan", "--format", "json", "--workflow-lane", workflow_lane],
    )

    assert module.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["paths"] == []
    assert result["specialized_commands"] == []
    assert result["tier"] == "L0"
    assert result["runtime_lane"] == "none"
    assert result["pr_required"] is pr_required
    assert result["production_required"] is production_required


def test_empty_json_doctor_preserves_normal_envelope(monkeypatch, capsys) -> None:
    spec = importlib.util.spec_from_file_location("check_changed_doctor", CHECKER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "collect_changed_paths", lambda _base: [])
    monkeypatch.setattr(module, "environment_checks", lambda _plan, _python: [])
    monkeypatch.setattr(
        sys,
        "argv",
        [str(CHECKER), "--doctor", "--format", "json", "--workflow-lane", "release"],
    )

    assert module.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["plan"]["paths"] == []
    assert result["plan"]["production_required"] is True
    assert result["environment_checks"] == []


def test_documentation_plan_stays_local_and_focused() -> None:
    plan = _plan("AGENTS.md", "docs/development-validation-operating-model-v1.md")

    assert plan["classification"]["documentation_only"] is True
    assert ["git", "diff", "--check", "origin/master...HEAD"] in plan["commands"]
    assert ["git", "diff", "--cached", "--check"] in plan["commands"]
    assert ["git", "diff", "--check"] in plan["commands"]
    assert ["bash", "scripts/check-release-policy.sh"] in plan["commands"]
    assert plan["workflow_lane"] == "development"
    assert plan["target_elapsed_minutes"] == 45
    assert plan["pr_required"] is False
    assert plan["production_required"] is False
    assert plan["closeout_authority"] == "local"
    assert plan["runtime_lane"] == "none"
    assert plan["stop_conditions"]
    assert not any("m4:preview" in " ".join(command) for command in plan["commands"])


def test_admin_plan_selects_static_gates_and_reports_browser_followup() -> None:
    plan = _plan(
        "frontend/src/app/admin/accounts/page.tsx",
        "frontend/tests/unit/admin-account-detail-v2-contract.mjs",
    )

    assert plan["classification"]["admin"] is True
    assert ["pnpm", "--dir", "frontend", "run", "type-check"] in plan["commands"]
    assert [
        "pnpm",
        "--dir",
        "frontend",
        "exec",
        "node",
        "tests/unit/admin-account-detail-v2-contract.mjs",
    ] in plan["commands"]
    assert [
        "node",
        "frontend/tests/unit/admin-account-detail-v2-contract.mjs",
    ] not in plan["commands"]
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


def test_mixed_frontend_and_backend_change_uses_highest_risk_tier() -> None:
    plan = _plan("frontend/src/app/portal/page.tsx", "app/core/security.py")

    assert plan["classification"]["frontend"] is True
    assert plan["classification"]["python"] is True
    assert plan["tier"] == "L2"
    assert any("mixed frontend changes" in item for item in plan["tier_reasons"])
    assert plan["runtime_lane"] == "m4:preview:sync"


def test_frontend_and_script_change_uses_highest_risk_tier() -> None:
    plan = _plan("frontend/src/app/portal/page.tsx", "scripts/check_changed.py")

    assert plan["classification"]["frontend"] is True
    assert plan["classification"]["python"] is True
    assert plan["tier"] == "L2"


def test_frontend_and_repository_policy_change_uses_highest_risk_tier() -> None:
    plan = _plan(
        "frontend/src/app/portal/page.tsx",
        "docs/development-validation-operating-model-v1.md",
    )

    assert plan["classification"]["frontend"] is True
    assert plan["classification"]["documentation_only"] is False
    assert plan["tier"] == "L2"


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
    assert plan["runtime_lane"] == "m4:preview:deploy"


def test_engineering_tooling_uses_github_actions_runtime_lane() -> None:
    plan = _plan("scripts/ai_task.py")

    assert plan["workflow_lane"] == "development"
    assert plan["closeout_authority"] == "local"
    assert plan["runtime_lane"] == "github-actions"


def test_cloud_source_and_build_inputs_keep_development_as_default() -> None:
    source_plan = _plan("app/main.py")
    build_plan = _plan("Dockerfile")

    assert source_plan["workflow_lane"] == "development"
    assert source_plan["runtime_lane"] == "m4:preview:sync"
    assert source_plan["pr_required"] is False
    assert build_plan["workflow_lane"] == "development"
    assert build_plan["runtime_lane"] == "m4:preview:deploy"
    assert build_plan["production_required"] is False


def test_explicit_merge_lane_changes_closeout_without_reclassifying_risk() -> None:
    development = _plan("app/main.py")
    merge = _plan("app/main.py", workflow_lane="merge")

    assert merge["workflow_lane"] == "merge"
    assert merge["target_elapsed_minutes"] == 90
    assert merge["pr_required"] is True
    assert merge["production_required"] is False
    assert merge["closeout_authority"] == "m4"
    assert merge["tier"] == development["tier"]
    assert merge["runtime_lane"] == development["runtime_lane"]
    assert merge["commands"] == development["commands"]


def test_explicit_release_lane_declares_but_does_not_authorize_production() -> None:
    plan = _plan("app/main.py", workflow_lane="release")

    assert plan["workflow_lane"] == "release"
    assert plan["target_elapsed_minutes"] == 120
    assert plan["pr_required"] is True
    assert plan["production_required"] is True
    assert plan["closeout_authority"] == "production"
    assert any("does not authorize" in item for item in plan["followups"])


def test_invalid_workflow_lane_fails_closed() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--plan",
            "--workflow-lane",
            "automatic-production",
            "README.md",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "invalid choice" in completed.stderr


def test_text_plan_reports_workflow_lane_and_stop_conditions() -> None:
    completed = subprocess.run(
        [sys.executable, str(CHECKER), "--plan", "README.md"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert "[plan] workflow lane: development" in completed.stdout
    assert "[plan] target elapsed minutes: 45" in completed.stdout
    assert "[plan] PR required: false" in completed.stdout
    assert "[stop] Stop scope expansion after a second independent blocker" in completed.stdout


def test_planned_commands_are_unique() -> None:
    plan = _plan("tests/contract/test_check_changed_contract.py")
    commands = [tuple(command) for command in plan["commands"]]

    assert len(commands) == len(set(commands))


def test_doctor_fails_before_python_gate_when_interpreter_is_missing() -> None:
    environment = os.environ.copy()
    environment["NPCINK_CLOUD_PYTHON_BIN"] = "/missing/npcink-python"
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--doctor",
            "--format",
            "json",
            "scripts/ai_task.py",
        ],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    payload = json.loads(completed.stdout)
    python_check = next(
        item for item in payload["environment_checks"] if item["id"] == "python"
    )
    assert python_check["status"] == "missing"
    assert python_check["required"] is True
    assert payload["plan"]["runtime_lane"] == "github-actions"


def test_doctor_reports_ready_exact_python_and_advisory_github_cli() -> None:
    environment = os.environ.copy()
    environment["NPCINK_CLOUD_PYTHON_BIN"] = sys.executable
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--doctor",
            "--format",
            "json",
            "scripts/ai_task.py",
        ],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    payload = json.loads(completed.stdout)
    checks = {item["id"]: item for item in payload["environment_checks"]}
    assert checks["python"]["status"] == "ready"
    assert checks["github_cli"]["required"] is False


def test_doctor_requires_python_for_inventory_only_plan() -> None:
    environment = os.environ.copy()
    environment["PATH"] = "/missing"
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--doctor",
            "--format",
            "json",
            "config/engineering-command-inventory-v1.json",
        ],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    payload = json.loads(completed.stdout)
    python_check = next(
        item for item in payload["environment_checks"] if item["id"] == "python"
    )
    assert python_check["status"] == "missing"
    assert "python3" in python_check["detail"]


def test_doctor_requires_node_for_frontend_workspace_contract() -> None:
    environment = os.environ.copy()
    environment["PATH"] = "/missing"
    completed = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--doctor",
            "--format",
            "json",
            "frontend/tests/unit/portal-package-contract.mjs",
        ],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    payload = json.loads(completed.stdout)
    node_check = next(
        item for item in payload["environment_checks"] if item["id"] == "node"
    )
    assert node_check["status"] == "missing"
    assert node_check["required"] is True


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
