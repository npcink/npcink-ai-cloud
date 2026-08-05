from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_payment_queries import CommercialPaymentQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-payment-queries.sqlite3'}"


@pytest.mark.parametrize(
    "query_type",
    [CommercialRepository, CommercialPaymentQueries],
)
def test_payment_queries_preserve_filters_order_limits_counts_and_lookups(
    tmp_path: Path,
    query_type: type[CommercialPaymentQueries],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 7, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add(Account(account_id="acct_payment_queries", name="Account", status="active"))
        facade = CommercialRepository(session)

        pending = facade.create_payment_order(
            order_id="payment_pending",
            account_id="acct_payment_queries",
            site_id="site_alpha",
            subscription_id=None,
            plan_id="plan_query",
            plan_version_id="version_query",
            provider="alipay",
            external_order_no="external_pending",
            status="pending",
            amount=10.0,
            currency="CNY",
            subject="Pending",
            checkout_url=None,
            refund_window_end_at=None,
            idempotency_key="pay",
            metadata_json=None,
        )
        pending.created_at = now - timedelta(days=2)
        canceled_old = facade.create_payment_order(
            order_id="payment_canceled_old",
            account_id="acct_payment_queries",
            site_id="site_alpha",
            subscription_id=None,
            plan_id="plan_query",
            plan_version_id="version_query",
            provider="alipay",
            external_order_no="external_canceled_old",
            status="canceled",
            amount=20.0,
            currency="CNY",
            subject="Canceled old",
            checkout_url=None,
            refund_window_end_at=None,
            idempotency_key=None,
            metadata_json=None,
        )
        canceled_old.created_at = now - timedelta(days=1)
        canceled_old.canceled_at = now - timedelta(days=10)
        canceled_recent = facade.create_payment_order(
            order_id="payment_canceled_recent",
            account_id="acct_payment_queries",
            site_id="site_beta",
            subscription_id=None,
            plan_id="plan_query",
            plan_version_id="version_query",
            provider="alipay",
            external_order_no="external_canceled_recent",
            status="canceled",
            amount=30.0,
            currency="CNY",
            subject="Canceled recent",
            checkout_url=None,
            refund_window_end_at=None,
            idempotency_key=None,
            metadata_json=None,
        )
        canceled_recent.created_at = now
        canceled_recent.canceled_at = now - timedelta(days=1)
        session.flush()
        repository = query_type(session)
        assert isinstance(repository, CommercialPaymentQueries)

        assert repository.get_payment_order("payment_pending") is pending
        assert repository.get_payment_order("missing") is None
        assert repository.get_payment_order_by_idempotency_key("pay") is pending
        assert repository.get_payment_order_by_idempotency_key("") is None
        assert (
            repository.get_payment_order_by_provider_external_order(
                provider="alipay", external_order_no="external_pending"
            )
            is pending
        )
        assert (
            repository.get_payment_order_by_provider_external_order(
                provider="", external_order_no="external_pending"
            )
            is None
        )
        assert (
            repository.get_payment_order_by_provider_external_order(
                provider="alipay", external_order_no=""
            )
            is None
        )

        assert [
            item.order_id
            for item in repository.list_payment_orders(account_id="acct_payment_queries")
        ] == ["payment_canceled_recent", "payment_canceled_old", "payment_pending"]
        assert [
            item.order_id
            for item in repository.list_payment_orders(
                account_id="acct_payment_queries", site_id="site_alpha"
            )
        ] == ["payment_canceled_old", "payment_pending"]
        assert repository.list_payment_orders(account_id="acct_payment_queries", statuses=()) == []
        assert [
            item.order_id
            for item in repository.list_payment_orders(
                account_id="acct_payment_queries",
                canceled_visible_after=now - timedelta(days=7),
            )
        ] == ["payment_canceled_recent", "payment_pending"]
        assert [
            item.order_id
            for item in repository.list_payment_orders(
                account_id="acct_payment_queries", limit=1, offset=1
            )
        ] == ["payment_canceled_old"]
        assert len(repository.list_payment_orders(account_id="acct_payment_queries", limit=0)) == 3

        assert repository.list_pending_payment_orders_before(
            cutoff=now - timedelta(days=1),
            account_id="acct_payment_queries",
            site_id="site_alpha",
        ) == [pending]
        assert repository.list_pending_payment_orders_before(cutoff=now - timedelta(days=3)) == []
        assert repository.count_payment_orders_by_status(account_id="acct_payment_queries") == {
            "canceled": 2,
            "pending": 1,
        }
        assert repository.count_payment_orders_by_status(
            account_id="acct_payment_queries",
            site_id="site_alpha",
            canceled_visible_after=now - timedelta(days=7),
        ) == {"pending": 1}

        refund_old = facade.create_payment_refund(
            refund_id="refund_old",
            order_id=pending.order_id,
            account_id="acct_payment_queries",
            subscription_id=None,
            provider="alipay",
            external_refund_no="external_refund_old",
            status="requested",
            amount=1.0,
            currency="CNY",
            reason=None,
            requested_at=now - timedelta(hours=2),
            idempotency_key="refund",
            metadata_json=None,
        )
        refund_old.created_at = now - timedelta(hours=2)
        refund_new = facade.create_payment_refund(
            refund_id="refund_new",
            order_id=pending.order_id,
            account_id="acct_payment_queries",
            subscription_id=None,
            provider="alipay",
            external_refund_no="external_refund_new",
            status="succeeded",
            amount=2.0,
            currency="CNY",
            reason="test",
            requested_at=now,
            idempotency_key=None,
            metadata_json=None,
        )
        refund_new.created_at = now

        event = facade.create_payment_event(
            event_id="event_query",
            provider="alipay",
            event_kind="payment.notify",
            status="processed",
            order_id=pending.order_id,
            refund_id=None,
            provider_event_id="provider_event_query",
            idempotency_key="event",
            payload_json=None,
            processed_at=now,
        )
        session.flush()

        assert repository.get_payment_refund(refund_old.refund_id) is refund_old
        assert repository.get_payment_refund("missing") is None
        assert repository.get_payment_refund_by_idempotency_key("refund") is refund_old
        assert repository.get_payment_refund_by_idempotency_key("") is None
        assert repository.list_payment_refunds(pending.order_id) == [refund_new, refund_old]
        assert repository.get_payment_event_by_idempotency_key("event") is event
        assert repository.get_payment_event_by_idempotency_key("") is None
        assert (
            repository.get_payment_event_by_provider_event(
                provider="alipay", provider_event_id="provider_event_query"
            )
            is event
        )
        assert (
            repository.get_payment_event_by_provider_event(provider="alipay", provider_event_id="")
            is None
        )

    dispose_engine(database_url)
