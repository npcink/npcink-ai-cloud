from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from app.adapters.repositories.commercial_payment_queries import CommercialPaymentQueries
from app.core.models import PaymentEvent, PaymentOrder, PaymentRefund


class CommercialPaymentRepository(CommercialPaymentQueries):
    def get_payment_order_for_update(self, order_id: str) -> PaymentOrder | None:
        return self.session.scalar(
            select(PaymentOrder).where(PaymentOrder.order_id == order_id).with_for_update()
        )

    def create_payment_order(
        self,
        *,
        order_id: str,
        account_id: str,
        site_id: str | None,
        subscription_id: str | None,
        plan_id: str,
        plan_version_id: str,
        provider: str,
        external_order_no: str,
        status: str,
        amount: float,
        currency: str,
        subject: str,
        checkout_url: str | None,
        refund_window_end_at: datetime | None,
        idempotency_key: str | None,
        metadata_json: dict[str, object] | None,
    ) -> PaymentOrder:
        order = PaymentOrder(
            order_id=order_id,
            account_id=account_id,
            site_id=site_id,
            subscription_id=subscription_id,
            plan_id=plan_id,
            plan_version_id=plan_version_id,
            provider=provider,
            external_order_no=external_order_no,
            status=status,
            amount=amount,
            currency=currency,
            subject=subject,
            checkout_url=checkout_url,
            refund_window_end_at=refund_window_end_at,
            idempotency_key=idempotency_key,
            metadata_json=metadata_json,
        )
        self.session.add(order)
        self.session.flush()
        return order

    def create_payment_refund(
        self,
        *,
        refund_id: str,
        order_id: str,
        account_id: str,
        subscription_id: str | None,
        provider: str,
        external_refund_no: str,
        status: str,
        amount: float,
        currency: str,
        reason: str | None,
        requested_at: datetime,
        idempotency_key: str | None,
        metadata_json: dict[str, object] | None,
    ) -> PaymentRefund:
        refund = PaymentRefund(
            refund_id=refund_id,
            order_id=order_id,
            account_id=account_id,
            subscription_id=subscription_id,
            provider=provider,
            external_refund_no=external_refund_no,
            status=status,
            amount=amount,
            currency=currency,
            reason=reason,
            requested_at=requested_at,
            idempotency_key=idempotency_key,
            metadata_json=metadata_json,
        )
        self.session.add(refund)
        self.session.flush()
        return refund

    def create_payment_event(
        self,
        *,
        event_id: str,
        provider: str,
        event_kind: str,
        status: str,
        order_id: str | None,
        refund_id: str | None,
        provider_event_id: str | None,
        idempotency_key: str | None,
        payload_json: dict[str, object] | None,
        processed_at: datetime | None,
    ) -> PaymentEvent:
        event = PaymentEvent(
            event_id=event_id,
            provider=provider,
            event_kind=event_kind,
            status=status,
            order_id=order_id,
            refund_id=refund_id,
            provider_event_id=provider_event_id,
            idempotency_key=idempotency_key,
            payload_json=payload_json,
            processed_at=processed_at,
        )
        self.session.add(event)
        self.session.flush()
        return event
