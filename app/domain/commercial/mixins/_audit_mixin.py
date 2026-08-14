"""Commercial service: audit, serialization, and coercion base mixin."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from time import perf_counter

from app.adapters.repositories.commercial_decision_repository import (
    CommercialDecisionRepository,
)
from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.models import (
    AccountSubscription,
    CommercialDecisionEvent,
    ServiceAuditEvent,
)
from app.domain.commercial.audit_context import ServiceAuditContext

MAX_AUDIT_PAYLOAD_DEPTH = 8
MAX_AUDIT_PAYLOAD_ITEMS = 100
MAX_AUDIT_STRING_CHARS = 2000
SENSITIVE_AUDIT_KEY_PARTS = (
    "secret",
    "token",
    "api_key",
    "apikey",
    "access_key",
    "password",
    "authorization",
    "signature",
    "private_key",
    "client_secret",
    "refresh_token",
    "id_token",
)


class CommercialServiceAuditMixin:
    def _normalize_runtime_policy_overrides(
        self,
        raw: object,
    ) -> dict[str, object]:
        raise NotImplementedError

    def _resolve_subscription_policy_action(
        self,
        *,
        subscription: AccountSubscription,
        policy: dict[str, object],
        period_end_at: datetime,
        now: datetime,
        reason: str,
    ) -> dict[str, object] | None:
        raise NotImplementedError

    def __init__(
        self,
        database_url: str,
        now_factory: Callable[[], datetime] | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.database_url = database_url
        self.now_factory = now_factory or (lambda: datetime.now(UTC))
        self.settings = settings or get_settings()

    def _serialize_service_audit_event(
        self,
        event: ServiceAuditEvent,
        *,
        include_payload: bool = True,
    ) -> dict[str, object]:
        serialized: dict[str, object] = {
            "event_id": int(event.id or 0),
            "account_id": event.account_id or "",
            "site_id": event.site_id or "",
            "key_id": event.key_id or "",
            "subscription_id": event.subscription_id or "",
            "plan_id": event.plan_id or "",
            "plan_version_id": event.plan_version_id or "",
            "scope_kind": event.scope_kind or "",
            "scope_id": event.scope_id or "",
            "event_kind": event.event_kind,
            "outcome": event.outcome,
            "method": event.method or "",
            "path": event.path or "",
            "trace_id": event.trace_id or "",
            "idempotency_key": event.idempotency_key or "",
            "actor_kind": event.actor_kind,
            "actor_ref": event.actor_ref or "",
            "created_at": self._serialize_datetime(event.created_at),
        }
        if include_payload:
            serialized["payload"] = event.payload_json or {}
        return serialized

    def _serialize_commercial_decision_event(
        self,
        event: CommercialDecisionEvent,
    ) -> dict[str, object]:
        return {
            "event_id": int(event.id or 0),
            "account_id": event.account_id or "",
            "site_id": event.site_id or "",
            "subscription_id": event.subscription_id or "",
            "plan_version_id": event.plan_version_id or "",
            "run_id": event.run_id or "",
            "request_kind": event.request_kind,
            "decision": event.decision,
            "decision_code": event.decision_code,
            "ability_family": event.ability_family or "",
            "channel": event.channel or "",
            "execution_kind": event.execution_kind or "",
            "execution_tier": event.execution_tier or "",
            "data_classification": event.data_classification or "",
            "trace_id": event.trace_id or "",
            "idempotency_key": event.idempotency_key or "",
            "payload": event.payload_json or {},
            "created_at": self._serialize_datetime(event.created_at),
        }

    def _record_service_audit_in_session(
        self,
        *,
        repository: CommercialServiceAuditRepository,
        audit_context: ServiceAuditContext | None,
        event_kind: str,
        outcome: str,
        account_id: str | None = None,
        site_id: str | None = None,
        key_id: str | None = None,
        subscription_id: str | None = None,
        plan_id: str | None = None,
        plan_version_id: str | None = None,
        scope_kind: str | None = None,
        scope_id: str | None = None,
        payload_json: object | None = None,
    ) -> ServiceAuditEvent | None:
        if audit_context is None:
            return None

        return repository.record_service_audit_event(
            account_id=account_id,
            site_id=site_id,
            key_id=key_id,
            subscription_id=subscription_id,
            plan_id=plan_id,
            plan_version_id=plan_version_id,
            scope_kind=scope_kind,
            scope_id=scope_id,
            event_kind=event_kind,
            outcome=outcome,
            method=audit_context.method.upper(),
            path=audit_context.path,
            trace_id=audit_context.trace_id,
            idempotency_key=audit_context.idempotency_key,
            actor_kind=audit_context.actor_kind,
            actor_ref=audit_context.actor_ref,
            payload_json=self._sanitize_payload_dict(payload_json),
        )

    def _record_commercial_decision_in_session(
        self,
        *,
        repository: CommercialDecisionRepository,
        account_id: str | None,
        site_id: str | None,
        subscription_id: str | None,
        plan_version_id: str | None,
        run_id: str | None,
        request_kind: str,
        decision: str,
        decision_code: str,
        ability_family: str | None,
        channel: str | None,
        execution_kind: str | None,
        execution_tier: str | None,
        data_classification: str | None,
        trace_id: str | None,
        idempotency_key: str | None,
        payload_json: object | None = None,
    ) -> CommercialDecisionEvent:
        return repository.record_commercial_decision_event(
            account_id=account_id,
            site_id=site_id,
            subscription_id=subscription_id,
            plan_version_id=plan_version_id,
            run_id=run_id,
            request_kind=request_kind,
            decision=decision,
            decision_code=decision_code,
            ability_family=ability_family,
            channel=channel,
            execution_kind=execution_kind,
            execution_tier=execution_tier,
            data_classification=data_classification,
            trace_id=trace_id,
            idempotency_key=idempotency_key,
            payload_json=self._sanitize_payload_dict(payload_json),
        )

    def _sanitize_payload(self, payload: object, *, depth: int = 0) -> object:
        if depth >= MAX_AUDIT_PAYLOAD_DEPTH:
            return "[truncated:max_depth]"
        if isinstance(payload, dict):
            sanitized: dict[str, object] = {}
            for index, (key, value) in enumerate(payload.items()):
                if index >= MAX_AUDIT_PAYLOAD_ITEMS:
                    sanitized["__truncated__"] = "max_items"
                    break
                normalized_key = str(key).lower()
                if any(part in normalized_key for part in SENSITIVE_AUDIT_KEY_PARTS):
                    sanitized[str(key)] = "[redacted]"
                    continue
                sanitized[str(key)] = self._sanitize_payload(value, depth=depth + 1)
            return sanitized
        if isinstance(payload, list):
            sanitized_items = [
                self._sanitize_payload(item, depth=depth + 1)
                for item in payload[:MAX_AUDIT_PAYLOAD_ITEMS]
            ]
            if len(payload) > MAX_AUDIT_PAYLOAD_ITEMS:
                sanitized_items.append("[truncated:max_items]")
            return sanitized_items
        if isinstance(payload, str) and len(payload) > MAX_AUDIT_STRING_CHARS:
            return f"{payload[:MAX_AUDIT_STRING_CHARS]}...[truncated]"
        return payload

    def _sanitize_payload_dict(
        self,
        payload: object | None,
    ) -> dict[str, object] | None:
        sanitized = self._sanitize_payload(payload)
        return sanitized if isinstance(sanitized, dict) else None

    def _build_subscription_grace_state(
        self,
        *,
        subscription: AccountSubscription | None,
        policy: dict[str, object],
        period_end_at: datetime,
        now: datetime,
    ) -> dict[str, object]:
        if subscription is None:
            return {
                "active": False,
                "subscription_status": "missing",
                "grace_until_at": "",
                "grace_period_days": 0,
            }
        action = self._resolve_subscription_policy_action(
            subscription=subscription,
            policy=policy,
            period_end_at=period_end_at,
            now=now,
            reason="inspect",
        )
        subscription_policy = policy.get("subscription")
        subscription_policy = subscription_policy if isinstance(subscription_policy, dict) else {}
        return {
            "active": action is not None,
            "subscription_status": subscription.status,
            "grace_period_days": max(
                0,
                self._coerce_int(subscription_policy.get("grace_period_days")),
            ),
            "grace_until_at": str(action.get("grace_until_at") or "") if action else "",
            "runtime_policy_overrides": (action.get("runtime_policy_overrides") if action else {}),
        }

    def _build_budget_policy_state(
        self,
        *,
        repository: CommercialDecisionRepository,
        subscription: AccountSubscription | None,
        policy: dict[str, object],
        budgets: dict[str, object],
        totals: dict[str, float],
        period_start_at: datetime,
    ) -> dict[str, object]:
        result: dict[str, object] = {}
        normalized_policy = policy.get("budgets")
        normalized_policy = normalized_policy if isinstance(normalized_policy, dict) else {}
        cny_cost_limit = self._coerce_float(budgets.get("max_cost_cny_per_period"))
        cost_total = self._coerce_float(totals.get("cost_cny"))
        cost_budget_source = "max_cost_cny_per_period"
        for meter_key, budget_key, totals_key in (
            ("runs", "max_runs_per_period", "runs"),
            ("tokens", "max_tokens_per_period", "tokens_total"),
            ("cost", "max_cost_cny_per_period", "cost_cny"),
        ):
            meter_policy = normalized_policy.get(meter_key)
            meter_policy = meter_policy if isinstance(meter_policy, dict) else {}
            grace_requests = max(0, self._coerce_int(meter_policy.get("grace_requests")))
            used_grace_requests = 0
            if subscription is not None and grace_requests > 0:
                used_grace_requests = repository.count_commercial_decision_events(
                    subscription_id=subscription.subscription_id,
                    decision="allow",
                    decision_code=f"commercial.quota_grace.{meter_key}",
                    request_kind="execute",
                    since=period_start_at,
                )
            current_total = (
                cost_total
                if meter_key == "cost"
                else self._coerce_float(totals.get(totals_key))
            )
            limit = (
                cny_cost_limit
                if meter_key == "cost"
                else self._coerce_float(budgets.get(budget_key))
            )
            result[meter_key] = {
                "current_total": round(float(current_total), 6),
                "limit": round(float(limit), 6),
                "grace_requests": grace_requests,
                "used_grace_requests": used_grace_requests,
                "remaining_grace_requests": max(0, grace_requests - used_grace_requests),
                "downgrade_policy": self._normalize_runtime_policy_overrides(
                    meter_policy.get("downgrade_policy")
                ),
                "over_limit": round(float(current_total), 6) >= round(float(limit), 6)
                and limit > 0,
                **(
                    {
                        "currency": "CNY",
                        "budget_source": cost_budget_source,
                    }
                    if meter_key == "cost"
                    else {}
                ),
            }
        return result

    def _build_diagnostic_check(
        self,
        code: str,
        ok: bool,
        label: str,
        next_step: str,
    ) -> dict[str, object]:
        return {
            "code": code,
            "key": code,
            "ok": ok,
            "status": "ok" if ok else "warning",
            "label": label,
            "title": label,
            "next_step": next_step,
            "detail": label,
            "action": next_step,
        }

    def _normalize_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _coerce_bool(self, value: object | None) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return False

    def _coerce_int(self, value: object | None) -> int:
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
                return 0
        return 0

    def _coerce_float(self, value: object | None) -> float:
        if isinstance(value, bool):
            return float(value)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return 0.0
        return 0.0

    def _serialize_datetime(self, value: datetime | str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            try:
                parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
            except ValueError:
                return normalized
            return self._normalize_datetime(parsed).isoformat()
        return self._normalize_datetime(value).isoformat()

    def record_service_audit_event(
        self,
        *,
        audit_context: ServiceAuditContext | None,
        event_kind: str,
        outcome: str,
        account_id: str | None = None,
        site_id: str | None = None,
        key_id: str | None = None,
        subscription_id: str | None = None,
        plan_id: str | None = None,
        plan_version_id: str | None = None,
        scope_kind: str | None = None,
        scope_id: str | None = None,
        payload_json: object | None = None,
    ) -> dict[str, object] | None:
        with get_session(self.database_url) as session:
            repository = CommercialServiceAuditRepository(session)
            event = self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind=event_kind,
                outcome=outcome,
                account_id=account_id,
                site_id=site_id,
                key_id=key_id,
                subscription_id=subscription_id,
                plan_id=plan_id,
                plan_version_id=plan_version_id,
                scope_kind=scope_kind,
                scope_id=scope_id,
                payload_json=payload_json,
            )
            if event is None:
                return None
            session.commit()
            return self._serialize_service_audit_event(event)

    def summarize_service_audit_events(
        self,
        *,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        since: datetime | None = None,
        window_minutes: int | None = None,
        limit: int = 20,
    ) -> dict[str, object]:
        resolved_since = since
        if resolved_since is None and window_minutes is not None:
            resolved_since = self.now_factory() - timedelta(minutes=window_minutes)
        with get_session(self.database_url) as session:
            repository = CommercialServiceAuditRepository(session)
            items = repository.summarize_service_audit_events(
                site_id=site_id,
                site_ids=site_ids,
                account_id=account_id,
                since=resolved_since,
                limit=limit,
            )
            totals: dict[str, int] = {"events": 0}
            for item in items:
                outcome = str(item.get("outcome") or "unknown")
                count = self._coerce_int(item.get("count"))
                totals["events"] += count
                totals[outcome] = totals.get(outcome, 0) + count
            return {
                "generated_at": self._serialize_datetime(self.now_factory()),
                "totals": totals,
                "items": items,
                "groups": items,
            }

    def list_commercial_decision_events(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        decision: str | None = None,
        decision_code: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
        limit: int = 50,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialDecisionRepository(session)
            events = repository.list_commercial_decision_events(
                site_id=site_id,
                subscription_id=subscription_id,
                decision=decision,
                decision_code=decision_code,
                request_kind=request_kind,
                since=since,
                limit=limit,
            )
            return {
                "items": [self._serialize_commercial_decision_event(event) for event in events],
                "total": len(events),
                "filters": {
                    "site_id": site_id or "",
                    "subscription_id": subscription_id or "",
                    "decision": decision or "",
                    "decision_code": decision_code or "",
                    "request_kind": request_kind or "",
                },
            }

    def summarize_commercial_decision_events(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
        window_minutes: int | None = None,
        limit: int = 20,
    ) -> dict[str, object]:
        resolved_since = since
        if resolved_since is None and window_minutes is not None:
            resolved_since = self.now_factory() - timedelta(minutes=window_minutes)
        with get_session(self.database_url) as session:
            repository = CommercialDecisionRepository(session)
            groups = repository.summarize_commercial_decision_events(
                site_id=site_id,
                subscription_id=subscription_id,
                request_kind=request_kind,
                since=resolved_since,
                limit=limit,
            )
            totals: dict[str, int] = {"events": 0}
            for group in groups:
                decision = str(group.get("decision") or "unknown")
                count = self._coerce_int(group.get("count"))
                totals["events"] += count
                totals[decision] = totals.get(decision, 0) + count
            return {
                "totals": totals,
                "groups": groups,
                "filters": {
                    "site_id": site_id or "",
                    "subscription_id": subscription_id or "",
                    "request_kind": request_kind or "",
                    "since": self._serialize_datetime(resolved_since),
                },
            }

    def list_service_audit_events(
        self,
        *,
        event_id: int | None = None,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        event_kind: str | None = None,
        outcome: str | None = None,
        idempotency_key: str | None = None,
        scope_kind: str | None = None,
        scope_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
        include_payload: bool = True,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialServiceAuditRepository(session)
            query_started_at = perf_counter()
            total = repository.count_service_audit_events(
                event_id=event_id,
                site_id=site_id,
                site_ids=site_ids,
                account_id=account_id,
                event_kind=event_kind,
                outcome=outcome,
                idempotency_key=idempotency_key,
                scope_kind=scope_kind,
                scope_id=scope_id,
            )
            events = repository.list_service_audit_events(
                event_id=event_id,
                site_id=site_id,
                site_ids=site_ids,
                account_id=account_id,
                event_kind=event_kind,
                outcome=outcome,
                idempotency_key=idempotency_key,
                scope_kind=scope_kind,
                scope_id=scope_id,
                limit=limit,
                offset=offset,
            )
            query_duration_ms = max(0.0, (perf_counter() - query_started_at) * 1000)
            next_offset = offset + len(events)
            pagination_limit = max(1, limit)
            last_offset = ((total - 1) // pagination_limit) * pagination_limit if total > 0 else 0
            is_out_of_range = offset > 0 and offset >= total
            return {
                "items": [
                    self._serialize_service_audit_event(
                        event,
                        include_payload=include_payload,
                    )
                    for event in events
                ],
                "total": total,
                "filters": {
                    "event_id": event_id or 0,
                    "site_id": site_id or "",
                    "site_ids": site_ids or [],
                    "account_id": account_id or "",
                    "event_kind": event_kind or "",
                    "outcome": outcome or "",
                    "idempotency_key": idempotency_key or "",
                    "scope_kind": scope_kind or "",
                    "scope_id": scope_id or "",
                },
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "total": total,
                    "has_more": next_offset < total,
                    "next_offset": next_offset if next_offset < total else None,
                    "last_offset": last_offset,
                    "is_out_of_range": is_out_of_range,
                },
                "generated_at": self._serialize_datetime(self.now_factory()),
                "diagnostics": {
                    "returned_count": len(events),
                    "query_duration_ms": round(query_duration_ms, 3),
                },
                "sort": {"created_at": "desc", "event_id": "desc"},
            }
