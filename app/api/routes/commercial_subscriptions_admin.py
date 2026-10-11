from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.api.auth import authorize_internal_request, get_cloud_services
from app.api.envelope import build_envelope
from app.core.security import extract_trace_id
from app.domain.commercial.errors import CommercialServiceError
from app.domain.commercial.service import CommercialService, ServiceAuditContext

router = APIRouter(prefix="/admin", tags=["service"])


def _dict_value(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _get_commercial_service(request: Request) -> CommercialService:
    services = get_cloud_services(request)
    return CommercialService(services.settings.database_url, settings=services.settings)


def _service_error_response(
    error: CommercialServiceError,
    *,
    request: Request,
) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content=build_envelope(
            status="error",
            error_code=error.error_code,
            message=error.message,
            data=error.data,
            trace_id=extract_trace_id(request.headers.get("traceparent", "")),
            revision="m6",
        ),
    )


def _build_audit_context(request: Request) -> ServiceAuditContext:
    return ServiceAuditContext(
        trace_id=extract_trace_id(request.headers.get("traceparent", "")),
        idempotency_key=request.headers.get("Idempotency-Key", "").strip(),
        method=request.method,
        path=request.url.path,
        actor_kind=str(getattr(request.state, "internal_actor_kind", "internal_token")),
        actor_ref=str(getattr(request.state, "internal_actor_ref", "internal")),
    )


def _build_audit_filters(
    *,
    account_id: str | None = None,
    event_kind: str | None = None,
    outcome: str | None = None,
    idempotency_key: str | None = None,
    scope_kind: str | None = None,
    scope_id: str | None = None,
) -> dict[str, str]:
    filters: dict[str, str] = {}
    for key, value in (
        ("account_id", account_id),
        ("event_kind", event_kind),
        ("outcome", outcome),
        ("idempotency_key", idempotency_key),
        ("scope_kind", scope_kind),
        ("scope_id", scope_id),
    ):
        if value:
            filters[key] = str(value)
    return filters


def _build_operator_receipt(
    *,
    event_kind: str,
    scope_kind: str,
    scope_id: str,
    outcome: str,
    effective_summary: str,
    audit_state: Literal["persisted", "unavailable", "not_applicable"],
    account_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    return {
        "event_kind": event_kind,
        "scope_kind": scope_kind,
        "scope_id": scope_id,
        "outcome": outcome,
        "effective_summary": effective_summary,
        "audit_state": audit_state,
        "audit_filters": _build_audit_filters(
            account_id=account_id,
            event_kind=event_kind,
            outcome=outcome,
            idempotency_key=idempotency_key,
            scope_kind=scope_kind,
            scope_id=scope_id,
        ),
    }


def _merge_receipt(data: Any, receipt: dict[str, Any]) -> Any:
    if isinstance(data, dict):
        return {**data, "receipt": receipt}
    return {"value": data, "receipt": receipt}


def _record_service_failure(
    request: Request,
    *,
    event_kind: str,
    error: CommercialServiceError,
    subscription_id: str | None = None,
    scope_kind: str | None = None,
    scope_id: str | None = None,
) -> None:
    try:
        _get_commercial_service(request).record_service_audit_event(
            audit_context=_build_audit_context(request),
            event_kind=event_kind,
            outcome="error",
            subscription_id=subscription_id,
            scope_kind=scope_kind,
            scope_id=scope_id,
            payload_json={
                "error_code": error.error_code,
                "message": error.message,
                "request": {},
            },
        )
    except Exception:
        return


@router.get("/subscriptions")
async def list_admin_subscriptions(
    request: Request,
    status: str | None = Query(default=None),
    account_id: str | None = Query(default=None),
    customer: str | None = Query(default=None, max_length=191),
    plan_id: str | None = Query(default=None),
    expires_before: Annotated[datetime | None, Query()] = None,
    risk: Literal["all", "needs_action", "critical", "warning", "monitor", "stable"] = Query(
        default="all"
    ),
    sort: Literal["priority", "expiry", "customer"] = Query(default="priority"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    try:
        result = _get_commercial_service(request).list_admin_subscriptions(
            status=status,
            account_id=account_id,
            customer_query=customer,
            plan_id=plan_id,
            expires_before=expires_before,
            risk=risk,
            sort=sort,
            offset=offset,
            limit=limit,
        )
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    return build_envelope(
        status="ok",
        message="admin subscriptions loaded",
        data=result,
        revision="m6",
    )


@router.get("/subscriptions/{subscription_id}")
async def get_admin_subscription(
    request: Request,
    subscription_id: str,
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    try:
        result = _get_commercial_service(request).get_admin_subscription(subscription_id)
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    site_id = str(_dict_value(result.get("site")).get("site_id") or "")
    account_id = str(_dict_value(result.get("account")).get("account_id") or "")
    result["related_surfaces"] = {
        "site_href": f"/admin/sites/{site_id}" if site_id else "",
        "account_href": f"/admin/accounts/{account_id}" if account_id else "",
        "audit_href": (
            f"/api/admin/audit-events?site_id={site_id}&account_id={account_id}&limit=20"
            if site_id or account_id
            else ""
        ),
    }
    result["commercial_follow_up"] = {
        "lifecycle_posture": (
            "Read current status and grace posture first; commercial follow-up "
            "should lead before runtime debugging when the subscription is degraded."
        ),
        "snapshot_reconciliation_summary": (
            "Use site detail and filtered audit evidence to confirm whether "
            "snapshot posture and current operational impact are still aligned."
        ),
        "next_operator_follow_up": (
            "Open site detail for runtime and entitlement impact, or customer "
            "detail for support scope."
        ),
    }
    return build_envelope(
        status="ok",
        message="admin subscription loaded",
        data=result,
        revision="m6",
    )


@router.post("/subscriptions/{subscription_id}/billing-snapshots/rebuild")
async def rebuild_admin_subscription_billing_snapshots(
    request: Request,
    subscription_id: str,
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    service = _get_commercial_service(request)
    audit_context = _build_audit_context(request)
    try:
        result = service.rebuild_subscription_billing_snapshots(
            subscription_id,
            audit_context=audit_context,
        )
    except CommercialServiceError as error:
        _record_service_failure(
            request,
            event_kind="subscription.billing_snapshot.rebuild",
            error=error,
            subscription_id=subscription_id,
            scope_kind="subscription",
            scope_id=subscription_id,
        )
        return _service_error_response(error, request=request)
    return build_envelope(
        status="ok",
        message="subscription billing snapshots rebuilt",
        data=_merge_receipt(
            result,
            _build_operator_receipt(
                event_kind="subscription.billing_snapshot.rebuild",
                scope_kind="subscription",
                scope_id=subscription_id,
                outcome="succeeded",
                audit_state="persisted",
                effective_summary=(
                    f"Billing snapshots for subscription {subscription_id} were rebuilt "
                    "from usage records."
                ),
                account_id=str(_dict_value(result.get("subscription")).get("account_id") or ""),
                idempotency_key=audit_context.idempotency_key,
            ),
        ),
        revision="m6",
    )
