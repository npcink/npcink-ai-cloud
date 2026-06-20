from __future__ import annotations

import json
from pathlib import Path

from app.dev.live_site_addon_install import APPROVAL_TEXT as STAGE1_APPROVAL_TEXT
from app.dev.live_site_runtime_execute_smoke import (
    APPROVAL_TEXT as EXECUTE_SMOKE_APPROVAL_TEXT,
)
from app.dev.live_site_runtime_smoke import APPROVAL_TEXT as RESOLVE_SMOKE_APPROVAL_TEXT
from app.dev.live_site_trial_status import build_status_report, load_optional_json


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload) + "\n")
    return path


def _paths(tmp_path: Path) -> dict[str, Path]:
    return {
        "stage1_report_path": tmp_path / "stage1-report.json",
        "handoff_report_path": tmp_path / "save-verify-handoff-report.json",
        "acceptance_report_path": tmp_path / "acceptance-report.json",
        "resolve_smoke_report_path": tmp_path / "runtime-resolve-smoke-report.json",
        "execute_smoke_report_path": tmp_path / "runtime-execute-smoke-report.json",
    }


def _write_ready_chain(paths: dict[str, Path]) -> None:
    _write_json(
        paths["stage1_report_path"],
        {
            "mode": "execute",
            "ok": True,
            "boundary": {
                "wordpress_option_writes": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        },
    )
    _write_json(
        paths["handoff_report_path"],
        {
            "mode": "read_only_handoff",
            "ready_for_manual_save_verify": True,
            "failures": [],
            "boundary": {
                "wordpress_writes": False,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        },
    )
    _write_json(
        paths["acceptance_report_path"],
        {
            "mode": "read_only_acceptance",
            "ready_for_runtime_smoke_approval": True,
            "boundary": {
                "wordpress_writes": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        },
    )
    _write_json(
        paths["resolve_smoke_report_path"],
        {
            "mode": "execute",
            "ok": True,
            "boundary": {
                "wordpress_writes": False,
                "runtime_execute": False,
                "provider_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
            "acceptance_failures": [],
            "response_failures": [],
        },
    )
    _write_json(
        paths["execute_smoke_report_path"],
        {
            "mode": "execute",
            "ok": True,
            "boundary": {
                "wordpress_writes": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
            "acceptance_failures": [],
            "resolve_smoke_failures": [],
            "response_failures": [],
        },
    )


def test_load_optional_json_reports_missing(tmp_path) -> None:
    report, error = load_optional_json(tmp_path / "missing.json")

    assert report == {}
    assert error == "missing"


def test_status_points_to_stage1_when_first_report_missing(tmp_path) -> None:
    paths = _paths(tmp_path)
    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is False
    assert report["next_action"] == {
        "phase": "stage1",
        "action": "execute_stage1_after_exact_approval",
        "approval_text": STAGE1_APPROVAL_TEXT,
    }


def test_status_treats_stage1_prepare_as_not_complete(tmp_path) -> None:
    paths = _paths(tmp_path)
    _write_ready_chain(paths)
    _write_json(
        paths["stage1_report_path"],
        {
            "mode": "prepare",
            "ok": True,
            "boundary": {
                "wordpress_option_writes": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        },
    )

    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is False
    assert report["next_action"] == {
        "phase": "stage1",
        "action": "execute_stage1_after_exact_approval",
        "approval_text": STAGE1_APPROVAL_TEXT,
    }


def test_status_points_to_resolve_smoke_after_acceptance(tmp_path) -> None:
    paths = _paths(tmp_path)
    _write_ready_chain(paths)
    paths["resolve_smoke_report_path"].unlink()

    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is False
    assert report["next_action"] == {
        "phase": "runtime_resolve_smoke",
        "action": "execute_runtime_resolve_smoke_after_exact_approval",
        "approval_text": RESOLVE_SMOKE_APPROVAL_TEXT,
    }


def test_status_points_to_handoff_after_stage1(tmp_path) -> None:
    paths = _paths(tmp_path)
    _write_ready_chain(paths)
    paths["handoff_report_path"].unlink()

    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is False
    assert report["next_action"] == {
        "phase": "stage1_save_verify_handoff",
        "action": "generate_save_verify_handoff_then_complete_wp_admin_save_and_verify",
        "approval_text": "",
    }


def test_status_points_to_execute_smoke_after_resolve(tmp_path) -> None:
    paths = _paths(tmp_path)
    _write_ready_chain(paths)
    paths["execute_smoke_report_path"].unlink()

    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is False
    assert report["next_action"] == {
        "phase": "runtime_execute_smoke",
        "action": "execute_runtime_execute_smoke_after_exact_approval",
        "approval_text": EXECUTE_SMOKE_APPROVAL_TEXT,
    }


def test_status_complete_when_all_phases_ok(tmp_path) -> None:
    paths = _paths(tmp_path)
    _write_ready_chain(paths)

    report = build_status_report(**paths, output_dir=tmp_path / "out")

    assert report["complete"] is True
    assert report["next_action"] == {
        "phase": "complete",
        "action": "trial_chain_complete_prepare_site_knowledge_decision",
        "approval_text": "",
    }
    assert (tmp_path / "out" / "trial-status-report.json").exists()
    assert (tmp_path / "out" / "summary.md").exists()
