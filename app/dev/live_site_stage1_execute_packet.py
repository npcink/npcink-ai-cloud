from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.dev.live_site_addon_install import APPROVAL_TEXT
from app.dev.live_site_identity_provision import DEFAULT_BASE_URL
from app.dev.live_site_preflight import _dict, _list, _text
from app.dev.live_site_stage1 import DEFAULT_OUTPUT_ROOT as DEFAULT_STAGE1_OUTPUT_ROOT
from app.dev.live_site_trial_status import (
    DEFAULT_OUTPUT_ROOT as DEFAULT_STATUS_OUTPUT_ROOT,
)
from app.dev.live_site_trial_status import (
    DEFAULT_STAGE1_REPORT,
    load_optional_json,
)

DEFAULT_READINESS_REPORT = Path(
    ".tmp/live-site-stage1-readiness/npcink-stage1/stage1-readiness-report.json"
)
DEFAULT_STATUS_REPORT = DEFAULT_STATUS_OUTPUT_ROOT / "npcink-stage1" / "trial-status-report.json"
DEFAULT_APPROVAL_FILE = DEFAULT_STAGE1_OUTPUT_ROOT / "npcink-stage1-approval.txt"
DEFAULT_OUTPUT_ROOT = Path(".tmp/live-site-stage1-execute-packet")


def _boundary_failures(
    report: dict[str, object],
    *,
    prefix: str,
    expected_false: list[str],
) -> list[str]:
    boundary = _dict(report.get("boundary"))
    return [
        f"{prefix} boundary.{key} expected false"
        for key in expected_false
        if boundary.get(key) is not False
    ]


def validate_readiness(report: dict[str, object], load_error: str) -> list[str]:
    failures: list[str] = []
    if load_error:
        return [f"readiness report {load_error}"]
    if report.get("mode") != "read_only_readiness":
        failures.append(f"readiness mode expected read_only_readiness, got {report.get('mode')!r}")
    if report.get("ok") is not True:
        failures.append("readiness ok is not true")
    if report.get("ready_for_stage1_execute_after_exact_approval") is not True:
        failures.append("readiness did not mark Stage 1 execute as ready")
    for failure in _list(report.get("all_failures")):
        failures.append(f"readiness failure: {failure}")
    failures.extend(
        _boundary_failures(
            report,
            prefix="readiness",
            expected_false=[
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "cloud_runtime_execution",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ],
        )
    )
    return failures


def validate_stage_prepare(report: dict[str, object], load_error: str) -> list[str]:
    failures: list[str] = []
    if load_error:
        return [f"stage report {load_error}"]
    if report.get("mode") != "prepare":
        failures.append(f"stage report mode expected prepare, got {report.get('mode')!r}")
    if report.get("ok") is not True:
        failures.append("stage prepare report ok is not true")
    if report.get("addon_ready_for_manual_verify") is not False:
        failures.append("stage prepare report unexpectedly marks addon ready for manual verify")
    outputs = _dict(report.get("outputs"))
    for key in ("stage_report", "addon_install_dir", "identity_dir"):
        if not _text(outputs.get(key)):
            failures.append(f"stage prepare outputs.{key} is empty")
    failures.extend(
        _boundary_failures(
            report,
            prefix="stage prepare",
            expected_false=[
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
            ],
        )
    )
    return failures


def validate_status(report: dict[str, object], load_error: str) -> list[str]:
    failures: list[str] = []
    if load_error:
        return [f"status report {load_error}"]
    if report.get("mode") != "read_only_status":
        failures.append(f"status mode expected read_only_status, got {report.get('mode')!r}")
    next_action = _dict(report.get("next_action"))
    if next_action.get("phase") != "stage1":
        failures.append(f"status next phase expected stage1, got {next_action.get('phase')!r}")
    if next_action.get("action") != "execute_stage1_after_exact_approval":
        failures.append(
            "status next action expected execute_stage1_after_exact_approval, "
            f"got {next_action.get('action')!r}"
        )
    if _text(next_action.get("approval_text")) != APPROVAL_TEXT:
        failures.append("status approval text does not match Stage 1 approval text")
    failures.extend(
        _boundary_failures(
            report,
            prefix="status",
            expected_false=[
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "cloud_runtime_execution",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ],
        )
    )
    return failures


def _stage_dir(stage_report: dict[str, object], fallback: Path) -> str:
    outputs = _dict(stage_report.get("outputs"))
    return _text(outputs.get("stage_dir")) or str(fallback)


def _base_url(readiness_report: dict[str, object]) -> str:
    cloud = _dict(readiness_report.get("cloud"))
    identity_plan = _dict(readiness_report.get("identity_plan"))
    return _text(cloud.get("base_url")) or _text(identity_plan.get("base_url")) or DEFAULT_BASE_URL


def _target(
    readiness_report: dict[str, object],
    stage_report: dict[str, object],
) -> dict[str, object]:
    target = _dict(readiness_report.get("target")) or _dict(stage_report.get("target"))
    return {
        "label": _text(target.get("label")),
        "url": _text(target.get("url")),
        "path": _text(target.get("path")),
    }


def _command(parts: list[str]) -> dict[str, object]:
    return {"argv": parts, "shell": " ".join(json.dumps(part) for part in parts)}


