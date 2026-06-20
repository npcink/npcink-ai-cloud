from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.dev.live_site_identity_provision import DEFAULT_BASE_URL
from app.dev.live_site_preflight import _dict, _list, _text
from app.dev.live_site_runtime_execute_smoke import (
    APPROVAL_TEXT as RUNTIME_EXECUTE_APPROVAL_TEXT,
)
from app.dev.live_site_runtime_execute_smoke import (
    DEFAULT_OUTPUT_ROOT as DEFAULT_RUNTIME_EXECUTE_OUTPUT_ROOT,
)
from app.dev.live_site_runtime_execute_smoke import (
    DEFAULT_RESOLVE_SMOKE_REPORT,
)
from app.dev.live_site_runtime_resolve_execute_packet import (
    validate_acceptance,
    validate_stage_execute,
)
from app.dev.live_site_runtime_smoke import (
    DEFAULT_ACCEPTANCE_REPORT,
    DEFAULT_STAGE_REPORT,
)
from app.dev.live_site_runtime_smoke import (
    DEFAULT_OUTPUT_ROOT as DEFAULT_RUNTIME_RESOLVE_OUTPUT_ROOT,
)
from app.dev.live_site_trial_status import (
    DEFAULT_OUTPUT_ROOT as DEFAULT_STATUS_OUTPUT_ROOT,
)
from app.dev.live_site_trial_status import load_optional_json

DEFAULT_EXECUTE_PREPARE_REPORT = (
    DEFAULT_RUNTIME_EXECUTE_OUTPUT_ROOT
    / "npcink-execute"
    / "runtime-execute-smoke-report.json"
)
DEFAULT_STATUS_REPORT = DEFAULT_STATUS_OUTPUT_ROOT / "npcink-execute" / "trial-status-report.json"
DEFAULT_APPROVAL_FILE = DEFAULT_RUNTIME_EXECUTE_OUTPUT_ROOT / "npcink-execute-approval.txt"
DEFAULT_OUTPUT_ROOT = Path(".tmp/live-site-runtime-execute-execute-packet")


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


def validate_resolve_smoke(report: dict[str, object], load_error: str) -> list[str]:
    failures: list[str] = []
    if load_error:
        return [f"resolve smoke report {load_error}"]
    if report.get("mode") != "execute":
        failures.append(f"resolve smoke mode expected execute, got {report.get('mode')!r}")
    if report.get("ok") is not True:
        failures.append("resolve smoke report ok is not true")
    if _list(report.get("acceptance_failures")):
        failures.append(
            "resolve smoke acceptance_failures: "
            + ", ".join(str(item) for item in _list(report.get("acceptance_failures")))
        )
    if _list(report.get("response_failures")):
        failures.append(
            "resolve smoke response_failures: "
            + ", ".join(str(item) for item in _list(report.get("response_failures")))
        )
    request_plan = _dict(report.get("request_plan"))
    expected_plan = {
        "method": "POST",
        "path": "/v1/runtime/resolve",
        "execution_pattern": "inline",
        "storage_mode": "result_only",
    }
    for key, expected in expected_plan.items():
        if request_plan.get(key) != expected:
            failures.append(
                f"resolve smoke request_plan.{key} expected {expected!r}, "
                f"got {request_plan.get(key)!r}"
            )
    policy = _dict(request_plan.get("policy"))
    if policy != {"allow_fallback": True}:
        failures.append(
            f"resolve smoke request_plan.policy expected allow_fallback only, got {policy!r}"
        )
    boundary = _dict(report.get("boundary"))
    if boundary.get("runtime_resolve_smoke") is not True:
        failures.append("resolve smoke boundary.runtime_resolve_smoke expected true")
    failures.extend(
        _boundary_failures(
            report,
            prefix="resolve smoke",
            expected_false=[
                "wordpress_writes",
                "wordpress_option_writes",
                "cloud_identity_provisioning",
                "public_runtime_provisioning",
                "runtime_execute",
                "provider_execution",
                "site_knowledge_sync",
                "site_knowledge_search",
                "content_writes",
                "monitoring_enabled",
            ],
        )
    )
    return failures


