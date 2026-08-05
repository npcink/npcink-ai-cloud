from __future__ import annotations

from datetime import datetime

from app.adapters.repositories.commercial_subscription_queries import (
    CommercialSubscriptionQueries,
)
from app.core.models import AccountSubscription


class CommercialSubscriptionRepository(CommercialSubscriptionQueries):
    def upsert_account_subscription(
        self,
        *,
        subscription_id: str,
        account_id: str,
        plan_id: str,
        plan_version_id: str,
        status: str,
        current_period_start_at: datetime | None,
        current_period_end_at: datetime | None,
        started_at: datetime | None,
        canceled_at: datetime | None,
        suspended_at: datetime | None,
        metadata_json: dict[str, object] | None,
    ) -> AccountSubscription:
        subscription = self.get_subscription(subscription_id)
        if subscription is None:
            subscription = AccountSubscription(
                subscription_id=subscription_id,
                account_id=account_id,
                plan_id=plan_id,
                plan_version_id=plan_version_id,
                status=status,
                current_period_start_at=current_period_start_at,
                current_period_end_at=current_period_end_at,
                started_at=started_at,
                canceled_at=canceled_at,
                suspended_at=suspended_at,
                metadata_json=metadata_json,
            )
            self.session.add(subscription)
        else:
            subscription.account_id = account_id
            subscription.plan_id = plan_id
            subscription.plan_version_id = plan_version_id
            subscription.status = status
            subscription.current_period_start_at = current_period_start_at
            subscription.current_period_end_at = current_period_end_at
            subscription.started_at = started_at
            subscription.canceled_at = canceled_at
            subscription.suspended_at = suspended_at
            subscription.metadata_json = metadata_json
        self.session.flush()
        return subscription
