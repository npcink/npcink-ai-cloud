from __future__ import annotations

from typing import Any, Self

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.api.auth import authorize_public_request, get_cloud_services
from app.api.envelope import build_envelope
from app.domain.observability.plugin_events import (
    MONITORING_STATE_CONTRACT_VERSION,
    MONITORING_STATE_EVENT_KIND,
    MONITORING_STATE_PLUGIN_SLUG,
    PluginObservabilityService,
)

router = APIRouter(prefix="/v1/observability", tags=["observability"])

CONTRACT_VERSION = "magick-plugin-observability-v1"


class PluginEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="", max_length=32)
    plugin_slug: str = Field(min_length=1, max_length=64)
    plugin_version: str = Field(default="", max_length=64)
    source: str = Field(default="local", max_length=32)
    event_kind: str = Field(min_length=1, max_length=96)
    event_id: str = Field(default="", max_length=96)
    emitted_at: str = Field(default="", max_length=64)
    captured_at: str = Field(default="", max_length=64)
    status: str = Field(default="", max_length=32)
    status_detail: str = Field(default="", max_length=64)
    error_code: str = Field(default="", max_length=128)
    latency_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    ability_id: str = Field(default="", max_length=191)
    proposal_id: str = Field(default="", max_length=191)
    correlation_id: str = Field(default="", max_length=191)
    adapter_request_id: str = Field(default="", max_length=191)
    method: str = Field(default="", max_length=16)
    route: str = Field(default="", max_length=255)
    status_code: int | None = Field(default=None, ge=100, le=599)
    mode: str = Field(default="", max_length=64)
    deduplicated: bool | None = None
    proposal_count: int | None = Field(default=None, ge=0, le=100_000)
    blocked_count: int | None = Field(default=None, ge=0, le=100_000)
    executed_count: int | None = Field(default=None, ge=0, le=100_000)
    failed_count: int | None = Field(default=None, ge=0, le=100_000)
    quality_contract: str = Field(default="", max_length=64)
    quality_session_id: str = Field(default="", max_length=191)
    task_key: str = Field(default="", max_length=64)
    object_scope_hash: str = Field(default="", max_length=128)
    actor_scope_hash: str = Field(default="", max_length=128)
    outcome: str = Field(default="", max_length=64)
    outcome_confidence: str = Field(default="", max_length=32)
    save_kind: str = Field(default="", max_length=32)
    time_to_outcome_bucket: str = Field(default="", max_length=32)
    generation_sequence: int | None = Field(default=None, ge=1, le=100_000)
    content_storage: str = Field(default="", max_length=64)
    monitoring_state_contract: str = Field(default="", max_length=64)
    monitoring_enabled: bool | None = Field(default=None, strict=True)

    @model_validator(mode="after")
    def validate_monitoring_state_projection(self) -> Self:
        is_projection = self.event_kind == MONITORING_STATE_EVENT_KIND
        has_projection_fields = (
            bool(self.monitoring_state_contract) or self.monitoring_enabled is not None
        )
        if not is_projection:
            if has_projection_fields:
                raise ValueError("monitoring state fields require the monitoring state event kind")
            return self
        if (
            self.plugin_slug != MONITORING_STATE_PLUGIN_SLUG
            or self.monitoring_state_contract != MONITORING_STATE_CONTRACT_VERSION
            or self.monitoring_enabled is None
            or self.content_storage != "omitted_metadata_only"
        ):
            raise ValueError("monitoring state projection contract is invalid")
        return self


class PluginEventBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: str = Field(default=CONTRACT_VERSION, max_length=64)
    source: str = Field(default="npcink-cloud-addon", max_length=64)
    events: list[PluginEventPayload] = Field(min_length=1, max_length=100)


@router.post("/plugin-events")
async def ingest_plugin_events(
    request: Request,
    payload: PluginEventBatchPayload,
) -> Any:
    if payload.contract_version != CONTRACT_VERSION:
        return JSONResponse(
            status_code=400,
            content=build_envelope(
                status="error",
                error_code="observability.contract_version_unsupported",
                message="plugin observability contract_version is unsupported",
                data={"contract_version": payload.contract_version},
                revision="m1",
            ),
        )

    auth = await authorize_public_request(
        request,
        require_idempotency=True,
        required_scope="stats:read",
    )
    if isinstance(auth, JSONResponse):
        return auth

    services = get_cloud_services(request)
    result = PluginObservabilityService(services.settings.database_url).ingest_events(
        site_id=auth.site_id,
        key_id=auth.key_id,
        events=[event.model_dump(exclude_none=True) for event in payload.events],
    )

    return build_envelope(
        status="ok",
        message="plugin observability events ingested",
        data=result,
        trace_id=auth.trace_id,
        revision="m1",
    )


@router.get("/plugin-summary")
async def get_plugin_summary(
    request: Request,
    window_hours: int = Query(default=24, ge=1, le=168),
    plugin_slug: str = Query(default="", max_length=64),
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=False,
        required_scope="stats:read",
    )
    if isinstance(auth, JSONResponse):
        return auth

    services = get_cloud_services(request)
    result = PluginObservabilityService(services.settings.database_url).get_summary(
        site_id=auth.site_id,
        window_hours=window_hours,
        plugin_slug=plugin_slug.strip(),
    )

    return build_envelope(
        status="ok",
        message="plugin observability summary loaded",
        data=result,
        trace_id=auth.trace_id,
        revision="m1",
    )