def validate_execute_prepare(report: dict[str, object], load_error: str) -> list[str]:
    failures: list[str] = []
    if load_error:
        return [f"execute prepare report {load_error}"]
    if report.get("mode") != "prepare":
        failures.append(f"execute prepare mode expected prepare, got {report.get('mode')!r}")
    if _list(report.get("acceptance_failures")):
        failures.append(
            "execute prepare acceptance_failures: "
            + ", ".join(str(item) for item in _list(report.get("acceptance_failures")))
        )
    if _list(report.get("resolve_smoke_failures")):
        failures.append(
            "execute prepare resolve_smoke_failures: "
            + ", ".join(str(item) for item in _list(report.get("resolve_smoke_failures")))
        )
    if _list(report.get("response_failures")):
        failures.append(
            "execute prepare response_failures: "
            + ", ".join(str(item) for item in _list(report.get("response_failures")))
        )
    request_plan = _dict(report.get("request_plan"))
    expected_plan = {
        "method": "POST",
        "path": "/v1/runtime/execute",
        "execution_pattern": "inline",
        "storage_mode": "result_only",
    }
    for key, expected in expected_plan.items():
        if request_plan.get(key) != expected:
            failures.append(
                f"execute prepare request_plan.{key} expected {expected!r}, "
                f"got {request_plan.get(key)!r}"
            )
    policy = _dict(request_plan.get("policy"))
    if policy != {"allow_fallback": True}:
        failures.append(
            f"execute prepare request_plan.policy expected allow_fallback only, got {policy!r}"
        )
    failures.extend(
        _boundary_failures(
            report,
            prefix="execute prepare",
            expected_false=[
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
    if next_action.get("phase") != "runtime_execute_smoke":
        failures.append(
            f"status next phase expected runtime_execute_smoke, got {next_action.get('phase')!r}"
        )
    if next_action.get("action") != "execute_runtime_execute_smoke_after_exact_approval":
        failures.append(
            "status next action expected execute_runtime_execute_smoke_after_exact_approval, "
            f"got {next_action.get('action')!r}"
        )
    if _text(next_action.get("approval_text")) != RUNTIME_EXECUTE_APPROVAL_TEXT:
        failures.append("status approval text does not match runtime execute approval text")
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


def _base_url(stage_report: dict[str, object], fallback: str) -> str:
    identity_target = _dict(_dict(stage_report.get("identity_provision")).get("target"))
    return _text(identity_target.get("base_url")) or fallback


def _target(
    acceptance_report: dict[str, object],
    stage_report: dict[str, object],
) -> dict[str, object]:
    target = _dict(acceptance_report.get("target")) or _dict(stage_report.get("target"))
    identity_target = _dict(_dict(stage_report.get("identity_provision")).get("target"))
    return {
        "label": _text(target.get("label")),
        "url": _text(target.get("url")),
        "path": _text(target.get("path")),
        "site_id": _text(identity_target.get("site_id")),
    }


def _command(parts: list[str]) -> dict[str, object]:
    return {"argv": parts, "shell": " ".join(json.dumps(part) for part in parts)}


def build_execute_packet(
    *,
    acceptance_report_path: Path,
    stage_report_path: Path,
    resolve_smoke_report_path: Path,
    execute_prepare_report_path: Path,
    status_report_path: Path,
    approval_file: Path,
    output_dir: Path,
    base_url: str = DEFAULT_BASE_URL,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    acceptance, acceptance_error = load_optional_json(acceptance_report_path)
    stage_report, stage_error = load_optional_json(stage_report_path)
    resolve_smoke, resolve_smoke_error = load_optional_json(resolve_smoke_report_path)
    execute_prepare, execute_prepare_error = load_optional_json(execute_prepare_report_path)
    status, status_error = load_optional_json(status_report_path)

    checks = {
        "acceptance_failures": validate_acceptance(acceptance, acceptance_error),
        "stage_execute_failures": validate_stage_execute(stage_report, stage_error),
        "resolve_smoke_failures": validate_resolve_smoke(
            resolve_smoke,
            resolve_smoke_error,
        ),
        "execute_prepare_failures": validate_execute_prepare(
            execute_prepare,
            execute_prepare_error,
        ),
        "status_failures": validate_status(status, status_error),
    }
    failures = [failure for values in checks.values() for failure in values]
    ready = not failures
    resolved_base_url = _base_url(stage_report, base_url)
    execute_output_dir = str(DEFAULT_RUNTIME_EXECUTE_OUTPUT_ROOT / "npcink-execute")

    commands = {
        "runtime_execute_execute": _command(
            [
                "scripts/live-site-runtime-execute-smoke.py",
                "--execute",
                "--approval-file",
                str(approval_file),
                "--acceptance-report",
                str(acceptance_report_path),
                "--stage-report",
                str(stage_report_path),
                "--resolve-smoke-report",
                str(resolve_smoke_report_path),
                "--base-url",
                resolved_base_url,
                "--output-dir",
                execute_output_dir,
            ]
        ),
        "trial_status_after_execute": _command(
            [
                "scripts/live-site-trial-status.py",
                "--stage1-report",
                str(stage_report_path),
                "--acceptance-report",
                str(acceptance_report_path),
                "--resolve-smoke-report",
                str(
                    DEFAULT_RUNTIME_RESOLVE_OUTPUT_ROOT
                    / "npcink-resolve"
                    / "runtime-resolve-smoke-report.json"
                ),
                "--execute-smoke-report",
                str(
                    DEFAULT_RUNTIME_EXECUTE_OUTPUT_ROOT
                    / "npcink-execute"
                    / "runtime-execute-smoke-report.json"
                ),
                "--output-dir",
                str(DEFAULT_STATUS_OUTPUT_ROOT / "npcink-execute-after-execute"),
            ]
        ),
    }

    report: dict[str, object] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "stage": "live_site_runtime_execute_execute_packet",
        "mode": "read_only_runtime_execute_execute_packet",
        "target": _target(acceptance, stage_report),
        "boundary": {
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
        },
        "execute_mode_expected_boundary": {
            "runtime_execute_smoke": True,
            "provider_execution_possible": True,
            "site_knowledge_sync": False,
            "site_knowledge_search": False,
            "wordpress_writes": False,
            "content_writes": False,
            "monitoring_enabled": False,
        },
        "inputs": {
            "acceptance_report": str(acceptance_report_path),
            "stage_report": str(stage_report_path),
            "resolve_smoke_report": str(resolve_smoke_report_path),
            "execute_prepare_report": str(execute_prepare_report_path),
            "status_report": str(status_report_path),
        },
        "approval": {
            "required_text": RUNTIME_EXECUTE_APPROVAL_TEXT,
            "approval_file": str(approval_file),
            "requires_user_supplied_exact_text": True,
            "generic_agreement_is_not_authorization": True,
        },
        "checks": checks,
        "commands": commands,
        "failures": failures,
        "ready_for_runtime_execute_execute_after_exact_approval": ready,
        "next_steps": next_steps(ready=ready),
    }
    (output_dir / "runtime-execute-execute-packet.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
    (output_dir / "summary.md").write_text(render_markdown(report))
    return report


def next_steps(*, ready: bool) -> list[str]:
    if ready:
        return [
            "put the exact runtime execute smoke approval text in the local approval file only "
            "after explicit user authorization",
            "run the runtime_execute_execute command from this packet",
            "then run the trial_status_after_execute command",
            "do not run Site Knowledge sync/search, WordPress content writes, or monitoring",
        ]
    return [
        "fix packet failures before requesting or using the runtime execute approval file",
        "do not call /v1/runtime/execute, Site Knowledge, or WordPress content writes yet",
    ]


def render_markdown(report: dict[str, object]) -> str:
    target = _dict(report.get("target"))
    approval = _dict(report.get("approval"))
    commands = _dict(report.get("commands"))
    failures = [str(item) for item in _list(report.get("failures"))]
    lines = [
        "# Live Site Runtime Execute Execute Packet",
        "",
        f"Generated at: `{_text(report.get('generated_at'))}`",
        "Mode: `read_only_runtime_execute_execute_packet`",
        "Ready after exact approval: "
        f"`{report.get('ready_for_runtime_execute_execute_after_exact_approval')}`",
        "",
        "## Target",
        "",
        f"- Label: `{_text(target.get('label'))}`",
        f"- URL: `{_text(target.get('url'))}`",
        f"- Path: `{_text(target.get('path'))}`",
        f"- Site ID: `{_text(target.get('site_id'))}`",
        "",
        "## Boundary",
        "",
        "This packet is read-only. It does not call Cloud runtime, run provider",
        "execution, run Site Knowledge, write WordPress options or content,",
        "provision Cloud identity, or enable monitoring.",
        "",
        "Execute mode may trigger provider execution. It still must not run Site",
        "Knowledge sync/search, write WordPress content, or enable monitoring.",
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
        description="Build a read-only runtime execute execute packet from existing reports."
    )
    parser.add_argument("--acceptance-report", type=Path, default=DEFAULT_ACCEPTANCE_REPORT)
    parser.add_argument("--stage-report", type=Path, default=DEFAULT_STAGE_REPORT)
    parser.add_argument("--resolve-smoke-report", type=Path, default=DEFAULT_RESOLVE_SMOKE_REPORT)
    parser.add_argument(
        "--execute-prepare-report",
        type=Path,
        default=DEFAULT_EXECUTE_PREPARE_REPORT,
    )
    parser.add_argument("--status-report", type=Path, default=DEFAULT_STATUS_REPORT)
    parser.add_argument("--approval-file", type=Path, default=DEFAULT_APPROVAL_FILE)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"npcink-execute-{suffix}"
    report = build_execute_packet(
        acceptance_report_path=args.acceptance_report,
        stage_report_path=args.stage_report,
        resolve_smoke_report_path=args.resolve_smoke_report,
        execute_prepare_report_path=args.execute_prepare_report,
        status_report_path=args.status_report,
        approval_file=args.approval_file,
        output_dir=output_dir,
        base_url=args.base_url,
    )
    print(
        json.dumps(
            {
                "ok": report["ready_for_runtime_execute_execute_after_exact_approval"],
                "mode": report["mode"],
                "output_dir": str(output_dir),
                "failed_checks": report["failures"],
                "approval_file": _dict(report.get("approval")).get("approval_file", ""),
            },
            ensure_ascii=False,
        )
    )
    return 0 if report["ready_for_runtime_execute_execute_after_exact_approval"] is True else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
