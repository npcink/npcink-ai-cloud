from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.models import (
    PAYMENT_ORDER_STATUS_CANCELED,
    PAYMENT_ORDER_STATUS_PENDING,
    PaymentEvent,
    PaymentOrder,
    PaymentRefund,
)


class CommercialPaymentQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_payment_order(self, order_id: str) -> PaymentOrder | None:
        return self.session.get(PaymentOrder, order_id)

    def get_payment_order_by_idempotency_key(self, idempotency_key: str) -> PaymentOrder | None:
        if not idempotency_key:
            return None
        return self.session.scalar(
            select(PaymentOrder).where(PaymentOrder.idempotency_key == idempotency_key)
        )

    def get_payment_order_by_provider_external_order(
        self,
        *,
        provider: str,
        external_order_no: str,
    ) -> PaymentOrder | None:
        if not provider or not external_order_no:
            return None
        return self.session.scalar(
            select(PaymentOrder).where(
                PaymentOrder.provider == provider,
                PaymentOrder.external_order_no == external_order_no,
            )
        )

    def list_payment_orders(
        self,
        *,
        account_id: str,
        site_id: str | None = None,
        include_unscoped: bool = False,
        statuses: tuple[str, ...] | None = None,
        canceled_visible_after: datetime | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[PaymentOrder]:
        statement = select(PaymentOrder).where(PaymentOrder.account_id == account_id)
        if site_id:
            site_scope = PaymentOrder.site_id == site_id
            if include_unscoped:
                site_scope = or_(site_scope, PaymentOrder.site_id.is_(None))
            statement = statement.where(site_scope)
        if statuses is not None:
            statement = statement.where(PaymentOrder.status.in_(statuses))
        if canceled_visible_after is not None:
            statement = statement.where(
                or_(
                    PaymentOrder.status != PAYMENT_ORDER_STATUS_CANCELED,
                    PaymentOrder.canceled_at.is_(None),
                    PaymentOrder.canceled_at >= canceled_visible_after,
                )
            )
        statement = statement.order_by(PaymentOrder.created_at.desc(), PaymentOrder.order_id.desc())
        if offset > 0:
            statement = statement.offset(offset)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def list_pending_payment_orders_before(
        self,
        *,
        cutoff: datetime,
        account_id: str | None = None,
        site_id: str | None = None,
        include_unscoped: bool = False,
    ) -> list[PaymentOrder]:
        statement = select(PaymentOrder).where(
            PaymentOrder.status == PAYMENT_ORDER_STATUS_PENDING,
            PaymentOrder.created_at <= cutoff,
        )
        if account_id:
            statement = statement.where(PaymentOrder.account_id == account_id)
        if site_id:
            site_scope = PaymentOrder.site_id == site_id
            if include_unscoped:
                site_scope = or_(site_scope, PaymentOrder.site_id.is_(None))
            statement = statement.where(site_scope)
        return list(self.session.scalars(statement))

    def count_payment_orders_by_status(
        self,
        *,
        account_id: str,
        site_id: str | None = None,
        include_unscoped: bool = False,
        canceled_visible_after: datetime | None = None,
    ) -> dict[str, int]:
        statement = (
            select(PaymentOrder.status, func.count(PaymentOrder.order_id))
            .where(PaymentOrder.account_id == account_id)
            .group_by(PaymentOrder.status)
        )
        if site_id:
            site_scope = PaymentOrder.site_id == site_id
            if include_unscoped:
                site_scope = or_(site_scope, PaymentOrder.site_id.is_(None))
            statement = statement.where(site_scope)
        if canceled_visible_after is not None:
            statement = statement.where(
                or_(
                    PaymentOrder.status != PAYMENT_ORDER_STATUS_CANCELED,
                    PaymentOrder.canceled_at.is_(None),
                    PaymentOrder.canceled_at >= canceled_visible_after,
                )
            )
        return {str(status): int(count or 0) for status, count in self.session.execute(statement)}

    def get_payment_refund(self, refund_id: str) -> PaymentRefund | None:
        return self.session.get(PaymentRefund, refund_id)

    def get_payment_refund_by_idempotency_key(self, idempotency_key: str) -> PaymentRefund | None:
        if not idempotency_key:
            return None
        return self.session.scalar(
            select(PaymentRefund).where(PaymentRefund.idempotency_key == idempotency_key)
        )

    def list_payment_refunds(self, order_id: str) -> list[PaymentRefund]:
        return list(
            self.session.scalars(
                select(PaymentRefund)
                .where(PaymentRefund.order_id == order_id)
                .order_by(PaymentRefund.created_at.desc(), PaymentRefund.refund_id.desc())
            )
        )

    def get_payment_event_by_idempotency_key(self, idempotency_key: str) -> PaymentEvent | None:
        if not idempotency_key:
            return None
        return self.session.scalar(
            select(PaymentEvent).where(PaymentEvent.idempotency_key == idempotency_key)
        )

    def get_payment_event_by_provider_event(
        self,
        *,
        provider: str,
        provider_event_id: str,
    ) -> PaymentEvent | None:
        if not provider_event_id:
            return None
        return self.session.scalar(
            select(PaymentEvent).where(
                PaymentEvent.provider == provider,
                PaymentEvent.provider_event_id == provider_event_id,
            )
        )