def build_execute_packet(
    *,
    readiness_report_path: Path,
    stage_report_path: Path,
    status_report_path: Path,
    approval_file: Path,
    output_dir: Path,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    readiness, readiness_error = load_optional_json(readiness_report_path)
    stage_report, stage_error = load_optional_json(stage_report_path)
    status, status_error = load_optional_json(status_report_path)

    failures = (
        validate_readiness(readiness, readiness_error)
        + validate_stage_prepare(stage_report, stage_error)
        + validate_status(status, status_error)
    )
    ready = not failures
    stage_dir = _stage_dir(stage_report, DEFAULT_STAGE1_OUTPUT_ROOT / "npcink-stage1")
    base_url = _base_url(readiness)

    commands = {
        "stage1_execute": _command(
            [
                "scripts/live-site-stage1.py",
                "--execute",
                "--approval-file",
                str(approval_file),
                "--base-url",
                base_url,
                "--output-dir",
                stage_dir,
            ]
        ),
        "save_verify_handoff": _command(
            [
                "scripts/live-site-save-verify-handoff.py",
                "--stage-report",
                str(stage_report_path),
                "--output-dir",
                ".tmp/live-site-save-verify-handoff/npcink-stage1",
            ]
        ),
        "trial_status": _command(
            [
                "scripts/live-site-trial-status.py",
                "--output-dir",
                ".tmp/live-site-trial-status/npcink-stage1",
            ]
        ),
        "rollback_prepare": _command(
            [
                "scripts/live-site-addon-rollback.py",
                "--snapshot",
                f"{stage_dir}/addon-install/prewrite-package/snapshot.json",
                "--output-dir",
                ".tmp/live-site-addon-rollback/npcink-stage1",
            ]
        ),
    }

    report: dict[str, object] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "stage": "live_site_stage1_execute_packet",
        "mode": "read_only_execute_packet",
        "target": _target(readiness, stage_report),
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
        "inputs": {
            "readiness_report": str(readiness_report_path),
            "stage_report": str(stage_report_path),
            "status_report": str(status_report_path),
        },
        "approval": {
            "required_text": APPROVAL_TEXT,
            "approval_file": str(approval_file),
            "requires_user_supplied_exact_text": True,
            "generic_agreement_is_not_authorization": True,
        },
        "checks": {
            "readiness_failures": validate_readiness(readiness, readiness_error),
            "stage_prepare_failures": validate_stage_prepare(stage_report, stage_error),
            "status_failures": validate_status(status, status_error),
        },
        "commands": commands,
        "failures": failures,
        "ready_for_stage1_execute_after_exact_approval": ready,
        "next_steps": next_steps(ready=ready),
    }
    (output_dir / "stage1-execute-packet.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
    (output_dir / "summary.md").write_text(render_markdown(report))
    return report


def next_steps(*, ready: bool) -> list[str]:
    if ready:
        return [
            "put the exact Stage 1 approval text in the local approval file only "
            "after explicit user authorization",
            "run the stage1_execute command from this packet",
            "then run the save_verify_handoff command before opening wp-admin",
            "do not run runtime smoke, Site Knowledge sync/search, content writes, or monitoring",
        ]
    return [
        "fix packet failures before requesting or using the Stage 1 approval file",
        "do not install the addon, provision Cloud identity, or paste Cloud credentials yet",
    ]


def render_markdown(report: dict[str, object]) -> str:
    target = _dict(report.get("target"))
    approval = _dict(report.get("approval"))
    commands = _dict(report.get("commands"))
    failures = [str(item) for item in _list(report.get("failures"))]
    lines = [
        "# Live Site Stage 1 Execute Packet",
        "",
        f"Generated at: `{_text(report.get('generated_at'))}`",
        "Mode: `read_only_execute_packet`",
        "Ready after exact approval: "
        f"`{report.get('ready_for_stage1_execute_after_exact_approval')}`",
        "",
        "## Target",
        "",
        f"- Label: `{_text(target.get('label'))}`",
        f"- URL: `{_text(target.get('url'))}`",
        f"- Path: `{_text(target.get('path'))}`",
        "",
        "## Boundary",
        "",
        "This packet is read-only. It does not install plugins, write WordPress",
        "options, provision Cloud identity, call runtime, run Site Knowledge,",
        "enable monitoring, or write content.",
        "",
        "## Approval",
        "",
        f"- Approval file: `{_text(approval.get('approval_file'))}`",
        "- Generic agreement is not authorization.",
        "- Exact required text:",
        "",
        "```text",
        _text(approval.get("required_text")),
        "```",
        "",
        "## Commands",
        "",
    ]
    for name, command in commands.items():
        command_dict = _dict(command)
        lines.extend([f"### {name}", "", "```bash", _text(command_dict.get("shell")), "```", ""])
    lines.extend(["## Failures", ""])
    if failures:
        lines.extend([f"- {failure}" for failure in failures])
    else:
        lines.append("- none")
    lines.extend(["", "## Next Steps", ""])
    lines.extend([f"- {step}" for step in _list(report.get("next_steps"))])
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a read-only Stage 1 execute packet from existing reports."
    )
    parser.add_argument("--readiness-report", type=Path, default=DEFAULT_READINESS_REPORT)
    parser.add_argument("--stage-report", type=Path, default=DEFAULT_STAGE1_REPORT)
    parser.add_argument("--status-report", type=Path, default=DEFAULT_STATUS_REPORT)
    parser.add_argument("--approval-file", type=Path, default=DEFAULT_APPROVAL_FILE)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"npcink-stage1-{suffix}"
    report = build_execute_packet(
        readiness_report_path=args.readiness_report,
        stage_report_path=args.stage_report,
        status_report_path=args.status_report,
        approval_file=args.approval_file,
        output_dir=output_dir,
    )
    print(
        json.dumps(
            {
                "ok": report["ready_for_stage1_execute_after_exact_approval"],
                "mode": report["mode"],
                "output_dir": str(output_dir),
                "failed_checks": report["failures"],
                "approval_file": _dict(report.get("approval")).get("approval_file", ""),
            },
            ensure_ascii=False,
        )
    )
    return 0 if report["ready_for_stage1_execute_after_exact_approval"] is True else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
