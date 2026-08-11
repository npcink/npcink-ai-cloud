import importlib.util
import sys
from pathlib import Path

import pytest

MODULE_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "compare-release-timing.py"
)
SPEC = importlib.util.spec_from_file_location("compare_release_timing", MODULE_PATH)
assert SPEC is not None
compare_release_timing = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["compare_release_timing"] = compare_release_timing
SPEC.loader.exec_module(compare_release_timing)

ComparisonError = compare_release_timing.ComparisonError
compare_receipts = compare_release_timing.compare_receipts


def github_receipt(*, run_id: int, duration: int, contract_seconds: int) -> dict:
    return {
        "schema": "npcink.release_timing.v1",
        "kind": "github_actions_run",
        "run_id": run_id,
        "workflow_name": "Cloud CI",
        "event": "pull_request",
        "head_branch": f"codex/backend-{run_id}",
        "head_sha": str(run_id).zfill(40),
        "url": f"https://example.test/runs/{run_id}",
        "status": "completed",
        "conclusion": "success",
        "duration_seconds": duration,
        "jobs": [
            {
                "name": "backend-targeted (contract-1)",
                "conclusion": "success",
                "duration_seconds": contract_seconds,
            },
            {
                "name": "frontend",
                "conclusion": "success",
                "duration_seconds": 30,
            },
        ],
    }


def production_receipt(*, run_id: str, total: int, transfer: int) -> dict:
    return {
        "schema": "npcink.release_timing.v1",
        "kind": "production_deploy_phases",
        "repository": "npcink/npcink-ai-cloud",
        "workflow_run_id": run_id,
        "head_sha": run_id.zfill(40),
        "release_lane": "backend",
        "release_action": "runtime",
        "status": "success",
        "recorded_total_seconds": total + transfer,
        "remote_sequence_seconds": total,
        "category_seconds": {
            "bundle": 0,
            "transfer": transfer,
            "image_load": 20,
            "migration": 0,
            "cutover": 30,
            "health": 10,
            "other": 5,
        },
    }


def test_compare_github_receipts_reports_wall_and_job_improvement() -> None:
    comparison = compare_receipts(
        github_receipt(run_id=1, duration=300, contract_seconds=240),
        github_receipt(run_id=2, duration=240, contract_seconds=180),
    )

    assert comparison["schema"] == "npcink.release_timing_comparison.v1"
    assert comparison["primary_metric"] == {
        "name": "run_wall",
        "baseline_seconds": 300,
        "candidate_seconds": 240,
        "delta_seconds": -60,
        "improvement_percent": 20.0,
        "measured_direction": "faster",
    }
    assert comparison["metrics"][1]["name"] == "job:backend-targeted (contract-1)"
    assert comparison["metrics"][1]["improvement_percent"] == 25.0


def test_compare_github_receipts_rejects_different_executed_job_sets() -> None:
    baseline = github_receipt(run_id=1, duration=300, contract_seconds=240)
    candidate = github_receipt(run_id=2, duration=240, contract_seconds=180)
    candidate["jobs"].append(
        {
            "name": "backend-targeted (impacted)",
            "conclusion": "success",
            "duration_seconds": 12,
        }
    )

    with pytest.raises(ComparisonError, match="job sets do not match"):
        compare_receipts(baseline, candidate)


def test_compare_github_receipts_rejects_same_run_and_unsuccessful_job() -> None:
    baseline = github_receipt(run_id=1, duration=300, contract_seconds=240)
    same_run = github_receipt(run_id=1, duration=240, contract_seconds=180)
    with pytest.raises(ComparisonError, match="run IDs must differ"):
        compare_receipts(baseline, same_run)

    candidate = github_receipt(run_id=2, duration=240, contract_seconds=180)
    candidate["jobs"][0]["conclusion"] = "neutral"
    with pytest.raises(ComparisonError, match="job did not succeed"):
        compare_receipts(baseline, candidate)


def test_compare_production_receipts_requires_same_lane_and_action() -> None:
    baseline = production_receipt(run_id="10", total=120, transfer=40)
    candidate = production_receipt(run_id="11", total=90, transfer=15)

    comparison = compare_receipts(baseline, candidate)

    assert comparison["primary_metric"]["name"] == "recorded_total"
    assert comparison["primary_metric"]["improvement_percent"] == 34.38
    remote_sequence = next(
        item
        for item in comparison["metrics"]
        if item["name"] == "remote_sequence"
    )
    assert remote_sequence["improvement_percent"] == 25.0
    transfer = next(
        item
        for item in comparison["metrics"]
        if item["name"] == "category:transfer"
    )
    assert transfer["improvement_percent"] == 62.5

    candidate["release_lane"] = "migration"
    with pytest.raises(ComparisonError, match="release_lane"):
        compare_receipts(baseline, candidate)


def test_compare_production_receipts_requires_recorded_total() -> None:
    baseline = production_receipt(run_id="10", total=120, transfer=40)
    candidate = production_receipt(run_id="11", total=90, transfer=15)
    del candidate["recorded_total_seconds"]

    with pytest.raises(ComparisonError, match="recorded phase total is missing"):
        compare_receipts(baseline, candidate)
