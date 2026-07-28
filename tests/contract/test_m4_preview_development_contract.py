from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "m4-preview.sh"
REDACTOR = ROOT / "scripts" / "redact-m4-preview-logs.py"
PACKAGE_PROXY = ROOT / "scripts" / "m4-package-proxy.py"
OVERLAY = ROOT / "docker-compose.m4-preview.yml"
RUNBOOK = ROOT / "docs" / "m4-preview-development-v1.md"
AI_STANDARD = ROOT / "docs" / "m4-preview-ai-development-standard-v1.md"
VALIDATION_ADR = (
    ROOT / "docs" / "decisions" / "024-risk-tiered-development-validation-authority.md"
)
CHECKPOINT_ADR = (
    ROOT
    / "docs"
    / "decisions"
    / "025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md"
)
SOURCE_RELAY_ADR = (
    ROOT / "docs" / "decisions" / "026-private-source-relay-transfer.md"
)
SOURCE_RELAY_VALIDATION = (
    ROOT / "docs" / "m4-source-relay-transfer-validation-2026-07-24.md"
)
PACKAGE_PROXY_ADR = (
    ROOT / "docs" / "decisions" / "027-m4-package-proxy-streaming-cache.md"
)
PACKAGE_PROXY_VALIDATION = (
    ROOT
    / "docs"
    / "m4-package-proxy-streaming-cache-validation-2026-07-25.md"
)
OLLAMA_LAUNCH_AGENT = ROOT / "deploy" / "top.mqzj.npcink-ollama-preview.plist"


def test_m4_preview_commands_are_explicit() -> None:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]

    expected = {
        "m4:preview:prepare": "bash scripts/m4-preview.sh prepare",
        "m4:preview:deploy": "bash scripts/m4-preview.sh deploy",
        "m4:preview:sync": "bash scripts/m4-preview.sh sync",
        "m4:preview:promote": "bash scripts/m4-preview.sh promote",
        "m4:preview:tunnel": "bash scripts/m4-preview.sh tunnel",
        "m4:preview:auto": "bash scripts/m4-preview.sh tunnel --auto",
        "m4:preview:status": "bash scripts/m4-preview.sh status",
        "m4:preview:logs": "bash scripts/m4-preview.sh logs",
        "m4:preview:test": "bash scripts/m4-preview.sh test",
        "m4:preview:recover": "bash scripts/m4-preview.sh recover",
        "m4:preview:ollama:install": "bash scripts/m4-preview.sh ollama-install",
        "m4:preview:ollama:configure": "bash scripts/m4-preview.sh ollama-configure",
        "m4:preview:ollama:status": "bash scripts/m4-preview.sh ollama-status",
        "m4:preview:ollama:restart": "bash scripts/m4-preview.sh ollama-restart",
        "m4:preview:restart": "bash scripts/m4-preview.sh restart",
        "m4:preview:stop": "bash scripts/m4-preview.sh stop",
    }
    assert {name: scripts.get(name) for name in expected} == expected


