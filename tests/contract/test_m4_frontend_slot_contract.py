from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "m4-frontend-slot.sh"
PREVIEW_SCRIPT = ROOT / "scripts" / "m4-preview.sh"
COMPOSE = ROOT / "docker-compose.m4-frontend-slot.yml"
NGINX = ROOT / "deploy" / "nginx.m4-frontend-slot.conf.template"
M4_OVERLAY = ROOT / "docker-compose.m4-preview.yml"
ADR = ROOT / "docs" / "decisions" / "035-ephemeral-m4-frontend-preview-slots.md"


def test_m4_frontend_slot_commands_are_explicit() -> None:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    expected = {
        "m4:frontend:up": "bash scripts/m4-frontend-slot.sh up",
        "m4:frontend:sync": "bash scripts/m4-frontend-slot.sh sync",
        "m4:frontend:status": "bash scripts/m4-frontend-slot.sh status",
        "m4:frontend:logs": "bash scripts/m4-frontend-slot.sh logs",
        "m4:frontend:tunnel": "bash scripts/m4-frontend-slot.sh tunnel",
        "m4:frontend:release": "bash scripts/m4-frontend-slot.sh release",
    }
    assert {name: scripts.get(name) for name in expected} == expected


def test_m4_frontend_slot_shell_is_fail_closed_and_non_destructive() -> None:
    subprocess.run(["bash", "-n", str(SCRIPT)], cwd=ROOT, check=True)
    source = SCRIPT.read_text(encoding="utf-8")
    preview_source = PREVIEW_SCRIPT.read_text(encoding="utf-8")

    assert 'source "$(cd "$(dirname "${BASH_SOURCE[0]}")"' in source
    assert "frontend_only_read_only" in source
    assert "primary runtime must be accepted" in source
    assert "primary M4 operation is active" in source
    assert "primary frontend dependency image does not match" in source
    assert 'frontend_image_input_sha="$(frontend_image_fingerprint)"' in source
    assert "state_value frontend_image_input_sha256" in source
    assert "state_value image_input_sha256" not in source
    assert "primary preview configuration does not match" in source
    assert 'primary_revision}" = "${source_base_revision}' in source
    assert 'primary_revision}" = "${source_revision}' in source
    assert source.count('[ "${primary_dirty}" = "false" ]') >= 2
    assert '[ "${source_dirty}" = "false" ]' in source
    assert "slot 3 requires --allow-third" in source
    assert "another operation holds slot" in source
    assert "operation.lock" in source
    assert "another source transfer holds" in preview_source
    assert "systemd-run --quiet --collect" in preview_source
    assert '--bind "${bind_ip}"' in preview_source
    assert "root@100.90.87.36" in preview_source
    assert "74.82.195.160" not in source + preview_source
    assert "docker system prune" not in source
    assert "docker volume prune" not in source
    assert "git checkout" not in source
    assert "git reset" not in source
    assert "git stash" not in source
    assert "com.docker.compose.volume=slot-frontend-next-cache" in source
    assert "label=com.docker.compose.project=${project}" in source


@pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="slot packaging dry-run belongs to the authoring Git checkout",
)
def test_m4_frontend_slot_dry_run_is_local_and_slot_three_is_explicit() -> None:
    completed = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "up",
            "--slot",
            "1",
            "--owner",
            "codex:test-ui",
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "slot=1" in completed.stdout
    assert "owner=codex:test-ui" in completed.stdout
    assert "local_url=http://127.0.0.1:18021" in completed.stdout
    assert "preview_mode=frontend_only_read_only" in completed.stdout
    assert "private Tailscale relay" in completed.stdout

    third = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "up",
            "--slot",
            "3",
            "--owner",
            "codex:test-ui",
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert third.returncode != 0
    assert "slot 3 requires --allow-third" in third.stderr


def test_m4_frontend_slot_tunnel_is_loopback_only() -> None:
    completed = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "tunnel",
            "--slot",
            "2",
            "--auto",
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "selected_route=lan-dry-run" in completed.stdout
    assert "127.0.0.1:18022:127.0.0.1:8022" in completed.stdout
    assert "ExitOnForwardFailure=yes" in completed.stdout
    assert "ServerAliveCountMax=3" in completed.stdout


def test_m4_frontend_slot_compose_reuses_only_primary_runtime_dependencies() -> None:
    compose = COMPOSE.read_text(encoding="utf-8")

    assert compose.count("\n  frontend-slot:") == 1
    assert compose.count("\n  proxy-slot:") == 1
    for forbidden_service in ("api:", "postgres:", "redis:", "worker:", "ops-worker:"):
        assert f"\n  {forbidden_service}" not in compose
    assert 'restart: "no"' in compose
    assert compose.count('restart: "no"') == 2
    assert "npcink-ai-cloud-frontend:m4-dev" in compose
    assert "CLOUD_API_BASE_URL: http://api:8000" in compose
    assert "cloud-frontend-node-modules-dev:/app/frontend/node_modules:ro" in compose
    assert "external: true" in compose
    assert "127.0.0.1:${NPCINK_CLOUD_M4_SLOT_PORT}:8080" in compose
    assert "0.0.0.0:" not in compose
    assert "NODE_OPTIONS: --max-old-space-size=1024" in compose
    assert "frontend_only" not in compose


def test_m4_frontend_slot_proxy_blocks_mutations_except_session_lifecycle() -> None:
    nginx = NGINX.read_text(encoding="utf-8")

    for path in (
        "/admin/auth/login",
        "/api/portal/auth/code/request",
        "/api/portal/auth/code/verify",
        "/api/portal/logout",
    ):
        assert f"location = {path}" in nginx
    assert nginx.count("limit_except POST") == 4
    assert nginx.count("limit_except GET HEAD") >= 8
    assert "location /internal/" in nginx
    assert "return 404;" in nginx
    assert "$request_uri" not in nginx
    assert '"$request_method $uri $server_protocol"' in nginx


def test_primary_preview_explicitly_allows_slot_tunnel_origins() -> None:
    overlay = M4_OVERLAY.read_text(encoding="utf-8")

    for port in (18021, 18022, 18023):
        assert f"http://127.0.0.1:{port}" in overlay
        assert f"127.0.0.1:{port}" in overlay
        assert f"localhost:{port}" in overlay


def test_frontend_slots_are_governed_as_ephemeral_not_a_second_runtime() -> None:
    adr = ADR.read_text(encoding="utf-8")

    assert "maximum of three" in adr
    assert "two normal slots" in adr
    assert "accepted primary runtime" in adr
    assert "no PostgreSQL, Redis, API, or worker" in adr
    assert "read-only" in adr
    assert "Cloudflare" in adr
    assert "TTL" in adr
