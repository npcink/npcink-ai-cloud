#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AGENT_FIXTURE = ROOT / "tests/fixtures/agent_feedback/content_support_regression_samples.json"
EDITOR_FIXTURE = ROOT / "tests/fixtures/editor_assist_quality/quality_events.json"
FORBIDDEN_KEYS = {
    "api_key",
    "approval_truth",
    "confirm_token",
    "content",
    "direct_publish",
    "direct_wordpress_write",
    "final_write_truth",
    "post_content",
    "post_id",
    "preflight_truth",
    "prompt",
    "prompt_text",
    "provider_response",
    "publish",
    "secret",
    "user_id",
    "write_confirmed",
    "write_control",
    "write_controls",
}


def _load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"fixture root must be an object: {path}")
    return payload


def _forbidden_path(value: Any, prefix: str = "") -> str:
    if isinstance(value, dict):
        for key, item in value.items():
            key = str(key).strip().lower()
            path = f"{prefix}.{key}" if prefix else key
            if key in FORBIDDEN_KEYS:
                return path
            if found := _forbidden_path(item, path):
                return found
    elif isinstance(value, list):
        for index, item in enumerate(value):
            if found := _forbidden_path(item, f"{prefix}[{index}]"):
                return found
    return ""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _agent_cases(payload: dict[str, Any]) -> list[dict[str, str]]:
    _require(
        payload.get("contract_version") == "cloud_agent_feedback_regression_samples.v1",
        "unexpected Agent Feedback fixture contract",
    )
    samples = payload.get("samples")
    _require(isinstance(samples, list), "agent_feedback.samples must be a list")
    report_cases = []
    for sample in samples:
        _require(isinstance(sample, dict), "Agent Feedback sample must be an object")
        _require(
            not (forbidden := _forbidden_path(sample)),
            f"Agent Feedback sample contains forbidden field: {forbidden}",
        )
        case_id = str(sample.get("sample_id") or "").strip()
        bucket = str(sample.get("expected_bucket") or "").strip()
        _require(bool(case_id and bucket), "Agent Feedback case metadata is incomplete")
        report_cases.append(
            {
                "case_id": case_id,
                "bucket": bucket,
                "description": str(sample.get("local_outcome") or "").strip(),
            }
        )
    return report_cases


def _editor_cases(payload: dict[str, Any]) -> list[dict[str, str]]:
    _require(
        payload.get("contract_version") == "editor_assist_quality.v1",
        "unexpected Editor Assist fixture contract",
    )
    cases = payload.get("cases")
    events = payload.get("events")
    _require(isinstance(cases, list), "editor_assist.cases must be a list")
    _require(isinstance(events, list), "editor_assist.events must be a list")

    events_by_session: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        _require(isinstance(event, dict), "Editor Assist event must be an object")
        _require(
            not (forbidden := _forbidden_path(event)),
            f"Editor Assist event contains forbidden field: {forbidden}",
        )
        _require(
            event.get("content_storage") == "omitted_metadata_only",
            "Editor Assist events must remain metadata-only",
        )
        session_id = str(event.get("quality_session_id") or "").strip()
        _require(bool(session_id), "Editor Assist event requires quality_session_id")
        events_by_session.setdefault(session_id, []).append(event)

    report_cases = []
    declared_sessions = set()
    for case in cases:
        _require(isinstance(case, dict), "Editor Assist case must be an object")
        _require(
            not (forbidden := _forbidden_path(case)),
            f"Editor Assist case contains forbidden field: {forbidden}",
        )
        case_id = str(case.get("case_id") or "").strip()
        session_id = str(case.get("quality_session_id") or "").strip()
        task_key = str(case.get("task_key") or "").strip()
        bucket = str(case.get("expected_bucket") or "").strip()
        expected_outcome = str(case.get("expected_outcome") or "").strip()
        description = str(case.get("description") or "").strip()
        repeated = case.get("repeated")
        _require(
            bool(
                case_id and session_id and task_key and bucket and expected_outcome and description
            ),
            "Editor Assist case metadata is incomplete",
        )
        _require(isinstance(repeated, bool), "Editor Assist repeated flag must be boolean")

        session_events = events_by_session.get(session_id, [])
        outcomes = {event.get("outcome") for event in session_events if event.get("outcome")}
        task_keys = {event.get("task_key") for event in session_events}
        has_repeat = any(
            event.get("event_kind") == "addon.editor_assist.generation.repeated"
            for event in session_events
        )
        _require(task_keys == {task_key}, f"Editor Assist case {case_id} task key mismatch")
        _require(
            outcomes == {expected_outcome},
            f"Editor Assist case {case_id} outcome mismatch",
        )
        _require(has_repeat is repeated, f"Editor Assist case {case_id} repeat mismatch")
        declared_sessions.add(session_id)
        report_cases.append({"case_id": case_id, "bucket": bucket, "description": description})

    _require(
        declared_sessions == set(events_by_session),
        "Editor Assist cases must describe every and only fixture session",
    )
    return report_cases


def build_report(agent_fixture: Path, editor_fixture: Path) -> dict[str, Any]:
    agent_cases = _agent_cases(_load(agent_fixture))
    editor_cases = _editor_cases(_load(editor_fixture))
    case_ids = [case["case_id"] for case in [*agent_cases, *editor_cases]]
    _require(len(agent_cases) == 5, "report requires five Agent Feedback cases")
    _require(len(editor_cases) == 5, "report requires five Editor Assist cases")
    _require(len(case_ids) == len(set(case_ids)), "case IDs must be globally unique")
    return {
        "schema_version": "ai_quality_regression_report.v1",
        "mode": "deterministic_metadata_only",
        "quality_interpretation": "report_only",
        "total_cases": len(case_ids),
        "capabilities": [
            {"capability": "agent_feedback", "case_count": 5, "cases": agent_cases},
            {"capability": "editor_assist", "case_count": 5, "cases": editor_cases},
        ],
        "boundary": {
            "provider_calls": 0,
            "production_mutation": False,
            "automatic_prompt_mutation": False,
            "automatic_model_mutation": False,
            "automatic_router_mutation": False,
            "raw_content_retention": False,
            "approval_truth": "wordpress_local",
            "preflight_truth": "wordpress_local",
            "final_write_truth": "wordpress_local",
        },
    }


def _text(report: dict[str, Any]) -> str:
    lines = [
        "AI quality regression sample report",
        f"Total cases: {report['total_cases']}",
        "Mode: deterministic metadata-only; quality interpretation is report-only",
    ]
    for capability in report["capabilities"]:
        lines.extend(("", f"{capability['capability']} ({capability['case_count']})"))
        lines.extend(
            f"- {case['case_id']} [{case['bucket']}]: {case['description']}"
            for case in capability["cases"]
        )
    lines.extend(
        (
            "",
            "Boundary: no Provider calls, raw content retention, automatic mutation, "
            "or Cloud approval/final-write truth.",
        )
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--agent-fixture", type=Path, default=AGENT_FIXTURE)
    parser.add_argument("--editor-fixture", type=Path, default=EDITOR_FIXTURE)
    args = parser.parse_args()
    try:
        report = build_report(args.agent_fixture, args.editor_fixture)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"[ai-quality-regression] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True) if args.format == "json" else _text(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
