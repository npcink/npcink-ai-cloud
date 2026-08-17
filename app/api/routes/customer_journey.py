from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_public_request, get_cloud_services
from app.api.envelope import build_envelope
from app.domain.customer_journey.contracts import (
    ALLOWED_BROWSER_FAMILIES,
    ALLOWED_ERROR_CATEGORIES,
    ALLOWED_JOURNEYS,
    ALLOWED_STEPS,
    ALLOWED_SURFACES,
    ALLOWED_VIEWPORT_CLASSES,
    CUSTOMER_JOURNEY_CONTRACT_VERSION,
    CustomerJourneyContractViolation,
)
from app.domain.customer_journey.service import CustomerJourneyService

router = APIRouter(prefix="/v1/customer-journey", tags=["customer-journey"])


class CustomerJourneyEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=8, max_length=96, pattern=r"^[A-Za-z0-9._:-]+$")
    cohort_id: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9._:-]*$")
    anonymous_session_id: str = Field(
        min_length=16,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    )
    surface: str = Field(min_length=1, max_length=32)
    journey: str = Field(min_length=1, max_length=64)
    step: str = Field(min_length=1, max_length=32)
    error_category: str = Field(default="", max_length=32)
    error_code: str = Field(default="", max_length=96, pattern=r"^[a-z0-9._:-]*$")
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    run_id: str = Field(default="", max_length=191, pattern=r"^[A-Za-z0-9._:-]*$")
    browser_family: str = Field(default="", max_length=32)
    viewport_class: str = Field(default="", max_length=16)
    occurred_at: datetime

    @field_validator("surface")
    @classmethod
    def validate_surface(cls, value: str) -> str:
        if value not in ALLOWED_SURFACES:
            raise ValueError("surface is not supported")
        return value

    @field_validator("journey")
    @classmethod
    def validate_journey(cls, value: str) -> str:
        if value not in ALLOWED_JOURNEYS:
            raise ValueError("journey is not supported")
        return value

    @field_validator("step")
    @classmethod
    def validate_step(cls, value: str) -> str:
        if value not in ALLOWED_STEPS:
            raise ValueError("step is not supported")
        return value

    @field_validator("error_category")
    @classmethod
    def validate_error_category(cls, value: str) -> str:
        if value not in ALLOWED_ERROR_CATEGORIES:
            raise ValueError("error_category is not supported")
        return value

    @field_validator("browser_family")
    @classmethod
    def validate_browser_family(cls, value: str) -> str:
        if value not in ALLOWED_BROWSER_FAMILIES:
            raise ValueError("browser_family is not supported")
        return value

    @field_validator("viewport_class")
    @classmethod
    def validate_viewport_class(cls, value: str) -> str:
        if value not in ALLOWED_VIEWPORT_CLASSES:
            raise ValueError("viewport_class is not supported")
        return value


class CustomerJourneyBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["customer_journey_event.v1"] = cast(
        Literal["customer_journey_event.v1"],
        CUSTOMER_JOURNEY_CONTRACT_VERSION,
    )
    events: list[CustomerJourneyEventPayload] = Field(min_length=1, max_length=100)


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
