from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_internal_request
from app.api.envelope import build_envelope
from app.api.routes.commercial_subscriptions_admin import (
    _build_audit_context,
    _build_operator_receipt,
    _get_commercial_service,
    _record_service_failure,
    _service_error_response,
)
from app.domain.commercial.admin_payments import (
    admin_full_refund_key,
    list_admin_account_payment_orders,
    request_admin_full_refund,
)
from app.domain.commercial.errors import CommercialServiceError

router = APIRouter(prefix="/admin", tags=["service"])


class AdminFullRefundPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.get("/accounts/{account_id}/payment-orders")
async def list_admin_payment_orders(
    account_id: str, request: Request,
    limit: int = Query(default=5, ge=1, le=20), offset: int = Query(default=0, ge=0),
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    try:
        result = await run_in_threadpool(
            list_admin_account_payment_orders, _get_commercial_service(request),
            account_id=account_id, limit=limit, offset=offset,
        )
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    return build_envelope(status="ok", message="account payment orders loaded", data=result,
                          revision="m6")


@router.post("/accounts/{account_id}/payment-orders/{order_id}/refunds")
async def request_admin_payment_refund(
    account_id: str, order_id: str, payload: AdminFullRefundPayload, request: Request,
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    try:
        result = await run_in_threadpool(
            request_admin_full_refund, _get_commercial_service(request),
            account_id=account_id, order_id=order_id, reason=payload.reason,
            audit_context=_build_audit_context(request),
        )
    except CommercialServiceError as error:
        _record_service_failure(
            request, event_kind="payment.refund.request", error=error,
            scope_kind="payment_order", scope_id=order_id,
        )
        return _service_error_response(error, request=request)
    receipt = _build_operator_receipt(
        event_kind="payment.refund.request", scope_kind="payment_refund",
        scope_id=str(result["refund_id"]), outcome="requested", audit_state="persisted",
        effective_summary="Full refund recorded; verify the current refund result",
        account_id=account_id, idempotency_key=admin_full_refund_key(order_id),
    )
    return build_envelope(
        status="ok", message="full refund recorded", data={"refund": result, "receipt": receipt},
        revision="m6",
    )
