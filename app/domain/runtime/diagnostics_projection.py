from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

from app.core.error_taxonomy import get_error_taxonomy
from app.core.models import RunRecord
from app.domain.runtime.models import (
    RUNTIME_BACKLOG_QUEUED_AGING_AFTER_SECONDS,
    RUNTIME_BACKLOG_RUNNING_AGING_AFTER_SECONDS,
    RUNTIME_DIAGNOSTIC_CALLBACK_DISPATCHING_STALE_AFTER_SECONDS,
    RUNTIME_DIAGNOSTIC_CALLBACK_OVERDUE_AFTER_SECONDS,
    RUNTIME_DIAGNOSTIC_CANCEL_STUCK_AFTER_SECONDS,
    RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
    RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
)
from app.domain.runtime.run_projection import RuntimeRunProjector


class RuntimeDiagnosticsProjector:
    """Pure projection rules for runtime summary and backlog diagnostics."""

    def __init__(self, *, run_projector: RuntimeRunProjector) -> None:
        self.run_projector = run_projector

    def augment_runtime_diagnostics_summary(
        self,
        summary: dict[str, object],
        current_time: datetime,
    ) -> dict[str, object]:
        queue = self._dict_or_empty(summary.get("queue"))
        queued_oldest_age_seconds = self._calculate_age_seconds(
            current_time,
            queue.get("queued_oldest_requested_at"),
        )
        running_oldest_age_seconds = self._calculate_age_seconds(
            current_time,
            queue.get("running_oldest_processing_started_at"),
        )
        queue["queued_oldest_age_seconds"] = queued_oldest_age_seconds
        queue["running_oldest_age_seconds"] = running_oldest_age_seconds
        queue["pressure_thresholds"] = {
            "queued_stale_after_seconds": RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
            "running_stale_after_seconds": RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
        }
        queue["pressure_state"], queue["pressure_reasons"] = self._classify_runtime_pressure(
            (
                (
                    "queue.queued_stale",
                    queued_oldest_age_seconds is not None
                    and queued_oldest_age_seconds >= RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
                    queued_oldest_age_seconds is not None
                    and queued_oldest_age_seconds
                    >= (RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS * 3),
                ),
                (
                    "queue.running_stale",
                    running_oldest_age_seconds is not None
                    and running_oldest_age_seconds
                    >= RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
                    running_oldest_age_seconds is not None
                    and running_oldest_age_seconds
                    >= (RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS * 3),
                ),
            )
        )

        cancel = self._dict_or_empty(summary.get("cancel"))
        oldest_request_age_seconds = self._calculate_age_seconds(
            current_time,
            cancel.get("oldest_requested_at"),
        )
        cancel["oldest_request_age_seconds"] = oldest_request_age_seconds
        cancel["pressure_thresholds"] = {
            "cancel_stuck_after_seconds": RUNTIME_DIAGNOSTIC_CANCEL_STUCK_AFTER_SECONDS,
        }
        cancel["pressure_state"], cancel["pressure_reasons"] = self._classify_runtime_pressure(
            (
                (
                    "cancel.request_stuck",
                    oldest_request_age_seconds is not None
                    and oldest_request_age_seconds >= RUNTIME_DIAGNOSTIC_CANCEL_STUCK_AFTER_SECONDS,
                    oldest_request_age_seconds is not None
                    and oldest_request_age_seconds
                    >= (RUNTIME_DIAGNOSTIC_CANCEL_STUCK_AFTER_SECONDS * 3),
                ),
            )
        )

        callback = self._dict_or_empty(summary.get("callback"))
        pending = max(0, self._coerce_int(callback.get("pending"), default=0))
        due_now = max(0, self._coerce_int(callback.get("due_now"), default=0))
        failed = max(0, self._coerce_int(callback.get("failed"), default=0))
        dispatching = max(0, self._coerce_int(callback.get("dispatching"), default=0))
        recoverable_dispatching = max(
            0, self._coerce_int(callback.get("recoverable_dispatching"), default=0)
        )
        oldest_due_age_seconds = self._calculate_age_seconds(
            current_time,
            callback.get("oldest_due_at"),
        )
        dispatching_oldest_age_seconds = self._calculate_age_seconds(
            current_time,
            callback.get("dispatching_oldest_last_attempt_at"),
        )
        callback["pending_not_due"] = max(0, pending - due_now)
        callback["oldest_due_age_seconds"] = oldest_due_age_seconds
        callback["dispatching_oldest_age_seconds"] = dispatching_oldest_age_seconds
        callback["recovery_action"] = "requeue_pending_after_stale_dispatch_lease"
        callback["pressure_thresholds"] = {
            "callback_overdue_after_seconds": RUNTIME_DIAGNOSTIC_CALLBACK_OVERDUE_AFTER_SECONDS,
            "dispatching_stale_after_seconds": (
                RUNTIME_DIAGNOSTIC_CALLBACK_DISPATCHING_STALE_AFTER_SECONDS
            ),
        }
        callback["pressure_state"], callback["pressure_reasons"] = self._classify_runtime_pressure(
            (
                ("callback.failed", failed > 0, failed >= 3),
                (
                    "callback.overdue",
                    oldest_due_age_seconds is not None
                    and oldest_due_age_seconds >= RUNTIME_DIAGNOSTIC_CALLBACK_OVERDUE_AFTER_SECONDS,
                    oldest_due_age_seconds is not None
                    and oldest_due_age_seconds
                    >= (RUNTIME_DIAGNOSTIC_CALLBACK_OVERDUE_AFTER_SECONDS * 3),
                ),
                (
                    "callback.due_now",
                    due_now > 0
                    and (
                        oldest_due_age_seconds is None
                        or oldest_due_age_seconds
                        < RUNTIME_DIAGNOSTIC_CALLBACK_OVERDUE_AFTER_SECONDS
                    ),
                    False,
                ),
                (
                    "callback.dispatching_stale",
                    recoverable_dispatching > 0,
                    recoverable_dispatching >= 3
                    or (
                        dispatching_oldest_age_seconds is not None
                        and dispatching_oldest_age_seconds
                        >= (RUNTIME_DIAGNOSTIC_CALLBACK_DISPATCHING_STALE_AFTER_SECONDS * 3)
                    ),
                ),
                (
                    "callback.dispatching",
                    dispatching > 0
                    and (
                        dispatching_oldest_age_seconds is None
                        or dispatching_oldest_age_seconds
                        < RUNTIME_DIAGNOSTIC_CALLBACK_DISPATCHING_STALE_AFTER_SECONDS
                    ),
                    False,
                ),
            )
        )

        failures = self._dict_or_empty(summary.get("failures"))
        failed_recent = max(0, self._coerce_int(failures.get("failed_recent"), default=0))
        provider_error_calls_recent = max(
            0,
            self._coerce_int(failures.get("provider_error_calls_recent"), default=0),
        )
        failures["pressure_state"], failures["pressure_reasons"] = self._classify_runtime_pressure(
            (
                ("failures.failed_recent", failed_recent > 0, failed_recent >= 3),
                (
                    "failures.provider_error_calls_recent",
                    provider_error_calls_recent > 0,
                    provider_error_calls_recent >= 3,
                ),
            )
        )
        failures["dominant_error"] = self._build_dominant_runtime_error(failures)
        operator_guidance = self._build_runtime_operator_guidance(
            queue=queue,
            cancel=cancel,
            callback=callback,
            failures=failures,
            retention=self._dict_or_empty(summary.get("retention")),
        )

        return {
            **summary,
            "queue": queue,
            "cancel": cancel,
            "callback": callback,
            "failures": failures,
            "operator_guidance": operator_guidance,
        }

    def _build_dominant_runtime_error(
        self,
        failures: dict[str, object],
    ) -> dict[str, object]:
        top_error_codes = failures.get("top_error_codes")
        top_provider_errors = failures.get("top_provider_errors")
        candidates: list[dict[str, object]] = []
        if isinstance(top_error_codes, list):
            candidates.extend(item for item in top_error_codes if isinstance(item, dict))
        if isinstance(top_provider_errors, list):
            candidates.extend(item for item in top_provider_errors if isinstance(item, dict))
        if not candidates:
            return {
                "error_code": "",
                "error_stage": "",
                "count": 0,
                "provider_id": "",
                "last_seen_at": "",
            }

        def sort_key(item: dict[str, object]) -> tuple[int, str]:
            return (
                self._coerce_int(item.get("count"), default=0),
                str(item.get("last_seen_at") or ""),
            )

        dominant = sorted(candidates, key=sort_key, reverse=True)[0]
        error_code = str(dominant.get("error_code") or "")
        taxonomy = get_error_taxonomy(error_code)
        return {
            "error_code": error_code,
            "error_stage": taxonomy.error_stage,
            "count": self._coerce_int(dominant.get("count"), default=0),
            "provider_id": str(dominant.get("provider_id") or ""),
            "last_seen_at": str(dominant.get("last_seen_at") or ""),
        }

    def _build_runtime_operator_guidance(
        self,
        *,
        queue: dict[str, object],
        cancel: dict[str, object],
        callback: dict[str, object],
        failures: dict[str, object],
        retention: dict[str, object],
    ) -> dict[str, object]:
        candidates: list[dict[str, object]] = []

        def add_candidate(
            *,
            reason: str,
            state: str,
            evidence_path: str,
            action: str,
            mode: str,
            priority: int,
        ) -> None:
            candidates.append(
                {
                    "reason": reason,
                    "state": state,
                    "evidence_path": evidence_path,
                    "suggested_action": action,
                    "mode": mode,
                    "priority": priority,
                }
            )

        if callback.get("pressure_state") in {"attention", "critical"}:
            add_candidate(
                reason="callback_delivery",
                state=str(callback.get("pressure_state") or "attention"),
                evidence_path="callback.pressure_reasons",
                action="inspect_callback_delivery_and_retry_buffer",
                mode="operator_review",
                priority=10,
            )
        if queue.get("pressure_state") in {"attention", "critical"}:
            add_candidate(
                reason="runtime_queue",
                state=str(queue.get("pressure_state") or "attention"),
                evidence_path="queue.pressure_reasons",
                action="inspect_runtime_worker_and_backlog_scope",
                mode="operator_review",
                priority=20,
            )
        if cancel.get("pressure_state") in {"attention", "critical"}:
            add_candidate(
                reason="cancel_requests",
                state=str(cancel.get("pressure_state") or "attention"),
                evidence_path="cancel.pressure_reasons",
                action="inspect_stuck_cancel_requests",
                mode="operator_review",
                priority=30,
            )
        if failures.get("pressure_state") in {"attention", "critical"}:
            dominant = failures.get("dominant_error")
            dominant_error = dominant if isinstance(dominant, dict) else {}
            error_stage = str(dominant_error.get("error_stage") or "runtime")
            action_by_stage = {
                "provider": "inspect_provider_credentials_quota_and_health",
                "auth": "inspect_site_key_signature_and_request_headers",
                "routing": "inspect_profile_catalog_and_routing_candidates",
                "runtime": "inspect_runtime_execution_error_and_worker_logs",
            }
            add_candidate(
                reason=f"{error_stage}_failures",
                state=str(failures.get("pressure_state") or "attention"),
                evidence_path="failures.dominant_error",
                action=action_by_stage.get(error_stage, "inspect_runtime_failure_detail"),
                mode="operator_review",
                priority=40,
            )
        if self._coerce_int(retention.get("due_purge"), default=0) > 0:
            add_candidate(
                reason="retention_due",
                state="attention",
                evidence_path="retention.due_purge",
                action="run_retention_cleanup_or_check_ops_cadence",
                mode="worker_auto",
                priority=50,
            )

        candidates.sort(key=lambda item: self._coerce_int(item.get("priority"), default=0))
        primary = (
            candidates[0]
            if candidates
            else {
                "reason": "none",
                "state": "healthy",
                "evidence_path": "",
                "suggested_action": "continue_monitoring",
                "mode": "none",
                "priority": 100,
            }
        )
        return {
            "state": str(primary["state"]),
            "primary_reason": str(primary["reason"]),
            "primary_evidence_path": str(primary["evidence_path"]),
            "suggested_actions": [
                {
                    "action": str(item["suggested_action"]),
                    "reason": str(item["reason"]),
                    "mode": str(item["mode"]),
                    "evidence_path": str(item["evidence_path"]),
                }
                for item in candidates[:5]
            ],
        }

    def build_runtime_backlog_diagnostics(
        self,
        *,
        runs: list[RunRecord],
        scope_kind: str,
        site_id: str | None,
        limit: int,
        current_time: datetime,
    ) -> dict[str, object]:
        queued_ages: list[int] = []
        running_ages: list[int] = []
        grouped_runs: dict[str, dict[str, object]] = {}
        for run in runs:
            age_seconds = self._resolve_backlog_age_seconds(run, current_time)
            scope_id = self._resolve_backlog_scope_id(run, scope_kind)
            entry = grouped_runs.setdefault(
                scope_id,
                {
                    "scope_kind": scope_kind,
                    "scope_id": scope_id,
                    "queued_ages": [],
                    "running_ages": [],
                },
            )
            if run.status == "queued":
                queued_ages.append(age_seconds)
                cast(list[int], entry["queued_ages"]).append(age_seconds)
            elif run.status == "running":
                running_ages.append(age_seconds)
                cast(list[int], entry["running_ages"]).append(age_seconds)

        total_queued = self._summarize_backlog_status(
            queued_ages,
            aging_after_seconds=RUNTIME_BACKLOG_QUEUED_AGING_AFTER_SECONDS,
            stale_after_seconds=RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
        )
        total_running = self._summarize_backlog_status(
            running_ages,
            aging_after_seconds=RUNTIME_BACKLOG_RUNNING_AGING_AFTER_SECONDS,
            stale_after_seconds=RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
        )

        items: list[dict[str, object]] = []
        for item in grouped_runs.values():
            item_queued = self._summarize_backlog_status(
                cast(list[int], item["queued_ages"]),
                aging_after_seconds=RUNTIME_BACKLOG_QUEUED_AGING_AFTER_SECONDS,
                stale_after_seconds=RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
            )
            item_running = self._summarize_backlog_status(
                cast(list[int], item["running_ages"]),
                aging_after_seconds=RUNTIME_BACKLOG_RUNNING_AGING_AFTER_SECONDS,
                stale_after_seconds=RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
            )
            pressure_state, pressure_reasons = self._classify_backlog_pressure(
                queued_state=str(item_queued["state"]),
                running_state=str(item_running["state"]),
            )
            items.append(
                {
                    "scope_kind": str(item["scope_kind"]),
                    "scope_id": str(item["scope_id"]),
                    "total_runs": self._coerce_int(item_queued.get("runs"), default=0)
                    + self._coerce_int(item_running.get("runs"), default=0),
                    "queued": item_queued,
                    "running": item_running,
                    "bottleneck_state": self._classify_backlog_bottleneck(
                        queued_state=str(item_queued["state"]),
                        running_state=str(item_running["state"]),
                    ),
                    "pressure_state": pressure_state,
                    "pressure_reasons": pressure_reasons,
                    "lease_recovery_inputs": {
                        "queued_stale_runs": self._coerce_int(
                            item_queued.get("stale_runs"), default=0
                        ),
                        "running_stale_runs": self._coerce_int(
                            item_running.get("stale_runs"), default=0
                        ),
                        "total_stale_runs": (
                            self._coerce_int(item_queued.get("stale_runs"), default=0)
                            + self._coerce_int(item_running.get("stale_runs"), default=0)
                        ),
                    },
                }
            )

        def backlog_sort_key(item: dict[str, object]) -> tuple[int, int, int, str]:
            lease_recovery_inputs = self._dict_or_empty(item.get("lease_recovery_inputs"))
            return (
                0
                if item.get("pressure_state") == "critical"
                else 1
                if item.get("pressure_state") == "attention"
                else 2,
                -self._coerce_int(lease_recovery_inputs.get("total_stale_runs"), default=0),
                -self._coerce_int(item.get("total_runs"), default=0),
                str(item.get("scope_id") or ""),
            )

        items.sort(key=backlog_sort_key)
        limited_items = items[: max(1, limit)]
        active_scope_count = len(items)
        pressured_scope_count = sum(1 for item in items if item["pressure_state"] != "healthy")
        stale_scope_count = sum(
            1
            for item in items
            if self._coerce_int(
                self._dict_or_empty(item.get("lease_recovery_inputs")).get("total_stale_runs"),
                default=0,
            )
            > 0
        )
        total_active_runs = max(
            1,
            self._coerce_int(total_queued.get("runs"), default=0)
            + self._coerce_int(total_running.get("runs"), default=0),
        )
        dominant_scope_share = (
            round(self._coerce_int(items[0].get("total_runs"), default=0) / total_active_runs, 3)
            if items
            else 0.0
        )
        total_pressure_state, total_pressure_reasons = self._classify_backlog_pressure(
            queued_state=str(total_queued["state"]),
            running_state=str(total_running["state"]),
        )

        return {
            "filters": {
                "site_id": site_id or "",
                "scope_kind": scope_kind,
                "limit": limit,
            },
            "generated_at": self.run_projector.serialize_timestamp(current_time),
            "thresholds": {
                "queued_aging_after_seconds": RUNTIME_BACKLOG_QUEUED_AGING_AFTER_SECONDS,
                "queued_stale_after_seconds": RUNTIME_DIAGNOSTIC_QUEUED_STALE_AFTER_SECONDS,
                "running_aging_after_seconds": RUNTIME_BACKLOG_RUNNING_AGING_AFTER_SECONDS,
                "running_stale_after_seconds": RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
            },
            "totals": {
                "queued": total_queued,
                "running": total_running,
                "bottleneck_state": self._classify_backlog_bottleneck(
                    queued_state=str(total_queued["state"]),
                    running_state=str(total_running["state"]),
                ),
                "pressure_state": total_pressure_state,
                "pressure_reasons": total_pressure_reasons,
                "lease_recovery_inputs": {
                    "queued_stale_runs": self._coerce_int(
                        total_queued.get("stale_runs"), default=0
                    ),
                    "running_stale_runs": self._coerce_int(
                        total_running.get("stale_runs"), default=0
                    ),
                    "stale_scope_count": stale_scope_count,
                },
            },
            "scope_pressure": {
                "scope_kind": scope_kind,
                "active_scope_count": active_scope_count,
                "pressured_scope_count": pressured_scope_count,
                "stale_scope_count": stale_scope_count,
                "spread_state": self._classify_backlog_spread_state(
                    pressured_scope_count=pressured_scope_count,
                    stale_scope_count=stale_scope_count,
                    dominant_scope_share=dominant_scope_share,
                ),
                "dominant_scope_share": dominant_scope_share,
            },
            "items": limited_items,
        }

    def _resolve_backlog_scope_id(
        self,
        run: RunRecord,
        scope_kind: str,
    ) -> str:
        if scope_kind == "site_id":
            return str(run.site_id or "unknown")
        if scope_kind == "ability_family":
            return str(run.ability_family or "unknown")
        if scope_kind == "execution_pattern":
            return str(run.execution_pattern or "unknown")
        return "unknown"

    def _resolve_backlog_age_seconds(
        self,
        run: RunRecord,
        current_time: datetime,
    ) -> int:
        if run.status == "running" and run.processing_started_at is not None:
            started_at = self.run_projector.normalize_timestamp(run.processing_started_at)
        else:
            started_at = self.run_projector.normalize_timestamp(run.started_at)
        return max(0, int((current_time - started_at).total_seconds()))

    def _summarize_backlog_status(
        self,
        ages: list[int],
        *,
        aging_after_seconds: int,
        stale_after_seconds: int,
    ) -> dict[str, object]:
        ordered = sorted(max(0, int(age)) for age in ages)
        fresh_count = sum(1 for age in ordered if age < aging_after_seconds)
        aging_count = sum(
            1 for age in ordered if age >= aging_after_seconds and age < stale_after_seconds
        )
        stale_count = sum(1 for age in ordered if age >= stale_after_seconds)
        if not ordered:
            state = "idle"
        elif stale_count > 0:
            state = "stale"
        elif aging_count > 0:
            state = "aging"
        else:
            state = "fresh_wave"
        return {
            "runs": len(ordered),
            "stale_runs": stale_count,
            "oldest_age_seconds": ordered[-1] if ordered else None,
            "p95_age_seconds": self._calculate_percentile(ordered, percentile=95),
            "state": state,
            "age_buckets": {
                "fresh": fresh_count,
                "aging": aging_count,
                "stale": stale_count,
            },
        }

    def _calculate_percentile(
        self,
        ordered_values: list[int],
        *,
        percentile: int,
    ) -> int | None:
        if not ordered_values:
            return None
        bounded = min(100, max(1, percentile))
        index = max(0, ((len(ordered_values) * bounded) - 1) // 100)
        return ordered_values[index]

    def _classify_backlog_pressure(
        self,
        *,
        queued_state: str,
        running_state: str,
    ) -> tuple[str, list[str]]:
        reasons: list[str] = []
        if queued_state == "stale":
            reasons.append("queue.stale")
        elif queued_state == "aging":
            reasons.append("queue.aging")
        if running_state == "stale":
            reasons.append("worker.stale")
        elif running_state == "aging":
            reasons.append("worker.aging")

        if any(reason.endswith(".stale") for reason in reasons):
            return "critical", reasons
        if reasons:
            return "attention", reasons
        return "healthy", []

    def _classify_backlog_bottleneck(
        self,
        *,
        queued_state: str,
        running_state: str,
    ) -> str:
        queued_abnormal = queued_state in {"aging", "stale"}
        running_abnormal = running_state in {"aging", "stale"}
        if queued_abnormal and running_abnormal:
            return "mixed"
        if queued_abnormal:
            return "queue_claiming_lag"
        if running_abnormal:
            return "worker_stall"
        return "healthy"

    def _classify_backlog_spread_state(
        self,
        *,
        pressured_scope_count: int,
        stale_scope_count: int,
        dominant_scope_share: float,
    ) -> str:
        if pressured_scope_count <= 0:
            return "none"
        if stale_scope_count <= 1 and dominant_scope_share >= 0.8:
            return "isolated"
        if pressured_scope_count == 1:
            return "isolated"
        return "multi_scope"

    def _classify_runtime_pressure(
        self,
        rules: tuple[tuple[str, bool, bool], ...],
    ) -> tuple[str, list[str]]:
        reasons: list[str] = []
        critical = False
        for code, active, is_critical in rules:
            if not active:
                continue
            reasons.append(code)
            critical = critical or is_critical
        if critical:
            return "critical", reasons
        if reasons:
            return "attention", reasons
        return "healthy", []

    def _calculate_age_seconds(
        self,
        current_time: datetime,
        serialized_timestamp: object,
    ) -> int | None:
        if not isinstance(serialized_timestamp, str) or not serialized_timestamp:
            return None
        try:
            parsed = datetime.fromisoformat(serialized_timestamp.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        age = current_time - parsed.astimezone(UTC)
        return max(0, int(age.total_seconds()))

    def _dict_or_empty(self, value: object | None) -> dict[str, object]:
        return value if isinstance(value, dict) else {}

    def _coerce_int(self, value: object | None, *, default: int) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                return default
        return default
