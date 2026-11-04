"""Bounded account order projection and full-refund adapter for Admin."""
from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
from typing import Any

from app.adapters.repositories.commercial_credit_repository import CommercialCreditRepository
from app.adapters.repositories.commercial_subscription_lifecycle_repository import (
    CommercialSubscriptionLifecycleRepository,
)
from app.core.db import get_session
from app.core.models import PaymentOrder, PaymentRefund
from app.domain.commercial.errors import CommercialConflictError, CommercialNotFoundError
from app.domain.commercial.service import CommercialService, ServiceAuditContext


def _scoped_order(
    repository: CommercialSubscriptionLifecycleRepository, account_id: str, order_id: str,
) -> PaymentOrder:
    order = repository.get_payment_order(order_id)
    if order is None or order.account_id != account_id:
        raise CommercialNotFoundError("service.payment_order_not_found", "payment order not found")
    return order


def _refund_data(service: CommercialService, refund: PaymentRefund) -> dict[str, Any]:
    # Never expose raw gateway responses, metadata or credentials in browser reads.
    return {
        key: value for key, value in service._serialize_payment_refund(refund).items()
        if key in {
            "refund_id", "status", "amount", "currency", "reason", "requested_at",
            "succeeded_at", "external_refund_no", "provider_refund_no",
        }
    }


def _blocker(
    service: CommercialService, repository: CommercialSubscriptionLifecycleRepository,
    order: PaymentOrder,
    refunds: list[PaymentRefund], *, gateway_ready: bool,
) -> str:
    if refunds:
        return "refund_exists"
    if order.status != "paid":
        return "not_paid"
    if order.provider != "alipay" or order.currency != "CNY":
        return "unsupported_provider"
    if not gateway_ready:
        return "gateway_unavailable"
    deadline = service._normalize_payment_order_datetime(order.refund_window_end_at)
    if deadline is not None and service.now_factory() > deadline:
        return "window_expired"
    try:
        service._assert_subscription_order_refundable_in_session(
            repository=repository, payment_order=order,
        )
    except CommercialConflictError:
        return "later_package_order"
    if service._payment_order_purchase_kind(order) == "credit_pack":
        grant = CommercialCreditRepository(repository.session).get_paid_credit_grant_by_order(
            order.order_id,
        )
        if grant is None:
            return "credit_grant_missing"
        consumed = (
            float(grant.original_ai_credits or 0) - float(grant.remaining_ai_credits or 0)
            - float(grant.refunded_ai_credits or 0)
        )
        if round(consumed, 6) > 0:
            return "credits_consumed"
    return ""


def _gateway_ready(service: CommercialService) -> bool:
    config = service._payment_gateway_runtime_config("alipay")
    return bool(config.get("configured") and config.get("enabled", True))


def admin_full_refund_key(order_id: str) -> str:
    return "admin_full_refund:" + sha256(order_id.encode()).hexdigest()


def list_admin_account_payment_orders(
    service: CommercialService, *, account_id: str, limit: int = 5, offset: int = 0,
) -> dict[str, Any]:
    gateway_ready = _gateway_ready(service)
    with get_session(service.database_url) as session:
        repository = CommercialSubscriptionLifecycleRepository(session)
        if repository.get_account(account_id) is None:
            raise CommercialNotFoundError("service.account_not_found", "account not found")
        total = sum(repository.count_payment_orders_by_status(account_id=account_id).values())
        items = []
        orders = repository.list_payment_orders(account_id=account_id, limit=limit, offset=offset)
        for order in orders:
            refunds = repository.list_payment_refunds(order.order_id)
            items.append({
                "order_id": order.order_id, "subject": order.subject,
                "provider": order.provider, "status": order.status,
                "amount": float(order.amount), "currency": order.currency,
                "external_order_no": order.external_order_no,
                "paid_at": service._serialize_datetime(order.paid_at),
                "created_at": service._serialize_datetime(order.created_at),
                "refund_window_end_at": service._serialize_datetime(order.refund_window_end_at),
                "refund_blocker": _blocker(
                    service, repository, order, refunds, gateway_ready=gateway_ready,
                ),
                "refund": _refund_data(service, refunds[0]) if refunds else None,
            })
    return {
        "account_id": account_id, "items": items,
        "pagination": {"limit": limit, "offset": offset, "total": total},
    }


def request_admin_full_refund(
    service: CommercialService, *, account_id: str, order_id: str, reason: str,
    audit_context: ServiceAuditContext,
) -> dict[str, Any]:
    # A durable, order-scoped key survives browser timeouts, refreshes and multiple
    # operator tabs. The HTTP request key still protects request-body replay.
    stable_key = admin_full_refund_key(order_id)
    with get_session(service.database_url) as session:
        repository = CommercialSubscriptionLifecycleRepository(session)
        order = _scoped_order(repository, account_id, order_id)
        existing = repository.get_payment_refund_by_idempotency_key(stable_key)
        if existing is not None:
            return _refund_data(service, existing)
        refunds = repository.list_payment_refunds(order_id)
        blocker = _blocker(
            service, repository, order, refunds, gateway_ready=_gateway_ready(service),
        )
        if blocker:
            raise CommercialConflictError(
                f"admin.payment_refund.{blocker}", "full refund is unavailable",
            )
    # Existing domain locking, amount caps, refund window, consumption checks,
    # signed gateway results and entitlement reversal remain authoritative.
    result = service.request_payment_refund(
        order_id=order_id, amount=None, reason=reason,
        audit_context=replace(audit_context, idempotency_key=stable_key),
    )
    refund = service.get_payment_refund(refund_id=str(result["refund_id"]))
    return {key: value for key, value in refund.items() if key != "metadata"}
