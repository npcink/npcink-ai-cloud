from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "m4-fullstack-slot.sh"
PREVIEW = ROOT / "scripts" / "m4-preview.sh"
OVERLAY = ROOT / "docker-compose.m4-fullstack-slot.yml"
M4_OVERLAY = ROOT / "docker-compose.m4-preview.yml"


def test_fullstack_slot_commands_are_explicit() -> None:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    expected = {
        "m4:fullstack:up": "bash scripts/m4-fullstack-slot.sh up",
        "m4:fullstack:sync": "bash scripts/m4-fullstack-slot.sh sync",
        "m4:fullstack:status": "bash scripts/m4-fullstack-slot.sh status",
        "m4:fullstack:logs": "bash scripts/m4-fullstack-slot.sh logs",
        "m4:fullstack:tunnel": "bash scripts/m4-fullstack-slot.sh tunnel",
        "m4:fullstack:release": "bash scripts/m4-fullstack-slot.sh release",
    }
    assert {name: scripts.get(name) for name in expected} == expected


def test_fullstack_slot_is_single_isolated_and_owner_leased() -> None:
    subprocess.run(["bash", "-n", str(SCRIPT)], cwd=ROOT, check=True)
    source = SCRIPT.read_text(encoding="utf-8")

    assert 'PROJECT="npcink-ai-cloud-m4-fullstack-1"' in source
    assert 'REMOTE_PORT="8031"' in source
    assert 'LOCAL_PORT="18031"' in source
    assert 'NPCINK_CLOUD_M4_STACK_MODE="isolated"' in source
    assert 'RUNTIME_IMAGE="npcink-ai-cloud-runtime:m4-fullstack-1"' in source
    assert 'FRONTEND_IMAGE="npcink-ai-cloud-frontend:m4-fullstack-1"' in source
    assert "lease_state=active" in source
    assert "expires_at_epoch" in source
    assert "primary preview operation is active" in source
    assert 'local owner="${2:-none}"' in source
    assert "docker stats --no-stream" in source
    assert "${container_ids}" in source
    assert "docker system prune" not in source
    assert "docker volume prune" not in source
    assert "git reset" not in source


def test_fullstack_slot_is_resource_limited_and_omits_workers() -> None:
    overlay = OVERLAY.read_text(encoding="utf-8")
    preview = PREVIEW.read_text(encoding="utf-8")

    for service in ("postgres", "redis", "api", "frontend", "proxy"):
        assert f"  {service}:\n" in overlay
    for worker in ("worker", "callback-worker", "ops-worker"):
        assert f"  {worker}:\n" not in overlay
    for limit in ("384m", "128m", "768m", "1536m", "64m"):
        assert f"mem_limit: {limit}" in overlay
    assert overlay.count('restart: "no"') == 5
    assert "postgres redis api frontend proxy" in preview
    assert "expected_restart_policy='no'" in preview
    assert "peer preview operation is active" in preview


def test_primary_and_isolated_stacks_use_separate_image_names() -> None:
    overlay = M4_OVERLAY.read_text(encoding="utf-8")
    preview = PREVIEW.read_text(encoding="utf-8")

    assert overlay.count("${NPCINK_CLOUD_M4_RUNTIME_IMAGE:-npcink-ai-cloud-runtime:m4-dev}") == 4
    assert "${NPCINK_CLOUD_M4_FRONTEND_IMAGE:-npcink-ai-cloud-frontend:m4-dev}" in overlay
    assert 'runtime_image="${23}"' in preview
    assert 'frontend_image="${24}"' in preview
    assert 'stack_mode="${22}"' in preview


def test_fullstack_slot_dry_run_does_not_claim_remote_state() -> None:
    completed = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "up",
            "--owner",
            "codex:contract-test",
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "would deploy npcink-ai-cloud-m4-fullstack-1" in completed.stdout
    assert "source transfer mode: relay" in completed.stdout


def test_fullstack_release_accepts_the_pnpm_argument_separator() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert 'if [ "${1:-}" = "--" ]; then' in source
    assert "release requires --owner ID" in source
