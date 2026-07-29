from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.db import get_session
from app.core.models import RuntimeGuardEvent
from app.core.security import (
    REPLAY_SCOPE_INTERNAL_POST,
    REPLAY_SCOPE_INTERNAL_POST_IP,
    REPLAY_SCOPE_PUBLIC_POST_IP,
    REPLAY_SCOPE_PUBLIC_POST_KEY,
    REPLAY_SCOPE_PUBLIC_POST_SITE,
)
from app.domain.runtime.diagnostics_projection import RuntimeDiagnosticsProjector
from app.domain.runtime.models import (
    ABUSE_GUARD_ATTENTION_RATIO,
    ABUSE_GUARD_CRITICAL_RATIO,
)
from app.domain.runtime.provider_evidence import summarize_provider_runtime_evidence
from app.domain.runtime.run_projection import RuntimeRunProjector


class RuntimeDiagnosticsQueryService:
    """Read-only runtime diagnostics assembled for internal operator surfaces."""

    def __init__(
        self,
        *,
        database_url: str,
        run_projector: RuntimeRunProjector,
    ) -> None:
        self.database_url = database_url
        self.run_projector = run_projector
        self.diagnostics_projector = RuntimeDiagnosticsProjector(
            run_projector=run_projector,
        )

    def get_runtime_diagnostics_summary(
        self,
        *,
        site_id: str | None = None,
        recent_minutes: int = 60,
    ) -> dict[str, object]:
        current_time = datetime.now(UTC)
        recent_since = current_time - timedelta(minutes=max(1, recent_minutes))
        with get_session(self.database_url) as session:
            repository = RuntimeRepository(session)
            summary = repository.get_runtime_diagnostics_summary(
                site_id=site_id,
                now=current_time,
                recent_since=recent_since,
            )
            guard_summary = {
                "recent_events": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                ),
                "recent_rate_limit_exceeded": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                    event_code="auth.rate_limit_exceeded",
                ),
                "recent_replay_blocked": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                    event_code="auth.replay_blocked",
                ),
                "recent_payload_too_large": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                    event_code="auth.payload_too_large",
                ),
                "recent_invalid_nonce": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                    event_code="auth.invalid_nonce",
                ),
                "recent_invalid_idempotency_key": repository.count_runtime_guard_events(
                    since=recent_since,
                    site_id=site_id,
                    event_code="auth.invalid_idempotency_key",
                ),
                "event_codes": repository.summarize_runtime_guard_event_codes(
                    since=recent_since,
                    site_id=site_id,
                    limit=10,
                ),
            }
        summary = self.diagnostics_projector.augment_runtime_diagnostics_summary(
            summary,
            current_time,
        )
        return {
            "filters": {
                "site_id": site_id or "",
                "recent_minutes": recent_minutes,
            },
            "generated_at": self.run_projector.serialize_timestamp(current_time),
            "guard": guard_summary,
            **summary,
        }

    def get_runtime_backlog_diagnostics(
        self,
        *,
        scope_kind: str,
        site_id: str | None = None,
        limit: int = 20,
    ) -> dict[str, object]:
        current_time = datetime.now(UTC)
        with get_session(self.database_url) as session:
            repository = RuntimeRepository(session)
            runs = repository.list_runtime_backlog_runs(site_id=site_id)
        return self.diagnostics_projector.build_runtime_backlog_diagnostics(
            runs=runs,
            scope_kind=scope_kind,
            site_id=site_id,
            limit=limit,
            current_time=current_time,
        )

    def get_provider_runtime_evidence_summary(
        self,
        *,
        site_id: str | None = None,
        provider_id: str | None = None,
        model_id: str | None = None,
        ability_name: str | None = None,
        recent_minutes: int = 1440,
        lane_limit: int = 50,
    ) -> dict[str, object]:
        current_time = datetime.now(UTC)
        resolved_recent_minutes = max(1, recent_minutes)
        resolved_lane_limit = max(1, lane_limit)
        record_limit = 10000
        recent_since = current_time - timedelta(minutes=resolved_recent_minutes)
        with get_session(self.database_url) as session:
            repository = RuntimeRepository(session)
            records, records_truncated = repository.list_provider_evidence_records(
                since=recent_since,
                limit=record_limit,
                site_id=site_id,
                provider_id=provider_id,
                model_id=model_id,
                ability_name=ability_name,
            )
            meter_events = repository.list_provider_evidence_meter_events(
                [record.call_id for record in records]
            )
        evidence = summarize_provider_runtime_evidence(
            records,
            meter_events,
            lane_limit=resolved_lane_limit,
        )
        return {
            "filters": {
                "site_id": site_id or "",
                "provider_id": provider_id or "",
                "model_id": model_id or "",
                "ability_name": ability_name or "",
                "recent_minutes": resolved_recent_minutes,
                "lane_limit": resolved_lane_limit,
            },
            "window": {
                "started_at": self.run_projector.serialize_timestamp(recent_since),
                "ended_at": self.run_projector.serialize_timestamp(current_time),
                "record_limit": record_limit,
                "records_truncated": records_truncated,
            },
            "generated_at": self.run_projector.serialize_timestamp(current_time),
            **evidence,
        }

    def list_runtime_guard_events(
        self,
        *,
        site_id: str | None = None,
        scope_kind: str | None = None,
        event_code: str | None = None,
        limit: int = 20,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = RuntimeRepository(session)
            events = repository.list_runtime_guard_events(
                site_id=site_id,
                scope_kind=scope_kind,
                event_code=event_code,
                limit=limit,
            )
        return {
            "filters": {
                "site_id": site_id or "",
                "scope_kind": scope_kind or "",
                "event_code": event_code or "",
                "limit": limit,
            },
            "items": [self._serialize_runtime_guard_event(event) for event in events],
        }

    def get_abuse_guard_diagnostics(
        self,
        *,
        window_seconds: int,
        cooldown_window_seconds: int,
        limit_per_scope: int,
        public_post_site_limit: int,
        public_post_key_limit: int,
        public_post_ip_limit: int,
        public_guard_site_cooldown_limit: int,
        public_guard_key_cooldown_limit: int,
        public_guard_ip_cooldown_limit: int,
        internal_post_token_limit: int,
        internal_post_ip_limit: int,
        internal_guard_token_cooldown_limit: int,
        internal_guard_ip_cooldown_limit: int,
    ) -> dict[str, object]:
        current_time = datetime.now(UTC)
        since = current_time - timedelta(seconds=max(1, window_seconds))
        cooldown_since = current_time - timedelta(seconds=max(1, cooldown_window_seconds))
        scope_kinds = [
            REPLAY_SCOPE_PUBLIC_POST_SITE,
            REPLAY_SCOPE_PUBLIC_POST_KEY,
            REPLAY_SCOPE_PUBLIC_POST_IP,
            REPLAY_SCOPE_INTERNAL_POST,
            REPLAY_SCOPE_INTERNAL_POST_IP,
        ]
        with get_session(self.database_url) as session:
            repository = RuntimeRepository(session)
            grouped = repository.summarize_replay_receipts(
                scope_kinds=scope_kinds,
                since=since,
                limit_per_scope=limit_per_scope,
            )
            cooldown_grouped = repository.summarize_runtime_guard_events(
                scope_kinds=scope_kinds,
                since=cooldown_since,
                limit_per_scope=limit_per_scope,
            )
            event_codes = repository.summarize_runtime_guard_event_codes(
                since=cooldown_since,
                limit=limit_per_scope,
            )
            cooldown_code_breakdown = (
                repository.summarize_runtime_guard_event_code_breakdown_by_scope(
                    scope_kinds=scope_kinds,
                    since=cooldown_since,
                    limit_per_scope=3,
                )
            )
        scope_specs = {
            REPLAY_SCOPE_PUBLIC_POST_SITE: {
                "request_limit": public_post_site_limit,
                "cooldown_limit": public_guard_site_cooldown_limit,
            },
            REPLAY_SCOPE_PUBLIC_POST_KEY: {
                "request_limit": public_post_key_limit,
                "cooldown_limit": public_guard_key_cooldown_limit,
            },
            REPLAY_SCOPE_PUBLIC_POST_IP: {
                "request_limit": public_post_ip_limit,
                "cooldown_limit": public_guard_ip_cooldown_limit,
            },
            REPLAY_SCOPE_INTERNAL_POST: {
                "request_limit": internal_post_token_limit,
                "cooldown_limit": internal_guard_token_cooldown_limit,
            },
            REPLAY_SCOPE_INTERNAL_POST_IP: {
                "request_limit": internal_post_ip_limit,
                "cooldown_limit": internal_guard_ip_cooldown_limit,
            },
        }
        scopes: dict[str, dict[str, object]] = {}
        watchlist: list[dict[str, object]] = []
        for scope_kind in scope_kinds:
            scope_spec = scope_specs[scope_kind]
            request_limit = max(0, self._coerce_int(scope_spec.get("request_limit"), default=0))
            cooldown_limit = max(0, self._coerce_int(scope_spec.get("cooldown_limit"), default=0))
            request_items = [
                self._decorate_abuse_guard_item(
                    scope_kind=scope_kind,
                    item=item,
                    observed_count=max(0, self._coerce_int(item.get("request_count"), default=0)),
                    limit=request_limit,
                    signal_kind="request_burst",
                    near_limit_reason="request_burst_near_limit",
                    exceeded_reason="request_burst_limit_exceeded",
                )
                for item in grouped.get(scope_kind, [])
            ]
            cooldown_items = []
            for item in cooldown_grouped.get(scope_kind, []):
                scope_id = str(item.get("scope_id") or "")
                breakdown = cooldown_code_breakdown.get((scope_kind, scope_id), [])
                cooldown_items.append(
                    self._decorate_abuse_guard_item(
                        scope_kind=scope_kind,
                        item=item,
                        observed_count=max(0, self._coerce_int(item.get("event_count"), default=0)),
                        limit=cooldown_limit,
                        signal_kind="reject_storm",
                        near_limit_reason="reject_storm_near_limit",
                        exceeded_reason="reject_storm_limit_exceeded",
                        event_code_breakdown=breakdown,
                    )
                )

            scopes[scope_kind] = {
                "max_requests_per_window": request_limit,
                "items": request_items,
                "request_pressure": self._summarize_abuse_guard_pressure(request_items),
                "max_reject_events_per_cooldown_window": cooldown_limit,
                "cooldown_items": cooldown_items,
                "cooldown_pressure": self._summarize_abuse_guard_pressure(cooldown_items),
            }
            watchlist.extend(
                item for item in (*request_items, *cooldown_items) if item["severity"] != "healthy"
            )

        sorted_watchlist = sorted(
            watchlist,
            key=lambda item: (
                0 if item.get("severity") == "critical" else 1,
                -(self._coerce_float(item.get("limit_ratio")) or 0.0),
                -self._coerce_int(item.get("observed_count"), default=0),
                str(item.get("scope_kind") or ""),
                str(item.get("scope_id") or ""),
            ),
        )
        return {
            "generated_at": self.run_projector.serialize_timestamp(current_time),
            "window_seconds": window_seconds,
            "cooldown_window_seconds": cooldown_window_seconds,
            "limit_per_scope": limit_per_scope,
            "guard_event_codes": event_codes,
            "watchlist_summary": {
                "highest_severity": (
                    "critical"
                    if any(item["severity"] == "critical" for item in sorted_watchlist)
                    else "attention"
                    if sorted_watchlist
                    else "healthy"
                ),
                "attention_count": sum(
                    1 for item in sorted_watchlist if item["severity"] == "attention"
                ),
                "critical_count": sum(
                    1 for item in sorted_watchlist if item["severity"] == "critical"
                ),
                "request_burst_count": sum(
                    1 for item in sorted_watchlist if item["signal_kind"] == "request_burst"
                ),
                "reject_storm_count": sum(
                    1 for item in sorted_watchlist if item["signal_kind"] == "reject_storm"
                ),
            },
            "watchlist": sorted_watchlist,
            "scopes": scopes,
        }

    def _decorate_abuse_guard_item(
        self,
        *,
        scope_kind: str,
        item: dict[str, object],
        observed_count: int,
        limit: int,
        signal_kind: str,
        near_limit_reason: str,
        exceeded_reason: str,
        event_code_breakdown: list[dict[str, object]] | None = None,
    ) -> dict[str, object]:
        limit_ratio = self._calculate_limit_ratio(observed_count, limit)
        severity = self._classify_abuse_guard_severity(limit_ratio)
        reason_codes: list[str] = []
        if severity == "critical":
            reason_codes.append(exceeded_reason)
        elif severity == "attention":
            reason_codes.append(near_limit_reason)
        if signal_kind == "reject_storm":
            reason_codes.extend(
                self._derive_guard_breakdown_reason_codes(event_code_breakdown or [])
            )
        return {
            **item,
            "scope_kind": scope_kind,
            "signal_kind": signal_kind,
            "severity": severity,
            "observed_count": observed_count,
            "limit": limit,
            "limit_ratio": limit_ratio,
            "remaining_before_limit": max(limit - observed_count, 0),
            "exceeded_by": max(observed_count - limit, 0),
            "reason_codes": reason_codes,
            "event_code_breakdown": event_code_breakdown or [],
        }

    def _summarize_abuse_guard_pressure(
        self,
        items: list[dict[str, object]],
    ) -> dict[str, object]:
        return {
            "highest_severity": (
                "critical"
                if any(item["severity"] == "critical" for item in items)
                else "attention"
                if any(item["severity"] == "attention" for item in items)
                else "healthy"
            ),
            "healthy_count": sum(1 for item in items if item["severity"] == "healthy"),
            "attention_count": sum(1 for item in items if item["severity"] == "attention"),
            "critical_count": sum(1 for item in items if item["severity"] == "critical"),
        }

    def _calculate_limit_ratio(self, observed_count: int, limit: int) -> float:
        if limit <= 0:
            return 0.0
        return round(observed_count / limit, 3)

    def _classify_abuse_guard_severity(self, limit_ratio: float) -> str:
        if limit_ratio >= ABUSE_GUARD_CRITICAL_RATIO:
            return "critical"
        if limit_ratio >= ABUSE_GUARD_ATTENTION_RATIO:
            return "attention"
        return "healthy"

    def _derive_guard_breakdown_reason_codes(
        self,
        breakdown: list[dict[str, object]],
    ) -> list[str]:
        reason_codes: list[str] = []
        if any(item.get("event_code") == "auth.replay_blocked" for item in breakdown):
            reason_codes.append("rejects_include_replay_blocks")
        if any(item.get("event_code") == "auth.rate_limit_exceeded" for item in breakdown):
            reason_codes.append("rejects_include_rate_limits")
        if any(item.get("event_code") == "auth.payload_too_large" for item in breakdown):
            reason_codes.append("rejects_include_payload_limits")
        if any(item.get("event_code") == "auth.invalid_nonce" for item in breakdown):
            reason_codes.append("rejects_include_invalid_nonce")
        if any(item.get("event_code") == "auth.invalid_idempotency_key" for item in breakdown):
            reason_codes.append("rejects_include_invalid_idempotency_key")
        return reason_codes

    def _serialize_runtime_guard_event(self, event: RuntimeGuardEvent) -> dict[str, object]:
        return {
            "id": event.id,
            "auth_surface": event.auth_surface,
            "scope_kind": event.scope_kind,
            "scope_id": event.scope_id,
            "site_id": event.site_id or "",
            "key_id": event.key_id or "",
            "client_ref": event.client_ref or "",
            "event_code": event.event_code,
            "status_code": event.status_code,
            "method": event.method or "",
            "path": event.path or "",
            "trace_id": event.trace_id or "",
            "payload": event.payload_json or {},
            "created_at": self.run_projector.serialize_timestamp(event.created_at),
        }

    @staticmethod
    def _coerce_int(value: object | None, *, default: int) -> int:
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

    @staticmethod
    def _coerce_float(value: object | None) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return float(value)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None
        return None
