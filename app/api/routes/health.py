from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.api.auth import authorize_internal_request
from app.api.envelope import build_envelope
from app.core.deployment_identity import DeploymentIdentity
from app.core.services import CloudServices
from app.domain.observability.service import ObservabilityService

router = APIRouter(prefix="/health", tags=["health"])


def _get_services(request: Request) -> CloudServices:
    services = getattr(request.app.state, "services", None)
    if services is None:
        raise RuntimeError("Cloud services are not configured.")
    return cast(CloudServices, services)


@router.get("/live")
async def live(request: Request, response: Response) -> dict[str, object]:
    services = _get_services(request)
    payload = await services.get_live_payload()
    deployment = DeploymentIdentity.from_settings(services.settings)
    response.headers["X-Npcink-Release"] = deployment.release
    response.headers["X-Npcink-Revision"] = deployment.short_revision
    response.headers["X-Npcink-Dirty"] = str(deployment.source_dirty).lower()

    return build_envelope(
        status="ok",
        message="service is live",
        data=payload,
    )


@router.get("/ready")
async def ready(request: Request) -> JSONResponse:
    auth = await authorize_internal_request(
        request,
        require_idempotency=False,
    )
    if auth is not None:
        return auth

    services = _get_services(request)
    deployment = DeploymentIdentity.from_settings(services.settings)
    report = await services.get_ready_report()
    status_code = 200 if report.ok else 503
    status = "ok" if report.ok else "error"
    error_code = "" if report.ok else "health.dependency_unavailable"
    message = "dependencies are ready" if report.ok else "dependency check failed"

    return JSONResponse(
        status_code=status_code,
        content=build_envelope(
            status=status,
            error_code=error_code,
            message=message,
            data={
                "checks": report.checks,
                "details": report.details,
                "deployment": deployment.internal_payload(),
            },
        ),
    )


@router.get("/operational-ready")
async def operational_ready(request: Request) -> JSONResponse:
    auth = await authorize_internal_request(
        request,
        require_idempotency=False,
    )
    if auth is not None:
        return auth

    services = _get_services(request)
    ready_report = await services.get_ready_report()
    report = ObservabilityService(services.settings).build_operational_readiness(
        ready_report=ready_report,
    )
    status_code = 200 if bool(report.get("ok")) else 503
    status = "ok" if bool(report.get("ok")) else "error"
    error_code = "" if bool(report.get("ok")) else "health.operational_not_ready"
    message = (
        "service is operationally ready"
        if bool(report.get("ok"))
        else "service is not operationally ready"
    )
    return JSONResponse(
        status_code=status_code,
        content=build_envelope(
            status=status,
            error_code=error_code,
            message=message,
            data=report,
        ),
    )
