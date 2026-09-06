from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.api.auth import authorize_internal_request, get_cloud_services
from app.api.envelope import build_envelope
from app.core.security import extract_trace_id
from app.domain.commercial.service import CommercialService, ServiceAuditContext
from app.domain.site_compliance import (
    SITE_COMPLIANCE_SETTING_ID,
    SiteComplianceAdminError,
    SiteComplianceAdminService,
)

router = APIRouter(prefix="/admin/site-compliance")


class SiteComplianceDraftPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any]


def _dict_value(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list_value(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _audit_context(request: Request) -> ServiceAuditContext:
    return ServiceAuditContext(
        trace_id=extract_trace_id(request.headers.get("traceparent", "")),
        idempotency_key=request.headers.get("Idempotency-Key", "").strip(),
        method=request.method,
        path=request.url.path,
        actor_kind=str(getattr(request.state, "internal_actor_kind", "internal_token")),
        actor_ref=str(getattr(request.state, "internal_actor_ref", "internal")),
    )


def _record_audit(
    request: Request,
    *,
    event_kind: str,
    outcome: str,
    result: dict[str, Any] | None = None,
    error_code: str = "",
    message: str = "",
) -> None:
    data = result or {}
    draft = _dict_value(data.get("draft"))
    published = _dict_value(data.get("published"))
    validation = _dict_value(draft.get("validation"))
    try:
        services = get_cloud_services(request)
        CommercialService(
            services.settings.database_url,
            settings=services.settings,
        ).record_service_audit_event(
            audit_context=_audit_context(request),
            event_kind=event_kind,
            outcome=outcome,
            scope_kind="service_setting",
            scope_id=SITE_COMPLIANCE_SETTING_ID,
            payload_json={
                "surface": "admin_site_compliance",
                "draft_version_id": str(draft.get("version_id") or ""),
                "published_version_id": str(published.get("version_id") or ""),
                "blocker_count": len(_list_value(validation.get("blockers"))),
                "warning_count": len(_list_value(validation.get("warnings"))),
                "error_code": error_code,
                "message": message,
                "content_exposed": False,
                "credential_value_exposure": "none",
            },
        )
    except Exception:
        return


@router.get("")
async def get_admin_site_compliance(request: Request) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    services = get_cloud_services(request)
    result = SiteComplianceAdminService(
        services.settings.database_url,
        services.settings,
    ).get_workspace()
    return build_envelope(
        status="ok",
        message="site compliance workspace loaded",
        data=result,
        revision="site-compliance-admin-v1",
    )


@router.put("/draft")
async def save_admin_site_compliance_draft(
    request: Request,
    payload: SiteComplianceDraftPayload,
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    services = get_cloud_services(request)
    try:
        result = SiteComplianceAdminService(
            services.settings.database_url,
            services.settings,
        ).save_draft(payload.payload, actor_ref=_audit_context(request).actor_ref)
    except SiteComplianceAdminError as error:
        _record_audit(
            request,
            event_kind="site_compliance.draft.save",
            outcome="error",
            error_code=error.error_code,
            message=error.message,
        )
        return JSONResponse(
            status_code=error.status_code,
            content=build_envelope(
                status="error",
                error_code=error.error_code,
                message=error.message,
                revision="site-compliance-admin-v1",
            ),
        )
    _record_audit(
        request,
        event_kind="site_compliance.draft.save",
        outcome="succeeded",
        result=result,
    )
    return build_envelope(
        status="ok",
        message="site compliance draft saved",
        data=result,
        revision="site-compliance-admin-v1",
    )


@router.post("/publish")
async def publish_admin_site_compliance(request: Request) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    services = get_cloud_services(request)
    try:
        result = SiteComplianceAdminService(
            services.settings.database_url,
            services.settings,
        ).publish(actor_ref=_audit_context(request).actor_ref)
    except SiteComplianceAdminError as error:
        _record_audit(
            request,
            event_kind="site_compliance.publish",
            outcome="error",
            error_code=error.error_code,
            message=error.message,
        )
        return JSONResponse(
            status_code=error.status_code,
            content=build_envelope(
                status="error",
                error_code=error.error_code,
                message=error.message,
                revision="site-compliance-admin-v1",
            ),
        )
    _record_audit(
        request,
        event_kind="site_compliance.publish",
        outcome="succeeded",
        result=result,
    )
    return build_envelope(
        status="ok",
        message="site compliance published",
        data=result,
        revision="site-compliance-admin-v1",
    )
