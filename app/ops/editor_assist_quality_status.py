from __future__ import annotations

import argparse
import json
from typing import Any

from app.core.config import Settings
from app.domain.observability.editor_assist_quality import (
    EditorAssistQualityService,
)

DEFAULT_WINDOW_HOURS = 168
DEFAULT_MINIMUM_SESSIONS = 50


def _bounded_hours(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 720:
        raise argparse.ArgumentTypeError("window hours must be between 1 and 720")
    return parsed


def _positive_count(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 100_000:
        raise argparse.ArgumentTypeError(
            "minimum sessions must be between 1 and 100000"
        )
    return parsed


def build_payload(
    settings: Settings,
    *,
    window_hours: int = DEFAULT_WINDOW_HOURS,
    site_id: str = "",
    task_key: str = "",
    minimum_sessions: int = DEFAULT_MINIMUM_SESSIONS,
) -> dict[str, Any]:
    summary = EditorAssistQualityService(settings.database_url).get_summary(
        window_hours=window_hours,
        site_id=site_id,
        task_key=task_key,
    )
    totals = summary.get("totals")
    session_total = int(totals.get("session_total", 0)) if isinstance(totals, dict) else 0
    sample_gate = "met" if session_total >= minimum_sessions else "insufficient"
    return {
        "contract_version": "editor_assist_quality_pilot_status.v1",
        "artifact_type": "editor_assist_quality_pilot_status",
        "summary": summary,
        "pilot": {
            "mode": "technical_monitoring_only",
            "observation_window_hours": window_hours,
            "minimum_sessions": minimum_sessions,
            "session_total": session_total,
            "sample_gate": sample_gate,
            "manual_decision_ready": sample_gate == "met",
            "natural_traffic_required": True,
            "synthetic_samples_count_as_natural_traffic": False,
            "next_action": (
                "manual_review"
                if sample_gate == "met"
                else "continue_natural_observation"
            ),
            "automatic_prompt_mutation": False,
            "automatic_model_mutation": False,
            "automatic_router_mutation": False,
            "read_only": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Print a read-only editor-assist natural-traffic pilot status."
        )
    )
    parser.add_argument(
        "--window-hours",
        type=_bounded_hours,
        default=DEFAULT_WINDOW_HOURS,
        help="observation window in hours (1-720, default: 168)",
    )
    parser.add_argument("--site-id", default="", help="optional site filter")
    parser.add_argument("--task-key", default="", help="optional task filter")
    parser.add_argument(
        "--minimum-sessions",
        type=_positive_count,
        default=DEFAULT_MINIMUM_SESSIONS,
        help="manual decision sample threshold (default: 50)",
    )
    args = parser.parse_args()
    payload = build_payload(
        Settings(),
        window_hours=args.window_hours,
        site_id=args.site_id.strip(),
        task_key=args.task_key.strip(),
        minimum_sessions=args.minimum_sessions,
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
