from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.dev.live_site_addon_install import APPROVAL_TEXT as STAGE1_APPROVAL_TEXT
from app.dev.live_site_preflight import _dict, _list, _text
from app.dev.live_site_runtime_execute_smoke import (
    APPROVAL_TEXT as EXECUTE_SMOKE_APPROVAL_TEXT,
)
from app.dev.live_site_runtime_smoke import APPROVAL_TEXT as RESOLVE_SMOKE_APPROVAL_TEXT

DEFAULT_STAGE1_REPORT = Path(".tmp/live-site-stage1/npcink-stage1/stage1-report.json")
DEFAULT_ACCEPTANCE_REPORT = Path(
    ".tmp/live-site-stage1-acceptance/npcink-stage1/acceptance-report.json"
)
DEFAULT_RESOLVE_SMOKE_REPORT = Path(
    ".tmp/live-site-runtime-smoke/npcink-resolve/runtime-resolve-smoke-report.json"
)
DEFAULT_EXECUTE_SMOKE_REPORT = Path(
    ".tmp/live-site-runtime-execute-smoke/npcink-execute/runtime-execute-smoke-report.json"
)
DEFAULT_OUTPUT_ROOT = Path(".tmp/live-site-trial-status")

PHASE_ORDER = [
    "stage1",
    "stage1_acceptance",
    "runtime_resolve_smoke",
    "runtime_execute_smoke",
]


def load_optional_json(path: Path) -> tuple[dict[str, object], str]:
    if not path.exists():
        return {}, "missing"
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return {}, f"unreadable: {exc}"
    if not isinstance(value, dict):
        return {}, "invalid: JSON root is not an object"
    return value, ""


def phase_status(
    *,
    phase_id: str,
    label: str,
    path: Path,
    report: dict[str, object],
    load_error: str,
    success_key: str,
    required_mode: str,
    failure_fields: list[str],
    boundary_expectations: dict[str, object],
) -> dict[str, object]:
    failures: list[str] = []
    if load_error:
        failures.append(load_error)
    if report:
        if required_mode and report.get("mode") != required_mode:
            failures.append(f"mode expected {required_mode!r}, got {report.get('mode')!r}")
        if report.get(success_key) is not True:
            failures.append(f"{success_key} is not true")
        for field in failure_fields:
            values = [str(item) for item in _list(report.get(field)) if str(item)]
            if values:
                failures.append(f"{field}: " + ", ".join(values))
        boundary = _dict(report.get("boundary"))
        for key, expected in boundary_expectations.items():
            if boundary.get(key) is not expected:
                failures.append(f"boundary.{key} expected {expected!r}, got {boundary.get(key)!r}")
    return {
        "id": phase_id,
        "label": label,
        "path": str(path),
        "exists": path.exists(),
        "ok": not failures,
        "mode": _text(report.get("mode")),
        "generated_at": _text(report.get("generated_at")),
        "failures": failures,
    }


