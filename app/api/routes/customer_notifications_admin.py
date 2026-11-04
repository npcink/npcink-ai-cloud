"""Admin-only service notices. No email, scheduler or WordPress writes."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_internal_request, get_cloud_services
from app.api.envelope import build_envelope
from app.api.routes.commercial_subscriptions_admin import (
    _build_audit_context,
    _service_error_response,
)
from app.domain.commercial.customer_notifications import (
    get_notice,
    list_notices,
    preview_notice,
    send_notice,
)
from app.domain.commercial.errors import CommercialServiceError

router = APIRouter(prefix="/admin/customer-notifications", tags=["service"])
NoticeId = Annotated[str, StringConstraints(pattern=r"^notice_[a-f0-9]{32}$")]
AccountId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=191)]


class NoticePreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dispatch_id: NoticeId
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    link_href: Literal[
        "", "/portal", "/portal/account", "/portal/billing", "/portal/usage", "/portal/support"
    ] = ""
    audience: Literal["selected", "all"]
    account_ids: list[AccountId] = Field(default_factory=list, max_length=1000)


@router.get("")
async def list_customer_notices(
    request: Request, limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    result = await run_in_threadpool(
        list_notices, get_cloud_services(request).settings.database_url, limit=limit, offset=offset
    )
    return build_envelope(status="ok", message="notices loaded", data=result, revision="m6")


@router.post("")
async def preview_customer_notice(request: Request, payload: NoticePreviewPayload) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    try:
        result = await run_in_threadpool(
            preview_notice,
            get_cloud_services(request).settings.database_url,
            **payload.model_dump(),
            context=_build_audit_context(request),
        )
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    return build_envelope(status="ok", message="notice preview saved", data=result, revision="m6")


@router.get("/{dispatch_id}")
async def get_customer_notice(request: Request, dispatch_id: NoticeId) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    try:
        result = await run_in_threadpool(
            get_notice, get_cloud_services(request).settings.database_url, dispatch_id
        )
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    return build_envelope(status="ok", message="notice loaded", data=result, revision="m6")


@router.post("/{dispatch_id}/send")
async def send_customer_notice(request: Request, dispatch_id: NoticeId) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    try:
        result = await run_in_threadpool(
            send_notice,
            get_cloud_services(request).settings.database_url,
            dispatch_id=dispatch_id,
            context=_build_audit_context(request),
        )
    except CommercialServiceError as error:
        return _service_error_response(error, request=request)
    return build_envelope(
        status="ok", message="notice committed to inbox", data=result, revision="m6"
    )
