from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.models import CommercialDecisionEvent

type SQLAFilter = ColumnElement[bool]


class CommercialDecisionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record_commercial_decision_event(
        self,
        *,
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
        payload_json: dict[str, object] | None = None,
    ) -> CommercialDecisionEvent:
        event = CommercialDecisionEvent(
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
            payload_json=payload_json,
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        self.session.flush()
        return event

    def list_commercial_decision_events(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        decision: str | None = None,
        decision_code: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
        limit: int | None = 50,
    ) -> list[CommercialDecisionEvent]:
        statement = select(CommercialDecisionEvent)
        if site_id:
            statement = statement.where(CommercialDecisionEvent.site_id == site_id)
        if subscription_id:
            statement = statement.where(CommercialDecisionEvent.subscription_id == subscription_id)
        if decision:
            statement = statement.where(CommercialDecisionEvent.decision == decision)
        if decision_code:
            statement = statement.where(CommercialDecisionEvent.decision_code == decision_code)
        if request_kind:
            statement = statement.where(CommercialDecisionEvent.request_kind == request_kind)
        if since is not None:
            statement = statement.where(CommercialDecisionEvent.created_at >= since)
        statement = statement.order_by(
            CommercialDecisionEvent.created_at.desc(),
            CommercialDecisionEvent.id.desc(),
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_commercial_decision_events(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        decision: str | None = None,
        decision_code: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
    ) -> int:
        return int(
            self.session.scalar(
                cast(
                    Any,
                    select(func.count())
                    .select_from(CommercialDecisionEvent)
                    .where(
                        *self._commercial_decision_filters(
                            site_id=site_id,
                            subscription_id=subscription_id,
                            decision=decision,
                            decision_code=decision_code,
                            request_kind=request_kind,
                            since=since,
                        )
                    ),
                )
            )
            or 0
        )

    def summarize_commercial_decision_events(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        event_count = func.count(CommercialDecisionEvent.id).label("event_count")
        first_seen_at = func.min(CommercialDecisionEvent.created_at).label("first_seen_at")
        last_seen_at = func.max(CommercialDecisionEvent.created_at).label("last_seen_at")
        statement = (
            select(
                CommercialDecisionEvent.request_kind,
                CommercialDecisionEvent.decision,
                CommercialDecisionEvent.decision_code,
                event_count,
                first_seen_at,
                last_seen_at,
            )
            .where(
                *self._commercial_decision_filters(
                    site_id=site_id,
                    subscription_id=subscription_id,
                    request_kind=request_kind,
                    since=since,
                )
            )
            .group_by(
                CommercialDecisionEvent.request_kind,
                CommercialDecisionEvent.decision,
                CommercialDecisionEvent.decision_code,
            )
            .order_by(event_count.desc(), last_seen_at.desc())
            .limit(max(1, limit))
        )
        items: list[dict[str, object]] = []
        for (
            request_kind_value,
            decision_value,
            decision_code_value,
            count,
            first_seen,
            last_seen,
        ) in self.session.execute(statement):
            items.append(
                {
                    "request_kind": str(request_kind_value or ""),
                    "decision": str(decision_value or ""),
                    "decision_code": str(decision_code_value or ""),
                    "count": int(count or 0),
                    "first_seen_at": self._serialize_decision_datetime(first_seen),
                    "last_seen_at": self._serialize_decision_datetime(last_seen),
                }
            )
        return items

    def _commercial_decision_filters(
        self,
        *,
        site_id: str | None = None,
        subscription_id: str | None = None,
        decision: str | None = None,
        decision_code: str | None = None,
        request_kind: str | None = None,
        since: datetime | None = None,
    ) -> list[SQLAFilter]:
        filters: list[SQLAFilter] = []
        if site_id:
            filters.append(CommercialDecisionEvent.site_id == site_id)
        if subscription_id:
            filters.append(CommercialDecisionEvent.subscription_id == subscription_id)
        if decision:
            filters.append(CommercialDecisionEvent.decision == decision)
        if decision_code:
            filters.append(CommercialDecisionEvent.decision_code == decision_code)
        if request_kind:
            filters.append(CommercialDecisionEvent.request_kind == request_kind)
        if since is not None:
            filters.append(CommercialDecisionEvent.created_at >= since)
        return filters

    def _serialize_decision_datetime(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.isoformat().replace("+00:00", "Z")
