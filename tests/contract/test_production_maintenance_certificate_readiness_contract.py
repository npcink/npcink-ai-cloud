from __future__ import annotations

import os
import shlex
import subprocess
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/production-maintenance.yml"
DEPLOY_WORKFLOW = ROOT / ".github/workflows/deploy-production.yml"


def _resolver_script() -> str:
    source = WORKFLOW.read_text(encoding="utf-8")
    start_marker = '            local current_link="${remote_dir}/current"\n'
    end_marker = '            [ -f "${receipt}" ] && [ ! -L "${receipt}" ] || {\n'
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    resolver = source[start:end]
    return textwrap.dedent(resolver)


def _deploy_resolver_script() -> str:
    source = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
    start_marker = '          current_link="${remote_dir}/current"\n'
    end_marker = '          test -f "${receipt}"\n'
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    resolver = source[start:end].replace("exit 1", "return 1")
    return textwrap.dedent(resolver)


def _run_resolver(
    tmp_path: Path, setup: str, *, deploy: bool = False
) -> subprocess.CompletedProcess[str]:
    managed_root = tmp_path / "managed-root"
    managed_root.mkdir()
    if setup:
        subprocess.run(
            ["bash", "-c", setup],
            cwd=managed_root,
            check=True,
        )
    script = "\n".join(
        (
            "set -euo pipefail",
            f"remote_dir=$(cd {shlex.quote(str(managed_root))} && pwd -P)",
            'current_release=""',
            "guard() {",
            textwrap.indent(
                _deploy_resolver_script() if deploy else _resolver_script(), "  "
            ),
            "}",
            "guard",
            "printf 'receipt-check\\n'",
        )
    )
    return subprocess.run(
        ["bash", "-c", script],
        env=os.environ.copy(),
        text=True,
        capture_output=True,
        check=False,
    )


def test_absent_current_is_allowed_for_first_install(tmp_path: Path) -> None:
    result = _run_resolver(tmp_path, "")
    assert result.returncode == 0, result.stderr
    assert "no current release" in result.stdout
    assert "receipt-check" in result.stdout


def test_regular_current_path_fails_closed(tmp_path: Path) -> None:
    result = _run_resolver(tmp_path, "touch current")
    assert result.returncode != 0
    assert "must be a symbolic link" in result.stderr


def test_broken_current_symlink_fails_closed(tmp_path: Path) -> None:
    result = _run_resolver(tmp_path, "ln -s release-missing current")
    assert result.returncode != 0
    assert "symlink is broken" in result.stderr


def test_out_of_root_current_symlink_fails_closed(tmp_path: Path) -> None:
    result = _run_resolver(
        tmp_path,
        "mkdir -p ../outside-release; ln -s ../outside-release current",
    )
    assert result.returncode != 0
    assert "outside the managed root" in result.stderr


def test_managed_current_symlink_is_allowed(tmp_path: Path) -> None:
    result = _run_resolver(
        tmp_path,
        "mkdir release-20260813; ln -s release-20260813 current",
    )
    assert result.returncode == 0, result.stderr
    assert "receipt-check" in result.stdout


@pytest.mark.parametrize("deploy", [False, True], ids=["maintenance", "deploy"])
def test_nested_current_release_fails_before_receipt_or_bundle_work(
    tmp_path: Path, deploy: bool
) -> None:
    result = _run_resolver(
        tmp_path,
        "mkdir -p release-20260813/subdir; ln -s release-20260813/subdir current",
        deploy=deploy,
    )
    assert result.returncode != 0
    assert "direct managed release child" in result.stderr
    assert "receipt-check" not in result.stdout


@pytest.mark.parametrize("deploy", [False, True], ids=["maintenance", "deploy"])
def test_invalid_current_release_name_fails_before_receipt_or_bundle_work(
    tmp_path: Path, deploy: bool
) -> None:
    result = _run_resolver(
        tmp_path,
        "mkdir 'release-invalid:name'; ln -s 'release-invalid:name' current",
        deploy=deploy,
    )
    assert result.returncode != 0
    assert "direct managed release child" in result.stderr
    assert "receipt-check" not in result.stdout
