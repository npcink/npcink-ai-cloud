from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / "scripts" / "list-stale-inline-running-runs.py").read_text()


def test_stale_inline_list_script_is_read_only_and_points_at_existing_repair() -> None:
    assert "mark_stale_running_failed" in SOURCE
    assert "fail_run" not in SOURCE
    assert "UPDATE" not in SOURCE.upper()
    assert "DELETE" not in SOURCE
    assert 'status == "running"' in SOURCE or "status == 'running'" in SOURCE
    assert "execution_pattern" in SOURCE
    assert "RUNTIME_INLINE_RUN_LEASE_SECONDS" in SOURCE
