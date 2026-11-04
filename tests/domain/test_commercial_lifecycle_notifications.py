from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PRINCIPAL_STATUS_ACTIVE,
    Account,
    AccountSubscription,
    AccountUserMembership,
    PortalNotification,
    Principal,
    Site,
)
from app.domain.commercial.notifications import (
    build_commercial_notification_id,
    notify_unique_account_owner,
)
from app.domain.commercial.service import CommercialService
from app.domain.runtime.errors import RuntimeQuotaExceededError
from tests.conftest import seed_site_auth


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-lifecycle-notifications.sqlite3'}"


def _notify_kwargs(notification_id: str) -> dict[str, str]:
    return {
        "account_id": "acct_notify",
        "notification_id": notification_id,
        "event_type": "runtime.ai_credits_denied",
        "title": "AI 积分不足",
        "body": "本订阅周期的 AI 积分额度不足，本次执行未开始。",
        "link_href": "/portal/account/usage",
    }


def test_notification_requires_one_active_owner_with_reliable_email(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    notification_id = build_commercial_notification_id("pnotif_test", "cycle-1")
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_notify", name="Notify", status="active"))
            session.add_all(
                [
                    Principal(
                        principal_id="owner-1",
                        email="owner@example.test",
                        status=PRINCIPAL_STATUS_ACTIVE,
                    ),
                    Principal(
                        principal_id="owner-2",
                        email="other@example.test",
                        status=PRINCIPAL_STATUS_ACTIVE,
                    ),
                ]
            )
            session.add(
                AccountUserMembership(
                    membership_id="membership-1",
                    principal_id="owner-1",
                    account_id="acct_notify",
                    role="owner",
                    status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                )
            )
            session.flush()
            assert notify_unique_account_owner(
                session=session,
                **_notify_kwargs(notification_id),
            )
            assert notify_unique_account_owner(
                session=session,
                **_notify_kwargs(notification_id),
            )
            session.commit()

        with get_session(database_url) as session:
            notifications = list(session.scalars(select(PortalNotification)))
            assert len(notifications) == 1
            assert notifications[0].principal_id == "owner-1"
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize(
    "membership_rows",
    [
        [],
        [("owner-1", "owner-1@example.test"), ("owner-2", "owner-2@example.test")],
        [("owner-1", None)],
    ],
)
def test_notification_skips_missing_or_ambiguous_recipient(
    tmp_path: Path,
    membership_rows: list[tuple[str, str | None]],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_notify", name="Notify", status="active"))
            principals = [
                Principal(
                    principal_id=principal_id,
                    email=email,
                    status=PRINCIPAL_STATUS_ACTIVE,
                )
                for principal_id, email in membership_rows
            ]
            session.add_all(principals)
            for index, (principal_id, _email) in enumerate(membership_rows):
                session.add(
                    AccountUserMembership(
                        membership_id=f"membership-{index}",
                        principal_id=principal_id,
                        account_id="acct_notify",
                        role="owner",
                        status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                    )
                )
            session.flush()
            assert not notify_unique_account_owner(
                session=session,
                **_notify_kwargs("pnotif_missing-recipient"),
            )
            session.commit()
            assert session.scalar(select(PortalNotification)) is None
    finally:
        dispose_engine(database_url)


def test_trial_expiry_notifies_once_for_account_owner(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = CommercialService(database_url)
    try:
        service.upsert_account(
            account_id="acct_trial_notification",
            name="Trial notification",
            primary_email="owner@example.test",
            bind_default_free=True,
        )
        service.start_account_plan_trial(account_id="acct_trial_notification", tier_id="pro")
        expired_at = datetime.now(UTC) - timedelta(days=1)
        with get_session(database_url) as session:
            trial = session.scalar(
                select(AccountSubscription).where(
                    AccountSubscription.account_id == "acct_trial_notification",
                    AccountSubscription.plan_id == "pro",
                )
            )
            assert trial is not None
            trial.current_period_end_at = expired_at
            session.commit()

        service.get_admin_account("acct_trial_notification")
        service.get_admin_account("acct_trial_notification")

        with get_session(database_url) as session:
            notifications = list(session.scalars(select(PortalNotification)))
            assert len(notifications) == 1
            assert notifications[0].event_type == "subscription.trial_expired"
            assert notifications[0].principal_id is not None
    finally:
        dispose_engine(database_url)


def test_ai_credit_denial_notifies_once_per_subscription_period(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(
        database_url,
        site_id="site_notification_quota",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
        budgets={"max_ai_credits_per_period": 5},
    )
    with get_session(database_url) as session:
        site = session.get(Site, "site_notification_quota")
        assert site is not None
        session.add(Principal(principal_id="quota-owner", email="quota@example.test"))
        session.add(
            AccountUserMembership(
                membership_id="quota-membership",
                principal_id="quota-owner",
                account_id=site.account_id,
                role="owner",
                status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
            )
        )
        session.commit()
    with get_session(database_url) as session:
        subscription = session.scalar(select(AccountSubscription))
        assert subscription is not None
        CommercialRepository(session).record_credit_ledger_entry(
            account_id=subscription.account_id,
            site_id="site_notification_quota",
            subscription_id=subscription.subscription_id,
            plan_version_id=subscription.plan_version_id,
            run_id="run_notification_quota_existing",
            provider_call_id=None,
            source_type="runs",
            source_id="site_notification_quota_existing",
            ai_credit_delta=-5,
            quantity=5,
            unit="ai_credits",
            rate=1,
            rate_unit="ai_credits",
            rate_version="ai-credit-ledger-v2",
            idempotency_key="notification-quota-existing",
        )
        session.commit()

    service = CommercialService(database_url)
    try:
        for suffix in ("one", "two"):
            with get_session(database_url) as session:
                with pytest.raises(RuntimeQuotaExceededError):
                    service.authorize_runtime_request(
                        session=session,
                        site_id="site_notification_quota",
                        ability_family="text",
                        channel="openapi",
                        execution_kind="text",
                        execution_tier="cloud",
                        data_classification="internal",
                        trace_id=f"trace-notification-quota-{suffix}",
                        idempotency_key=f"idem-notification-quota-{suffix}",
                        request_kind="execute",
                        estimated_ai_credits=1,
                    )

        with get_session(database_url) as session:
            notifications = list(session.scalars(select(PortalNotification)))
            assert len(notifications) == 1
            assert notifications[0].event_type == "runtime.ai_credits_denied"
            assert notifications[0].principal_id == "quota-owner"
            assert notifications[0].link_href == "/portal/usage"
    finally:
        dispose_engine(database_url)
