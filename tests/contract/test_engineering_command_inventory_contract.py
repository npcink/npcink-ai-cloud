from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check_engineering_command_inventory.py"


def _write_synthetic_bundle(root: Path, *, initialize_git: bool = False) -> Path:
    (root / "config").mkdir(parents=True)
    (root / "frontend").mkdir()
    (root / "scripts").mkdir()
    shutil.copy2(CHECKER, root / "scripts" / CHECKER.name)
    (root / "package.json").write_text(
        json.dumps({"name": "npcink-ai-cloud", "scripts": {"alpha": "true"}}),
        encoding="utf-8",
    )
    (root / "frontend" / "package.json").write_text(
        json.dumps({"name": "frontend", "scripts": {"beta": "true"}}),
        encoding="utf-8",
    )
    (root / "README.md").write_text(
        "# Npcink AI Cloud\n\nRun `pnpm run alpha`.\n", encoding="utf-8"
    )
    inventory = {
        "schema_version": 1,
        "profiles": {
            "read_only": {
                "environments": ["authoring_mac"],
                "effect": "read_only",
                "approval": "none",
            }
        },
        "groups": [
            {
                "package": "root",
                "profile": "read_only",
                "owner_doc": "README.md",
                "used_by": ["contract"],
                "evidence": ["README.md"],
                "status": "active",
                "commands": {"alpha": "Synthetic root command."},
            },
            {
                "package": "frontend",
                "profile": "read_only",
                "owner_doc": "README.md",
                "used_by": ["manual"],
                "evidence": ["README.md"],
                "status": "active",
                "commands": {"beta": "Synthetic frontend command."},
            },
        ],
    }
    (root / "config" / "engineering-command-inventory-v1.json").write_text(
        json.dumps(inventory), encoding="utf-8"
    )
    if initialize_git:
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        subprocess.run(["git", "add", "."], cwd=root, check=True)
    return root / "scripts" / CHECKER.name


def _run_checker(checker: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(checker), "--format", "json"],
        cwd=checker.parents[1],
        check=False,
        capture_output=True,
        text=True,
    )


def _command(payload: dict[str, object], name: str) -> dict[str, object]:
    commands = payload["commands"]
    assert isinstance(commands, list)
    return next(command for command in commands if command["name"] == name)


def test_engineering_command_inventory_covers_both_packages() -> None:
    result = subprocess.run(
        [sys.executable, str(CHECKER), "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)

    root_scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))[
        "scripts"
    ]
    frontend_scripts = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )["scripts"]

    assert payload["counts"] == {
        "root": len(root_scripts),
        "frontend": len(frontend_scripts),
        "total": len(root_scripts) + len(frontend_scripts),
    }


def test_any_deprecated_commands_keep_replacement_and_removal_evidence() -> None:
    result = subprocess.run(
        [sys.executable, str(CHECKER), "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    commands = json.loads(result.stdout)["commands"]
    deprecated = [command for command in commands if command["status"] == "deprecated"]

    assert all(command["replacement"] for command in deprecated)
    assert all(command["removal_condition"] for command in deprecated)
    protected_consumers = {"ci", "release", "runbook", "contract"}
    assert all(protected_consumers.isdisjoint(command["observed_usage"]) for command in deprecated)


def test_checker_uses_filesystem_fallback_without_git_metadata(tmp_path: Path) -> None:
    checker = _write_synthetic_bundle(tmp_path / "bundle")

    completed = _run_checker(checker)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert _command(payload, "alpha")["observed_evidence"] == ["README.md"]


def test_no_git_bundle_nested_in_outer_worktree_uses_filesystem_fallback(
    tmp_path: Path,
) -> None:
    outer = tmp_path / "outer-worktree"
    outer.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=outer, check=True)
    checker = _write_synthetic_bundle(outer / "bundle")

    completed = _run_checker(checker)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert _command(payload, "alpha")["observed_evidence"] == ["README.md"]


def test_git_worktree_keeps_git_ls_files_authority_for_untracked_files(
    tmp_path: Path,
) -> None:
    bundle = tmp_path / "worktree"
    checker = _write_synthetic_bundle(bundle, initialize_git=True)
    (bundle / "untracked.md").write_text("Run `pnpm --dir frontend run beta`.\n", encoding="utf-8")

    completed = _run_checker(checker)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert _command(payload, "beta")["observed_usage"] == ["manual"]
    assert _command(payload, "beta")["observed_evidence"] == []


def test_filesystem_fallback_still_rejects_deleted_package_commands(
    tmp_path: Path,
) -> None:
    bundle = tmp_path / "bundle"
    checker = _write_synthetic_bundle(bundle)
    (bundle / "package.json").write_text(
        json.dumps({"name": "npcink-ai-cloud", "scripts": {}}), encoding="utf-8"
    )

    completed = _run_checker(checker)

    assert completed.returncode == 1
    assert "not present in package scripts: alpha" in completed.stderr


def test_filesystem_fallback_ignores_generated_directory_pollution(
    tmp_path: Path,
) -> None:
    bundle = tmp_path / "bundle"
    checker = _write_synthetic_bundle(bundle)
    for relative_directory in (
        ".venv/generated",
        "node_modules/generated",
        "frontend/.next/cache",
        ".pytest_cache/generated",
        ".runtime/generated",
        ".tmp/generated",
        "build/generated",
        "dist/generated",
        "nested/__pycache__",
    ):
        generated = bundle / relative_directory
        generated.mkdir(parents=True)
        (generated / "caller.md").write_text(
            "Run `pnpm --dir frontend run beta`.\n", encoding="utf-8"
        )
    (bundle / "generated.png").write_bytes(
        b"Run `pnpm --dir frontend run beta`.\n"
    )

    completed = _run_checker(checker)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert _command(payload, "beta")["observed_usage"] == ["manual"]
    assert _command(payload, "beta")["observed_evidence"] == []


def test_filesystem_fallback_fails_closed_for_wrong_repository_root(
    tmp_path: Path,
) -> None:
    checker = tmp_path / "wrong-root" / "scripts" / CHECKER.name
    checker.parent.mkdir(parents=True)
    shutil.copy2(CHECKER, checker)

    completed = _run_checker(checker)

    assert completed.returncode == 1
    assert "not a trusted repository root" in completed.stderr


def test_filesystem_fallback_fails_closed_for_symlink_escape(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    checker = _write_synthetic_bundle(bundle)
    outside = tmp_path / "outside.md"
    outside.write_text("Run `pnpm --dir frontend run beta`.\n", encoding="utf-8")
    (bundle / "escape.md").symlink_to(outside)

    completed = _run_checker(checker)

    assert completed.returncode == 1
    assert "symlink" in completed.stderr


def test_filesystem_fallback_fails_closed_for_directory_symlink(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    checker = _write_synthetic_bundle(bundle)
    target = bundle / "linked-source"
    target.mkdir()
    (bundle / "source-alias").symlink_to(target, target_is_directory=True)

    completed = _run_checker(checker)

    assert completed.returncode == 1
    assert "directory symlink" in completed.stderr


def test_filesystem_fallback_fails_closed_for_special_file(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    checker = _write_synthetic_bundle(bundle)
    os.mkfifo(bundle / "generated.png")

    completed = _run_checker(checker)

    assert completed.returncode == 1
    assert "non-regular source path" in completed.stderr
