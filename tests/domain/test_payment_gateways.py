from __future__ import annotations

import pytest

from app.domain.commercial.errors import CommercialValidationError
from app.domain.commercial.payment_gateways import (
    PAYMENT_GATEWAY_CONTRACT_VERSION,
    PaymentGatewayOrderRequest,
    PaymentGatewayRefundRequest,
    get_payment_gateway_provider,
    normalize_payment_gateway_provider,
)


def test_payment_gateway_create_order_and_refund_are_provider_normalized() -> None:
    assert normalize_payment_gateway_provider("wechat") == "wechat_pay"
    gateway = get_payment_gateway_provider("wxpay")
    order = gateway.create_order(
        PaymentGatewayOrderRequest(
            provider="wechat_pay",
            order_id="pay_gateway_order_001",
            amount=99.0,
            currency="CNY",
            subject="Small credit pack",
            metadata={"purchase_kind": "credit_pack"},
        )
    )
    refund = gateway.create_refund(
        PaymentGatewayRefundRequest(
            provider="wechat_pay",
            refund_id="ref_gateway_order_001",
            order_id="pay_gateway_order_001",
            amount=99.0,
            currency="CNY",
            reason="customer requested refund",
            metadata={},
        )
    )

    assert order.external_order_no == "pay_gateway_order_001"
    assert order.checkout_url == ""
    assert order.provider_payload["contract_version"] == PAYMENT_GATEWAY_CONTRACT_VERSION
    assert order.provider_payload["provider"] == "wechat_pay"
    assert refund.external_refund_no == "ref_gateway_order_001"
    assert refund.provider_payload["refund_status"] == "requested"


def test_alipay_gateway_verifies_payment_and_refund_callbacks() -> None:
    gateway = get_payment_gateway_provider("alipay")
    payment = gateway.verify_payment_callback(
        {
            "out_trade_no": "pay_alipay_001",
            "trade_no": "202606230000000001",
            "notify_id": "notify-alipay-payment-001",
            "total_amount": "99.00",
            "trade_status": "TRADE_SUCCESS",
            "gmt_payment": "2026-06-23 10:20:30",
        }
    )
    refund = gateway.verify_refund_callback(
        {
            "out_biz_no": "ref_alipay_001",
            "trade_no": "202606230000000001",
            "notify_id": "notify-alipay-refund-001",
            "refund_fee": "99.00",
            "refund_status": "REFUND_SUCCESS",
            "gmt_refund_pay": "2026-06-23 10:30:30",
        }
    )

    assert payment.status == "succeeded"
    assert payment.external_order_no == "pay_alipay_001"
    assert payment.provider_trade_no == "202606230000000001"
    assert payment.amount == 99.0
    assert payment.to_payload()["contract_version"] == PAYMENT_GATEWAY_CONTRACT_VERSION
    assert refund.status == "succeeded"
    assert refund.external_refund_no == "ref_alipay_001"
    assert refund.amount == 99.0


def test_wechat_gateway_verifies_cent_amount_callbacks() -> None:
    gateway = get_payment_gateway_provider("wechat_pay")
    payment = gateway.verify_payment_callback(
        {
            "out_trade_no": "pay_wechat_001",
            "transaction_id": "420000000020260623000001",
            "event_id": "notify-wechat-payment-001",
            "amount": {"total": 9900},
            "trade_state": "SUCCESS",
            "success_time": "2026-06-23T10:20:30+08:00",
        }
    )
    refund = gateway.verify_refund_callback(
        {
            "out_refund_no": "ref_wechat_001",
            "refund_id": "503000000020260623000001",
            "event_id": "notify-wechat-refund-001",
            "amount": {"refund": 9900},
            "refund_status": "SUCCESS",
            "success_time": "2026-06-23T10:30:30+08:00",
        }
    )

    assert payment.status == "succeeded"
    assert payment.amount == 99.0
    assert payment.provider_trade_no == "420000000020260623000001"
    assert refund.status == "succeeded"
    assert refund.amount == 99.0
    assert refund.provider_refund_no == "503000000020260623000001"


def test_gateway_callback_requires_external_order_or_refund_number() -> None:
    gateway = get_payment_gateway_provider("alipay")
    with pytest.raises(CommercialValidationError) as payment_error:
        gateway.verify_payment_callback({"trade_status": "TRADE_SUCCESS"})
    with pytest.raises(CommercialValidationError) as refund_error:
        gateway.verify_refund_callback({"refund_status": "REFUND_SUCCESS"})

    assert payment_error.value.error_code == "service.payment_callback_order_missing"
    assert refund_error.value.error_code == "service.payment_refund_callback_missing"
