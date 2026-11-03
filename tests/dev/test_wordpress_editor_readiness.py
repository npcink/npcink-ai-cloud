from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from scripts import wordpress_editor_readiness as readiness


@pytest.mark.parametrize("prefix", [[], ["--"]])
@pytest.mark.parametrize("cloud_ready", [True, False])
def test_forwarded_options_preserve_checks_and_exit_status(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    prefix: list[str],
    cloud_ready: bool,
) -> None:
    monkeypatch.delenv("NPCINK_WP_MYSQL_SOCKET", raising=False)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "wordpress_editor_readiness.py",
            *prefix,
            "--json",
            "--wp-root",
            str(tmp_path),
            "--cloud-url",
            "http://cloud.invalid:18010",
            "--timeout",
            "0.25",
            "--addon-plugin",
            "custom-addon",
        ],
    )
    monkeypatch.setattr(
        readiness.shutil, "which", lambda name: {"wp": "/mock/wp", "php": "/mock/php"}.get(name)
    )
    commands: list[list[str]] = []
    cloud_calls: list[tuple[str, float]] = []

    def fake_run(command: list[str], timeout: float) -> dict[str, Any]:
        assert timeout == 0.25
        commands.append(command)
        return {"status": "ok"}

    def fake_cloud_check(url: str, timeout: float) -> dict[str, Any]:
        cloud_calls.append((url, timeout))
        return {"status": "ok" if cloud_ready else "unavailable"}

    monkeypatch.setattr(readiness, "run", fake_run)
    monkeypatch.setattr(readiness, "cloud_check", fake_cloud_check)

    assert readiness.main() == (0 if cloud_ready else 1)
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == ("ready" if cloud_ready else "blocked")
    assert report["failures"] == ([] if cloud_ready else ["cloud"])
    assert report["write_operations"] is False
    assert cloud_calls == [("http://cloud.invalid:18010", 0.25)]
    assert all(command[:2] == ["/mock/wp", f"--path={tmp_path}"] for command in commands)
    assert any(command[-3:] == ["plugin", "is-active", "custom-addon"] for command in commands)


@pytest.mark.parametrize("prefix", [[], ["--"]])
def test_help_exits_before_any_readiness_checks(prefix: list[str]) -> None:
    result = subprocess.run(
        [sys.executable, readiness.__file__, *prefix, "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "--json" in result.stdout
    assert "--wp-root" in result.stdout


@pytest.mark.parametrize(
    "arguments",
    [["--unknown-option"], ["--", "--unknown-option"], ["--json", "--", "--help"]],
)
def test_unknown_arguments_and_later_separator_remain_errors(
    monkeypatch: pytest.MonkeyPatch,
    arguments: list[str],
) -> None:
    monkeypatch.setattr(sys, "argv", ["wordpress_editor_readiness.py", *arguments])
    with pytest.raises(SystemExit) as error:
        readiness.main()
    assert error.value.code == 2
