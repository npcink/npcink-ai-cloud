from __future__ import annotations

import json
from pathlib import Path

from app.dev.live_site_runtime_execute_execute_packet import build_execute_packet
from app.dev.live_site_runtime_execute_smoke import APPROVAL_TEXT


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload) + "\n")
    return path


def _paths(tmp_path: Path) -> dict[str, Path]:
    return {
        "acceptance_report_path": tmp_path / "acceptance" / "acceptance-report.json",
        "stage_report_path": tmp_path / "stage1" / "stage1-report.json",
        "resolve_smoke_report_path": tmp_path / "resolve" / "runtime-resolve-smoke-report.json",
        "execute_prepare_report_path": tmp_path / "execute" / "runtime-execute-smoke-report.json",
        "status_report_path": tmp_path / "status" / "trial-status-report.json",
        "approval_file": tmp_path / "execute-approval.txt",
    }


def _boundary_false(*keys: str) -> dict[str, bool]:
    return {key: False for key in keys}


def _write_ready_inputs(paths: dict[str, Path]) -> None:
    secret_file = paths["stage_report_path"].parent / "identity" / "cloud-api-key.secret.json"
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    secret_file.write_text(
        json.dumps(
            {
                "site_id": "site_npcink_local_live",
                "key_id": "key_live",
                "secret": "secret_live",
                "cloud_api_key": "mak1_fake",
            }
        )
        + "\n"
    )
    _write_json(
        paths["acceptance_report_path"],
        {
            "mode": "read_only_acceptance",
            "ready_for_runtime_smoke_approval": True,
            "checks": [{"name": "cloud_addon_verified", "ok": True}],
            "target": {
                "label": "npcink",
                "url": "http://npcink.local/",
                "path": "/site/app/public",
            },
            "boundary": _boundary_false(
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "cloud_runtime_execution",
                "runtime_smoke",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ),
        },
    )
    _write_json(
        paths["stage_report_path"],
        {
            "mode": "execute",
            "ok": True,
            "outputs": {"secret_file": str(secret_file)},
            "identity_provision": {
                "target": {
                    "site_id": "site_npcink_local_live",
                    "base_url": "http://127.0.0.1:8010",
                }
            },
            "boundary": {
                "wordpress_writes": True,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": True,
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
        paths["resolve_smoke_report_path"],
        {
            "mode": "execute",
            "ok": True,
            "acceptance_failures": [],
            "response_failures": [],
            "request_plan": {
                "method": "POST",
                "path": "/v1/runtime/resolve",
                "site_id": "site_npcink_local_live",
                "execution_pattern": "inline",
                "storage_mode": "result_only",
                "policy": {"allow_fallback": True},
            },
            "boundary": {
                "wordpress_writes": False,
                "wordpress_option_writes": False,
                "cloud_identity_provisioning": False,
                "public_runtime_provisioning": False,
                "runtime_resolve_smoke": True,
                "runtime_execute": False,
                "provider_execution": False,
                "site_knowledge_sync": False,
                "site_knowledge_search": False,
                "content_writes": False,
                "monitoring_enabled": False,
            },
        },
    )
    _write_json(
        paths["execute_prepare_report_path"],
        {
            "mode": "prepare",
            "ok": False,
            "acceptance_failures": [],
            "resolve_smoke_failures": [],
            "response_failures": [],
            "request_plan": {
                "method": "POST",
                "path": "/v1/runtime/execute",
                "site_id": "site_npcink_local_live",
                "execution_pattern": "inline",
                "storage_mode": "result_only",
                "policy": {"allow_fallback": True},
            },
            "boundary": _boundary_false(
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "runtime_resolve_smoke",
                "runtime_execute_smoke",
                "provider_execution_possible",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ),
        },
    )
    _write_json(
        paths["status_report_path"],
        {
            "mode": "read_only_status",
            "next_action": {
                "phase": "runtime_execute_smoke",
                "action": "execute_runtime_execute_smoke_after_exact_approval",
                "approval_text": APPROVAL_TEXT,
            },
            "boundary": _boundary_false(
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "cloud_runtime_execution",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ),
        },
    )


def test_execute_packet_ready_from_resolve_execute_prepare_and_status(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")
    encoded = json.dumps(report)

    assert report["ready_for_runtime_execute_execute_after_exact_approval"] is True
    assert report["approval"]["required_text"] == APPROVAL_TEXT  # type: ignore[index]
    assert report["commands"]["runtime_execute_execute"]["argv"] == [  # type: ignore[index]
        "scripts/live-site-runtime-execute-smoke.py",
        "--execute",
        "--approval-file",
        str(paths["approval_file"]),
        "--acceptance-report",
        str(paths["acceptance_report_path"]),
        "--stage-report",
        str(paths["stage_report_path"]),
        "--resolve-smoke-report",
        str(paths["resolve_smoke_report_path"]),
        "--base-url",
        "http://127.0.0.1:8010",
        "--output-dir",
        ".tmp/live-site-runtime-execute-smoke/npcink-execute",
    ]
    assert report["execute_mode_expected_boundary"]["provider_execution_possible"] is True  # type: ignore[index]
    assert "secret_live" not in encoded
    assert "mak1_fake" not in encoded
    assert (tmp_path / "packet" / "runtime-execute-execute-packet.json").exists()
    assert (tmp_path / "packet" / "summary.md").exists()


def test_execute_packet_blocks_when_resolve_smoke_not_executed(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    resolve = json.loads(paths["resolve_smoke_report_path"].read_text())
    resolve["mode"] = "prepare"
    resolve["ok"] = False
    paths["resolve_smoke_report_path"].write_text(json.dumps(resolve) + "\n")

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_runtime_execute_execute_after_exact_approval"] is False
    assert "resolve smoke mode expected execute, got 'prepare'" in report["failures"]
    assert "resolve smoke report ok is not true" in report["failures"]


def test_execute_packet_blocks_when_execute_prepare_path_is_wrong(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    prepare = json.loads(paths["execute_prepare_report_path"].read_text())
    prepare["request_plan"]["path"] = "/v1/runtime/resolve"
    paths["execute_prepare_report_path"].write_text(json.dumps(prepare) + "\n")

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_runtime_execute_execute_after_exact_approval"] is False
    assert (
        "execute prepare request_plan.path expected '/v1/runtime/execute', "
        "got '/v1/runtime/resolve'"
    ) in report["failures"]


def test_execute_packet_blocks_when_status_next_action_is_not_execute(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)
    status = json.loads(paths["status_report_path"].read_text())
    status["next_action"]["phase"] = "site_knowledge_sync"
    status["next_action"]["action"] = "request_site_knowledge_approval"
    paths["status_report_path"].write_text(json.dumps(status) + "\n")

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["ready_for_runtime_execute_execute_after_exact_approval"] is False
    assert (
        "status next phase expected runtime_execute_smoke, got 'site_knowledge_sync'"
        in report["failures"]
    )


def test_execute_packet_boundary_stays_read_only(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    _write_ready_inputs(paths)

    report = build_execute_packet(**paths, output_dir=tmp_path / "packet")

    assert report["boundary"] == {
        "wordpress_writes": False,
        "wordpress_option_writes": False,
        "cloud_identity_provisioning": False,
        "public_runtime_provisioning": False,
        "runtime_resolve_smoke": False,
        "runtime_execute_smoke": False,
        "provider_execution_possible": False,
        "site_knowledge_sync": False,
        "site_knowledge_search": False,
        "content_writes": False,
        "monitoring_enabled": False,
    }
