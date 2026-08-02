from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import pytest
from sqlalchemy.dialects import postgresql

from app.adapters.repositories.commercial_payment_repository import CommercialPaymentRepository
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-payment-repository.sqlite3'}"


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialPaymentRepository],
)
def test_payment_repository_preserves_create_flush_fields_and_rollback(
    tmp_path: Path,
    repository_type: type[CommercialPaymentRepository],
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 8, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add(Account(account_id="acct_payment_repository", name="Account", status="active"))
        repository = repository_type(session)
        assert isinstance(repository, CommercialPaymentRepository)

        order = repository.create_payment_order(
            order_id="payment_repository_order",
            account_id="acct_payment_repository",
            site_id="site_payment_repository",
            subscription_id=None,
            plan_id="plan_payment_repository",
            plan_version_id="version_payment_repository",
            provider="alipay",
            external_order_no="external_payment_repository",
            status="pending",
            amount=29.5,
            currency="CNY",
            subject="Payment repository order",
            checkout_url="https://example.test/checkout",
            refund_window_end_at=now + timedelta(days=7),
            idempotency_key=None,
            metadata_json={"source": "characterization"},
        )
        assert session.get(type(order), order.order_id) is order
        assert repository.get_payment_order_for_update(order.order_id) is order
        assert (
            order.account_id,
            order.site_id,
            order.provider,
            order.external_order_no,
            order.status,
            order.amount,
            order.currency,
            order.subject,
            order.checkout_url,
            order.refund_window_end_at,
            order.idempotency_key,
            order.metadata_json,
        ) == (
            "acct_payment_repository",
            "site_payment_repository",
            "alipay",
            "external_payment_repository",
            "pending",
            29.5,
            "CNY",
            "Payment repository order",
            "https://example.test/checkout",
            now + timedelta(days=7),
            None,
            {"source": "characterization"},
        )

        refund = repository.create_payment_refund(
            refund_id="payment_repository_refund",
            order_id=order.order_id,
            account_id=order.account_id,
            subscription_id=None,
            provider="alipay",
            external_refund_no="external_refund_repository",
            status="requested",
            amount=9.5,
            currency="CNY",
            reason="characterization",
            requested_at=now,
            idempotency_key=None,
            metadata_json={"sequence": 1},
        )
        assert session.get(type(refund), refund.refund_id) is refund
        assert (
            refund.order_id,
            refund.account_id,
            refund.provider,
            refund.external_refund_no,
            refund.status,
            refund.amount,
            refund.currency,
            refund.reason,
            refund.requested_at,
            refund.idempotency_key,
            refund.metadata_json,
        ) == (
            order.order_id,
            order.account_id,
            "alipay",
            "external_refund_repository",
            "requested",
            9.5,
            "CNY",
            "characterization",
            now,
            None,
            {"sequence": 1},
        )

        event = repository.create_payment_event(
            event_id="payment_repository_event",
            provider="alipay",
            event_kind="payment.notify",
            status="processed",
            order_id=order.order_id,
            refund_id=refund.refund_id,
            provider_event_id="provider_event_repository",
            idempotency_key=None,
            payload_json={"trade_status": "TRADE_SUCCESS"},
            processed_at=now,
        )
        assert session.get(type(event), event.event_id) is event
        assert (
            event.provider,
            event.event_kind,
            event.status,
            event.order_id,
            event.refund_id,
            event.provider_event_id,
            event.idempotency_key,
            event.payload_json,
            event.processed_at,
        ) == (
            "alipay",
            "payment.notify",
            "processed",
            order.order_id,
            refund.refund_id,
            "provider_event_repository",
            None,
            {"trade_status": "TRADE_SUCCESS"},
            now,
        )

        session.rollback()
        assert repository.get_payment_order(order.order_id) is None
        assert repository.get_payment_refund(refund.refund_id) is None
        assert (
            repository.get_payment_event_by_provider_event(
                provider="alipay", provider_event_id="provider_event_repository"
            )
            is None
        )

    dispose_engine(database_url)


class _ScalarCaptureSession:
    def __init__(self) -> None:
        self.statement: object | None = None
        self.result = object()

    def scalar(self, statement: object) -> object:
        self.statement = statement
        return self.result


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialPaymentRepository],
)
def test_payment_order_for_update_preserves_postgresql_row_lock(
    repository_type: type[CommercialPaymentRepository],
) -> None:
    session = _ScalarCaptureSession()
    repository = repository_type(cast(Any, session))

    assert repository.get_payment_order_for_update("payment_locked") is session.result
    assert session.statement is not None
    sql = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "payment_orders.order_id =" in sql
    assert sql.rstrip().endswith("FOR UPDATE")
