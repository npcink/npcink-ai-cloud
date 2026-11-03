"""M4 preview sync must not orphan in-flight inline runs when it recreates the API."""

from __future__ import annotations

import re
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "m4-preview.sh"
OVERLAY = ROOT / "docker-compose.m4-preview.yml"
DEV_COMPOSE = ROOT / "docker-compose.dev.yml"
PROVIDER_TIMEOUT_SECONDS = 45  # hosted inline policy timeout_ms=45000


def _drain_block() -> str:
    text = SCRIPT.read_text()
    match = re.search(
        r"# BEGIN inline run drain before API recreate\n(.*?)"
        r"# END inline run drain before API recreate",
        text,
        re.S,
    )
    assert match, "drain block missing"
    return match.group(1)


def test_every_api_recreate_is_preceded_by_the_inline_drain() -> None:
    text = SCRIPT.read_text()
    sync_recreate = (
        '\tprepare_api_recreate\n\t"${compose[@]}" up -d --no-build --pull never '
        "--force-recreate api"
    )
    deploy_up = (
        '\tprepare_api_recreate\n\t"${compose[@]}" up -d --no-build --pull never \\\n'
        "\t\tpostgres redis api worker callback-worker ops-worker"
    )
    assert sync_recreate in text
    assert deploy_up in text
    assert text.count("--force-recreate api") == 1
    assert text.index("# END inline run drain before API recreate") < text.index(sync_recreate)


def test_drain_is_capped_and_scoped_to_recent_inline_runs() -> None:
    block = _drain_block()
    assert (
        'inline_drain_timeout_seconds="${NPCINK_CLOUD_M4_INLINE_DRAIN_TIMEOUT_SECONDS:-90}"'
    ) in block
    assert (
        'inline_inflight_window_seconds="${NPCINK_CLOUD_M4_INLINE_INFLIGHT_WINDOW_SECONDS:-60}"'
    ) in block
    # Old orphans (outside the window) must never block a sync forever.
    assert "and execution_pattern = 'inline'" in block
    assert (
        "processing_started_at > now() - interval '${inline_inflight_window_seconds} seconds'"
    ) in block
    # Read-only: the drain never mutates run state.
    assert not re.search(r"\b(update|delete|insert)\b", block, re.I)


def test_drain_does_not_change_the_inline_admission_lease() -> None:
    models = (ROOT / "app" / "domain" / "runtime" / "models.py").read_text()
    assert "RUNTIME_INLINE_RUN_LEASE_SECONDS = 180" in models


def test_m4_api_graceful_shutdown_outlasts_the_provider_timeout() -> None:
    class _Loader(yaml.SafeLoader):
        pass

    _Loader.add_constructor("!override", lambda loader, node: loader.construct_sequence(node))
    overlay = yaml.load(OVERLAY.read_text(), Loader=_Loader)  # noqa: S506 - SafeLoader subclass
    api = overlay["services"]["api"]
    graceful = int(re.search(r"--timeout-graceful-shutdown (\d+)", api["command"]).group(1))
    grace_period = int(str(api["stop_grace_period"]).rstrip("s"))
    assert graceful > PROVIDER_TIMEOUT_SECONDS
    assert grace_period > graceful, "Docker must not SIGKILL before uvicorn finishes draining"
    # The overlay keeps the dev reload contract; only the shutdown budget differs.
    for flag in ("--reload-dir app", "--reload-dir migrations", "--reload-exclude app/workers/*"):
        assert flag in api["command"]
    assert "--timeout-graceful-shutdown 5" in DEV_COMPOSE.read_text()


def _run_drain(counts: list[str], timeout: int = 9) -> subprocess.CompletedProcess[str]:
    script = textwrap.dedent(
        """
        set -euo pipefail
        project_name=test
        HOME="$(mktemp -d)"
        export NPCINK_CLOUD_M4_INLINE_DRAIN_TIMEOUT_SECONDS={timeout}
        state="$(mktemp)"
        echo 0 >"$state"
        counts=({counts})
        sleep() {{ :; }}
        compose=(fake_compose)
        fake_compose() {{
          if [ "$1" = exec ]; then
            cat >/dev/null
            local calls value
            calls="$(cat "$state")"
            value="${{counts[$calls]}}"
            echo $((calls + 1)) >"$state"
            echo "$value"
            [ "$value" != FAIL ]
          else
            echo ""
          fi
        }}
        {block}
        prepare_api_recreate
        echo "polls=$(cat "$state")"
        """
    ).format(timeout=timeout, counts=" ".join(counts), block=_drain_block())
    return subprocess.run(["bash", "-c", script], capture_output=True, text=True, check=False)


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_drain_waits_until_inline_runs_finish() -> None:
    result = _run_drain(["2", "1", "0"])
    assert result.returncode == 0, result.stderr
    assert "no inline run in flight (waited 6s)" in result.stdout
    assert "polls=3" in result.stdout


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_drain_gives_up_at_the_cap() -> None:
    result = _run_drain(["1"] * 6, timeout=9)
    assert result.returncode == 0, result.stderr
    assert "still in flight after 9s; recreating anyway" in result.stderr


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_drain_does_not_block_when_the_database_is_unreadable() -> None:
    result = _run_drain(["FAIL"])
    assert result.returncode == 0, result.stderr
    assert "run_records is not readable; recreating without drain" in result.stderr
