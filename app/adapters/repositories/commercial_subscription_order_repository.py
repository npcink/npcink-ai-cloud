from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import SubscriptionOrder


class CommercialSubscriptionOrderRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_subscription_order(self, subscription_order_id: str) -> SubscriptionOrder | None:
        return self.session.get(SubscriptionOrder, subscription_order_id)

    def get_subscription_order_by_payment_order(
        self, payment_order_id: str
    ) -> SubscriptionOrder | None:
        if not payment_order_id:
            return None
        return self.session.scalar(
            select(SubscriptionOrder).where(SubscriptionOrder.payment_order_id == payment_order_id)
        )

    def list_subscription_orders(
        self,
        *,
        account_id: str,
        limit: int | None = None,
    ) -> list[SubscriptionOrder]:
        statement = (
            select(SubscriptionOrder)
            .where(SubscriptionOrder.account_id == account_id)
            .order_by(
                SubscriptionOrder.created_at.desc(),
                SubscriptionOrder.subscription_order_id.desc(),
            )
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_subscription_orders(
        self,
        *,
        account_id: str,
        statuses: set[str],
    ) -> int:
        if not statuses:
            return 0
        return int(
            self.session.scalar(
                select(func.count())
                .select_from(SubscriptionOrder)
                .where(
                    SubscriptionOrder.account_id == account_id,
                    SubscriptionOrder.status.in_(statuses),
                )
            )
            or 0
        )

    def create_subscription_order(
        self,
        *,
        subscription_order_id: str,
        account_id: str,
        offer_id: str,
        payment_order_id: str | None,
        source_subscription_id: str | None,
        target_plan_id: str,
        target_plan_version_id: str,
        order_kind: str,
        status: str,
        list_amount: Decimal,
        ai_credit_amount: Decimal,
        payable_amount: Decimal,
        currency: str,
        effective_at: datetime | None,
        period_start_at: datetime | None,
        period_end_at: datetime | None,
        metadata_json: dict[str, object] | None,
    ) -> SubscriptionOrder:
        order = SubscriptionOrder(
            subscription_order_id=subscription_order_id,
            account_id=account_id,
            offer_id=offer_id,
            payment_order_id=payment_order_id,
            source_subscription_id=source_subscription_id,
            target_plan_id=target_plan_id,
            target_plan_version_id=target_plan_version_id,
            order_kind=order_kind,
            status=status,
            list_amount=list_amount,
            ai_credit_amount=ai_credit_amount,
            payable_amount=payable_amount,
            currency=currency,
            effective_at=effective_at,
            period_start_at=period_start_at,
            period_end_at=period_end_at,
            metadata_json=metadata_json,
        )
        self.session.add(order)
        self.session.flush()
        return order
