from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.core.db import get_session
from app.core.models import PluginObservabilityEvent

CONTRACT_VERSION = "editor_assist_quality.v1"
ADDON_PLUGIN_SLUG = "npcink-cloud-addon"
GENERATION_EVENT = "addon.editor_assist.generation.completed"
REPEAT_EVENT = "addon.editor_assist.generation.repeated"
OUTCOME_EVENTS = {
    "addon.editor_assist.outcome.observed",
    "addon.editor_assist.outcome.expired",
}
QUALITY_EVENT_KINDS = {GENERATION_EVENT, REPEAT_EVENT, *OUTCOME_EVENTS}
TRACKED_TASKS = {
    "title_generation",
    "content_summary",
    "content_rewrite",
}
MIN_ISSUE_SAMPLE = 5


class EditorAssistQualityService:
    """Builds read-only quality evidence from metadata-only WordPress events."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def get_summary(
        self,
        *,
        window_hours: int = 24,
        site_id: str = "",
        task_key: str = "",
        now: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        bounded_hours = min(168, max(1, int(window_hours or 24)))
        start_at = current_time - timedelta(hours=bounded_hours)
        comparison_start_at = start_at - timedelta(hours=bounded_hours)

        conditions = [
            PluginObservabilityEvent.plugin_slug == ADDON_PLUGIN_SLUG,
            PluginObservabilityEvent.event_kind.in_(QUALITY_EVENT_KINDS),
            PluginObservabilityEvent.received_at >= comparison_start_at,
            PluginObservabilityEvent.received_at <= current_time,
        ]
        if site_id:
            conditions.append(PluginObservabilityEvent.site_id == site_id)

        with get_session(self.database_url) as session:
            events = list(
                session.scalars(
                    select(PluginObservabilityEvent)
                    .where(*conditions)
                    .order_by(
                        PluginObservabilityEvent.received_at.asc(),
                        PluginObservabilityEvent.id.asc(),
                    )
                )
            )

        all_sessions, _, _ = self._build_sessions(
            events,
            task_key=task_key,
        )
        sessions = {
            key: item
            for key, item in all_sessions.items()
            if self._aware_datetime(item.get("started_at")) >= start_at
        }
        previous_sessions = {
            key: item
            for key, item in all_sessions.items()
            if comparison_start_at
            <= self._aware_datetime(item.get("started_at"))
            < start_at
        }
        current_events = [
            event
            for event in events
            if self._aware_datetime(event.received_at) >= start_at
        ]
        _, generation_total, latencies = self._build_sessions(
            current_events,
            task_key=task_key,
        )
        task_summaries = self._task_summaries(sessions)
        previous_task_summaries = self._task_summaries(previous_sessions)
        totals = self._summarize_sessions("all", list(sessions.values()))
        totals["generation_total"] = generation_total
        totals["p50_generation_latency_ms"] = self._percentile(latencies, 0.50)
        totals["p95_generation_latency_ms"] = self._percentile(latencies, 0.95)

        issue_candidates: list[dict[str, object]] = []
        previous_issue_candidates: list[dict[str, object]] = []
        for summary in task_summaries:
            issue_candidates.extend(self._issue_candidates(summary))
        for summary in previous_task_summaries:
            previous_issue_candidates.extend(self._issue_candidates(summary))
        issue_candidates = self._decorate_issue_candidates(
            issue_candidates,
            previous_issue_candidates,
        )

        return {
            "contract_version": CONTRACT_VERSION,
            "artifact_type": "editor_assist_quality_summary",
            "generated_at": self._format_datetime(current_time),
            "window": {
                "hours": bounded_hours,
                "start_at": self._format_datetime(start_at),
                "end_at": self._format_datetime(current_time),
            },
            "comparison_window": {
                "hours": bounded_hours,
                "start_at": self._format_datetime(comparison_start_at),
                "end_at": self._format_datetime(start_at),
                "session_total": len(previous_sessions),
                "issue_candidate_total": len(previous_issue_candidates),
            },
            "filters": {
                "site_id": site_id,
                "task_key": task_key,
            },
            "totals": totals,
            "tasks": task_summaries,
            "trend": self._build_trend(
                sessions,
                start_at=start_at,
                end_at=current_time,
                window_hours=bounded_hours,
            ),
            "issue_candidates": issue_candidates,
            "read_only": True,
            "surface": "internal_editor_assist_quality",
            "boundary": {
                "production_mutation": False,
                "automatic_prompt_mutation": False,
                "automatic_model_mutation": False,
                "automatic_router_mutation": False,
                "approval_truth": "wordpress_local",
                "preflight_truth": "wordpress_local",
                "final_write_truth": "wordpress_local",
                "control_plane": "wordpress_local",
                "raw_content_retention": False,
            },
        }

    def _build_sessions(
        self,
        events: list[PluginObservabilityEvent],
        *,
        task_key: str,
    ) -> tuple[dict[str, dict[str, Any]], int, list[int]]:
        sessions: dict[str, dict[str, Any]] = {}
        generation_total = 0
        latencies: list[int] = []
        for event in events:
            payload = event.payload_json if isinstance(event.payload_json, dict) else {}
            if str(payload.get("quality_contract") or "") != CONTRACT_VERSION:
                continue
            event_task = str(payload.get("task_key") or "")
            if event_task not in TRACKED_TASKS or (task_key and event_task != task_key):
                continue
            quality_session_id = str(payload.get("quality_session_id") or "")
            if not quality_session_id:
                continue

            session_key = f"{event.site_id}|{quality_session_id}|{event_task}"
            item = sessions.setdefault(
                session_key,
                {
                    "site_id": event.site_id,
                    "quality_session_id": quality_session_id,
                    "task_key": event_task,
                    "generation_count": 0,
                    "repeated": False,
                    "outcome": "",
                    "outcome_confidence": "",
                    "save_kind": "",
                    "started_at": self._aware_datetime(event.received_at),
                    "latest_at": self._aware_datetime(event.received_at),
                },
            )
            item["latest_at"] = self._aware_datetime(event.received_at)
            if event.event_kind == GENERATION_EVENT:
                generation_total += 1
                sequence = self._int(payload.get("generation_sequence"))
                item["generation_count"] = max(
                    self._int(item.get("generation_count")),
                    sequence,
                    1,
                )
                if event.latency_ms is not None:
                    latencies.append(max(0, int(event.latency_ms)))
            elif event.event_kind == REPEAT_EVENT:
                item["repeated"] = True
                item["generation_count"] = max(
                    self._int(item.get("generation_count")),
                    self._int(payload.get("generation_sequence")),
                    2,
                )
            elif event.event_kind in OUTCOME_EVENTS:
                item["outcome"] = str(payload.get("outcome") or "")
                item["outcome_confidence"] = str(
                    payload.get("outcome_confidence") or ""
                )
                item["save_kind"] = str(payload.get("save_kind") or "")
        return sessions, generation_total, latencies

    def _task_summaries(
        self,
        sessions: dict[str, dict[str, Any]],
    ) -> list[dict[str, object]]:
        task_groups = {
            task: [item for item in sessions.values() if item["task_key"] == task]
            for task in sorted(TRACKED_TASKS)
        }
        return [
            self._summarize_sessions(task, items)
            for task, items in task_groups.items()
            if items
        ]

    def _summarize_sessions(
        self,
        task_key: str,
        sessions: list[dict[str, Any]],
    ) -> dict[str, object]:
        session_total = len(sessions)
        repeated_sessions = sum(
            1
            for item in sessions
            if bool(item.get("repeated"))
            or self._int(item.get("generation_count")) > 1
        )
        exact_saved_sessions = sum(
            1 for item in sessions if item.get("outcome") == "saved_exact_output"
        )
        unmatched_saved_sessions = sum(
            1
            for item in sessions
            if item.get("outcome") == "saved_after_generation_unmatched"
        )
        expired_sessions = sum(
            1 for item in sessions if item.get("outcome") == "expired_without_save"
        )
        resolved_sessions = (
            exact_saved_sessions + unmatched_saved_sessions + expired_sessions
        )
        published_exact_sessions = sum(
            1
            for item in sessions
            if item.get("outcome") == "saved_exact_output"
            and item.get("save_kind") == "publish"
        )

        return {
            "task_key": task_key,
            "session_total": session_total,
            "resolved_session_total": resolved_sessions,
            "pending_session_total": max(0, session_total - resolved_sessions),
            "repeated_session_total": repeated_sessions,
            "repeat_session_rate": self._rate(repeated_sessions, session_total),
            "exact_saved_session_total": exact_saved_sessions,
            "exact_saved_rate": self._rate(exact_saved_sessions, resolved_sessions),
            "unmatched_saved_session_total": unmatched_saved_sessions,
            "unmatched_saved_rate": self._rate(
                unmatched_saved_sessions, resolved_sessions
            ),
            "expired_without_save_session_total": expired_sessions,
            "expired_without_save_rate": self._rate(
                expired_sessions, resolved_sessions
            ),
            "published_exact_session_total": published_exact_sessions,
            "sample_stage": self._sample_stage(session_total),
        }

    def _build_trend(
        self,
        sessions: dict[str, dict[str, Any]],
        *,
        start_at: datetime,
        end_at: datetime,
        window_hours: int,
    ) -> list[dict[str, object]]:
        bucket_total = max(1, min(7, (window_hours + 23) // 24))
        bucket_seconds = max(
            1,
            int((end_at - start_at).total_seconds() / bucket_total),
        )
        trend: list[dict[str, object]] = []
        session_items = list(sessions.values())
        for index in range(bucket_total):
            bucket_start = start_at + timedelta(seconds=bucket_seconds * index)
            bucket_end = (
                end_at
                if index == bucket_total - 1
                else start_at + timedelta(seconds=bucket_seconds * (index + 1))
            )
            bucket_sessions = [
                item
                for item in session_items
                if bucket_start
                <= self._aware_datetime(item.get("started_at"))
                and (
                    self._aware_datetime(item.get("started_at")) <= bucket_end
                    if index == bucket_total - 1
                    else self._aware_datetime(item.get("started_at")) < bucket_end
                )
            ]
            summary = self._summarize_sessions("all", bucket_sessions)
            trend.append(
                {
                    "label": bucket_start.date().isoformat(),
                    "start_at": self._format_datetime(bucket_start),
                    "end_at": self._format_datetime(bucket_end),
                    "session_total": summary["session_total"],
                    "repeat_session_rate": summary["repeat_session_rate"],
                    "exact_saved_rate": summary["exact_saved_rate"],
                    "unmatched_saved_rate": summary["unmatched_saved_rate"],
                    "expired_without_save_rate": summary[
                        "expired_without_save_rate"
                    ],
                }
            )
        return trend

    def _issue_candidates(
        self,
        summary: dict[str, object],
    ) -> list[dict[str, object]]:
        task_key = str(summary.get("task_key") or "")
        session_total = self._int(summary.get("session_total"))
        resolved_total = self._int(summary.get("resolved_session_total"))
        candidates: list[dict[str, object]] = []

        repeat_rate = self._float(summary.get("repeat_session_rate"))
        if session_total >= MIN_ISSUE_SAMPLE and repeat_rate >= 0.25:
            candidates.append(
                self._candidate(
                    code="editor_assist.repeat_pressure",
                    task_key=task_key,
                    sample_size=session_total,
                    observed_rate=repeat_rate,
                    threshold=0.25,
                    interpretation=(
                        "Short-window regeneration is elevated; the first result may "
                        "not be meeting the editor's need."
                    ),
                )
            )

        no_save_rate = self._float(summary.get("expired_without_save_rate"))
        if resolved_total >= MIN_ISSUE_SAMPLE and no_save_rate >= 0.30:
            candidates.append(
                self._candidate(
                    code="editor_assist.no_save_pressure",
                    task_key=task_key,
                    sample_size=resolved_total,
                    observed_rate=no_save_rate,
                    threshold=0.30,
                    interpretation=(
                        "Many generated suggestions expire without a matching local "
                        "save; this is a diagnostic signal, not proof of rejection."
                    ),
                )
            )

        exact_rate = self._float(summary.get("exact_saved_rate"))
        if resolved_total >= MIN_ISSUE_SAMPLE and exact_rate < 0.40:
            candidates.append(
                self._candidate(
                    code="editor_assist.exact_adoption_low",
                    task_key=task_key,
                    sample_size=resolved_total,
                    observed_rate=exact_rate,
                    threshold=0.40,
                    interpretation=(
                        "Exact saved adoption is low. Treat this as possible edit "
                        "burden and validate against a fixed evaluation corpus."
                    ),
                    comparison="below",
                )
            )
        return candidates

    def _candidate(
        self,
        *,
        code: str,
        task_key: str,
        sample_size: int,
        observed_rate: float,
        threshold: float,
        interpretation: str,
        comparison: str = "at_or_above",
    ) -> dict[str, object]:
        sample_stage = self._sample_stage(sample_size)
        confidence = self._sample_confidence(sample_size)
        return {
            "code": code,
            "severity": "warning",
            "task_key": task_key,
            "sample_size": sample_size,
            "observed_rate": observed_rate,
            "threshold": threshold,
            "comparison": comparison,
            "interpretation": interpretation,
            "sample_stage": sample_stage,
            "confidence": confidence,
            "persistence": "new",
            "previous_observed_rate": 0.0,
            "actionable": False,
            "next_action": (
                "validate_instrumentation"
                if confidence == "low"
                else "review_quality_trend"
            ),
            "recommended_eval_task": (
                "summary_hard_gate" if task_key == "content_summary" else task_key
            ),
            "production_mutation": False,
        }

    def _decorate_issue_candidates(
        self,
        candidates: list[dict[str, object]],
        previous_candidates: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        previous_by_key = {
            (str(item.get("task_key") or ""), str(item.get("code") or "")): item
            for item in previous_candidates
        }
        for candidate in candidates:
            previous = previous_by_key.get(
                (
                    str(candidate.get("task_key") or ""),
                    str(candidate.get("code") or ""),
                )
            )
            sustained = previous is not None
            candidate["persistence"] = "sustained" if sustained else "new"
            candidate["previous_observed_rate"] = (
                self._float(previous.get("observed_rate")) if previous else 0.0
            )
            actionable = (
                sustained and str(candidate.get("confidence") or "") == "high"
            )
            candidate["actionable"] = actionable
            if actionable:
                candidate["next_action"] = "run_fixed_corpus_evaluation"
        return candidates

    def _sample_stage(self, sample_size: int) -> str:
        if sample_size < MIN_ISSUE_SAMPLE:
            return "insufficient"
        if sample_size < 50:
            return "validation"
        if sample_size < 200:
            return "observation"
        return "decision"

    def _sample_confidence(self, sample_size: int) -> str:
        if sample_size < 50:
            return "low"
        if sample_size < 200:
            return "medium"
        return "high"

    def _percentile(self, values: list[int], quantile: float) -> int:
        if not values:
            return 0
        ordered = sorted(values)
        index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * quantile)))
        return int(ordered[index])

    def _rate(self, numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 4) if denominator > 0 else 0.0

    def _int(self, value: object) -> int:
        if not isinstance(value, (str, int, float)):
            return 0
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def _float(self, value: object) -> float:
        if not isinstance(value, (str, int, float)):
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _format_datetime(self, value: datetime) -> str:
        normalized = self._aware_datetime(value)
        return normalized.isoformat().replace("+00:00", "Z")

    def _aware_datetime(self, value: object) -> datetime:
        if not isinstance(value, datetime):
            return datetime.min.replace(tzinfo=UTC)
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
