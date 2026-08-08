from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/report_ai_quality_regression_samples.py"
AGENT_FIXTURE = ROOT / "tests/fixtures/agent_feedback/content_support_regression_samples.json"
EDITOR_FIXTURE = ROOT / "tests/fixtures/editor_assist_quality/quality_events.json"


def _run_report(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_ai_quality_regression_report_describes_ten_bounded_cases() -> None:
    result = _run_report("--format", "json")

    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["schema_version"] == "ai_quality_regression_report.v1"
    assert report["mode"] == "deterministic_metadata_only"
    assert report["quality_interpretation"] == "report_only"
    assert report["total_cases"] == 10
    assert {
        capability["capability"]: capability["case_count"] for capability in report["capabilities"]
    } == {"agent_feedback": 5, "editor_assist": 5}
    cases_by_capability = {
        capability["capability"]: {case["case_id"]: case["bucket"] for case in capability["cases"]}
        for capability in report["capabilities"]
    }
    assert cases_by_capability["agent_feedback"] == {
        "content_support_title_accepted": "accepted_quality",
        "content_support_summary_edited": "accepted_after_edit",
        "content_support_outline_evidence_weak": "evidence_gap",
        "content_support_next_step_wrong": "intent_gap",
        "content_support_context_missing": "context_gap",
    }
    assert cases_by_capability["editor_assist"] == {
        "editor_summary_exact_publish": "exact_publish_adoption",
        "editor_summary_edited_after_repeat": "edited_after_repeat",
        "editor_summary_expired_without_save": "expired_without_save",
        "editor_summary_edited_without_repeat": "edited_without_repeat",
        "editor_summary_no_save_threshold_companion": "expired_threshold_companion",
    }
    assert report["boundary"] == {
        "approval_truth": "wordpress_local",
        "automatic_model_mutation": False,
        "automatic_prompt_mutation": False,
        "automatic_router_mutation": False,
        "final_write_truth": "wordpress_local",
        "preflight_truth": "wordpress_local",
        "production_mutation": False,
        "provider_calls": 0,
        "raw_content_retention": False,
    }


def test_ai_quality_regression_report_is_human_readable() -> None:
    result = _run_report()

    assert result.returncode == 0, result.stderr
    assert "Total cases: 10" in result.stdout
    assert "agent_feedback (5)" in result.stdout
    assert "editor_assist (5)" in result.stdout
    assert "quality interpretation is report-only" in result.stdout


def test_ai_quality_regression_report_rejects_raw_prompt_fields(tmp_path: Path) -> None:
    payload = json.loads(AGENT_FIXTURE.read_text(encoding="utf-8"))
    payload["samples"][0]["prompt_text"] = "must never enter a metadata fixture"
    invalid_fixture = tmp_path / "agent-feedback-with-prompt.json"
    invalid_fixture.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_report(
        "--format",
        "json",
        "--agent-fixture",
        str(invalid_fixture),
        "--editor-fixture",
        str(EDITOR_FIXTURE),
    )

    assert result.returncode == 1
    assert "forbidden field: prompt_text" in result.stderr
