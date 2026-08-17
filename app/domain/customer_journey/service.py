from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import delete, select

from app.core.db import get_session
from app.core.models import CustomerJourneyEvent, RunRecord
from app.domain.customer_journey.contracts import (
    CUSTOMER_JOURNEY_CONTRACT_VERSION,
    GENERATION_JOURNEYS,
    CustomerJourneyContractViolation,
)

MAX_SUMMARY_EVENTS = 20_000
MAX_FUTURE_SKEW = timedelta(minutes=5)
SESSION_SETTLEMENT_GRACE = timedelta(minutes=30)


class CustomerJourneyService:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def ingest_events(
        self,
        *,
        site_id: str,
        key_id: str,
        events: list[dict[str, Any]],
        received_at: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (received_at or datetime.now(UTC)).astimezone(UTC)
        normalized = [
            self._normalize_event(
                site_id=site_id,
                event=event,
                current_time=current_time,
            )
            for event in events
        ]
        run_ids = {str(item.get("run_id") or "") for item in normalized if item.get("run_id")}

        with get_session(self.database_url) as session:
            if run_ids:
                valid_run_ids = set(
                    session.scalars(
                        select(RunRecord.run_id).where(
                            RunRecord.site_id == site_id,
                            RunRecord.run_id.in_(run_ids),
                        )
                    )
                )
                invalid_run_ids = sorted(run_ids - valid_run_ids)
                if invalid_run_ids:
                    raise CustomerJourneyContractViolation(
                        "customer_journey.run_reference_invalid",
                        "run_id must reference a run owned by the authenticated site",
                    )

            dedupe_keys = [str(item["dedupe_key"]) for item in normalized]
            existing = set(
                session.scalars(
                    select(CustomerJourneyEvent.dedupe_key).where(
                        CustomerJourneyEvent.dedupe_key.in_(dedupe_keys)
                    )
                )
            )
            stored_count = 0
            for item in normalized:
                dedupe_key = str(item["dedupe_key"])
                if dedupe_key in existing:
                    continue
                session.add(
                    CustomerJourneyEvent(
                        dedupe_key=dedupe_key,
                        site_id=site_id,
                        key_id=key_id or None,
                        event_id=str(item["event_id"]),
                        cohort_id=str(item.get("cohort_id") or "") or None,
                        session_hash=str(item["session_hash"]),
                        surface=str(item["surface"]),
                        journey=str(item["journey"]),
                        step=str(item["step"]),
                        error_category=str(item.get("error_category") or "") or None,
                        error_code=str(item.get("error_code") or "") or None,
                        duration_ms=self._optional_int(item.get("duration_ms")),
                        run_id=str(item.get("run_id") or "") or None,
                        browser_family=str(item.get("browser_family") or "") or None,
                        viewport_class=str(item.get("viewport_class") or "") or None,
                        occurred_at=self._parse_datetime(item["occurred_at"]),
                        received_at=current_time,
                    )
                )
                existing.add(dedupe_key)
                stored_count += 1
            session.commit()

        return {
            "contract_version": CUSTOMER_JOURNEY_CONTRACT_VERSION,
            "accepted_count": len(normalized),
            "stored_count": stored_count,
            "duplicate_count": len(normalized) - stored_count,
            "content_storage": "omitted_metadata_only",
            "received_at": self._format_datetime(current_time),
        }

    def get_summary(
        self,
        *,
        site_id: str,
        window_hours: int = 24,
        cohort_id: str = "",
        now: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        bounded_hours = min(168, max(1, int(window_hours or 24)))
        start_at = current_time - timedelta(hours=bounded_hours)
        conditions = [
            CustomerJourneyEvent.site_id == site_id,
            CustomerJourneyEvent.occurred_at >= start_at,
            CustomerJourneyEvent.occurred_at <= current_time,
        ]
        if cohort_id:
            conditions.append(CustomerJourneyEvent.cohort_id == cohort_id)

        with get_session(self.database_url) as session:
            newest_events = list(
                session.scalars(
                    select(CustomerJourneyEvent)
                    .where(*conditions)
                    .order_by(CustomerJourneyEvent.occurred_at.desc())
                    .limit(MAX_SUMMARY_EVENTS + 1)
                )
            )
        sample_truncated = len(newest_events) > MAX_SUMMARY_EVENTS
        events = sorted(
            newest_events[:MAX_SUMMARY_EVENTS],
            key=lambda item: self._as_utc(item.occurred_at),
        )

        sessions: dict[str, list[CustomerJourneyEvent]] = defaultdict(list)
        journey_steps: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
        error_counts: Counter[tuple[str, str]] = Counter()
        slow_counts: Counter[str] = Counter()
        for event in events:
            sessions[event.session_hash].append(event)
            journey_steps[event.journey][event.step].add(event.session_hash)
            if event.error_code or event.error_category:
                error_counts[(event.error_category or "unknown", event.error_code or "")] += 1
            if event.duration_ms is not None and event.duration_ms > 5000:
                slow_counts[event.journey] += 1

        funnels = []
        for journey, steps in sorted(journey_steps.items()):
            started = len(steps["started"])
            succeeded = len(steps["succeeded"])
            failed = len(steps["failed"])
            abandoned = len(steps["abandoned"])
            attempts = started or (succeeded + failed + abandoned)
            funnels.append(
                {
                    "journey": journey,
                    "started_total": started,
                    "succeeded_total": succeeded,
                    "failed_total": failed,
                    "abandoned_total": abandoned,
                    "retried_total": len(steps["retried"]),
                    "success_rate": self._rate(succeeded, attempts),
                }
            )

        anomalous_sessions = []
        accepted_without_save_total = 0
        for session_hash, session_events in sessions.items():
            retries_by_journey = Counter(
                event.journey for event in session_events if event.step == "retried"
            )
            slow_events = sum(
                event.duration_ms is not None and event.duration_ms > 5000
                for event in session_events
            )
            last_occurred_at = self._as_utc(session_events[-1].occurred_at)
            settled = current_time - last_occurred_at >= SESSION_SETTLEMENT_GRACE
            unrecovered_failure = False
            for failed_event in reversed(session_events):
                if failed_event.step not in {"failed", "abandoned"}:
                    continue
                recovered = any(
                    later_event.journey == failed_event.journey
                    and self._as_utc(later_event.occurred_at)
                    > self._as_utc(failed_event.occurred_at)
                    and later_event.step in {"retried", "succeeded"}
                    for later_event in session_events
                )
                if not recovered:
                    unrecovered_failure = settled
                    break
            accepted_events = [
                event
                for event in session_events
                if event.journey in GENERATION_JOURNEYS and event.step == "accepted"
            ]
            accepted_without_save = settled and any(
                not any(
                    saved_event.journey == "save"
                    and saved_event.step == "succeeded"
                    and self._as_utc(saved_event.occurred_at)
                    > self._as_utc(accepted_event.occurred_at)
                    for saved_event in session_events
                )
                for accepted_event in accepted_events
            )
            accepted_without_save_total += int(accepted_without_save)
            reasons = []
            if any(count >= 3 for count in retries_by_journey.values()):
                reasons.append("customer_journey.repeated_retry")
            if slow_events:
                reasons.append("customer_journey.slow_interaction")
            if unrecovered_failure:
                reasons.append("customer_journey.unrecovered_failure")
            if accepted_without_save:
                reasons.append("customer_journey.accepted_without_save")
            if reasons:
                anomalous_sessions.append(
                    {
                        "session_ref": session_hash[:16],
                        "reasons": reasons,
                        "event_total": len(session_events),
                        "first_occurred_at": self._format_datetime(session_events[0].occurred_at),
                        "last_occurred_at": self._format_datetime(session_events[-1].occurred_at),
                    }
                )

        candidates = self._build_defect_candidates(
            funnels=funnels,
            error_counts=error_counts,
            slow_counts=slow_counts,
            anomalous_sessions=anomalous_sessions,
            accepted_without_save_total=accepted_without_save_total,
        )
        return {
            "contract_version": "customer_journey_summary.v1",
            "generated_at": self._format_datetime(current_time),
            "window": {
                "hours": bounded_hours,
                "start_at": self._format_datetime(start_at),
                "end_at": self._format_datetime(current_time),
            },
            "filters": {"cohort_id": cohort_id},
            "totals": {
                "events_total": len(events),
                "sessions_total": len(sessions),
                "anomalous_sessions_total": len(anomalous_sessions),
                "sample_truncated": sample_truncated,
                "sample_event_limit": MAX_SUMMARY_EVENTS,
            },
            "funnels": funnels,
            "top_errors": [
                {"error_category": category, "error_code": code, "count": count}
                for (category, code), count in error_counts.most_common(10)
            ],
            "anomalous_sessions": anomalous_sessions[:25],
            "defect_candidates": candidates,
            "diagnostic_only": True,
            "production_mutation": False,
            "approval_truth": "wordpress_local",
            "final_write_truth": "wordpress_local",
        }

    def cleanup_expired_events(
        self,
        *,
        retention_days: int = 30,
        now: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        bounded_days = min(90, max(1, int(retention_days or 30)))
        cutoff_at = current_time - timedelta(days=bounded_days)
        with get_session(self.database_url) as session:
            result = session.execute(
                delete(CustomerJourneyEvent).where(CustomerJourneyEvent.received_at < cutoff_at)
            )
            session.commit()
        return {
            "purged_events": int(getattr(result, "rowcount", 0) or 0),
            "retention_days": bounded_days,
            "cutoff_at": self._format_datetime(cutoff_at),
        }

    def _normalize_event(
        self,
        *,
        site_id: str,
        event: dict[str, Any],
        current_time: datetime,
    ) -> dict[str, Any]:
        raw_event_id = str(event["event_id"])
        session_id = str(event["anonymous_session_id"])
        occurred_at = self._parse_datetime(event["occurred_at"])
        if occurred_at < current_time - timedelta(days=31) or occurred_at > (
            current_time + MAX_FUTURE_SKEW
        ):
            raise CustomerJourneyContractViolation(
                "customer_journey.occurred_at_out_of_range",
                "occurred_at must be within 31 days in the past and five minutes in the future",
            )
        session_hash = hashlib.sha256(f"{site_id}|{session_id}".encode()).hexdigest()
        event_id = hashlib.sha256(f"{site_id}|{raw_event_id}".encode()).hexdigest()
        return {
            **event,
            "event_id": event_id,
            "session_hash": session_hash,
            "dedupe_key": event_id,
            "occurred_at": occurred_at,
        }

    def _build_defect_candidates(
        self,
        *,
        funnels: list[dict[str, object]],
        error_counts: Counter[tuple[str, str]],
        slow_counts: Counter[str],
        anomalous_sessions: list[dict[str, object]],
        accepted_without_save_total: int,
    ) -> list[dict[str, object]]:
        candidates: list[dict[str, object]] = []
        for funnel in funnels:
            attempts = self._coerce_int(funnel["started_total"]) or (
                self._coerce_int(funnel["succeeded_total"])
                + self._coerce_int(funnel["failed_total"])
                + self._coerce_int(funnel["abandoned_total"])
            )
            failure_sessions = self._coerce_int(funnel["failed_total"]) + self._coerce_int(
                funnel["abandoned_total"]
            )
            success_rate = self._coerce_float(funnel["success_rate"])
            if failure_sessions >= 2 or (attempts >= 3 and success_rate < 0.8):
                candidates.append(
                    {
                        "priority": "P1",
                        "code": "customer_journey.main_path_failure_pressure",
                        "journey": funnel["journey"],
                        "sample_size": attempts,
                        "success_rate": success_rate,
                        "reason": "multiple failures or main-path success below 80%",
                    }
                )
        for (category, code), count in error_counts.most_common():
            if count >= 3:
                candidates.append(
                    {
                        "priority": "P1",
                        "code": "customer_journey.repeated_error",
                        "error_category": category,
                        "error_code": code,
                        "sample_size": count,
                        "reason": "same bounded error occurred at least three times",
                    }
                )
        if accepted_without_save_total:
            candidates.append(
                {
                    "priority": "P1",
                    "code": "customer_journey.accepted_without_save",
                    "sample_size": accepted_without_save_total,
                    "reason": "accepted generation did not reach an explicit successful save",
                }
            )
        retry_sessions = sum(
            "customer_journey.repeated_retry" in self._string_list(item["reasons"])
            for item in anomalous_sessions
        )
        if retry_sessions:
            candidates.append(
                {
                    "priority": "P2",
                    "code": "customer_journey.repeated_retry",
                    "sample_size": retry_sessions,
                    "reason": "a session retried the same journey at least three times",
                }
            )
        for journey, count in slow_counts.items():
            candidates.append(
                {
                    "priority": "P2",
                    "code": "customer_journey.slow_interaction",
                    "journey": journey,
                    "sample_size": count,
                    "reason": "interaction duration exceeded five seconds",
                }
            )
        return candidates[:25]

    def _parse_datetime(self, value: object) -> datetime:
        if isinstance(value, datetime):
            parsed = value
        else:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    def _format_datetime(self, value: datetime) -> str:
        return self._as_utc(value).isoformat().replace("+00:00", "Z")

    def _as_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _optional_int(self, value: object) -> int | None:
        return None if value is None else int(cast(Any, value))

    def _coerce_int(self, value: object) -> int:
        try:
            return int(cast(Any, value))
        except (TypeError, ValueError):
            return 0

    def _coerce_float(self, value: object) -> float:
        try:
            return float(cast(Any, value))
        except (TypeError, ValueError):
            return 0.0

    def _string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value]

    def _rate(self, numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 4) if denominator > 0 else 0.0
