"""Execute the embedded runner with synthetic settings, without Docker or a DB."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SYNTHETIC_URL = "postgresql+psycopg://fixture:synthetic-nonsecret@postgres/fixture"


def _runner():
    source = (ROOT / "scripts/m4-preview.sh").read_text()
    return source.split("test_runner='\n", 1)[1].split("\n'", 1)[0]


def _execute(monkeypatch, target, *, url=SYNTHETIC_URL, environment="preview"):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("NPCINK_CLOUD_DATABASE_URL", url)
    monkeypatch.setenv("NPCINK_CLOUD_ENVIRONMENT", environment)
    monkeypatch.setenv("NPCINK_CLOUD_PRIVATE_TEST", "synthetic-private")
    monkeypatch.setenv("NPCINK_TEST_PORTAL_POSTGRES_URL", "stale-must-not-leak")
    monkeypatch.setenv("NPCINK_TEST_PORTAL_ENVIRONMENT", "stale")
    monkeypatch.setattr(sys, "argv", ["-c", target, "-q"])
    seen = {}

    def run_pytest(arguments):
        seen.update(environment=dict(os.environ), arguments=list(arguments))
        return 0

    monkeypatch.setattr(pytest, "main", run_pytest)
    with pytest.raises(SystemExit) as stopped:
        exec(compile(_runner(), "<m4-test-runner>", "exec"), {})
    return stopped.value.code, seen


@pytest.mark.parametrize(
    "target",
    [
        "tests/integration/test_admin_economics_postgres.py",
        "tests/integration/test_portal_self_service_postgres.py",
        "tests/integration/test_portal_self_service_postgres.py::test_same_code_two_sessions_close_at_most_once",
        "/workspace/tests/integration/test_portal_postgres_acceptance.py::test_activity_index_postgres_round_trip",
    ],
)
def test_explicit_pg_target_receives_original_settings_without_argv_or_output_leak(
    monkeypatch,
    capsys,
    target,
):
    code, seen = _execute(monkeypatch, target)
    assert code == 0
    assert seen["environment"]["NPCINK_TEST_PORTAL_POSTGRES_URL"] == SYNTHETIC_URL
    assert seen["environment"]["NPCINK_TEST_PORTAL_ENVIRONMENT"] == "preview"
    assert not any(key.startswith("NPCINK_CLOUD_") for key in seen["environment"])
    assert seen["arguments"] == [target, "-q"]
    assert SYNTHETIC_URL not in str(sys.argv)
    output = capsys.readouterr()
    assert "synthetic-nonsecret" not in output.out + output.err


@pytest.mark.parametrize(
    "target",
    [
        "tests/api/test_portal_notifications_routes.py",
        "--ignore=/workspace/tests/integration/test_portal_self_service_postgres.py",
    ],
)
def test_ordinary_focused_target_does_not_enable_pg(monkeypatch, capsys, target):
    code, seen = _execute(monkeypatch, target)
    assert code == 0
    assert "NPCINK_TEST_PORTAL_POSTGRES_URL" not in seen["environment"]
    assert "NPCINK_TEST_PORTAL_ENVIRONMENT" not in seen["environment"]
    assert not any(key.startswith("NPCINK_CLOUD_") for key in seen["environment"])
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize("missing", ["url", "environment"])
def test_explicit_pg_missing_runtime_settings_fails_instead_of_skipping(
    monkeypatch, capsys, missing
):
    code, seen = _execute(
        monkeypatch,
        "tests/integration/test_portal_self_service_postgres.py",
        url="" if missing == "url" else SYNTHETIC_URL,
        environment="" if missing == "environment" else "preview",
    )
    assert code == 64 and not seen
    output = capsys.readouterr()
    assert "require a database URL and runtime environment" in output.err
    assert SYNTHETIC_URL not in output.err


def test_production_environment_is_preserved_and_guard_rejects_it(monkeypatch):
    code, seen = _execute(
        monkeypatch,
        "tests/integration/test_portal_self_service_postgres.py",
        environment="production",
    )
    assert code == 0  # Synthetic pytest.main; the real fixture must reject this value.
    assert seen["environment"]["NPCINK_TEST_PORTAL_ENVIRONMENT"] == "production"
    from tests.integration.test_portal_postgres_acceptance import m4_database_url

    with pytest.raises(AssertionError, match="production acceptance is forbidden"):
        m4_database_url.__wrapped__()
