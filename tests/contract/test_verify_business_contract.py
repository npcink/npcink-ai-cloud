from __future__ import annotations

import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "verify_business", ROOT / "scripts/verify_business.py"
)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def test_plan_from_another_directory_has_no_live_lane(tmp_path: Path) -> None:
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/verify-local.sh"), "--business", "--plan"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    plan = json.loads(result.stdout)
    assert tuple(plan["areas"]) == runner.AREAS
    assert plan["complete"] is plan["production_accepted"] is False
    assert plan["m4"] == plan["production"] == plan["real_provider_calls"] == "not_run"
    assert all(
        area["production_status"] == "not_run" and area["production_gap"]
        for area in plan["areas"].values()
    )
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize(
    "xml",
    [
        "<testsuites/>",
        '<testsuites><testcase classname="tests.api.example" name="test_expected">'
        "<skipped/></testcase></testsuites>",
        '<testsuites><testcase classname="tests.api.example" name="test_expected">'
        "<failure/></testcase></testsuites>",
        '<testsuites><testcase classname="tests.api.example" name="test_other"/></testsuites>',
    ],
)
def test_missing_skipped_failed_or_wrong_cloud_cases_fail(tmp_path: Path, xml: str) -> None:
    path = tmp_path / "cases.xml"
    path.write_text(xml)
    with pytest.raises(ValueError):
        runner.verify_cloud_evidence(path, ["tests/api/example.py::test_expected"])


def test_parameter_cases_require_every_selected_function(tmp_path: Path) -> None:
    path = tmp_path / "cases.xml"
    path.write_text(
        '<testsuites><testcase classname="tests.api.example" name="test_expected[a]"/>'
        '<testcase classname="tests.api.example" name="test_expected[b]"/></testsuites>'
    )
    assert runner.verify_cloud_evidence(path, ["tests/api/example.py::test_expected"]) == 2
    with pytest.raises(ValueError):
        runner.verify_cloud_evidence(
            path, ["tests/api/example.py::test_expected", "tests/api/example.py::test_missing"]
        )


def test_php_safety_or_missing_prerequisite_is_verified(tmp_path: Path, monkeypatch) -> None:
    php = shutil.which("php")
    if not php:
        monkeypatch.setattr(runner.critical, "prerequisites", lambda *a: [])
        assert "PHP CLI is required; no automatic installation" in runner.prerequisites(
            None, runner.load_manifest()
        )
        return
    probe = tmp_path / "probe.php"
    probe.write_text(
        "<?php echo json_encode(array('ini'=>php_ini_loaded_file(),"
        "'url'=>ini_get('allow_url_fopen'),'exec'=>function_exists('exec'),"
        "'socket'=>function_exists('stream_socket_client'),"
        "'curl'=>function_exists('curl_exec'), 'proc'=>function_exists('proc_open')));"
    )
    command = runner.php_command(php, tmp_path, probe.name)
    result = subprocess.run(
        command, env=runner.critical.clean_environment(), capture_output=True, text=True, check=True
    )
    assert result.stdout.endswith(f"\n{runner.PHP_COMPLETED}\n")
    assert json.loads(result.stdout.splitlines()[0]) == {
        "ini": False,
        "url": "0",
        "exec": False,
        "socket": False,
        "curl": False,
        "proc": False,
    }


@pytest.mark.parametrize("text", ["", "[ok] partial\n", "[ok] partial\n[fail] denied\n"])
def test_partial_php_success_cannot_be_reported_as_complete(tmp_path: Path, text: str) -> None:
    log = tmp_path / "php.log"
    log.write_text(text)
    with pytest.raises(ValueError):
        runner.verify_php_evidence(log)


def test_addon_snapshot_excludes_working_changes(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (
        ("init",),
        ("config", "user.name", "Fixture"),
        ("config", "user.email", "fixture@example.test"),
    ):
        runner.git(repo, *args)
    (repo / "fixture.php").write_text("committed")
    runner.git(repo, "add", "fixture.php")
    runner.git(repo, "commit", "-m", "fixture")
    (repo / "fixture.php").write_text("other session work")
    (repo / "untracked.txt").write_text("not part of candidate")
    snapshot = tmp_path / "snapshot"
    identity = runner.snapshot_addon(repo, snapshot)
    assert identity["source_checkout_dirty"] is True
    assert identity["working_changes_excluded"] is True
    assert (snapshot / "fixture.php").read_text() == "committed"
    assert not (snapshot / "untracked.txt").exists()
    assert (repo / "fixture.php").read_text() == "other session work"


@pytest.mark.parametrize("kind", [tarfile.SYMTYPE, tarfile.REGTYPE])
def test_unsafe_archive_is_rejected(tmp_path: Path, monkeypatch, kind: bytes) -> None:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        entry = tarfile.TarInfo("../escape" if kind == tarfile.REGTYPE else "link")
        entry.type = kind
        entry.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
        archive.addfile(entry)
    monkeypatch.setattr(runner, "git", lambda *a: "head")
    monkeypatch.setattr(runner.subprocess, "check_output", lambda *a, **kw: buffer.getvalue())
    with pytest.raises(ValueError, match="unsafe"):
        runner.snapshot_addon(tmp_path, tmp_path / "snapshot")
    assert not (tmp_path.parent / "escape").exists()


def test_manifest_names_exact_existing_cloud_functions() -> None:
    data = runner.load_manifest()
    for node in runner.selectors(data, "cloud"):
        path, function = node.split("::")
        assert f"def {function}(" in (ROOT / path).read_text()


def test_child_failure_prevents_following_step(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="exited 7"):
        runner.run_command(
            [sys.executable, "-c", "raise SystemExit(7)"], tmp_path, tmp_path / "failed.log"
        )


def test_failure_receipt_never_claims_production_or_local_completion(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    monkeypatch.setattr(runner, "prerequisites", lambda *a: [])
    monkeypatch.setattr(runner, "git", lambda *a: "head")
    monkeypatch.setattr(runner.critical, "working_tree_hash", lambda: "hash")
    monkeypatch.setattr(runner, "snapshot_addon", lambda *a: {"head": "addon-head"})

    def fail(*_args):
        raise ValueError("intentional failure")

    monkeypatch.setattr(runner, "run_command", fail)
    monkeypatch.setattr(sys, "argv", ["verify_business", "--addon-root", str(tmp_path)])
    assert runner.main() == 1
    receipt = json.loads(
        next((tmp_path / ".tmp/business-acceptance").glob("*/receipt.json")).read_text()
    )
    assert receipt["complete"] is receipt["production_accepted"] is False
    assert len(receipt["steps"]) == 1
    assert receipt["steps"][0]["status"] == "failed"
    assert all(area["local_status"] == "not_run" for area in receipt["areas"].values())