def test_m4_preview_shell_contract_is_syntax_valid_and_fail_closed() -> None:
    subprocess.run(["bash", "-n", str(SCRIPT)], cwd=ROOT, check=True)
    source = SCRIPT.read_text(encoding="utf-8")

    assert "npcink-ai-cloud-m4-dev" in source
    assert "npcink-ai-cloud-m4-preview)" in source
    assert "legacy project name is forbidden" in source
    assert "operation.lock" in source
    assert 'if ! mkdir "${lock_dir}"' in source
    assert "lock_acquired=0" in source
    assert 'if [ "${lock_acquired}" = "1" ]; then' in source
    assert "built_image_marker" in source
    assert "deployed_image_marker" in source
    assert "deployed_config_marker" in source
    assert "prepared image inputs are not deployed" in source
    assert 'test ! -L "${remote_dir}"' in source
    assert 'resolved_remote_dir="$(cd "${remote_dir}" && pwd -P)"' in source
    assert 'work_dir="${staging}"' in source
    assert 'work_dir="${remote_dir}"' in source
    assert "com.docker.compose.service" in source
    assert "source_bundle_sha256" in source
    assert "source_transfer_mode" in source
    assert "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE" in source
    assert "NPCINK_CLOUD_M4_RELAY_SSH_HOST" in source
    assert "ConnectionAttempts=3" in source
    assert "root@100.90.87.36" in source
    assert "74.82.195.160" not in source
    assert "source relay download complete" in source
    assert "source relay bundle integrity mismatch" in source
    assert "source relay cleanup failed" in source
    assert "M4 relay SSH host contains unsupported characters" in source
    assert "source transfer holds" in source
    assert "systemd-run --quiet --collect" in source
    assert '--bind "${bind_ip}"' in source
    assert "--retry-all-errors" in source
    assert "--max-time 120" in source
    assert "--speed-time 20" in source
    assert "source_dirty_paths" in source
    assert "acceptance_state" in source
    assert "promotion_pr" in source
    assert "deployed_at_utc" in source
    assert "git ls-files -z --cached --others --exclude-standard" in source
    assert "--exclude '.env'" in source
    assert "--exclude '.env.local'" in source
    assert "--exclude 'frontend/.next'" in source
    assert "--exclude 'node_modules'" in source
    assert "docker system prune" not in source
    assert "docker volume prune" not in source
    assert "docker image save" not in source
    assert "docker image load" not in source
    assert "docker compose" in source
    assert "exec --interactive=false -T" in source
    assert "building runtime image on M4" in source
    assert "ghcr.nju.edu.cn/astral-sh/uv:" in source
    assert "m.daocloud.io/docker.io/library/python:" in source
    assert "m.daocloud.io/docker.io/library/node:" in source
    assert "crane pull" in source
    assert "remote_config_digest" in source
    assert "verified M4-local base aliases" in source
    assert "scripts/m4-package-proxy.py" in source
    assert '--secret "id=pip_index_url' in source
    assert "NPCINK_CLOUD_M4_NPM_REGISTRY" in source
    assert 'frontend_volume="${project_name}_cloud-frontend-node-modules-dev"' in source
    assert "com.docker.compose.project" in source
    assert "prepare complete: images and Compose config are ready" in source
    assert "equivalent_gate=pnpm run check:fast" in source
    assert "test_scope=focused" in source
    assert "test_scope=contract" in source
    assert "test_scope=domain" in source
    assert "test_scope=full" in source
    assert 'if [ "${#test_targets[@]}" -gt 0 ]; then' in source
    assert 'remote_locked_operation test "${test_scope}"' in source
    assert 'label=com.docker.compose.oneoff=False' in source
    assert "recovery requires existing container" in source
    assert '"${compose[@]}" start postgres redis' in source
    assert '"${compose[@]}" start api frontend proxy worker callback-worker ops-worker' in source
    assert "recovery complete" in source
    assert 'key.startswith("NPCINK_CLOUD_")' in source
    assert "pytest.main(sys.argv[1:])" in source
    assert "tests/contract" in source
    assert "tests/domain" in source
    assert "NPCINK_CLOUD_M4_TUNNEL_LOCAL_PORT" in source
    assert 'forward="127.0.0.1:${local_port}:127.0.0.1:${M4_PORT}"' in source
    assert "ExitOnForwardFailure=yes" in source
    assert "ServerAliveCountMax=3" in source
    assert "top.mqzj.npcink-ollama-preview" in source
    assert "m4:preview:ollama:install" in source
    assert "scripts/configure_m4_ollama_preview.py" in source
    assert "env PYTHONPATH=/app python scripts/configure_m4_ollama_preview.py" in source
    assert "managed Ollama is not installed; skipping preview recovery" in source
    assert "127.0.0.1:${M4_OLLAMA_PORT}" in source
    assert 'source_branch}" = "master"' in source
    assert "promotion requires a clean master worktree" in source
    assert "refs/remotes/origin/master" in source
    assert "PR #${pr_number} is not merged" in source
    assert "PR #${pr_number} targets ${pr_base}, not master" in source
    assert "m4:preview:promote -- --pr ${promotion_pr} --deploy" in source

    prepare_block = source.rsplit('if [ "${mode}" = "prepare" ]; then', 1)[1].split(
        'elif [ "${mode}" = "deploy" ]; then',
        1,
    )[0]
    assert "deployed_image_marker" not in prepare_block
    assert "deployed_config_marker" not in prepare_block
    assert source.index("wait_for_http") < source.index('> "${deployed_image_marker}"')


@pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="source transfer dry-run requires Git worktree metadata",
)
def test_m4_source_transfer_defaults_to_private_relay_and_direct_is_explicit() -> None:
    relayed = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "source transfer mode: relay" in relayed.stdout
    assert "root@100.90.87.36" in relayed.stdout
    assert "100.90.87.36:18080" in relayed.stdout

    direct_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE": "direct",
    }
    direct = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=direct_env,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "source transfer mode: direct" in direct.stdout
    assert "would upload source directly to M4" in direct.stdout


def test_m4_source_transfer_validation_fails_closed_without_git_metadata() -> None:
    invalid_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE": "automatic",
    }
    invalid = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=invalid_env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert invalid.returncode != 0
    assert "must be relay or direct" in invalid.stderr

    invalid_host_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_RELAY_SSH_HOST": "root@relay invalid",
    }
    invalid_host = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=invalid_host_env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert invalid_host.returncode != 0
    assert "SSH host contains unsupported characters" in invalid_host.stderr


def test_m4_tunnel_dry_run_is_local_only_and_non_mutating() -> None:
    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )

    assert "local_url=http://127.0.0.1:18010" in completed.stdout
    assert "127.0.0.1:18010:127.0.0.1:8010" in completed.stdout
    assert "ExitOnForwardFailure=yes" in completed.stdout
    assert "ServerAliveInterval=15" in completed.stdout
    assert "ServerAliveCountMax=3" in completed.stdout
    assert "docker" not in completed.stdout
    assert "rsync" not in completed.stdout


def test_m4_auto_tunnel_prefers_lan_and_falls_back_to_tailscale(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
printf '%s\n' "$*" >> "${FAKE_SSH_LOG}"
case "$*" in
  *192.168.10.200*health/live*) exit "${FAKE_LAN_STATUS:-0}" ;;
  *100.102.170.79*health/live*) exit "${FAKE_TAILSCALE_STATUS:-0}" ;;
esac
exit 0
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)

    for lan_status, expected_route, expected_host in (
        ("0", "lan", "muze@192.168.10.200"),
        ("1", "tailscale", "muze@100.102.170.79"),
    ):
        ssh_log = tmp_path / f"{expected_route}.log"
        runtime_env = {
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "FAKE_SSH_LOG": str(ssh_log),
            "FAKE_LAN_STATUS": lan_status,
        }
        completed = subprocess.run(
            ["bash", str(SCRIPT), "tunnel", "--auto"],
            cwd=ROOT,
            env=runtime_env,
            text=True,
            capture_output=True,
            check=True,
        )

        assert f"selected_route={expected_route}" in completed.stdout
        assert f"ssh_target={expected_host}" in completed.stdout
        assert expected_host in ssh_log.read_text(encoding="utf-8").splitlines()[-1]
        assert "127.0.0.1:18010:127.0.0.1:8010" in ssh_log.read_text(
            encoding="utf-8"
        ).splitlines()[-1]


def test_m4_auto_tunnel_fails_when_both_routes_are_unhealthy(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
    fake_ssh.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
    }

    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--auto"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode != 0
    assert "both LAN and Tailscale" in completed.stderr


