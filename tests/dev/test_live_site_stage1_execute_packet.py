from __future__ import annotations

import json
from pathlib import Path

from app.dev.live_site_addon_install import APPROVAL_TEXT
from app.dev.live_site_stage1_execute_packet import build_execute_packet


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload) + "\n")
    return path


def _paths(tmp_path: Path) -> dict[str, Path]:
    return {
        "readiness_report_path": tmp_path / "readiness" / "stage1-readiness-report.json",
        "stage_report_path": tmp_path / "stage1" / "stage1-report.json",
        "status_report_path": tmp_path / "status" / "trial-status-report.json",
        "approval_file": tmp_path / "stage1-approval.txt",
    }


def _write_ready_inputs(paths: dict[str, Path]) -> None:
    _write_json(
        paths["readiness_report_path"],
        {
            "mode": "read_only_readiness",
            "ok": True,
            "ready_for_stage1_execute_after_exact_approval": True,
            "all_failures": [],
            "target": {
                "label": "npcink",
                "url": "http://npcink.local/",
                "path": "/site/app/public",
            },
            "cloud": {"base_url": "http://127.0.0.1:8010"},
            "boundary": {
                "wordpress_writes": False,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": False,
                "public_runtime_provisioning": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "site_knowledge_search": False,
                "content_writes": False,
                "monitoring_enabled": False,
            },
        },
    )
    _write_json(
        paths["stage_report_path"],
        {
            "mode": "prepare",
            "ok": True,
            "addon_ready_for_manual_verify": False,
            "outputs": {
                "stage_dir": str(paths["stage_report_path"].parent),
                "stage_report": str(paths["stage_report_path"]),
                "addon_install_dir": str(paths["stage_report_path"].parent / "addon-install"),
                "identity_dir": str(paths["stage_report_path"].parent / "identity"),
            },
            "boundary": {
                "wordpress_writes": False,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": False,
                "public_runtime_provisioning": False,
                "cloud_runtime_execution": False,
                "runtime_smoke": False,
                "site_knowledge_sync": False,
                "site_knowledge_search": False,
                "content_writes": False,
                "monitoring_enabled": False,
            },
        },
    )
    _write_json(
        paths["status_report_path"],
        {
            "mode": "read_only_status",
            "next_action": {
                "phase": "stage1",
                "action": "execute_stage1_after_exact_approval",
                "approval_text": APPROVAL_TEXT,
            },
            "boundary": {
                "wordpress_writes": False,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": False,
                "public_runtime_provisioning": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "site_knowledge_search": False,
                "content_writes": False,
                "monitoring_enabled": False,
            },
        },
    )


def test_execute_packet_ready_from_readiness_prepare_and_status(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")
    encoded = json.dumps(report)

    assert report["ready_for_stage1_execute_after_exact_approval"] is True
    assert report["approval"]["required_text"] == APPROVAL_TEXT  # type: ignore[index]
    assert report["commands"]["stage1_execute"]["argv"] == [  # type: ignore[index]
        "scripts/live-site-stage1.py",
        "--execute",
        "--approval-file",
        str(paths["approval_file"]),
        "--base-url",
        "http://127.0.0.1:8010",
        "--output-dir",
        str(paths["stage_report_path"].parent),
    ]
    assert "internal-token" not in encoded
    assert (tmp_path / "packet" / "stage1-execute-packet.json").exists()
    assert (tmp_path / "packet" / "summary.md").exists()


def test_execute_packet_blocks_when_readiness_missing(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    paths["readiness_report_path"].unlink()

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_stage1_execute_after_exact_approval"] is False
    assert "readiness report missing" in report["failures"]


def test_execute_packet_blocks_when_stage_report_not_prepare(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    stage = json.loads(paths["stage_report_path"].read_text())
    stage["mode"] = "execute"
    paths["stage_report_path"].write_text(json.dumps(stage) + "\n")

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_stage1_execute_after_exact_approval"] is False
    assert "stage report mode expected prepare, got 'execute'" in report["failures"]


def test_execute_packet_blocks_when_status_next_action_is_not_stage1(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    status = json.loads(paths["status_report_path"].read_text())
    status["next_action"]["phase"] = "stage1_acceptance"
    status["next_action"]["action"] = "complete_wp_admin_save_and_verify_then_run_acceptance"
    status["next_action"]["approval_text"] = ""
    paths["status_report_path"].write_text(json.dumps(status) + "\n")

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_stage1_execute_after_exact_approval"] is False
    assert "status next phase expected stage1, got 'stage1_acceptance'" in report["failures"]


def test_execute_packet_boundary_stays_read_only(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["boundary"] == {
        "wordpress_writes": False,
        "wordpress_option_writes": False,
        "cloud_identity_provisioning": False,
        "public_runtime_provisioning": False,
        "cloud_runtime_execution": False,
        "runtime_smoke": False,
        "site_knowledge_sync": False,
        "site_knowledge_search": False,
        "content_writes": False,
        "monitoring_enabled": False,
    }
