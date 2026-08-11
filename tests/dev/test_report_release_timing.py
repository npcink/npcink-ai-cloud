import importlib.util
import json
import subprocess
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "report-release-timing.py"
SPEC = importlib.util.spec_from_file_location("report_release_timing", MODULE_PATH)
assert SPEC is not None
report_release_timing = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["report_release_timing"] = report_release_timing
SPEC.loader.exec_module(report_release_timing)

format_duration = report_release_timing.format_duration
collect_deploy_phase_timings = report_release_timing.collect_deploy_phase_timings
summarize = report_release_timing.summarize
summarize_deploy_log = report_release_timing.summarize_deploy_log


def test_release_timing_summary_orders_jobs_by_duration() -> None:
    run = {
        "status": "completed",
        "conclusion": "success",
        "createdAt": "2026-07-08T16:44:41Z",
        "updatedAt": "2026-07-08T17:07:12Z",
        "jobs": [
            {
                "name": "frontend",
                "conclusion": "success",
                "startedAt": "2026-07-08T16:44:50Z",
                "completedAt": "2026-07-08T16:45:35Z",
            },
            {
                "name": "backend",
                "conclusion": "success",
                "startedAt": "2026-07-08T16:44:50Z",
                "completedAt": "2026-07-08T16:52:48Z",
            },
        ],
    }

    summary = summarize(run)

    assert summary["duration"] == "22m31s"
    assert summary["jobs"][0]["name"] == "backend"
    assert summary["jobs"][0]["duration"] == "7m58s"
    assert summary["jobs"][1]["name"] == "frontend"
    assert summary["jobs"][1]["duration"] == "45s"


def test_format_duration_handles_missing_and_seconds() -> None:
    assert format_duration(None) == "n/a"
    assert format_duration(7) == "7s"
    assert format_duration(65) == "1m05s"


def test_deploy_timing_summary_groups_release_phases_without_double_counting_wrapper() -> None:
    log_text = """
[timing] upload deploy bundle: start
[timing] upload deploy bundle: 12s
[timing] remote deploy sequence: start
[timing] remote load and up: start
[timing] verify exact bundle before load: start
[timing] verify exact bundle before load: 5s
[timing] remote load and up: 31s
[timing] remote migrate: start
[timing] alembic upgrade: start
[timing] alembic upgrade: 6s
[timing] remote migrate: 7s
[timing] stop public and write-capable application services: start
[timing] stop application service api (api123): start
[timing] stop application service worker (worker123): start
[timing] stop application service ops-worker (ops123): start
[timing] stop application service api (api123): 0s
[timing] stop application service worker (worker123): 2s
[timing] stop application service ops-worker (ops123): 2s
[timing] stop public and write-capable application services: 3s
[timing] remote operational readiness: start
[timing] remote operational readiness: 9s
[timing] remote deploy sequence: 58s
"""

    summary = summarize_deploy_log(
        log_text,
        repository="npcink/npcink-ai-cloud",
        head_sha="a" * 40,
        workflow_run_id="12345",
        release_lane="backend",
        release_action="runtime",
        deploy_exit_status=0,
    )

    assert summary["schema"] == "npcink.release_timing.v1"
    assert summary["kind"] == "production_deploy_phases"
    assert summary["repository"] == "npcink/npcink-ai-cloud"
    assert summary["head_sha"] == "a" * 40
    assert summary["workflow_run_id"] == "12345"
    assert summary["recorded_total_seconds"] == 62
    assert summary["remote_sequence_seconds"] == 58
    assert summary["category_seconds"] == {
        "bundle": 0,
        "transfer": 12,
        "image_load": 31,
        "migration": 7,
        "cutover": 3,
        "health": 9,
        "other": 0,
    }
    assert len(summary["phases"]) == 11
    nested = {
        phase["label"]: phase
        for phase in summary["phases"]
        if phase["parent_label"] not in (None, "remote deploy sequence")
    }
    assert nested["verify exact bundle before load"]["counted_in_category_totals"] is False
    assert nested["alembic upgrade"]["counted_in_category_totals"] is False
    assert nested["stop application service api (api123)"][
        "counted_in_category_totals"
    ] is False
    assert nested["stop application service worker (worker123)"][
        "counted_in_category_totals"
    ] is False
    assert nested["stop application service ops-worker (ops123)"][
        "counted_in_category_totals"
    ] is False
    assert summary["status"] == "success"


def test_deploy_timing_parser_preserves_failed_phase_exit_status() -> None:
    phases = collect_deploy_phase_timings(
        "[timing] remote migrate: 4s (failed: 17)\n"
    )

    assert len(phases) == 1
    assert phases[0].category == "migration"
    assert phases[0].conclusion == "failure"
    assert phases[0].exit_status == 17
    assert phases[0].depth is None
    assert phases[0].counted_in_category_totals is True


def test_deploy_timing_cli_writes_revision_bound_receipt(tmp_path: Path) -> None:
    deploy_log = tmp_path / "deploy.log"
    receipt = tmp_path / "receipt.json"
    deploy_log.write_text(
        "[timing] remote deploy sequence: 42s\n",
        encoding="utf-8",
    )

    subprocess.run(
        [
            sys.executable,
            str(MODULE_PATH),
            "--deploy-log",
            str(deploy_log),
            "--source-repository",
            "npcink/npcink-ai-cloud",
            "--source-sha",
            "b" * 40,
            "--workflow-run-id",
            "67890",
            "--release-lane",
            "backend",
            "--release-action",
            "runtime",
            "--receipt-output",
            str(receipt),
        ],
        check=True,
        text=True,
        capture_output=True,
    )

    payload = json.loads(receipt.read_text(encoding="utf-8"))
    assert payload["repository"] == "npcink/npcink-ai-cloud"
    assert payload["head_sha"] == "b" * 40
    assert payload["workflow_run_id"] == "67890"
    assert payload["remote_sequence_seconds"] == 42
