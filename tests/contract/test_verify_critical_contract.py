from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "verify_critical", ROOT / "scripts/verify_critical.py"
)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def test_critical_plan_from_another_directory_does_not_execute(tmp_path: Path) -> None:
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/verify-local.sh"), "--", "--critical", "--plan"],
        cwd=tmp_path, capture_output=True, text=True, check=True,
    )
    plan = json.loads(result.stdout)
    assert plan["selected"] == ["type-check", "contracts", "api", "browser"]
    assert plan["docker"] is False
    assert plan["m4"] == plan["production"] == "not_run"
    assert not list(tmp_path.iterdir())
    assert "-p" in plan["stages"]["api"][0]
    assert "scripts.critical_offline" in plan["stages"]["api"][0]


def test_children_do_not_inherit_credentials_external_targets_or_pytest_flags(monkeypatch) -> None:
    for key in ("NPCINK_CLOUD_OPENAI_API_KEY", "NPCINK_CLOUD_DATABASE_URL",
                "NPCINK_CLOUD_FRONTEND_BASE_URL",
                "NODE_OPTIONS", "PYTEST_ADDOPTS", "HTTPS_PROXY"):
        monkeypatch.setenv(key, "must-not-inherit")
    env = runner.clean_environment()
    assert all("must-not-inherit" != value for value in env.values())
    assert env["CLOUD_API_BASE_URL"] == "http://127.0.0.1:9"
    assert env["NPCINK_CLOUD_DATABASE_URL"] == "sqlite+pysqlite:///:memory:"
    assert env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] == "1"


@pytest.mark.parametrize("xml", [
    '<testsuites><testsuite tests="0"/></testsuites>',
    '<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>',
    '<testsuites><testsuite><testcase><failure/></testcase></testsuite></testsuites>',
])
def test_empty_skipped_or_failed_api_evidence_is_rejected(tmp_path: Path, xml: str) -> None:
    (tmp_path / "api.xml").write_text(xml)
    with pytest.raises(ValueError):
        runner.verify_evidence("api", tmp_path, {})


@pytest.mark.parametrize("titles,skipped", [([], 0), (["renamed test"], 0), (["expected"], 1)])
def test_missing_renamed_or_skipped_browser_case_is_not_green(
    tmp_path: Path, titles: list[str], skipped: int,
) -> None:
    report = {
        "stats": {"expected": len(titles), "unexpected": 0, "flaky": 0, "skipped": skipped},
        "suites": [{"specs": [{"title": title} for title in titles]}],
    }
    (tmp_path / "browser.json").write_text(json.dumps(report))
    with pytest.raises(ValueError):
        runner.verify_evidence("browser", tmp_path, {"browser_titles": ["expected"]})


def test_subprocess_failure_stops_the_stage(tmp_path: Path) -> None:
    sentinel = tmp_path / "must-not-run"
    commands = [
        [sys.executable, "-c", "raise SystemExit(7)"],
        [sys.executable, "-c", f"open({str(sentinel)!r}, 'w').close()"],
    ]
    with pytest.raises(ValueError, match="exited 7"):
        runner.run_stage("contracts", commands, tmp_path, {}, runner.clean_environment())
    assert not sentinel.exists()


def test_caught_network_attempt_still_fails_offline_suite(tmp_path: Path) -> None:
    test_file = tmp_path / "test_accidental_network.py"
    test_file.write_text(
        "import socket\n"
        "def test_caught_error():\n"
        "    with socket.socket() as s:\n"
        "        try:\n"
        "            s.connect(('192.0.2.1', 443))\n"
        "        except RuntimeError:\n"
        "            pass\n"
    )
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "scripts.critical_offline",
         str(test_file), "-q", "-o", "addopts="],
        cwd=ROOT, capture_output=True, text=True,
        env=runner.clean_environment(), timeout=30,
    )
    assert result.returncode != 0
    assert "offline network attempts: 1" in result.stdout


def test_manifest_paths_exist_and_browser_titles_are_unique() -> None:
    manifest = runner.load_manifest()
    for path in manifest["api_tests"]:
        assert (ROOT / path.split("::")[0]).is_file()
    for path in manifest["contracts"]:
        assert (ROOT / "frontend" / path).is_file()
    for path in manifest["browser_files"]:
        assert (ROOT / "frontend/tests/e2e" / path).is_file()


def test_source_change_invalidates_an_otherwise_passed_run(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    monkeypatch.setattr(runner, "prerequisites", lambda _selected: [])
    monkeypatch.setattr(runner.subprocess, "check_output", lambda *a, **kw: "fake-head\n")
    hashes = iter(["before", "after"])
    monkeypatch.setattr(runner, "working_tree_hash", lambda: next(hashes))
    monkeypatch.setattr(runner, "run_stage", lambda *a: None)
    monkeypatch.setattr(sys, "argv", ["verify_critical", "--only", "contracts"])
    assert runner.main() == 1
    report = next((tmp_path / ".tmp/critical-regression").glob("run-*/receipt.json"))
    receipt = json.loads(report.read_text())
    assert receipt["complete"] is False
    assert receipt["failure"] == "source_changed_during_run"
    assert receipt["selected"] == ["contracts"]


def test_committing_during_run_cannot_hide_source_change(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    monkeypatch.setattr(runner, "prerequisites", lambda _selected: [])
    # Both snapshots are clean and have the same empty diff; their HEADs differ.
    snapshots = iter(["before\n", "", "after\n"])
    monkeypatch.setattr(runner.subprocess, "check_output", lambda *a, **kw: next(snapshots))
    monkeypatch.setattr(runner, "working_tree_hash", lambda: "unchanged-empty-diff")
    monkeypatch.setattr(runner, "run_stage", lambda *a: None)
    monkeypatch.setattr(sys, "argv", ["verify_critical", "--only", "contracts"])
    assert runner.main() == 1
    report = next((tmp_path / ".tmp/critical-regression").glob("run-*/receipt.json"))
    receipt = json.loads(report.read_text())
    assert receipt["head"] == "before"
    assert receipt["source_dirty"] is False
    assert receipt["complete"] is False
    assert receipt["failure"] == "source_changed_during_run"
