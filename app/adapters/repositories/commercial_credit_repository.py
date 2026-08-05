from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.adapters.repositories.commercial_credit_ledger_queries import (
    CommercialCreditLedgerQueries,
)
from app.core.models import (
    CREDIT_LEDGER_EVENT_CONSUME,
    CreditLedgerEntry,
    PaidCreditGrant,
)


class CommercialCreditRepository(CommercialCreditLedgerQueries):
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