def test_m4_test_scopes_are_explicit_and_dry_run_is_non_mutating(
    tmp_path: Path,
) -> None:
    focused = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "test",
            "--dry-run",
            "--focused",
            "tests/domain/test_commercial_service.py::test_operator_grant",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "test_scope=focused" in focused.stdout
    assert (
        "test_target=tests/domain/test_commercial_service.py::test_operator_grant"
        in focused.stdout
    )
    assert "ssh" not in focused.stdout
    assert "docker" not in focused.stdout

    for scope in ("contract", "domain", "full"):
        completed = subprocess.run(
            ["bash", str(SCRIPT), "test", "--dry-run", f"--{scope}"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        assert f"test_scope={scope}" in completed.stdout
        assert "ssh" not in completed.stdout
        assert "docker" not in completed.stdout

    rejected = subprocess.run(
        ["bash", str(SCRIPT), "test", "--dry-run", "--focused", "../outside.py"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert rejected.returncode != 0
    assert "must stay under tests/" in rejected.stderr

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\ncat >/dev/null\n", encoding="utf-8")
    fake_ssh.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
    }
    no_target_full = subprocess.run(
        ["bash", str(SCRIPT), "test", "--full"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "unbound variable" not in no_target_full.stderr


def test_m4_ollama_launch_agent_is_loopback_only_and_dry_run_is_non_mutating() -> None:
    source = OLLAMA_LAUNCH_AGENT.read_text(encoding="utf-8")

    assert "<string>top.mqzj.npcink-ollama-preview</string>" in source
    assert "<string>/usr/local/bin/ollama</string>" in source
    assert "<string>serve</string>" in source
    assert "<string>127.0.0.1:11434</string>" in source
    assert "0.0.0.0" not in source
    assert "<key>RunAtLoad</key>" in source
    assert "<key>KeepAlive</key>" in source

    completed = subprocess.run(
        ["bash", str(SCRIPT), "ollama-install", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )

    assert "dry-run: install top.mqzj.npcink-ollama-preview" in completed.stdout
    assert "127.0.0.1:11434" in completed.stdout
    assert "docker" not in completed.stdout
    assert "rsync" not in completed.stdout


def test_m4_ollama_ownership_preflight_is_early_and_fail_closed() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")

    preflight = source[
        source.index("remote_ollama_preflight() {") :
        source.index("remote_ollama_install() {")
    ]
    promote = source[
        source.index("promote_accepted_master() {") :
        source.index("probe_tunnel_host() {")
    ]
    main = source[source.index("main() {") :]
    deploy_case = main[main.index("\t\tdeploy)") : main.index("\t\tpromote)")]

    assert "Ollama ownership preflight failed before source transfer" in preflight
    assert "m4:preview:ollama:status" in preflight
    assert "m4:preview:ollama:install" in preflight
    assert "kill " not in preflight
    assert "launchctl kickstart" not in preflight
    assert deploy_case.index("remote_ollama_preflight") < deploy_case.index(
        "upload_and_apply"
    )
    assert promote.index("remote_ollama_preflight") < promote.index(
        "upload_and_apply"
    )
    assert "before source transfer" in runbook
    assert "unknown listener process" in runbook
    assert "MUST be checked before source transfer" in standard
    assert "MUST NOT automatically stop" in standard


def test_m4_deploy_stops_before_packaging_when_ollama_preflight_fails(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\ncat >/dev/null\nexit 65\n", encoding="utf-8")
    fake_ssh.chmod(0o755)

    completed = subprocess.run(
        ["bash", str(SCRIPT), "deploy"],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 65
    assert "packaging tracked files" not in completed.stdout
    assert "source revision:" not in completed.stdout


def test_m4_overlay_is_loopback_only_and_starts_the_complete_runtime() -> None:
    overlay = OVERLAY.read_text(encoding="utf-8")
    base = (ROOT / "docker-compose.dev.yml").read_text(encoding="utf-8")

    for binding in (
        "127.0.0.1:${NPCINK_CLOUD_M4_PORT:-8010}:8080",
        "127.0.0.1:${NPCINK_CLOUD_M4_POSTGRES_PORT:-15433}:5432",
        "127.0.0.1:${NPCINK_CLOUD_M4_REDIS_PORT:-16380}:6379",
    ):
        assert binding in overlay

    assert "0.0.0.0:" not in overlay
    assert "npcink-ai-cloud-runtime:m4-dev" in overlay
    assert "npcink-ai-cloud-frontend:m4-dev" in overlay
    assert "NEXT_PUBLIC_ENV: development" in overlay
    assert (
        "NEXT_PUBLIC_MINI_DEV_HOST_ALLOWLIST: "
        "${NPCINK_CLOUD_M4_MINI_DEV_HOST_ALLOWLIST:-cloud.mqzjmax.top,127.0.0.1,localhost}"
        in overlay
    )
    assert "NPCINK_CLOUD_SETUP_STATE_OVERRIDE: complete" in overlay
    assert (
        overlay.count(
            "NPCINK_CLOUD_SERVICE_SETTINGS_ENCRYPTION_KEY_ID: "
            "${NPCINK_CLOUD_SERVICE_SETTINGS_ENCRYPTION_KEY_ID:-m4-preview-service-v1}"
        )
        == 4
    )
    assert '"node"' in overlay
    assert '"node_modules/next/dist/bin/next"' in overlay
    for service in (
        "postgres",
        "redis",
        "api",
        "frontend",
        "proxy",
        "worker",
        "callback-worker",
        "ops-worker",
    ):
        assert f"  {service}:" in base
    assert base.count("restart: unless-stopped") == 8


def test_m4_log_redactor_masks_env_canaries_and_common_credentials(tmp_path: Path) -> None:
    env_file = tmp_path / ".env.local"
    env_canary = "env-canary-91b7d19e"
    database_canary = "db-canary-b7fe4c9a"
    env_file.write_text(
        f"NPCINK_CLOUD_API_KEY={env_canary}\nNPCINK_CLOUD_DATABASE_URL={database_canary}\n",
        encoding="utf-8",
    )
    raw = (
        f"api_key={env_canary}\n"
        f"database={database_canary}\n"
        "Authorization: Bearer auth-canary-ec78\n"
        "password=plain-canary-09ac\n"
        "required=false\n"
        "postgresql://user-canary:pass-canary@postgres:5432/db?token=query-canary\n"
    )

    completed = subprocess.run(
        [sys.executable, str(REDACTOR), "--env-file", str(env_file)],
        cwd=ROOT,
        input=raw,
        text=True,
        capture_output=True,
        check=True,
    )

    for secret in (
        env_canary,
        database_canary,
        "auth-canary-ec78",
        "plain-canary-09ac",
        "user-canary",
        "pass-canary",
        "query-canary",
    ):
        assert secret not in completed.stdout
    assert "[redacted]" in completed.stdout
    assert "required=false" in completed.stdout


def _load_package_proxy():
    spec = importlib.util.spec_from_file_location("m4_package_proxy", PACKAGE_PROXY)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_m4_package_proxy_is_fixed_destination_and_rewrites_registry_links() -> None:
    proxy = _load_package_proxy()
    pypi = proxy.resolve_route("/pypi/simple/alembic/?x=1")
    npm = proxy.resolve_route("/npm/pnpm")
    npm_binary = proxy.resolve_route("/npm/pnpm/-/pnpm-10.33.0.tgz")

    assert pypi is not None
    assert npm is not None
    assert npm_binary is not None
    assert pypi.upstream_url == "https://pypi.org/simple/alembic/?x=1"
    assert npm.upstream_url == "https://registry.npmjs.org/pnpm"
    assert npm_binary.kind == "npm_binary"
    assert proxy.resolve_route("/https://example.com/private") is None

    public_base = "http://host.docker.internal:18081"
    pypi_body = proxy.rewrite_payload(
        "pypi",
        b'<a href="https://files.pythonhosted.org/packages/a.whl">wheel</a>',
        public_base,
    )
    npm_body = proxy.rewrite_payload(
        "npm",
        b'{"tarball":"https://registry.npmjs.org/pnpm/-/pnpm.tgz"}',
        public_base,
    )
    assert b"http://host.docker.internal:18081/pypi-files/packages/a.whl" in pypi_body
    assert b"http://host.docker.internal:18081/npm/pnpm/-/pnpm.tgz" in npm_body


def test_m4_package_proxy_binds_loopback_and_publishes_readiness(tmp_path: Path) -> None:
    ready_file = tmp_path / "proxy.port"
    process = subprocess.Popen(
        [
            sys.executable,
            str(PACKAGE_PROXY),
            "--bind",
            "127.0.0.1",
            "--port",
            "0",
            "--ready-file",
            str(ready_file),
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        for _attempt in range(100):
            if ready_file.exists() and ready_file.read_text(encoding="utf-8").strip():
                break
            assert process.poll() is None
            time.sleep(0.02)
        port = int(ready_file.read_text(encoding="utf-8").strip())
        with urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as response:
            assert response.status == 200
            assert response.read() == b"ok\n"
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_m4_package_proxy_buffers_and_retries_upstream_downloads() -> None:
    proxy_source = PACKAGE_PROXY.read_text(encoding="utf-8")
    preview_source = SCRIPT.read_text(encoding="utf-8")
    assert "tempfile.SpooledTemporaryFile" in proxy_source
    assert "for attempt in range(1, 4)" in proxy_source
    assert "PackageCache" in proxy_source
    assert "X-Npcink-M4-Cache" in proxy_source
    assert "STREAM_CHUNK_BYTES" in proxy_source
    assert "downstream_disconnects" in proxy_source
    assert 'package_proxy_port="18081"' in preview_source
    assert '--port "${package_proxy_port}"' in preview_source
    assert '--cache-dir "${package_proxy_cache_dir}"' in preview_source
    assert 'package_proxy_cache_max_bytes="2147483648"' in preview_source
    assert "npm_config_fetch_timeout=300000" in preview_source
    assert "npm_config_fetch_retries=4" in preview_source
    assert "npm_config_network_concurrency=8" in preview_source
    assert "id=npcink-ai-cloud-m4-pnpm-store" in preview_source
    assert "-e 's#--timeout 60#--timeout 300#'" in preview_source


class _FakePackageResponse:
    def __init__(
        self,
        payload: bytes,
        on_first_read=None,
        *,
        declared_length: int | None = None,
    ) -> None:
        self.status = 200
        self.headers = {
            "Content-Type": "application/octet-stream",
            "Content-Length": str(
                len(payload) if declared_length is None else declared_length
            ),
        }
        self._chunks = [payload[:3], payload[3:], b""]
        self._on_first_read = on_first_read

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def getcode(self) -> int:
        return self.status

    def read(self, _size: int) -> bytes:
        if self._on_first_read is not None:
            callback = self._on_first_read
            self._on_first_read = None
            callback()
        return self._chunks.pop(0)


class _FakePackageOpener:
    def __init__(self, response_factory) -> None:
        self.response_factory = response_factory
        self.calls = 0

    def open(self, _request, timeout: int):
        assert timeout == 120
        self.calls += 1
        return self.response_factory()


def _new_proxy_handler(proxy, path: str, writer, cache):
    handler = proxy.PackageProxyHandler.__new__(proxy.PackageProxyHandler)
    handler.path = path
    handler.command = "GET"
    handler.requestline = f"GET {path} HTTP/1.1"
    handler.request_version = "HTTP/1.1"
    handler.close_connection = False
    handler.wfile = writer
    handler.cache = cache
    handler.metrics = proxy.PackageProxyMetrics()
    return handler


def test_m4_package_proxy_streams_binary_before_upstream_completion_and_caches(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    first_writer = io.BytesIO()

    def assert_headers_arrived() -> None:
        assert b"HTTP/1.1 200 OK" in first_writer.getvalue()
        assert b"\r\n\r\n" in first_writer.getvalue()

    opener = _FakePackageOpener(
        lambda: _FakePackageResponse(b"abcdef", assert_headers_arrived)
    )
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)

    path = "/npm/example/-/example-1.0.0.tgz"
    first = _new_proxy_handler(proxy, path, first_writer, cache)
    first._serve(send_body=True)
    assert opener.calls == 1
    assert first_writer.getvalue().endswith(b"abcdef")
    assert b"X-Npcink-M4-Cache: miss" in first_writer.getvalue()
    assert not list((tmp_path / "cache").rglob("*.partial"))

    monkeypatch.setattr(
        proxy,
        "DIRECT_OPENER",
        _FakePackageOpener(
            lambda: pytest.fail("cache hit must not open the upstream registry")
        ),
    )
    second_writer = io.BytesIO()
    second = _new_proxy_handler(proxy, path, second_writer, cache)
    second._serve(send_body=True)
    assert b"X-Npcink-M4-Cache: hit" in second_writer.getvalue()
    assert second_writer.getvalue().endswith(b"abcdef")


def test_m4_package_proxy_finishes_atomic_cache_fill_after_client_disconnect(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )

    class DisconnectAfterHeaders(io.BytesIO):
        def write(self, payload: bytes) -> int:
            if payload.startswith(b"HTTP/1.1"):
                return super().write(payload)
            raise BrokenPipeError

    path = "/npm/example/-/example-1.0.0.tgz"
    route = proxy.resolve_route(path)
    assert route is not None
    opener = _FakePackageOpener(lambda: _FakePackageResponse(b"abcdef"))
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)
    handler = _new_proxy_handler(proxy, path, DisconnectAfterHeaders(), cache)

    handler._serve(send_body=True)

    assert handler.metrics.downstream_disconnects == 1
    cached = cache.lookup(route.upstream_url)
    assert cached is not None
    assert cached.path.read_bytes() == b"abcdef"
    assert not list((tmp_path / "cache").rglob("*.partial"))


def test_m4_package_proxy_rejects_corrupt_or_symlinked_cache_entries(
    tmp_path: Path,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    upstream_url = "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
    _key, partial_path, partial = cache.new_partial(upstream_url)
    partial.write(b"abcdef")
    partial.close()
    cache.commit(
        upstream_url,
        partial_path,
        content_type="application/octet-stream",
        content_length=6,
    )
    cached = cache.lookup(upstream_url)
    assert cached is not None
    cached.path.write_bytes(b"bad")

    assert cache.lookup(upstream_url) is None
    assert not cached.path.exists()

    symlink_root = tmp_path / "symlink-cache"
    symlink_root.symlink_to(tmp_path / "cache", target_is_directory=True)
    with pytest.raises(ValueError, match="must not be a symlink"):
        proxy.PackageCache(
            symlink_root,
            max_bytes=1024 * 1024,
            max_age_seconds=3600,
        )


def test_m4_package_proxy_discards_truncated_upstream_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    path = "/npm/example/-/example-1.0.0.tgz"
    route = proxy.resolve_route(path)
    assert route is not None
    opener = _FakePackageOpener(
        lambda: _FakePackageResponse(b"abcdef", declared_length=7)
    )
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)
    handler = _new_proxy_handler(proxy, path, io.BytesIO(), cache)

    handler._serve(send_body=True)

    assert handler.close_connection is True
    assert cache.lookup(route.upstream_url) is None
    assert not list((tmp_path / "cache").rglob("*.partial"))


def test_m4_package_proxy_prunes_partial_and_oldest_cache_entries(
    tmp_path: Path,
) -> None:
    proxy = _load_package_proxy()
    cache_root = tmp_path / "cache"
    cache = proxy.PackageCache(
        cache_root,
        max_bytes=6,
        max_age_seconds=3600,
    )
    first_url = "https://registry.npmjs.org/first/-/first-1.0.0.tgz"
    second_url = "https://registry.npmjs.org/second/-/second-1.0.0.tgz"

    _key, first_partial_path, first_partial = cache.new_partial(first_url)
    first_partial.write(b"1111")
    first_partial.close()
    cache.commit(
        first_url,
        first_partial_path,
        content_type="application/octet-stream",
        content_length=4,
    )
    first = cache.lookup(first_url)
    assert first is not None
    old_time = time.time() - 60
    os.utime(first.path, (old_time, old_time))

    _key, second_partial_path, second_partial = cache.new_partial(second_url)
    second_partial.write(b"2222")
    second_partial.close()
    cache.commit(
        second_url,
        second_partial_path,
        content_type="application/octet-stream",
        content_length=4,
    )

    assert cache.lookup(first_url) is None
    second = cache.lookup(second_url)
    assert second is not None
    assert second.path.read_bytes() == b"2222"

    _key, abandoned_path, abandoned = cache.new_partial(
        "https://registry.npmjs.org/abandoned/-/abandoned-1.0.0.tgz"
    )
    abandoned.write(b"partial")
    abandoned.close()
    assert abandoned_path.exists()

    proxy.PackageCache(
        cache_root,
        max_bytes=6,
        max_age_seconds=3600,
    )
    assert not abandoned_path.exists()


def test_m4_runbook_preserves_source_cloudflare_and_recovery_boundaries() -> None:
    runbook = RUNBOOK.read_text(encoding="utf-8")

    assert "source and Git truth" in runbook
    assert "No day-to-day Docker installation" in runbook
    assert "does not authorize a production deploy" in runbook
    assert "Cloudflare DNS, Access, or Tunnel change" in runbook
    assert "127.0.0.1:8010" in runbook
    assert "127.0.0.1:15433" in runbook
    assert "127.0.0.1:16380" in runbook
    assert "docker system prune" in runbook
    assert "m4:preview:recover" in runbook
    assert "m4:preview:tunnel" in runbook
    assert "five working days" in runbook
    assert "Docker Desktop 4.83.0" in runbook
    assert "m4:preview:stop" in runbook
    assert "last known-good Git revision" in runbook
    assert "portal-demo@example.com" in runbook
    assert "https://cloud.mqzjmax.top/portal/dev-entry" in runbook
    assert "shared development identity" in runbook
    assert "Candidate and Accepted States" in runbook
    assert "pnpm run m4:preview:promote -- --pr" in runbook
    assert "acceptance_state=accepted" in runbook
    assert "receives no M4 SSH credential" in runbook
    assert "m4:preview:test -- --focused" in runbook
    assert "GitHub required" in runbook
    assert "checks are the merge authority" in runbook
    assert "same revision" in runbook
    assert "source bundle intentionally omits `.git`" in runbook
    assert "Private Source Relay Contract" in runbook
    assert "root@100.90.87.36" in runbook
    assert "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct" in runbook
    assert "does not become source or Git truth" in runbook
    assert "AI checkpoint rule" in runbook
    assert "coherent task checkpoint" in runbook
    assert "does not authorize an unreported" in runbook
    assert "~/.cache/npcink-ai-cloud-m4-dev/package-proxy" in runbook
    assert "at most 2 GiB" in runbook
    assert "unused for 14 days" in runbook
    assert "disposable build optimization" in runbook


def test_m4_package_proxy_decision_is_linked_measured_and_bounded() -> None:
    decision = PACKAGE_PROXY_ADR.read_text(encoding="utf-8")
    validation = PACKAGE_PROXY_VALIDATION.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "027-m4-package-proxy-streaming-cache.md"
    validation_name = "m4-package-proxy-streaming-cache-validation-2026-07-25.md"

    for document in (runbook, standard, readme):
        assert decision_name in document
    for document in (runbook, readme):
        assert validation_name in document
    assert "whole-body buffering" in decision
    assert "2 GiB" in decision
    assert "14 days" in decision
    assert "not source or Git truth" in decision
    assert "remove only" in decision
    assert "42,303,110" in validation
    assert "12.07 seconds" in validation
    assert "M4 candidate" in validation
    assert "package proxy cache documented in ADR-027" in agents


def test_m4_ai_development_standard_is_actionable_and_linked() -> None:
    standard = AI_STANDARD.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard_path = "docs/m4-preview-ai-development-standard-v1.md"

    assert standard_path in agents
    assert standard_path in readme
    assert "m4-preview-ai-development-standard-v1.md" in runbook

    for required_text in (
        "Local-only",
        "Cloud source",
        "Build/runtime",
        "M4 MUST NOT become source or Git truth",
        "WordPress remains the local control plane",
        "pnpm run m4:preview:sync",
        "pnpm run m4:preview:deploy",
        "pnpm run m4:preview:promote -- --pr",
        "pnpm run m4:preview:test",
        "m4:preview:test -- --focused",
        "GitHub required checks",
        "same full contract/domain gate",
        "focused bug-fix feedback loop",
        "http://127.0.0.1:18010",
        "https://cloud.mqzjmax.top",
        "acceptance_state=accepted",
        "source_branch=master",
        "source_dirty=false",
        "under two minutes",
        "under ten minutes per",
        "report candidate validation as accepted completion",
        "Default task-checkpoint dispatch",
        "MUST NOT wait for a second user message",
        "per-save watcher",
        "MUST NOT become the fallback Cloud Docker runtime",
    ):
        assert required_text in standard


def test_m4_validation_authority_decision_is_linked_and_bounded() -> None:
    decision = VALIDATION_ADR.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_path = "decisions/024-risk-tiered-development-validation-authority.md"

    assert decision_path in standard
    assert "024-risk-tiered-development-validation-authority.md" in readme
    assert "M4 Preview" in decision
    assert "GitHub required checks are the repository merge authority" in decision
    assert "must not be repeated for one revision" in decision
    assert "does not authorize production" in decision


def test_m4_checkpoint_dispatch_decision_is_linked_and_bounded() -> None:
    decision = CHECKPOINT_ADR.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md"

    assert decision_name in standard
    assert decision_name in runbook
    assert decision_name in readme
    assert "coherent task checkpoint" in agents
    assert "without waiting for the user to ask again" in agents
    assert "M4 is the routine Cloud Docker environment" in decision
    assert "without waiting for a second deployment request" in decision
    assert "does not silently fall back to local Docker" in decision
    assert "does not authorize\nproduction deployment" in decision
    assert "per-save watchers" in decision
    assert "GitHub-hosted M4 credentials" in decision


def test_m4_private_source_relay_decision_and_validation_are_linked() -> None:
    decision = SOURCE_RELAY_ADR.read_text(encoding="utf-8")
    validation = SOURCE_RELAY_VALIDATION.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "026-private-source-relay-transfer.md"

    assert decision_name in standard
    assert decision_name in runbook
    assert decision_name in readme
    assert "Tailscale-only source relay" in agents
    assert "does not become source or Git truth" in decision
    assert "explicit direct fallback" in decision
    assert "4,823,040" in validation
    assert "18 seconds" in validation
    assert "SHA-256" in validation
