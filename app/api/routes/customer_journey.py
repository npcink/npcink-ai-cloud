from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_public_request, get_cloud_services
from app.api.envelope import build_envelope
from app.domain.customer_journey.api_contracts import CustomerJourneyBatchPayload
from app.domain.customer_journey.contracts import (
    CustomerJourneyContractViolation,
)
from app.domain.customer_journey.service import CustomerJourneyService

router = APIRouter(prefix="/v1/customer-journey", tags=["customer-journey"])


def _service(request: Request) -> CustomerJourneyService:
    return CustomerJourneyService(get_cloud_services(request).settings.database_url)


@router.post("/events")
async def ingest_customer_journey_events(
    request: Request,
    payload: CustomerJourneyBatchPayload,
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=True,
        required_scope="stats:read",
    )
    if isinstance(auth, JSONResponse):
        return auth
    try:
        result = await run_in_threadpool(
            _service(request).ingest_events,
            site_id=auth.site_id,
            key_id=auth.key_id,
            events=[event.model_dump(mode="json", exclude_none=True) for event in payload.events],
        )
    except CustomerJourneyContractViolation as exc:
        return JSONResponse(
            status_code=400,
            content=build_envelope(
                status="error",
                error_code=exc.error_code,
                message=exc.message,
                trace_id=auth.trace_id,
                revision="m1",
            ),
        )
    return build_envelope(
        status="ok",
        message="customer journey metadata ingested",
        data=result,
        trace_id=auth.trace_id,
        revision="m1",
    )


@router.get("/summary")
async def get_customer_journey_summary(
    request: Request,
    window_hours: int = Query(default=24, ge=1, le=168),
    cohort_id: str = Query(default="", max_length=64, pattern=r"^[A-Za-z0-9._:-]*$"),
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=False,
        required_scope="stats:read",
    )
    if isinstance(auth, JSONResponse):
        return auth
    result = await run_in_threadpool(
        _service(request).get_summary,
        site_id=auth.site_id,
        window_hours=window_hours,
        cohort_id=cohort_id,
    )
    return build_envelope(
        status="ok",
        message="customer journey summary loaded",
        data=result,
        trace_id=auth.trace_id,
        revision="m1",
    )
