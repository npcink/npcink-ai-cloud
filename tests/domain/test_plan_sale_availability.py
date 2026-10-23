from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_session, init_schema
from app.core.models import Plan, PlanOffer, PlanVersion
from app.domain.commercial.errors import CommercialNotFoundError, CommercialValidationError
from tests.domain.test_subscription_commerce import _account, _audit, _database_url, _service


def _setup(tmp_path: Path):
    database_url = _database_url(tmp_path)
    init_schema(database_url)
    service = _service(database_url)
    _account(service, "acct_sale")
    service.list_account_plan_offers(account_id="acct_sale")
    return database_url, service


def test_withdrawal_survives_reads_publication_and_blocks_purchase_and_trial(tmp_path: Path):
    database_url, service = _setup(tmp_path)
    withdrawn = service.update_admin_plan_sales_status(
        plan_id="plus", status="retired", audit_context=_audit("withdraw-plus")
    )
    assert withdrawn["status"] == "retired"
    assert service.get_admin_plan("plus")["sales_offer"]["status"] == "retired"

    # Editing price/rights must not silently put a withdrawn package back on sale.
    service.publish_plan_version(
        plan_id="plus", plan_version_id="plus_v2", version_label="v2",
        sales_price_cny=19, budgets_json={"max_ai_credits_per_period": 3500},
    )
    for _ in range(2):
        visible = service.list_account_plan_offers(account_id="acct_sale")
        assert "plus" not in [item["tier_id"] for item in visible["items"]]
        assert "plus" not in visible["trial"]["allowed_tiers"]
    public = service.list_public_plan_catalog()
    assert next(t for t in public["tiers"] if t["tier_id"] == "plus")[
        "availability"
    ] == "unavailable"
    with pytest.raises(CommercialNotFoundError):
        service.create_account_subscription_payment_order(
            account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit("blocked")
        )
    with pytest.raises(CommercialNotFoundError):
        service.start_account_plan_trial(account_id="acct_sale", tier_id="plus")
    with get_session(database_url) as session:
        offer = session.get(PlanOffer, "plus_monthly_v1")
        assert offer.status == "retired"
        assert offer.plan_version_id == "plus_v2"
        assert float(offer.amount) == 19
        assert CommercialRepository(session).list_service_audit_events(
            event_kind="plan_offer.sales_status.update"
        )

    restored = service.update_admin_plan_sales_status(plan_id="plus", status="active")
    assert restored["status"] == "active"
    order = service.create_account_subscription_payment_order(
        account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit("restored")
    )
    assert order["order"]["amount"] == 19


@pytest.mark.parametrize("condition", [
    "draft", "future", "expired", "plan_archived", "version_draft", "version_mismatch",
    "quote_only",
])
def test_catalog_checkout_and_trial_agree_on_unavailable_packages(tmp_path: Path, condition: str):
    database_url, service = _setup(tmp_path)
    with get_session(database_url) as session:
        offer = session.get(PlanOffer, "plus_monthly_v1")
        if condition == "draft":
            offer.status = "draft"
        elif condition == "future":
            offer.valid_from_at = service.now_factory() + timedelta(days=1)
        elif condition == "expired":
            offer.valid_until_at = service.now_factory() - timedelta(seconds=1)
        elif condition == "plan_archived":
            session.get(Plan, "plus").status = "archived"
        elif condition == "version_draft":
            session.get(PlanVersion, "plus_v1").status = "draft"
        elif condition == "version_mismatch":
            offer.plan_version_id = "pro_v1"
        elif condition == "quote_only":
            offer.purchase_mode = "quote"
        session.commit()

    offers = service.list_account_plan_offers(account_id="acct_sale")
    assert "plus" not in [item["tier_id"] for item in offers["items"]]
    assert "plus" not in offers["trial"]["allowed_tiers"]
    public = service.list_public_plan_catalog()
    assert next(t for t in public["tiers"] if t["tier_id"] == "plus")[
        "availability"
    ] == "unavailable"
    with pytest.raises((CommercialNotFoundError, CommercialValidationError)):
        service.create_account_subscription_payment_order(
            account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit(condition)
        )
    with pytest.raises((CommercialNotFoundError, CommercialValidationError)):
        service.start_account_plan_trial(account_id="acct_sale", tier_id="plus")
    if condition != "draft":
        with pytest.raises((CommercialNotFoundError, CommercialValidationError)):
            service.update_admin_plan_sales_status(plan_id="plus", status="active")


