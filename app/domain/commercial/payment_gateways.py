from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.domain.commercial.errors import CommercialValidationError

PAYMENT_GATEWAY_CONTRACT_VERSION = "payment-gateway-contract-v1"
SUPPORTED_PAYMENT_GATEWAY_PROVIDERS = ("alipay", "wechat_pay", "manual")


@dataclass(frozen=True)
class PaymentGatewayOrderRequest:
    provider: str
    order_id: str
    amount: float
    currency: str
    subject: str
    metadata: dict[str, object]


@dataclass(frozen=True)
class PaymentGatewayOrderResult:
    provider: str
    external_order_no: str
    checkout_url: str
    provider_payload: dict[str, object]


@dataclass(frozen=True)
class PaymentGatewayRefundRequest:
    provider: str
    refund_id: str
    order_id: str
    amount: float
    currency: str
    reason: str
    metadata: dict[str, object]


@dataclass(frozen=True)
class PaymentGatewayRefundResult:
    provider: str
    external_refund_no: str
    provider_payload: dict[str, object]


@dataclass(frozen=True)
class PaymentGatewayCallbackResult:
    provider: str
    external_order_no: str
    provider_trade_no: str
    provider_event_id: str
    amount: float | None
    status: str
    occurred_at: datetime | None
    raw_event: dict[str, object]

    def to_payload(self) -> dict[str, object]:
        return {
            "contract_version": PAYMENT_GATEWAY_CONTRACT_VERSION,
            "provider": self.provider,
            "external_order_no": self.external_order_no,
            "provider_trade_no": self.provider_trade_no,
            "provider_event_id": self.provider_event_id,
            "amount": self.amount,
            "status": self.status,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else "",
            "raw_event": self.raw_event,
        }


@dataclass(frozen=True)
class PaymentGatewayRefundCallbackResult:
    provider: str
    external_refund_no: str
    provider_refund_no: str
    provider_event_id: str
    amount: float | None
    status: str
    occurred_at: datetime | None
    raw_event: dict[str, object]

    def to_payload(self) -> dict[str, object]:
        return {
            "contract_version": PAYMENT_GATEWAY_CONTRACT_VERSION,
            "provider": self.provider,
            "external_refund_no": self.external_refund_no,
            "provider_refund_no": self.provider_refund_no,
            "provider_event_id": self.provider_event_id,
            "amount": self.amount,
            "status": self.status,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else "",
            "raw_event": self.raw_event,
        }


class PaymentGatewayProvider(Protocol):
    provider: str

    def create_order(self, request: PaymentGatewayOrderRequest) -> PaymentGatewayOrderResult:
        ...

    def create_refund(self, request: PaymentGatewayRefundRequest) -> PaymentGatewayRefundResult:
        ...

    def verify_payment_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayCallbackResult:
        ...

    def verify_refund_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayRefundCallbackResult:
        ...


