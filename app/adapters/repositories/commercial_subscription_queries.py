from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import AccountSubscription, Site


class CommercialSubscriptionQueries:
    """Read-only subscription queries shared by commercial repository consumers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_subscription(self, subscription_id: str) -> AccountSubscription | None:
        return self.session.get(AccountSubscription, subscription_id)

    def list_account_subscriptions(self, account_id: str) -> list[AccountSubscription]:
        statement = (
            select(AccountSubscription)
            .where(AccountSubscription.account_id == account_id)
            .order_by(
                AccountSubscription.created_at.desc(),
                AccountSubscription.subscription_id.desc(),
            )
        )
        return list(self.session.scalars(statement))

    def list_subscriptions(
        self,
        *,
        status: str | None = None,
        statuses: list[str] | None = None,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        site_id: str | None = None,
        site_ids: list[str] | None = None,
        plan_id: str | None = None,
        current_period_end_before: datetime | None = None,
        offset: int = 0,
        limit: int | None = None,
    ) -> list[AccountSubscription]:
        statement = select(AccountSubscription)
        if status:
            statement = statement.where(AccountSubscription.status == status)
        if statuses:
            statement = statement.where(AccountSubscription.status.in_(statuses))
        if account_id:
            statement = statement.where(AccountSubscription.account_id == account_id)
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(AccountSubscription.account_id.in_(account_ids))
        joined_sites = False
        if site_id:
            statement = statement.join(
                Site,
                Site.account_id == AccountSubscription.account_id,
            ).where(Site.site_id == site_id)
            joined_sites = True
        if site_ids is not None:
            if not site_ids:
                return []
            statement = statement.join(
                Site,
                Site.account_id == AccountSubscription.account_id,
            ).where(Site.site_id.in_(site_ids))
            joined_sites = True
        if plan_id:
            statement = statement.where(AccountSubscription.plan_id == plan_id)
        if current_period_end_before is not None:
            statement = statement.where(
                AccountSubscription.current_period_end_at.is_not(None),
                AccountSubscription.current_period_end_at <= current_period_end_before,
            )
        statement = statement.order_by(
            AccountSubscription.created_at.desc(),
            AccountSubscription.subscription_id.desc(),
        )
        if joined_sites:
            statement = statement.distinct()
        if offset > 0:
            statement = statement.offset(offset)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_subscriptions(
        self,
        *,
        status: str | None = None,
        statuses: list[str] | None = None,
        account_id: str | None = None,
        plan_id: str | None = None,
        current_period_end_before: datetime | None = None,
    ) -> int:
        statement = select(func.count(AccountSubscription.subscription_id))
        if status:
            statement = statement.where(AccountSubscription.status == status)
        if statuses:
            statement = statement.where(AccountSubscription.status.in_(statuses))
        if account_id:
            statement = statement.where(AccountSubscription.account_id == account_id)
        if plan_id:
            statement = statement.where(AccountSubscription.plan_id == plan_id)
        if current_period_end_before is not None:
            statement = statement.where(
                AccountSubscription.current_period_end_at.is_not(None),
                AccountSubscription.current_period_end_at <= current_period_end_before,
            )
        return int(self.session.scalar(statement) or 0)

    def summarize_subscription_status_counts(self) -> dict[str, int]:
        statement = (
            select(AccountSubscription.status, func.count(AccountSubscription.subscription_id))
            .where(AccountSubscription.status.is_not(None))
            .group_by(AccountSubscription.status)
        )
        return {
            str(status or ""): int(count or 0)
            for status, count in self.session.execute(statement)
            if status
        }

    def summarize_subscription_plan_counts(self) -> dict[str, int]:
        statement = (
            select(AccountSubscription.plan_id, func.count(AccountSubscription.subscription_id))
            .where(AccountSubscription.plan_id.is_not(None))
            .group_by(AccountSubscription.plan_id)
            .order_by(func.count(AccountSubscription.subscription_id).desc())
        )
        return {
            str(plan_id or ""): int(count or 0)
            for plan_id, count in self.session.execute(statement)
            if plan_id
        }

    def count_subscriptions_by_account(
        self,
        *,
        account_ids: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> dict[str, int]:
        statement = select(
            AccountSubscription.account_id,
            func.count(AccountSubscription.subscription_id),
        ).group_by(AccountSubscription.account_id)
        if account_ids is not None:
            if not account_ids:
                return {}
            statement = statement.where(AccountSubscription.account_id.in_(account_ids))
        if statuses:
            statement = statement.where(AccountSubscription.status.in_(statuses))
        return {
            str(account_id or ""): int(count or 0)
            for account_id, count in self.session.execute(statement)
        }

    def count_subscriptions_by_site(
        self,
        *,
        site_ids: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> dict[str, int]:
        statement = (
            select(
                Site.site_id,
                func.count(AccountSubscription.subscription_id),
            )
            .select_from(Site)
            .join(AccountSubscription, AccountSubscription.account_id == Site.account_id)
            .group_by(Site.site_id)
        )
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(Site.site_id.in_(site_ids))
        if statuses:
            statement = statement.where(AccountSubscription.status.in_(statuses))
        return {
            str(site_id or ""): int(count or 0)
            for site_id, count in self.session.execute(statement)
        }

    def get_latest_account_subscription(self, account_id: str) -> AccountSubscription | None:
        return next(iter(self.list_account_subscriptions(account_id)), None)

    def get_runtime_subscription(self, account_id: str) -> AccountSubscription | None:
        candidates = self.list_account_subscriptions(account_id)
        active_statuses = {"trialing", "active"}
        for subscription in candidates:
            if subscription.status in active_statuses:
                return subscription
        return candidates[0] if candidates else None

    def count_subscriptions_expiring_by(
        self,
        *,
        before: datetime,
        statuses: list[str] | None = None,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(AccountSubscription)
            .where(
                AccountSubscription.current_period_end_at.is_not(None),
                AccountSubscription.current_period_end_at <= before,
            )
        )
        if statuses:
            statement = statement.where(AccountSubscription.status.in_(statuses))
        return int(self.session.scalar(statement) or 0)