@pytest.mark.parametrize("trial_setting", ["disabled", "approval_only"])
def test_trial_disabled_does_not_disable_paid_purchase(tmp_path: Path, trial_setting: str):
    database_url, service = _setup(tmp_path)
    with get_session(database_url) as session:
        offer = session.get(PlanOffer, "plus_monthly_v1")
        offer.trial_enabled = trial_setting != "disabled"
        offer.trial_requires_approval = trial_setting == "approval_only"
        session.commit()
    with pytest.raises(CommercialValidationError, match="self-serve trial"):
        service.start_account_plan_trial(account_id="acct_sale", tier_id="plus")
    order = service.create_account_subscription_payment_order(
        account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit("paid-only")
    )
    assert order["order"]["amount"] == 15


def test_withdrawal_keeps_an_active_trial_and_its_retry(tmp_path: Path):
    _, service = _setup(tmp_path)
    started = service.start_account_plan_trial(account_id="acct_sale", tier_id="plus")
    service.update_admin_plan_sales_status(plan_id="plus", status="retired")
    replay = service.start_account_plan_trial(account_id="acct_sale", tier_id="plus")
    assert replay["trial"] == started["trial"]
    assert replay["subscription"]["subscription_id"] == started["subscription"]["subscription_id"]


def test_withdrawal_preserves_existing_checkout_and_subscription(tmp_path: Path):
    _, service = _setup(tmp_path)
    created = service.create_account_subscription_payment_order(
        account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit("old-order")
    )
    service.update_admin_plan_sales_status(plan_id="plus", status="retired")
    service.publish_plan_version(
        plan_id="plus", plan_version_id="plus_v2", version_label="v2", sales_price_cny=19,
    )
    replay = service.create_account_subscription_payment_order(
        account_id="acct_sale", offer_id="plus_monthly_v1", audit_context=_audit("old-order")
    )
    assert replay["order"]["order_id"] == created["order"]["order_id"]
    assert replay["order"]["amount"] == 15
    paid = service.mark_payment_order_paid(
        order_id=created["order"]["order_id"], provider_event_id="sale-paid", amount=15,
    )
    assert paid["subscription"]["plan_version_id"] == "plus_v1"
    assert paid["subscription"]["status"] == "active"


def test_withdrawn_credit_pack_hides_and_preserves_existing_order_snapshot(tmp_path: Path):
    _, service = _setup(tmp_path)
    created = service.create_credit_pack_payment_order(
        account_id="acct_sale", pack_id="pack_small", audit_context=_audit("pack-before")
    )
    service.update_admin_credit_pack_catalog(items=[{
        "pack_id": "pack_small", "amount": 119, "ai_credits": 12000, "active": False,
    }])
    assert "pack_small" not in [p["pack_id"] for p in service.list_credit_packs()["items"]]
    with pytest.raises(CommercialValidationError):
        service.create_credit_pack_payment_order(
            account_id="acct_sale", pack_id="pack_small", audit_context=_audit("pack-after")
        )
    replay = service.create_credit_pack_payment_order(
        account_id="acct_sale", pack_id="pack_small", audit_context=_audit("pack-before")
    )
    assert replay["order_id"] == created["order_id"]
    assert replay["amount"] == 99
    assert replay["credit_pack"]["ai_credits"] == 10000
