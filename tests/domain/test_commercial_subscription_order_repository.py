from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_subscription_order_repository import (
    CommercialSubscriptionOrderRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-subscription-order.sqlite3'}"


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialSubscriptionOrderRepository],
)
def test_subscription_order_repository_preserves_create_lookup_list_and_count(
    tmp_path: Path,
    repository_type: type[CommercialSubscriptionOrderRepository],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 6, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add(Account(account_id="acct_orders", name="Account", status="active"))
        facade = CommercialRepository(session)
        facade.upsert_plan(
            plan_id="plan_orders",
            name="Orders",
            status="published",
            description="",
            metadata_json=None,
        )
        facade.upsert_plan_version(
            plan_version_id="version_orders",
            plan_id="plan_orders",
            version_label="v1",
            status="published",
            currency="CNY",
            entitlements_json={},
            budgets_json={},
            concurrency_json={},
            policy_json={},
            metadata_json=None,
        )
        facade.upsert_plan_offer(
            offer_id="offer_orders",
            plan_id="plan_orders",
            plan_version_id="version_orders",
            account_id=None,
            tier_id="pro",
            billing_cycle="monthly",
            amount=Decimal("29.00"),
            currency="CNY",
            purchase_mode="self_serve",
            status="active",
            trial_enabled=False,
            trial_days=0,
            trial_ai_credit_limit=0,
            trial_requires_approval=False,
            valid_from_at=None,
            valid_until_at=None,
            metadata_json=None,
        )
        facade.create_payment_order(
            order_id="payment_orders_1",
            account_id="acct_orders",
            site_id=None,
            subscription_id=None,
            plan_id="plan_orders",
            plan_version_id="version_orders",
            provider="alipay",
            external_order_no="external_orders_1",
            status="pending",
            amount=29.0,
            currency="CNY",
            subject="Order 1",
            checkout_url=None,
            refund_window_end_at=None,
            idempotency_key=None,
            metadata_json=None,
        )

        repository = repository_type(session)
        assert isinstance(repository, CommercialSubscriptionOrderRepository)

        first = repository.create_subscription_order(
            subscription_order_id="subscription_order_1",
            account_id="acct_orders",
            offer_id="offer_orders",
            payment_order_id="payment_orders_1",
            source_subscription_id=None,
            target_plan_id="plan_orders",
            target_plan_version_id="version_orders",
            order_kind="upgrade",
            status="pending_payment",
            list_amount=Decimal("29.00"),
            ai_credit_amount=Decimal("0.00"),
            payable_amount=Decimal("29.00"),
            currency="CNY",
            effective_at=now,
            period_start_at=now,
            period_end_at=now + timedelta(days=30),
            metadata_json={"sequence": 1},
        )
        first.created_at = now - timedelta(minutes=1)
        second = repository.create_subscription_order(
            subscription_order_id="subscription_order_2",
            account_id="acct_orders",
            offer_id="offer_orders",
            payment_order_id=None,
            source_subscription_id=None,
            target_plan_id="plan_orders",
            target_plan_version_id="version_orders",
            order_kind="renewal",
            status="paid",
            list_amount=Decimal("29.00"),
            ai_credit_amount=Decimal("1.00"),
            payable_amount=Decimal("28.00"),
            currency="CNY",
            effective_at=now + timedelta(days=30),
            period_start_at=now + timedelta(days=30),
            period_end_at=now + timedelta(days=60),
            metadata_json={"sequence": 2},
        )
        second.created_at = now
        session.flush()

        assert session.get(type(first), first.subscription_order_id) is first
        assert repository.get_subscription_order(first.subscription_order_id) is first
        assert repository.get_subscription_order("missing") is None
        assert repository.get_subscription_order_by_payment_order("payment_orders_1") is first
        assert repository.get_subscription_order_by_payment_order("") is None
        assert [
            item.subscription_order_id
            for item in repository.list_subscription_orders(account_id="acct_orders")
        ] == ["subscription_order_2", "subscription_order_1"]
        assert [
            item.subscription_order_id
            for item in repository.list_subscription_orders(account_id="acct_orders", limit=1)
        ] == ["subscription_order_2"]
        assert len(repository.list_subscription_orders(account_id="acct_orders", limit=0)) == 2
        assert (
            repository.count_subscription_orders(
                account_id="acct_orders", statuses={"pending_payment", "paid"}
            )
            == 2
        )
        assert (
            repository.count_subscription_orders(account_id="acct_orders", statuses={"paid"}) == 1
        )
        assert repository.count_subscription_orders(account_id="acct_orders", statuses=set()) == 0

        session.rollback()
        assert repository.get_subscription_order(first.subscription_order_id) is None

    dispose_engine(database_url)
