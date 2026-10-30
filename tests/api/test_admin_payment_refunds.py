from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_session
from app.domain.commercial.payment_gateways import (
    AlipayPaymentGatewayProvider,
    PaymentGatewayRefundResult,
)
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers
from tests.domain.test_subscription_commerce import _account, _audit, _pay, _service


def _setup(tmp_path: Path):
    database_url, client = _build_client(tmp_path)
    service = _service(database_url)
    _account(service, "acct_refund_admin")
    _account(service, "acct_other")
    service.list_account_plan_offers(account_id="acct_refund_admin")
    paid = _pay(service, account_id="acct_refund_admin", offer_id="plus_monthly_v1", key="admin")
    order_id = paid["order"]["order_id"]
    path = "/internal/service/admin/accounts/acct_refund_admin/payment-orders"
    return database_url, client, service, order_id, path


def _enable(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(CommercialService, "_payment_gateway_runtime_config",
                        lambda self, provider: {"configured": True, "enabled": True})


def test_full_refund_replays_across_http_keys_and_reverses_package_once(tmp_path, monkeypatch):
    database_url, client, _, order_id, path = _setup(tmp_path)
    _enable(monkeypatch)
    calls = []

    def refund(self, request):
        calls.append(request)
        return PaymentGatewayRefundResult("alipay", request.refund_id, {
            "refund_status": "succeeded", "provider_refund_no": "trade-refund-test",
            "sensitive_gateway_detail": "must-not-reach-browser",
        })

    monkeypatch.setattr(AlipayPaymentGatewayProvider, "create_refund", refund)
    url = f"{path}/{order_id}/refunds"
    results = []
    for key in ("refund-click-one", "refund-other-tab"):
        response = client.post(url, json={"reason": "operator test"},
                               headers=build_internal_headers(idempotency_key=key))
        assert response.status_code == 200, response.text
        assert "must-not-reach-browser" not in response.text
        results.append(response.json()["data"]["refund"])
        assert response.json()["data"]["receipt"]["audit_state"] == "persisted"
    assert len(calls) == 1
    assert calls[0].amount == 15
    assert results[0]["refund_id"] == results[1]["refund_id"]
    assert results[0]["status"] == "succeeded"
    data = client.get(path, headers=build_internal_headers()).json()["data"]
    assert data["items"][0]["status"] == "refunded"
    assert data["items"][0]["refund"]["status"] == "succeeded"
    with get_session(database_url) as session:
        repository = CommercialRepository(session)
        assert len(repository.list_payment_refunds(order_id)) == 1
        assert repository.get_payment_order(order_id).status == "refunded"


def test_unknown_gateway_result_is_readable_and_never_resubmitted(tmp_path, monkeypatch):
    _, client, _, order_id, path = _setup(tmp_path)
    _enable(monkeypatch)
    calls = []

    def lost_response(self, request):
        calls.append(request.refund_id)
        raise TimeoutError("lost response")

    monkeypatch.setattr(AlipayPaymentGatewayProvider, "create_refund", lost_response)
    url = f"{path}/{order_id}/refunds"
    response = client.post(url, json={"reason": "test unknown"},
                           headers=build_internal_headers(idempotency_key="refund-lost"))
    assert response.status_code == 400
    assert response.json()["error_code"] == "service.payment_refund_status_unknown"
    data = client.get(path, headers=build_internal_headers()).json()["data"]
    assert data["items"][0]["refund"]["status"] == "unknown"
    response = client.post(url, json={"reason": "same order"},
                           headers=build_internal_headers(idempotency_key="refund-after-reload"))
    assert response.status_code == 200
    assert response.json()["data"]["refund"]["status"] == "unknown"
    assert len(calls) == 1


def test_admin_refund_requires_auth_idempotency_exact_scope_and_full_amount(tmp_path, monkeypatch):
    _, client, _, order_id, path = _setup(tmp_path)
    _enable(monkeypatch)
    url = f"{path}/{order_id}/refunds"
    assert client.get(path).status_code == 401
    assert client.post(url, json={"reason": "test"}).status_code == 401
    assert client.post(url, json={"reason": "test"},
                       headers=build_internal_headers()).status_code == 401
    for index, body in enumerate(({"reason": " "}, {"reason": "test", "amount": 1},
                                  {"reason": "test", "metadata": {}}, {"reason": "x" * 501})):
        assert client.post(url, json=body, headers=build_internal_headers(
            idempotency_key=f"invalid-refund-{index}",
        )).status_code == 422
    other_url = url.replace("acct_refund_admin", "acct_other")
    assert client.post(other_url, json={"reason": "wrong account"}, headers=build_internal_headers(
        idempotency_key="wrong-account-refund",
    )).status_code == 404
    assert client.get(f"{path}?limit=21", headers=build_internal_headers()).status_code == 422


@pytest.mark.parametrize("blocked", ["gateway_unavailable", "window_expired", "not_paid"])
def test_admin_refund_projection_and_post_both_enforce_blockers(tmp_path, monkeypatch, blocked):
    database_url, client, _, order_id, path = _setup(tmp_path)
    if blocked != "gateway_unavailable":
        _enable(monkeypatch)
    with get_session(database_url) as session:
        order = CommercialRepository(session).get_payment_order(order_id)
        order.metadata_json = {**order.metadata_json, "secret": "must-not-be-exposed"}
        if blocked == "window_expired":
            order.refund_window_end_at = datetime.now(UTC) - timedelta(days=1)
        if blocked == "not_paid":
            order.status = "pending"
        session.commit()
    read = client.get(path, headers=build_internal_headers())
    assert "must-not-be-exposed" not in read.text
    assert read.json()["data"]["items"][0]["refund_blocker"] == blocked
    response = client.post(f"{path}/{order_id}/refunds", json={"reason": "test"},
                           headers=build_internal_headers(idempotency_key=f"blocked-{blocked}"))
    assert response.status_code == 409
    assert response.json()["error_code"] == f"admin.payment_refund.{blocked}"


def test_admin_credit_pack_projection_blocks_consumed_credits(tmp_path, monkeypatch):
    database_url, client, service, _, path = _setup(tmp_path)
    _enable(monkeypatch)
    order = service.create_credit_pack_payment_order(
        account_id="acct_refund_admin", pack_id="pack_small", audit_context=_audit("admin-pack"),
    )
    order_id = str(order["order_id"])
    service.mark_payment_order_paid(
        order_id=order_id, amount=float(order["amount"]), provider_event_id="admin-pack-paid",
        audit_context=_audit("admin-pack-paid"),
    )
    with get_session(database_url) as session:
        repository = CommercialRepository(session)
        assert repository.consume_paid_credit_grants(
            account_id="acct_refund_admin", ai_credits=1.0, now=datetime.now(UTC),
        ) == 1.0
        session.commit()
    read = client.get(path, headers=build_internal_headers()).json()["data"]
    projected = next(item for item in read["items"] if item["order_id"] == order_id)
    assert projected["refund_blocker"] == "credits_consumed"
    response = client.post(f"{path}/{order_id}/refunds", json={"reason": "test consumed pack"},
                           headers=build_internal_headers(idempotency_key="admin-pack-refund"))
    assert response.status_code == 409
    assert response.json()["error_code"] == "admin.payment_refund.credits_consumed"