def build_status_report(
    *,
    stage1_report_path: Path,
    acceptance_report_path: Path,
    resolve_smoke_report_path: Path,
    execute_smoke_report_path: Path,
    output_dir: Path,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stage1, stage1_error = load_optional_json(stage1_report_path)
    acceptance, acceptance_error = load_optional_json(acceptance_report_path)
    resolve_smoke, resolve_error = load_optional_json(resolve_smoke_report_path)
    execute_smoke, execute_error = load_optional_json(execute_smoke_report_path)

    phases = [
        phase_status(
            phase_id="stage1",
            label="Stage 1 addon install + Cloud identity",
            path=stage1_report_path,
            report=stage1,
            load_error=stage1_error,
            success_key="ok",
            required_mode="execute",
            failure_fields=[],
            boundary_expectations={
                "wordpress_option_writes": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        ),
        phase_status(
            phase_id="stage1_acceptance",
            label="Stage 1 wp-admin Save and Verify acceptance",
            path=acceptance_report_path,
            report=acceptance,
            load_error=acceptance_error,
            success_key="ready_for_runtime_smoke_approval",
            required_mode="read_only_acceptance",
            failure_fields=[],
            boundary_expectations={
                "wordpress_writes": False,
                "cloud_runtime_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        ),
        phase_status(
            phase_id="runtime_resolve_smoke",
            label="Runtime resolve smoke",
            path=resolve_smoke_report_path,
            report=resolve_smoke,
            load_error=resolve_error,
            success_key="ok",
            required_mode="execute",
            failure_fields=["acceptance_failures", "response_failures"],
            boundary_expectations={
                "wordpress_writes": False,
                "runtime_execute": False,
                "provider_execution": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        ),
        phase_status(
            phase_id="runtime_execute_smoke",
            label="Runtime execute smoke",
            path=execute_smoke_report_path,
            report=execute_smoke,
            load_error=execute_error,
            success_key="ok",
            required_mode="execute",
            failure_fields=[
                "acceptance_failures",
                "resolve_smoke_failures",
                "response_failures",
            ],
            boundary_expectations={
                "wordpress_writes": False,
                "site_knowledge_sync": False,
                "content_writes": False,
            },
        ),
    ]
    next_action = determine_next_action(phases)
    complete = all(_dict(phase).get("ok") is True for phase in phases)
    report: dict[str, object] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "stage": "live_site_trial_status",
        "mode": "read_only_status",
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
        "phases": phases,
        "complete": complete,
        "next_action": next_action,
    }
    (output_dir / "trial-status-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n"
    )
    (output_dir / "summary.md").write_text(render_markdown(report))
    return report


def determine_next_action(phases: list[dict[str, object]]) -> dict[str, object]:
    for phase in phases:
        phase_id = _text(phase.get("id"))
        if phase.get("ok") is True:
            continue
        if phase_id == "stage1":
            return {
                "phase": phase_id,
                "action": "execute_stage1_after_exact_approval",
                "approval_text": STAGE1_APPROVAL_TEXT,
            }
        if phase_id == "stage1_acceptance":
            return {
                "phase": phase_id,
                "action": "complete_wp_admin_save_and_verify_then_run_acceptance",
                "approval_text": "",
            }
        if phase_id == "runtime_resolve_smoke":
            return {
                "phase": phase_id,
                "action": "execute_runtime_resolve_smoke_after_exact_approval",
                "approval_text": RESOLVE_SMOKE_APPROVAL_TEXT,
            }
        if phase_id == "runtime_execute_smoke":
            return {
                "phase": phase_id,
                "action": "execute_runtime_execute_smoke_after_exact_approval",
                "approval_text": EXECUTE_SMOKE_APPROVAL_TEXT,
            }
    return {
        "phase": "complete",
        "action": "trial_chain_complete_prepare_site_knowledge_decision",
        "approval_text": "",
    }


def render_markdown(report: dict[str, object]) -> str:
    phases = [_dict(item) for item in _list(report.get("phases"))]
    next_action = _dict(report.get("next_action"))
    lines = [
        "# Live Site Trial Status",
        "",
        f"Generated at: `{_text(report.get('generated_at'))}`",
        f"Complete: `{report.get('complete')}`",
        "",
        "## Boundary",
        "",
        "This report is read-only. It does not install plugins, write options,",
        "provision Cloud identity, call runtime, run Site Knowledge, enable",
        "monitoring, or write WordPress content.",
        "",
        "## Phases",
        "",
        "| Phase | OK | Mode | Report | Failures |",
        "| --- | ---: | --- | --- | --- |",
    ]
    for phase in phases:
        failures = "; ".join(str(item) for item in _list(phase.get("failures"))) or "none"
        lines.append(
            "| {label} | `{ok}` | `{mode}` | `{path}` | `{failures}` |".format(
                label=_text(phase.get("label")),
                ok=phase.get("ok"),
                mode=_text(phase.get("mode")) or "n/a",
                path=_text(phase.get("path")),
                failures=failures[:220],
            )
        )
    lines.extend(
        [
            "",
            "## Next Action",
            "",
            f"- Phase: `{_text(next_action.get('phase'))}`",
            f"- Action: `{_text(next_action.get('action'))}`",
        ]
    )
    approval_text = _text(next_action.get("approval_text"))
    if approval_text:
        lines.extend(["- Approval text:", "", "```text", approval_text, "```"])
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize the guarded npcink.local live-site trial chain."
    )
    parser.add_argument("--stage1-report", type=Path, default=DEFAULT_STAGE1_REPORT)
    parser.add_argument("--acceptance-report", type=Path, default=DEFAULT_ACCEPTANCE_REPORT)
    parser.add_argument("--resolve-smoke-report", type=Path, default=DEFAULT_RESOLVE_SMOKE_REPORT)
    parser.add_argument("--execute-smoke-report", type=Path, default=DEFAULT_EXECUTE_SMOKE_REPORT)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"npcink-status-{suffix}"
    report = build_status_report(
        stage1_report_path=args.stage1_report,
        acceptance_report_path=args.acceptance_report,
        resolve_smoke_report_path=args.resolve_smoke_report,
        execute_smoke_report_path=args.execute_smoke_report,
        output_dir=output_dir,
    )
    print(
        json.dumps(
            {
                "complete": report["complete"],
                "mode": report["mode"],
                "output_dir": str(output_dir),
                "next_action": report["next_action"],
            },
            ensure_ascii=False,
        )
    )
    return 0 if report["complete"] is True else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
