from __future__ import annotations

import importlib.util
import json
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


def test_task_plan_writes_structured_ignored_envelope(tmp_path: Path, monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setattr(module, "validate_task_worktree", lambda _base: None)
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


def test_task_plan_rejects_non_task_branch(monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setattr(
        module,
        "git_text",
        lambda *args, **_kwargs: "master" if args[:2] == ("branch", "--show-current") else "",
    )

    try:
        module.validate_task_worktree("origin/master")
    except SystemExit as exc:
        assert "dedicated codex/* branch" in str(exc)
    else:
        raise AssertionError("non-task branch was accepted")


def test_task_plan_rejects_published_topic_branch(monkeypatch) -> None:
    module = _load_module()

    def fake_git_text(*args, **_kwargs):
        if args[:2] == ("branch", "--show-current"):
            return "codex/already-published"
        if args[:3] == ("rev-parse", "--abbrev-ref", "--symbolic-full-name"):
            return "origin/codex/already-published"
        return ""

    monkeypatch.setattr(module, "git_text", fake_git_text)

    try:
        module.validate_task_worktree("origin/master")
    except SystemExit as exc:
        assert "already tracks origin/codex/already-published" in str(exc)
    else:
        raise AssertionError("published topic branch was accepted")


def test_task_plan_rejects_branch_behind_current_base(monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setattr(module, "git_text", lambda *args, **_kwargs: (
        "codex/stale-task" if args[:2] == ("branch", "--show-current") else ""
    ))

    class Completed:
        returncode = 1

    monkeypatch.setattr(module.subprocess, "run", lambda *_args, **_kwargs: Completed())

    try:
        module.validate_task_worktree("origin/master")
    except SystemExit as exc:
        assert "does not contain current origin/master" in str(exc)
    else:
        raise AssertionError("stale task branch was accepted")


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
            "runtime_lane": "github-actions",
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
    assert receipt["runtime_lane"] == "github-actions"
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
        "runtime_lane": "github-actions",
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


def test_negative_resource_budget_is_rejected(tmp_path: Path, monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setattr(module, "validate_task_worktree", lambda _base: None)
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


def test_pnpm_style_separator_is_parsed_before_task_planning(
    tmp_path: Path, monkeypatch
) -> None:
    module = _load_module()
    output = tmp_path / "pnpm-envelope.json"
    captured: dict[str, object] = {}

    def fake_create_envelope(args):
        captured["args"] = args
        return output, {"plan": {"tier": "L2"}}

    monkeypatch.setattr(module, "create_envelope", fake_create_envelope)
    monkeypatch.setattr(
        module.sys,
        "argv",
        [
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
    )

    assert module.main() == 0
    args = captured["args"]
    assert args.task_id == "pnpm-contract"
    assert args.paths == ["app/domain/agent_feedback/service.py"]


def test_successful_verification_is_reusable_only_for_exact_identity() -> None:
    module = _load_module()
    commands = [["python3", "-m", "pytest", "tests/contract/test_ai_task_contract.py"]]
    envelope = {
        "base_revision": "base-sha",
        "verification_runs": [
            {
                "status": "passed",
                "base_revision": "base-sha",
                "source_fingerprint_after": "source-sha",
                "commands": [{"command": commands[0], "status": "passed"}],
            }
        ],
    }

    assert module.reusable_verification(
        envelope, {"commands": commands}, "source-sha"
    ) is not None
    assert module.reusable_verification(
        envelope, {"commands": commands}, "changed-source"
    ) is None
    assert module.reusable_verification(
        envelope, {"commands": [["python3", "--version"]]}, "source-sha"
    ) is None
