from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from argparse import Namespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "ai_task.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("ai_task_contract", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_task_plan_writes_structured_ignored_envelope(tmp_path: Path) -> None:
    module = _load_module()
    output = tmp_path / "task.json"
    args = Namespace(
        task_id="validation-router-test",
        module="engineering validation tooling",
        outcome="Select exact validation evidence.",
        non_goal=["No M4 mutation."],
        public_contract=["pnpm run check:changed"],
        rollback="Revert the tooling change.",
        base="origin/master",
        output=str(output),
        elapsed_minutes=30,
        provider_calls=0,
        full_gate_executions=0,
        image_builds=0,
        shared_runtime_operations=0,
        paths=["app/domain/agent_feedback/service.py"],
    )

    written, payload = module.create_envelope(args)

    assert written == output
    assert payload["schema_version"] == 1
    assert payload["plan"]["tier"] == "L2"
    assert payload["plan"]["domains"] == ["agent_feedback_quality"]
    assert payload["base_revision"]
    assert payload["budgets"]["provider_calls"] == 0
    assert json.loads(output.read_text(encoding="utf-8"))["task_id"] == "validation-router-test"


def test_stale_plan_fails_closed(monkeypatch) -> None:
    module = _load_module()
    envelope = {
        "base_ref": "origin/master",
        "base_revision": "base-sha",
        "plan": {"paths": ["README.md"]},
    }
    monkeypatch.setattr(module, "git_text", lambda *_args, **_kwargs: "base-sha")
    monkeypatch.setattr(module.check_changed, "collect_changed_paths", lambda _base: ["AGENTS.md"])

    try:
        module.rebuild_and_validate_plan(envelope, "python3")
    except SystemExit as exc:
        assert "task plan is stale" in str(exc)
    else:
        raise AssertionError("stale task plan did not fail closed")


def test_receipt_requires_current_successful_verification(monkeypatch) -> None:
    module = _load_module()
    state = {"branch": "codex/test", "head": "abc", "status_short": "", "clean": True}
    monkeypatch.setattr(module, "repository_state", lambda: state)
    monkeypatch.setattr(module, "source_fingerprint", lambda _paths: "content-hash")
    monkeypatch.setattr(module, "plan_source_is_current", lambda _envelope: True)
    envelope = {
        "task_id": "receipt-test",
        "base_revision": "base-sha",
        "budgets": {},
        "change": {
            "focused_module": "tooling",
            "intended_outcome": "receipt",
            "non_goals": [],
            "public_contracts": [],
            "expected_files": ["scripts/ai_task.py"],
            "rollback": "revert",
        },
        "plan": {
            "paths": ["scripts/ai_task.py"],
            "tier": "L2",
            "tier_reasons": ["shared tooling"],
            "documents": [],
            "domains": ["engineering_validation_tooling"],
            "followups": [],
        },
        "verification_runs": [
            {
                "status": "passed",
                "base_revision": "base-sha",
                "commands": [],
                "source_state_after": {**state, "head": "pre-commit"},
                "source_fingerprint_after": "content-hash",
            }
        ],
    }

    receipt = module.receipt_payload(envelope)

    assert receipt["verification_current"] is True
    assert receipt["highest_evidence_state"] == "local verified"
    assert "AI_TASK_RECEIPT" in module.receipt_markdown(receipt)


def test_tampered_saved_command_is_rejected(monkeypatch) -> None:
    module = _load_module()
    expected_plan = {
        "paths": ["scripts/ai_task.py"],
        "classification": {},
        "tier": "L2",
        "tier_reasons": [],
        "domains": ["engineering_validation_tooling"],
        "documents": [],
        "commands": [["python3", "-m", "compileall", "scripts"]],
        "specialized_commands": [],
        "followups": [],
    }
    envelope = {
        "base_ref": "origin/master",
        "base_revision": "base-sha",
        "plan": {**expected_plan, "commands": [["sh", "-c", "unexpected"]]},
    }
    monkeypatch.setattr(module, "git_text", lambda *_args, **_kwargs: "base-sha")
    monkeypatch.setattr(
        module.check_changed,
        "collect_changed_paths",
        lambda _base: ["scripts/ai_task.py"],
    )
    monkeypatch.setattr(
        module.check_changed,
        "build_plan",
        lambda _paths, _python, _base: expected_plan,
    )

    try:
        module.rebuild_and_validate_plan(envelope, "python3")
    except SystemExit as exc:
        assert "plan definition changed at commands" in str(exc)
    else:
        raise AssertionError("tampered command was accepted")


def test_negative_resource_budget_is_rejected(tmp_path: Path) -> None:
    module = _load_module()
    args = Namespace(
        task_id="invalid-budget",
        module="tooling",
        outcome="Reject invalid budgets.",
        non_goal=[],
        public_contract=[],
        rollback="No file should be written.",
        base="origin/master",
        output=str(tmp_path / "invalid.json"),
        elapsed_minutes=30,
        provider_calls=-1,
        full_gate_executions=0,
        image_builds=0,
        shared_runtime_operations=0,
        paths=["scripts/ai_task.py"],
    )

    try:
        module.create_envelope(args)
    except SystemExit as exc:
        assert "resource budgets non-negative" in str(exc)
    else:
        raise AssertionError("negative budget did not fail closed")


def test_pnpm_style_separator_is_accepted(tmp_path: Path) -> None:
    output = tmp_path / "pnpm-envelope.json"
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "plan",
            "--",
            "--task-id",
            "pnpm-contract",
            "--outcome",
            "Prove pnpm separator compatibility.",
            "--rollback",
            "Delete the temporary envelope.",
            "--output",
            str(output),
            "app/domain/agent_feedback/service.py",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    assert output.exists()
