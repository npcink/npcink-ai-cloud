"""Real aggregate SQL in one disposable schema, never shared commerce data."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.api.routes.economics_admin import _load_revenue, _load_usage_by_family
from app.core.db import get_session, init_schema
from app.core.models import (
    Account,
    AccountSubscription,
    PaymentOrder,
    PaymentRefund,
    ProviderCallRecord,
    RunRecord,
    Site,
    UsageMeterEvent,
)
from tests.integration.test_portal_postgres_acceptance import (
    m4_database_url as m4_database_url,
)
from tests.integration.test_portal_postgres_acceptance import (
    portal_database as portal_database,
)

START = datetime(2026, 10, 1, tzinfo=UTC)
END = datetime(2026, 11, 1, tzinfo=UTC)


def test_economics_aggregates_read_only_on_postgres(portal_database):
    url = portal_database
    init_schema(url)
    with get_session(url) as session:
        session.add(Account(account_id="econ", name="Synthetic fixture", status="active"))
        session.flush()
        session.add(
            Site(
                site_id="econ_site",
                account_id="econ",
                name="Fixture",
                site_url="https://example.test",
                status="active",
            )
        )
        session.flush()
        session.add(
            RunRecord(
                run_id="econ_run",
                site_id="econ_site",
                ability_name="test",
                ability_family="vision",
                execution_kind="text",
                channel="test",
                profile_id="test",
                status="succeeded",
                trace_id="test",
            )
        )
        session.flush()
        for i, (date, key, quantity) in enumerate(
            [(START, "runs", 2), (START, "tokens_total", 1000), (END, "runs", 99)]
        ):
            session.add(
                UsageMeterEvent(
                    site_id="econ_site",
                    event_kind="consume",
                    meter_key=key,
                    quantity=quantity,
                    ability_family="vision",
                    dedupe_key=f"meter{i}",
                    created_at=date,
                )
            )
        session.add(
            ProviderCallRecord(
                run_id="econ_run",
                provider_id="test",
                model_id="test",
                instance_id="test",
                region="test",
                latency_ms=1,
                cost=0.25,
                created_at=START,
            )
        )
        for i, (plan, status) in enumerate(
            [
                ("pro", "active"),
                ("pro", "active"),
                ("agency", "trialing"),
                ("free", "active"),
                ("plus", "canceled"),
            ]
        ):
            session.add(
                AccountSubscription(
                    subscription_id=f"sub{i}",
                    account_id="econ",
                    plan_id=plan,
                    plan_version_id="test",
                    status=status,
                )
            )
        orders = [
            ("paid", "pro", 100, "CNY", START, None),
            ("refunded", "pack_small", 50, "CNY", START, {}),
            ("paid", "custom", 30, "CNY", START, {"purchase_kind": "credit_pack"}),
            ("paid", "packX", 7, "CNY", START, None),
            ("paid", "pro", 999, "USD", START, None),
            ("pending", "pro", 999, "CNY", START, None),
            ("paid", "pro", 999, "CNY", END, None),
        ]
        for i, (status, plan, amount, currency, paid_at, metadata) in enumerate(orders):
            session.add(
                PaymentOrder(
                    order_id=f"order{i}",
                    account_id="econ",
                    plan_id=plan,
                    plan_version_id="test",
                    external_order_no=f"order{i}",
                    subject="test",
                    status=status,
                    amount=amount,
                    currency=currency,
                    paid_at=paid_at,
                    metadata_json=metadata,
                )
            )
        session.flush()
        for i, (status, amount, currency, date) in enumerate(
            [
                ("succeeded", 20, "CNY", START),
                ("requested", 90, "CNY", START),
                ("succeeded", 90, "USD", START),
                ("succeeded", 90, "CNY", END),
            ]
        ):
            session.add(
                PaymentRefund(
                    refund_id=f"refund{i}",
                    order_id="order0",
                    account_id="econ",
                    external_refund_no=f"refund{i}",
                    requested_at=START,
                    succeeded_at=date,
                    status=status,
                    amount=amount,
                    currency=currency,
                )
            )
        session.commit()
    usage = _load_usage_by_family(url, month_start=START, month_end=END)
    assert usage["families"] == {
        "vision": {
            "runs": 2,
            "tokens_total": 1000.0,
            "provider_call_count": 1,
            "provider_call_cost_usd": 0.25,
        }
    }
    revenue = _load_revenue(url, month_start=START, month_end=END)
    assert revenue["subscription_revenue_cny"] == 107
    assert revenue["credit_pack_revenue_cny"] == 80
    assert revenue["refunds_cny"] == 20
    assert revenue["net_revenue_cny"] == 167
    assert revenue["active_paid_accounts"] == revenue["trialing_accounts"] == 1
    assert revenue["account_counts_scope"] == "current_snapshot"
    # Independent readback: no reconcile or lifecycle mutations from the reads.
    with get_session(url) as session:
        assert session.get(AccountSubscription, "sub2").status == "trialing"
        assert session.get(PaymentOrder, "order1").status == "refunded"
        assert len(list(session.scalars(select(PaymentOrder)))) == 7
