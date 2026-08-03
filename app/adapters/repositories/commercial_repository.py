from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.adapters.repositories.commercial_access_repository import CommercialAccessRepository
from app.adapters.repositories.commercial_account_site_repository import (
    CommercialAccountSiteRepository,
)
from app.adapters.repositories.commercial_credit_ledger_queries import (
    CommercialCreditLedgerQueries,
)
from app.adapters.repositories.commercial_identity_repository import CommercialIdentityRepository
from app.adapters.repositories.commercial_payment_repository import CommercialPaymentRepository
from app.adapters.repositories.commercial_plan_repository import CommercialPlanRepository
from app.adapters.repositories.commercial_runtime_knowledge_queries import (
    CommercialRuntimeKnowledgeQueries,
)
from app.adapters.repositories.commercial_site_api_key_repository import (
    CommercialSiteApiKeyRepository,
)
from app.adapters.repositories.commercial_subscription_order_repository import (
    CommercialSubscriptionOrderRepository,
)
from app.adapters.repositories.commercial_subscription_repository import (
    CommercialSubscriptionRepository,
)
from app.adapters.repositories.commercial_support_repository import (
    CommercialSupportRepository,
)
from app.adapters.repositories.commercial_trial_entitlement_repository import (
    CommercialTrialEntitlementRepository,
)
from app.core.models import (
    CREDIT_LEDGER_EVENT_CONSUME,
    BillingSnapshot,
    CommercialDecisionEvent,
    CreditLedgerEntry,
    PaidCreditGrant,
    ProviderCallRecord,
    RunRecord,
    ServiceAuditEvent,
    UsageMeterEvent,
)

type SQLAFilter = ColumnElement[bool]


