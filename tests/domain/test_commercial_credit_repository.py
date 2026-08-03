from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import pytest
from sqlalchemy.dialects import postgresql

from app.adapters.repositories.commercial_credit_repository import CommercialCreditRepository
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import CREDIT_LEDGER_EVENT_GRANT, Account


class _StatementCaptureSession:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def scalar(self, statement: Any) -> None:
        self.statements.append(statement)
        return None

    def scalars(self, statement: Any) -> list[Any]:
        self.statements.append(statement)
        return []


def _create_payment_order(
    facade: CommercialRepository,
    *,
    order_id: str,
    account_id: str,
) -> None:
    facade.create_payment_order(
        order_id=order_id,
        account_id=account_id,
        site_id=None,
        subscription_id=None,
        plan_id="credit-pack",
        plan_version_id="credit-pack-v1",
        provider="alipay",
        external_order_no=f"external-{order_id}",
        status="paid",
        amount=10.0,
        currency="CNY",
        subject="Credit pack",
        checkout_url=None,
        refund_window_end_at=None,
        idempotency_key=f"payment-{order_id}",
        metadata_json=None,
    )


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialCreditRepository],
)
def test_credit_repository_preserves_ledger_and_paid_grant_transaction_semantics(
    tmp_path: Path,
    repository_type: type[CommercialCreditRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / repository_type.__name__}.sqlite3"
    init_schema(database_url)
    account_id = "account-credit-repository"
    now = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add(Account(account_id=account_id, name="Credit Account", status="active"))
        facade = CommercialRepository(session)
        for order_id in ("order-earlier", "order-later"):
            _create_payment_order(facade, order_id=order_id, account_id=account_id)
        repository = repository_type(session)

        with pytest.raises(ValueError, match="integer credit unit"):
            repository.record_credit_ledger_entry(
                account_id=account_id,
                site_id=None,
                subscription_id=None,
                plan_version_id=None,
                run_id=None,
                provider_call_id=None,
                source_type="runtime",
                source_id="fractional-consume",
                ai_credit_delta=-1.25,
                quantity=1.25,
                unit="ai_credits",
                rate=1.0,
                rate_unit="credit",
                rate_version="test-v1",
                idempotency_key="fractional-consume",
            )

        ledger = repository.record_credit_ledger_entry(
            account_id=account_id,
            site_id=None,
            subscription_id=None,
            plan_version_id=None,
            run_id=None,
            provider_call_id=None,
            event_type=CREDIT_LEDGER_EVENT_GRANT,
            source_type="operator",
            source_id="grant-source",
            ai_credit_delta=1.23456789,
            quantity=2.34567891,
            unit="ai_credits",
            rate=3.45678912,
            rate_unit="credit",
            rate_version="test-v1",
            idempotency_key="ledger-idempotency",
            created_at=now,
        )
        duplicate = repository.record_credit_ledger_entry(
            account_id="different-account",
            site_id=None,
            subscription_id=None,
            plan_version_id=None,
            run_id=None,
            provider_call_id=None,
            event_type=CREDIT_LEDGER_EVENT_GRANT,
            source_type="different",
            source_id="different",
            ai_credit_delta=99.0,
            quantity=99.0,
            unit="ai_credits",
            rate=99.0,
            rate_unit="credit",
            rate_version="different",
            idempotency_key="ledger-idempotency",
        )
        assert duplicate is ledger
        assert ledger.ai_credit_delta == 1.234568
        assert ledger.quantity == 2.345679
        assert ledger.rate == 3.456789
        assert ledger.created_at == now

        earlier = repository.upsert_paid_credit_grant(
            account_id=account_id,
            payment_order_id="order-earlier",
            original_ai_credits=4.0,
            expires_at=now + timedelta(days=1),
            metadata_json={"kind": "earlier"},
        )
        later = repository.upsert_paid_credit_grant(
            account_id=account_id,
            payment_order_id="order-later",
            original_ai_credits=5.0,
            expires_at=now + timedelta(days=2),
            metadata_json=None,
        )
        assert repository.upsert_paid_credit_grant(
            account_id=account_id,
            payment_order_id="order-earlier",
            original_ai_credits=100.0,
            expires_at=now + timedelta(days=30),
        ) is earlier
        assert repository.get_paid_credit_grant_by_order("order-earlier") is earlier
        assert repository.get_paid_credit_grant_by_order("missing") is None
        assert repository.list_available_paid_credit_grants(
            account_id=account_id, now=now
        ) == [earlier, later]
        assert repository.list_available_paid_credit_grants(
            account_id=account_id, now=now + timedelta(days=3)
        ) == []

        assert repository.consume_paid_credit_grants(
            account_id=account_id, ai_credits=6.0, now=now
        ) == 6.0
        assert earlier.remaining_ai_credits == 0.0
        assert later.remaining_ai_credits == 3.0
        assert repository.consume_paid_credit_grants(
            account_id=account_id, ai_credits=0.0, now=now
        ) == 0.0

        refunded = repository.refund_paid_credit_grant(
            payment_order_id="order-later", ai_credits=2.0
        )
        assert refunded is later
        assert later.refunded_ai_credits == 2.0
        assert later.remaining_ai_credits == 1.0
        capped = repository.refund_paid_credit_grant(
            payment_order_id="order-later", ai_credits=99.0
        )
        assert capped is later
        assert later.refunded_ai_credits == 5.0
        assert later.remaining_ai_credits == 0.0
        assert repository.refund_paid_credit_grant(
            payment_order_id="missing", ai_credits=1.0
        ) is None

    dispose_engine(database_url)


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialCreditRepository],
)
def test_credit_repository_preserves_optional_postgres_row_locks(
    repository_type: type[CommercialCreditRepository],
) -> None:
    session = _StatementCaptureSession()
    repository = repository_type(cast(Any, session))

    repository.get_paid_credit_grant_by_order("order-lock", for_update=True)
    repository.list_available_paid_credit_grants(
        account_id="account-lock",
        now=datetime(2026, 8, 3, tzinfo=UTC),
        for_update=True,
    )

    compiled = [
        str(statement.compile(dialect=postgresql.dialect())) for statement in session.statements
    ]
    assert len(compiled) == 2
    assert all("FOR UPDATE" in statement for statement in compiled)
