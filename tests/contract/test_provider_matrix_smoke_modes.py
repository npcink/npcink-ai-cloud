"""Execute the shell entrypoint with isolated commands and in-memory provider stubs."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy/remote-provider-matrix-smoke.sh"


@pytest.fixture
def smoke_sandbox(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    deploy = tmp_path / "deploy"
    deploy.mkdir()
    shutil.copyfile(SCRIPT, deploy / SCRIPT.name)
    # Loading even the common helpers is forbidden in default mode.
    (deploy / "common.sh").write_text("echo unexpected-common-load >&2; exit 99\n")
    commands = tmp_path / "bin"
    commands.mkdir()
    python_command = commands / "python3"
    python_command.write_text(
        f"#!{sys.executable}\n"
        + """
import runpy
import sys

def block_external(event, args):
    if event.startswith("socket.") or event == "subprocess.Popen":
        raise AssertionError("external I/O forbidden")
    if event == "import" and args[0].startswith("app") and args[0] not in sys.modules:
        raise AssertionError("real application import forbidden")
sys.addaudithook(block_external)
if sys.argv[1] == "-":
    exec(compile(sys.stdin.read(), "<stub-smoke>", "exec"))
else:
    runpy.run_path(sys.argv[1], run_name="__main__")
"""
    )
    python_command.chmod(0o755)
    (commands / "dirname").symlink_to(shutil.which("dirname"))
    for name in ("docker", "ssh", "curl"):
        command = commands / name
        command.write_text("#!/bin/sh\necho unexpected-external-command >&2\nexit 98\n")
        command.chmod(0o755)
    # No inherited credentials, application settings, PATH, or live-mode variables.
    env = {"PATH": str(commands), "LANG": "C", "NPCINK_CLOUD_SMOKE_LIVE": "1"}
    return deploy / SCRIPT.name, env


def run_smoke(
    sandbox: tuple[Path, dict[str, str]],
    *args: str,
) -> subprocess.CompletedProcess[str]:
    script, env = sandbox
    return subprocess.run(
        ["/bin/bash", str(script), *args],
        env=env,
        cwd=script.parent.parent,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )


@pytest.mark.parametrize("args", [(), ("--dry-run",)])
def test_default_and_dry_run_never_load_live_helpers(smoke_sandbox, args) -> None:
    result = run_smoke(smoke_sandbox, *args)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["mode"] == "dry-run"
    assert payload["live_validation"] is False
    assert payload["provider_truth"] == "local_stub_fixtures"
    assert payload["missing_capabilities"] == []
    assert payload["connection_tests"] == [{"provider_id": "stub", "kind": "stub", "ok": True}]
    assert result.stderr == ""


def test_stub_does_not_claim_support_for_unknown_capabilities(smoke_sandbox) -> None:
    smoke_sandbox[1]["NPCINK_CLOUD_REQUIRED_PROVIDER_CAPABILITIES"] = " text_generation,unknown "
    result = run_smoke(smoke_sandbox)
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert payload["missing_capabilities"] == ["unknown"]


@pytest.mark.parametrize(
    "args",
    [
        ("--bogus",),
        ("--live", "--dry-run"),
        ("--dry-run", "--live"),
        ("--live", "--live"),
        ("--live=yes",),
    ],
)
def test_invalid_arguments_fail_before_external_commands(smoke_sandbox, args) -> None:
    result = run_smoke(smoke_sandbox, *args)
    assert result.returncode == 2
    assert "Usage:" in result.stderr
    assert "unexpected" not in result.stderr


def test_help_needs_no_live_dependencies(smoke_sandbox) -> None:
    result = run_smoke(smoke_sandbox, "--help")
    assert result.returncode == 0
    assert "Provider charges" in result.stdout


@pytest.mark.parametrize("outcome,exit_code", [("ok", 0), ("failed", 1), ("error", 1)])
def test_explicit_live_uses_only_in_memory_connection_stubs(
    smoke_sandbox,
    outcome: str,
    exit_code: int,
) -> None:
    script, env = smoke_sandbox
    harness = script.parent / "live_harness.py"
    harness.write_text("""
import json
import os
import sys
import types

def module(name, **attrs):
    stub = types.ModuleType(name)
    stub.__dict__.update(attrs)
    sys.modules[name] = stub

class AdminError(Exception):
    code = "stub_error"

class Service:
    def __init__(self, *args): pass
    def list_connections(self):
        return {"connections": [{"connection_id": "fixture", "provider_id": "fixture",
            "enabled": True, "configured": True, "capability_ids": ["text_generation"]}]}
    def test_connection(self, connection_id):
        assert connection_id == "fixture"
        if os.environ["STUB_OUTCOME"] == "error": raise AdminError()
        return {"connection_id": connection_id, "ok": os.environ["STUB_OUTCOME"] == "ok"}

projection = types.SimpleNamespace(**{key: 1 for key in (
    "applied_count", "web_search_count", "image_source_count", "embedding_count",
    "rerank_count", "vector_store_count")})
module("app.core.config", Settings=lambda: types.SimpleNamespace(database_url="stub"))
module("app.adapters.providers.registry",
       resolve_live_provider_adapters=lambda *args, **kwargs: {"fixture": object()})
module("app.domain.provider_connections.runtime_settings",
       apply_provider_connection_runtime_settings=lambda settings: projection)
module("app.domain.provider_connections.service", ProviderConnectionAdminError=AdminError,
       ProviderConnectionAdminService=Service)
exec(compile(sys.stdin.read(), "<live-smoke-with-stubs>", "exec"))
""")
    (script.parent / "common.sh").write_text("""
npcink_ai_cloud_require_cmd() { [ "$1" = docker ]; }
npcink_ai_cloud_compose() {
    [ "$2" = exec ] && [ "$3" = -T ] && [ "$4" = -e ] || return 90
    [ "$5" = REQUIRED_CAPABILITIES=text_generation ] || return 91
    [ "$6" = api ] && [ "$7" = python ] && [ "$8" = - ] || return 92
    python3 "${ROOT_DIR}/deploy/live_harness.py"
}
""")
    env.update(STUB_OUTCOME=outcome, NPCINK_CLOUD_REQUIRED_PROVIDER_CAPABILITIES="text_generation")
    result = run_smoke(smoke_sandbox, "--live")
    assert result.returncode == exit_code, result.stderr
    payload = json.loads(result.stdout)
    assert payload["mode"] == "live"
    assert payload["live_validation"] is True
    assert payload["provider_truth"] == "db_managed_provider_connections"
    assert payload["registered_provider_ids"] == ["fixture"]
    assert len(payload["connection_tests"]) == 1
    assert bool(payload["test_failures"]) is (exit_code != 0)