class CommercialRepository(
    CommercialAccountSiteRepository,
    CommercialSiteApiKeyRepository,
    CommercialTrialEntitlementRepository,
    CommercialRuntimeKnowledgeQueries,
    CommercialCreditLedgerQueries,
    CommercialIdentityRepository,
    CommercialAccessRepository,
    CommercialPaymentRepository,
    CommercialPlanRepository,
    CommercialSubscriptionRepository,
    CommercialSubscriptionOrderRepository,
    CommercialSupportRepository,
):
    def __init__(self, session: Session) -> None:
        self.session = session

    def record_usage_meter_event(
        self,
        *,
        account_id: str | None,
        site_id: str,
        subscription_id: str | None,
        plan_version_id: str | None,
        run_id: str | None,
        provider_call_id: int | None,
        event_kind: str,
        meter_key: str,
        quantity: float,
        ability_family: str | None,
        channel: str | None,
        execution_kind: str | None,
        execution_tier: str | None,
        data_classification: str | None,
        currency: str | None,
        dedupe_key: str,
        payload_json: dict[str, object] | None = None,
    ) -> UsageMeterEvent:
        existing = self.session.scalar(
            select(UsageMeterEvent).where(UsageMeterEvent.dedupe_key == dedupe_key)
        )
        if existing is not None:
            return existing

        event = UsageMeterEvent(
            account_id=account_id,
            site_id=site_id,
            subscription_id=subscription_id,
            plan_version_id=plan_version_id,
            run_id=run_id,
            provider_call_id=provider_call_id,
            event_kind=event_kind,
            meter_key=meter_key,
            quantity=quantity,
            ability_family=ability_family,
            channel=channel,
            execution_kind=execution_kind,
            execution_tier=execution_tier,
            data_classification=data_classification,
            currency=currency,
            dedupe_key=dedupe_key,
            payload_json=payload_json,
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        self.session.flush()
        return event

    def record_credit_ledger_entry(
        self,
        *,
        account_id: str | None,
        site_id: str | None,
        subscription_id: str | None,
        plan_version_id: str | None,
        run_id: str | None,
        provider_call_id: int | None,
        event_type: str = CREDIT_LEDGER_EVENT_CONSUME,
        source_type: str,
        source_id: str,
        ai_credit_delta: float,
        quantity: float,
        unit: str,
        rate: float,
        rate_unit: str | None,
        rate_version: str,
        idempotency_key: str,
        metadata_json: dict[str, object] | None = None,
        created_at: datetime | None = None,
    ) -> CreditLedgerEntry:
        existing = self.session.scalar(
            select(CreditLedgerEntry).where(CreditLedgerEntry.idempotency_key == idempotency_key)
        )
        if existing is not None:
            return existing

        normalized_credit_delta = round(float(ai_credit_delta or 0.0), 6)
        if (
            event_type == CREDIT_LEDGER_EVENT_CONSUME
            and not float(normalized_credit_delta).is_integer()
        ):
            raise ValueError("consume ai_credit_delta must be an integer credit unit")
        if event_type == CREDIT_LEDGER_EVENT_CONSUME:
            normalized_credit_delta = float(int(normalized_credit_delta))

        entry = CreditLedgerEntry(
            ledger_entry_id=f"cle_{uuid4().hex}",
            account_id=account_id,
            site_id=site_id,
            subscription_id=subscription_id,
            plan_version_id=plan_version_id,
            run_id=run_id,
            provider_call_id=provider_call_id,
            event_type=event_type,
            source_type=source_type,
            source_id=source_id,
            ai_credit_delta=normalized_credit_delta,
            quantity=round(float(quantity or 0.0), 6),
            unit=unit,
            rate=round(float(rate or 0.0), 6),
            rate_unit=rate_unit,
            rate_version=rate_version,
            idempotency_key=idempotency_key,
            metadata_json=metadata_json,
            created_at=created_at or datetime.now(UTC),
        )
        self.session.add(entry)
        self.session.flush()
        return entry

    def get_paid_credit_grant_by_order(
        self,
        payment_order_id: str,
        *,
        for_update: bool = False,
    ) -> PaidCreditGrant | None:
        statement = select(PaidCreditGrant).where(
            PaidCreditGrant.payment_order_id == payment_order_id
        )
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalar(statement)

    def upsert_paid_credit_grant(
        self,
        *,
        account_id: str,
        payment_order_id: str,
        original_ai_credits: float,
        expires_at: datetime,
        metadata_json: dict[str, object] | None = None,
    ) -> PaidCreditGrant:
        existing = self.get_paid_credit_grant_by_order(payment_order_id)
        if existing is not None:
            return existing
        normalized_credits = round(max(0.0, float(original_ai_credits or 0.0)), 6)
        grant = PaidCreditGrant(
            grant_id=f"pcg_{uuid4().hex}",
            account_id=account_id,
            payment_order_id=payment_order_id,
            original_ai_credits=normalized_credits,
            remaining_ai_credits=normalized_credits,
            refunded_ai_credits=0.0,
            expires_at=expires_at,
            metadata_json=metadata_json or {},
            created_at=datetime.now(UTC),
        )
        self.session.add(grant)
        self.session.flush()
        return grant

    def list_available_paid_credit_grants(
        self,
        *,
        account_id: str,
        now: datetime,
        for_update: bool = False,
    ) -> list[PaidCreditGrant]:
        statement = (
            select(PaidCreditGrant)
            .where(
                PaidCreditGrant.account_id == account_id,
                PaidCreditGrant.remaining_ai_credits > 0,
                PaidCreditGrant.expires_at > now,
            )
            .order_by(PaidCreditGrant.expires_at.asc(), PaidCreditGrant.created_at.asc())
        )
        if for_update:
            statement = statement.with_for_update()
        return list(self.session.scalars(statement))

    def consume_paid_credit_grants(
        self,
        *,
        account_id: str,
        ai_credits: float,
        now: datetime,
    ) -> float:
        remaining = round(max(0.0, float(ai_credits or 0.0)), 6)
        consumed = 0.0
        for grant in self.list_available_paid_credit_grants(
            account_id=account_id,
            now=now,
            for_update=True,
        ):
            if remaining <= 0:
                break
            amount = min(remaining, max(0.0, float(grant.remaining_ai_credits or 0.0)))
            grant.remaining_ai_credits = round(float(grant.remaining_ai_credits) - amount, 6)
            consumed += amount
            remaining -= amount
        self.session.flush()
        return round(consumed, 6)

    def refund_paid_credit_grant(
        self,
        *,
        payment_order_id: str,
        ai_credits: float,
    ) -> PaidCreditGrant | None:
        grant = self.session.scalar(
            select(PaidCreditGrant)
            .where(PaidCreditGrant.payment_order_id == payment_order_id)
            .with_for_update()
        )
        if grant is None:
            return None
        normalized = round(max(0.0, float(ai_credits or 0.0)), 6)
        already_refunded = max(0.0, float(grant.refunded_ai_credits or 0.0))
        target_refunded = min(float(grant.original_ai_credits), already_refunded + normalized)
        increment = max(0.0, target_refunded - already_refunded)
        grant.refunded_ai_credits = round(target_refunded, 6)
        grant.remaining_ai_credits = round(
            max(0.0, float(grant.remaining_ai_credits or 0.0) - increment),
            6,
        )
        self.session.flush()
        return grant

    def list_usage_meter_events(
        self,
        site_id: str,
        *,
        subscription_id: str | None = None,
        period_start_at: datetime | None = None,
        period_end_at: datetime | None = None,
        limit: int | None = None,
    ) -> list[UsageMeterEvent]:
        statement = select(UsageMeterEvent).where(UsageMeterEvent.site_id == site_id)
        if subscription_id is not None:
            statement = statement.where(UsageMeterEvent.subscription_id == subscription_id)
        if period_start_at is not None:
            statement = statement.where(UsageMeterEvent.created_at >= period_start_at)
        if period_end_at is not None:
            statement = statement.where(UsageMeterEvent.created_at <= period_end_at)
        statement = statement.order_by(
            UsageMeterEvent.created_at.desc(),
            UsageMeterEvent.id.desc(),
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def list_usage_meter_events_for_admin(
        self,
        *,
        site_ids: list[str] | None = None,
        account_ids: list[str] | None = None,
        ability_family: str | None = None,
        meter_keys: list[str] | None = None,
        since: datetime | None = None,
        limit: int | None = None,
    ) -> list[UsageMeterEvent]:
        statement = select(UsageMeterEvent)
        if site_ids is not None:
            if not site_ids:
                return []
            statement = statement.where(UsageMeterEvent.site_id.in_(site_ids))
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(UsageMeterEvent.account_id.in_(account_ids))
        if ability_family:
            statement = statement.where(UsageMeterEvent.ability_family == ability_family)
        if meter_keys is not None:
            if not meter_keys:
                return []
            statement = statement.where(UsageMeterEvent.meter_key.in_(meter_keys))
        if since is not None:
            statement = statement.where(UsageMeterEvent.created_at >= since)
        statement = statement.order_by(
            UsageMeterEvent.created_at.desc(),
            UsageMeterEvent.id.desc(),
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def summarize_usage_meter_events_for_admin(
        self,
        *,
        since: datetime | None = None,
    ) -> dict[str, object]:
        count_statement = select(func.count(UsageMeterEvent.id))
        totals_statement = (
            select(UsageMeterEvent.meter_key, func.sum(UsageMeterEvent.quantity))
            .where(UsageMeterEvent.meter_key.is_not(None))
            .group_by(UsageMeterEvent.meter_key)
        )
        if since is not None:
            count_statement = count_statement.where(UsageMeterEvent.created_at >= since)
            totals_statement = totals_statement.where(UsageMeterEvent.created_at >= since)
        totals = {
            str(meter_key or ""): round(float(quantity or 0.0), 6)
            for meter_key, quantity in self.session.execute(totals_statement)
            if meter_key
        }
        return {
            "event_count": int(self.session.scalar(count_statement) or 0),
            "totals": dict(sorted(totals.items())),
        }

    def list_run_records_for_admin(
        self,
        *,
        site_id: str | None = None,
        ability_family: str | None = None,
        since: datetime | None = None,
        limit: int | None = None,
    ) -> list[RunRecord]:
        statement = select(RunRecord)
        if site_id:
            statement = statement.where(RunRecord.site_id == site_id)
        if ability_family:
            statement = statement.where(RunRecord.ability_family == ability_family)
        if since is not None:
            statement = statement.where(RunRecord.started_at >= since)
        statement = statement.order_by(RunRecord.started_at.desc(), RunRecord.run_id.desc())
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def list_run_records_by_ids(self, run_ids: list[str]) -> list[RunRecord]:
        normalized_ids = [str(run_id or "").strip() for run_id in run_ids]
        normalized_ids = [run_id for run_id in normalized_ids if run_id]
        if not normalized_ids:
            return []
        statement = select(RunRecord).where(RunRecord.run_id.in_(normalized_ids))
        return list(self.session.scalars(statement))

    def list_provider_call_records_for_admin(
        self,
        *,
        site_id: str | None = None,
        ability_family: str | None = None,
        since: datetime | None = None,
        run_ids: list[str] | None = None,
        limit: int | None = None,
    ) -> list[ProviderCallRecord]:
        statement = select(ProviderCallRecord)
        if site_id or ability_family:
            statement = statement.join(RunRecord, RunRecord.run_id == ProviderCallRecord.run_id)
        if site_id:
            statement = statement.where(RunRecord.site_id == site_id)
        if ability_family:
            statement = statement.where(RunRecord.ability_family == ability_family)
        if run_ids is not None:
            if not run_ids:
                return []
            statement = statement.where(ProviderCallRecord.run_id.in_(run_ids))
        if since is not None:
            statement = statement.where(ProviderCallRecord.created_at >= since)
        statement = statement.order_by(
            ProviderCallRecord.created_at.desc(),
            ProviderCallRecord.id.desc(),
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def summarize_usage_meter_by_site(
        self,
        *,
        site_ids: list[str] | None = None,
        since: datetime | None = None,
    ) -> dict[str, dict[str, object]]:
        statement = select(
            UsageMeterEvent.site_id,
            func.count(UsageMeterEvent.id),
            func.sum(UsageMeterEvent.quantity),
            func.max(UsageMeterEvent.created_at),
        ).group_by(UsageMeterEvent.site_id)
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(UsageMeterEvent.site_id.in_(site_ids))
        if since is not None:
            statement = statement.where(UsageMeterEvent.created_at >= since)
        items: dict[str, dict[str, object]] = {}
        for site_id, event_count, quantity_total, last_seen_at in self.session.execute(statement):
            items[str(site_id or "")] = {
                "event_count": int(event_count or 0),
                "quantity_total": round(float(quantity_total or 0.0), 6),
                "last_seen_at": self._serialize_datetime(last_seen_at),
            }
        return items

    def list_billing_snapshots(self, site_id: str) -> list[BillingSnapshot]:
        statement = (
            select(BillingSnapshot)
            .where(BillingSnapshot.site_id == site_id)
            .order_by(BillingSnapshot.period_start_at.desc(), BillingSnapshot.snapshot_id.desc())
        )
        return list(self.session.scalars(statement))

    def get_latest_billing_snapshots_by_site(
        self,
        *,
        site_ids: list[str] | None = None,
    ) -> dict[str, BillingSnapshot]:
        statement = select(BillingSnapshot)
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(BillingSnapshot.site_id.in_(site_ids))
        statement = statement.order_by(
            BillingSnapshot.site_id.asc(),
            BillingSnapshot.period_end_at.desc(),
            BillingSnapshot.generated_at.desc(),
            BillingSnapshot.snapshot_id.desc(),
        )
        items: dict[str, BillingSnapshot] = {}
        for snapshot in self.session.scalars(statement):
            site_id = str(snapshot.site_id or "")
            if site_id and site_id not in items:
                items[site_id] = snapshot
        return items

    def record_service_audit_event(
        self,
        *,
        account_id: str | None,
        site_id: str | None,
        key_id: str | None,
        subscription_id: str | None,
        plan_id: str | None,
        plan_version_id: str | None,
        scope_kind: str | None,
        scope_id: str | None,
        event_kind: str,
        outcome: str,
        method: str | None,
        path: str | None,
        trace_id: str | None,
        idempotency_key: str | None,
        actor_kind: str,
        actor_ref: str | None,
        payload_json: dict[str, object] | None = None,
    ) -> ServiceAuditEvent:
        event = ServiceAuditEvent(
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
            method=method,
            path=path,
            trace_id=trace_id,
            idempotency_key=idempotency_key,
            actor_kind=actor_kind,
            actor_ref=actor_ref,
            payload_json=payload_json,
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        self.session.flush()
        return event

    def list_service_audit_events(
        self,
        *,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        event_kind: str | None = None,
        outcome: str | None = None,
        limit: int = 50,
    ) -> list[ServiceAuditEvent]:
        statement = select(ServiceAuditEvent).where(
            *self._service_audit_filters(
                site_id=site_id,
                site_ids=site_ids,
                account_id=account_id,
                event_kind=event_kind,
                outcome=outcome,
            )
        )
        statement = statement.order_by(
            ServiceAuditEvent.created_at.desc(),
            ServiceAuditEvent.id.desc(),
        ).limit(limit)
        return list(self.session.scalars(statement))

    def list_service_audit_events_for_principal(
        self,
        *,
        principal_id: str,
        limit: int = 50,
    ) -> list[ServiceAuditEvent]:
        normalized_principal_id = str(principal_id or "").strip()
        if not normalized_principal_id:
            return []
        statement = (
            select(ServiceAuditEvent)
            .where(
                or_(
                    ServiceAuditEvent.scope_id == normalized_principal_id,
                    ServiceAuditEvent.scope_id.like(f"%:{normalized_principal_id}"),
                )
            )
            .order_by(ServiceAuditEvent.created_at.desc(), ServiceAuditEvent.id.desc())
            .limit(max(1, limit))
        )
        return list(self.session.scalars(statement))

    def count_service_audit_events(
        self,
        *,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        event_kind: str | None = None,
        outcome: str | None = None,
        since: datetime | None = None,
    ) -> int:
        return int(
            self.session.scalar(
                cast(
                    Any,
                    select(func.count())
                    .select_from(ServiceAuditEvent)
                    .where(
                        *self._service_audit_filters(
                            site_id=site_id,
                            site_ids=site_ids,
                            account_id=account_id,
                            event_kind=event_kind,
                            outcome=outcome,
                            since=since,
                        )
                    ),
                )
            )
            or 0
        )

    def summarize_service_audit_events(
        self,
        *,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        since: datetime | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        event_count = func.count(ServiceAuditEvent.id).label("event_count")
        first_seen_at = func.min(ServiceAuditEvent.created_at).label("first_seen_at")
        last_seen_at = func.max(ServiceAuditEvent.created_at).label("last_seen_at")
        statement = (
            select(
                ServiceAuditEvent.event_kind,
                ServiceAuditEvent.outcome,
                event_count,
                first_seen_at,
                last_seen_at,
            )
            .where(
                *self._service_audit_filters(
                    site_id=site_id,
                    site_ids=site_ids,
                    account_id=account_id,
                    since=since,
                )
            )
            .group_by(ServiceAuditEvent.event_kind, ServiceAuditEvent.outcome)
            .order_by(event_count.desc(), last_seen_at.desc())
            .limit(max(1, limit))
        )
        items: list[dict[str, object]] = []
        for event_kind_value, outcome_value, count, first_seen, last_seen in self.session.execute(
            statement
        ):
            items.append(
                {
                    "event_kind": str(event_kind_value or ""),
                    "outcome": str(outcome_value or ""),
                    "count": int(count or 0),
                    "first_seen_at": self._serialize_datetime(first_seen),
                    "last_seen_at": self._serialize_datetime(last_seen),
                }
            )
        return items

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
                    "first_seen_at": self._serialize_datetime(first_seen),
                    "last_seen_at": self._serialize_datetime(last_seen),
                }
            )
        return items

    def upsert_billing_snapshot(
        self,
        *,
        snapshot_id: str,
        account_id: str | None,
        site_id: str | None,
        subscription_id: str | None,
        plan_version_id: str | None,
        currency: str,
        period_start_at: datetime,
        period_end_at: datetime,
        totals_json: dict[str, object],
        breakdown_json: dict[str, object],
    ) -> BillingSnapshot:
        snapshot = self.session.get(BillingSnapshot, snapshot_id)
        if snapshot is None:
            snapshot = BillingSnapshot(
                snapshot_id=snapshot_id,
                account_id=account_id,
                site_id=site_id,
                subscription_id=subscription_id,
                plan_version_id=plan_version_id,
                currency=currency,
                period_start_at=period_start_at,
                period_end_at=period_end_at,
                totals_json=totals_json,
                breakdown_json=breakdown_json,
            )
            self.session.add(snapshot)
        else:
            snapshot.account_id = account_id
            snapshot.site_id = site_id
            snapshot.subscription_id = subscription_id
            snapshot.plan_version_id = plan_version_id
            snapshot.currency = currency
            snapshot.period_start_at = period_start_at
            snapshot.period_end_at = period_end_at
            snapshot.totals_json = totals_json
            snapshot.breakdown_json = breakdown_json
        self.session.flush()
        return snapshot

    def _service_audit_filters(
        self,
        *,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        account_id: str | None = None,
        event_kind: str | None = None,
        outcome: str | None = None,
        since: datetime | None = None,
    ) -> list[SQLAFilter]:
        filters: list[SQLAFilter] = []
        normalized_site_ids = (
            sorted({str(item).strip() for item in site_ids if str(item).strip()})
            if site_ids is not None
            else None
        )
        if site_id:
            filters.append(ServiceAuditEvent.site_id == site_id)
        elif account_id and normalized_site_ids is not None:
            if normalized_site_ids:
                filters.append(
                    or_(
                        ServiceAuditEvent.account_id == account_id,
                        ServiceAuditEvent.site_id.in_(normalized_site_ids),
                    )
                )
            else:
                filters.append(ServiceAuditEvent.account_id == account_id)
        elif normalized_site_ids is not None:
            if normalized_site_ids:
                filters.append(ServiceAuditEvent.site_id.in_(normalized_site_ids))
            else:
                filters.append(ServiceAuditEvent.id == -1)
        elif account_id:
            filters.append(ServiceAuditEvent.account_id == account_id)
        if event_kind:
            filters.append(ServiceAuditEvent.event_kind == event_kind)
        if outcome:
            filters.append(ServiceAuditEvent.outcome == outcome)
        if since is not None:
            filters.append(ServiceAuditEvent.created_at >= since)
        return filters

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

    def _serialize_datetime(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.isoformat().replace("+00:00", "Z")
