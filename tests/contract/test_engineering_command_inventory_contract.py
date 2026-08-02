from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check_engineering_command_inventory.py"


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
    assert all(
        protected_consumers.isdisjoint(command["observed_usage"])
        for command in deprecated
    )