def normalize_payment_gateway_provider(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized in {"wechat", "wxpay"}:
        normalized = "wechat_pay"
    if normalized not in SUPPORTED_PAYMENT_GATEWAY_PROVIDERS:
        raise CommercialValidationError(
            "service.payment_provider_unsupported",
            "payment provider must be alipay, wechat_pay, or manual",
        )
    return normalized


def get_payment_gateway_provider(provider: str) -> PaymentGatewayProvider:
    normalized = normalize_payment_gateway_provider(provider)
    if normalized == "alipay":
        return AlipayPaymentGatewayProvider()
    if normalized == "wechat_pay":
        return WeChatPayPaymentGatewayProvider()
    return ManualPaymentGatewayProvider()


class SimulatedPaymentGatewayProvider:
    provider = "manual"
    checkout_mode = "simulated"

    def create_order(self, request: PaymentGatewayOrderRequest) -> PaymentGatewayOrderResult:
        self._assert_provider(request.provider)
        return PaymentGatewayOrderResult(
            provider=self.provider,
            external_order_no=request.order_id,
            checkout_url="",
            provider_payload={
                "contract_version": PAYMENT_GATEWAY_CONTRACT_VERSION,
                "provider": self.provider,
                "gateway_mode": self.checkout_mode,
                "order_status": "created",
            },
        )

    def create_refund(self, request: PaymentGatewayRefundRequest) -> PaymentGatewayRefundResult:
        self._assert_provider(request.provider)
        return PaymentGatewayRefundResult(
            provider=self.provider,
            external_refund_no=request.refund_id,
            provider_payload={
                "contract_version": PAYMENT_GATEWAY_CONTRACT_VERSION,
                "provider": self.provider,
                "gateway_mode": self.checkout_mode,
                "refund_status": "requested",
            },
        )

    def verify_payment_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayCallbackResult:
        external_order_no = _first_text(payload, "out_trade_no", "order_id", "external_order_no")
        provider_trade_no = _first_text(
            payload,
            "trade_no",
            "transaction_id",
            "provider_trade_no",
        )
        if not external_order_no:
            raise CommercialValidationError(
                "service.payment_callback_order_missing",
                "payment callback is missing the external order number",
            )
        return PaymentGatewayCallbackResult(
            provider=self.provider,
            external_order_no=external_order_no,
            provider_trade_no=provider_trade_no,
            provider_event_id=_first_text(payload, "notify_id", "event_id", "provider_event_id"),
            amount=_first_float(payload, "total_amount", "amount", "total"),
            status=self._payment_callback_status(payload),
            occurred_at=_first_datetime(payload, "gmt_payment", "success_time", "paid_at"),
            raw_event=dict(payload),
        )

    def verify_refund_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayRefundCallbackResult:
        external_refund_no = _first_text(
            payload,
            "out_biz_no",
            "out_refund_no",
            "refund_id",
            "external_refund_no",
        )
        provider_refund_no = _first_text(
            payload,
            "trade_no",
            "refund_id",
            "provider_refund_no",
        )
        if not external_refund_no:
            raise CommercialValidationError(
                "service.payment_refund_callback_missing",
                "refund callback is missing the external refund number",
            )
        return PaymentGatewayRefundCallbackResult(
            provider=self.provider,
            external_refund_no=external_refund_no,
            provider_refund_no=provider_refund_no,
            provider_event_id=_first_text(payload, "notify_id", "event_id", "provider_event_id"),
            amount=_first_float(payload, "refund_fee", "amount", "refund"),
            status=self._refund_callback_status(payload),
            occurred_at=_first_datetime(payload, "gmt_refund_pay", "success_time", "succeeded_at"),
            raw_event=dict(payload),
        )

    def _assert_provider(self, provider: str) -> None:
        if normalize_payment_gateway_provider(provider) != self.provider:
            raise CommercialValidationError(
                "service.payment_provider_mismatch",
                "payment provider does not match the gateway implementation",
            )

    def _payment_callback_status(self, payload: dict[str, object]) -> str:
        status = _first_text(payload, "trade_status", "trade_state", "status").upper()
        if status in {"TRADE_SUCCESS", "TRADE_FINISHED", "SUCCESS", "PAID"}:
            return "succeeded"
        return "ignored"

    def _refund_callback_status(self, payload: dict[str, object]) -> str:
        status = _first_text(payload, "refund_status", "refund_state", "status").upper()
        if status in {"REFUND_SUCCESS", "SUCCESS", "SUCCEEDED"}:
            return "succeeded"
        return "ignored"


class AlipayPaymentGatewayProvider(SimulatedPaymentGatewayProvider):
    provider = "alipay"


class WeChatPayPaymentGatewayProvider(SimulatedPaymentGatewayProvider):
    provider = "wechat_pay"

    def verify_payment_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayCallbackResult:
        normalized = dict(payload)
        amount = payload.get("amount")
        if isinstance(amount, dict) and "total" in amount:
            normalized["amount"] = round(_coerce_float(amount.get("total")) / 100, 6)
        return super().verify_payment_callback(normalized)

    def verify_refund_callback(
        self,
        payload: dict[str, object],
    ) -> PaymentGatewayRefundCallbackResult:
        normalized = dict(payload)
        amount = payload.get("amount")
        if isinstance(amount, dict) and "refund" in amount:
            normalized["amount"] = round(_coerce_float(amount.get("refund")) / 100, 6)
        return super().verify_refund_callback(normalized)


class ManualPaymentGatewayProvider(SimulatedPaymentGatewayProvider):
    provider = "manual"


def _first_text(payload: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _first_float(payload: dict[str, object], *keys: str) -> float | None:
    for key in keys:
        if key in payload:
            value = payload.get(key)
            if value is not None and str(value).strip():
                return _coerce_float(value)
    return None


def _coerce_float(value: object) -> float:
    if not isinstance(value, int | float | str):
        return 0.0
    try:
        return round(float(value), 6)
    except (TypeError, ValueError):
        return 0.0


def _first_datetime(payload: dict[str, object], *keys: str) -> datetime | None:
    for key in keys:
        value = payload.get(key)
        if not value:
            continue
        if isinstance(value, datetime):
            return value
        parsed = _parse_datetime_text(str(value))
        if parsed is not None:
            return parsed
    return None


def _parse_datetime_text(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    for candidate in (text, text.replace(" ", "T")):
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
        except ValueError:
            continue
    return None
