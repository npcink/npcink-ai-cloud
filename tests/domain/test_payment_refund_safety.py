from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from sqlalchemy import select

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import PaidCreditGrant, PaymentRefund
from app.domain.commercial.errors import CommercialValidationError
from app.domain.commercial.payment_gateways import get_payment_gateway_provider
from tests.domain.test_payment_gateways import _alipay_test_keys
from tests.domain.test_payment_service import _audit, _seed_account_and_plan, _service, _sqlite_url


def _signed_response(key: object, raw: str, *, signature: str | None = None) -> httpx.Response:
    sign = base64.b64encode(
        key.sign(  # type: ignore[attr-defined]
            raw.encode(),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    ).decode()
    return httpx.Response(
        200,
        request=httpx.Request("POST", "https://example.test/gateway"),
        text='{"alipay_trade_refund_response":'
        + raw
        + ',"sign":'
        + json.dumps(sign if signature is None else signature)
        + "}",
    )


@pytest.mark.parametrize("outcome", ["pending", "unknown", "succeeded"])
def test_requested_credit_pack_is_frozen_during_gateway_io(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    outcome: str,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = _service(database_url)
    _seed_account_and_plan(service)
    base = service.create_payment_order(
        account_id="acct_pay",
        plan_id="plan_pro",
        plan_version_id="plan_pro_v1",
        amount=199,
        audit_context=_audit("base"),
    )
    service.mark_payment_order_paid(order_id=str(base["order_id"]), amount=199)
    order = service.create_credit_pack_payment_order(
        account_id="acct_pay",
        pack_id="pack_small",
        audit_context=_audit("pack"),
    )
    service.mark_payment_order_paid(order_id=str(order["order_id"]), amount=99)

    def consume() -> float:
        with get_session(database_url) as session:
            repo = CommercialRepository(session)
            available = repo.list_available_paid_credit_grants(
                account_id="acct_pay",
                now=datetime.now(UTC),
            )
            assert available == []
            consumed = repo.consume_paid_credit_grants(
                account_id="acct_pay",
                ai_credits=1,
                now=datetime.now(UTC),
            )
            session.commit()
            return consumed

    class Gateway:
        def create_refund(self, request):
            assert consume() == 0
            if outcome == "unknown":
                raise CommercialValidationError(
                    "service.alipay_response_signature_missing", "missing"
                )
            from app.domain.commercial.payment_gateways import PaymentGatewayRefundResult

            return PaymentGatewayRefundResult(
                provider="alipay",
                external_refund_no=request.refund_id,
                provider_payload={"refund_status": outcome},
            )

    monkeypatch.setattr(
        "app.domain.commercial.mixins._payment_mixin.get_payment_gateway_provider",
        lambda *args, **kwargs: Gateway(),
    )
    if outcome == "unknown":
        with pytest.raises(CommercialValidationError):
            service.request_payment_refund(order_id=str(order["order_id"]), amount=99)
    else:
        service.request_payment_refund(order_id=str(order["order_id"]), amount=99)
    assert consume() == 0
    with get_session(database_url) as session:
        grant = session.scalar(select(PaidCreditGrant))
        refund = session.scalar(select(PaymentRefund))
        assert grant is not None and refund is not None
        if outcome == "succeeded":
            assert grant.remaining_ai_credits == 0
            assert grant.refunded_ai_credits == grant.original_ai_credits
        else:
            assert grant.remaining_ai_credits == grant.original_ai_credits
            assert refund.status == ("requested" if outcome == "pending" else "unknown")
    dispose_engine(database_url)


@pytest.mark.parametrize(
    "case",
    [
        "pretty",
        "escaped",
        "missing_sign",
        "invalid_sign",
        "missing_order",
        "missing_amount",
        "wrong_order",
        "wrong_amount",
        "fractional_amount",
        "nonfinite_amount",
        "duplicate",
        "rejected",
        "missing_code",
        "system_error",
    ],
)
def test_real_refund_adapter_outcome_persists_safe_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case: str,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = _service(database_url)
    _seed_account_and_plan(service)
    order = service.create_payment_order(
        account_id="acct_pay",
        plan_id="plan_pro",
        plan_version_id="plan_pro_v1",
        amount=199,
    )
    service.mark_payment_order_paid(order_id=str(order["order_id"]), amount=199)
    key, private_pem, public_pem = _alipay_test_keys()
    gateway = get_payment_gateway_provider(
        "alipay",
        config={
            "configured": True,
            "enabled": True,
            "app_id": "test-app",
            "private_key": private_pem,
            "public_key": public_pem,
            "gateway_url": "https://example.test/gateway",
        },
    )
    payload = {
        "code": "10000",
        "out_trade_no": order["order_id"],
        "refund_fee": "199.00",
        "msg": '退款 "成功"',
        "extra": {"alipay_trade_refund_response": {"x": 1}},
    }
    if case == "missing_order":
        payload.pop("out_trade_no")
    if case == "missing_amount":
        payload.pop("refund_fee")
    if case == "wrong_order":
        payload["out_trade_no"] = "other-order"
    if case in {"wrong_amount", "fractional_amount", "nonfinite_amount"}:
        payload["refund_fee"] = {
            "wrong_amount": "198.00",
            "fractional_amount": "199.001",
            "nonfinite_amount": "NaN",
        }[case]
    if case == "missing_code":
        payload.pop("code")
    if case == "system_error":
        payload["code"] = "20000"
    if case == "rejected":
        payload = {"code": "40004", "sub_code": "ACQ.REFUND_AMT_NOT_EQUAL_TOTAL"}
    raw = json.dumps(
        payload, ensure_ascii=case == "escaped", indent=2 if case == "pretty" else None
    )
    if case == "duplicate":
        raw = raw[:-1] + ', "refund_fee": "199.00"}'
    response = _signed_response(key, raw, signature="" if case == "missing_sign" else None)
    if case == "invalid_sign":
        response = _signed_response(key, raw.replace("199.00", "198.00"))
        response = httpx.Response(
            200, request=response.request, text=response.text.replace("198.00", "199.00")
        )
    monkeypatch.setattr(
        "app.domain.commercial.payment_gateways.httpx.post", lambda *a, **k: response
    )
    monkeypatch.setattr(
        "app.domain.commercial.mixins._payment_mixin.get_payment_gateway_provider",
        lambda *a, **k: gateway,
    )
    if case in {"pretty", "escaped"}:
        refund = service.request_payment_refund(order_id=str(order["order_id"]), amount=199)
        assert refund["status"] == "succeeded"
    else:
        with pytest.raises(CommercialValidationError):
            service.request_payment_refund(order_id=str(order["order_id"]), amount=199)
        with get_session(database_url) as session:
            refund = session.scalar(select(PaymentRefund))
            assert refund is not None
            assert refund.status == ("failed" if case == "rejected" else "unknown")
    dispose_engine(database_url)


def test_late_gateway_failure_does_not_downgrade_confirmed_refund(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = _service(database_url)
    _seed_account_and_plan(service)
    order = service.create_payment_order(
        account_id="acct_pay",
        plan_id="plan_pro",
        plan_version_id="plan_pro_v1",
        amount=199,
    )
    service.mark_payment_order_paid(order_id=str(order["order_id"]), amount=199)
    refund = service.request_payment_refund(order_id=str(order["order_id"]), amount=199)
    service.mark_payment_refund_succeeded(refund_id=str(refund["refund_id"]))
    service._record_payment_refund_gateway_outcome(
        refund_id=str(refund["refund_id"]),
        status="unknown",
        error_code="late-timeout",
    )
    assert service.get_payment_refund(refund_id=str(refund["refund_id"]))["status"] == "succeeded"
    dispose_engine(database_url)
