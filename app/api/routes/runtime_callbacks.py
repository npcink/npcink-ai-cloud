from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_public_request, get_cloud_services
from app.api.envelope import build_envelope
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import CommercialServiceError
from app.domain.commercial.service import CommercialService

router = APIRouter(prefix="/v1/runtime/callbacks", tags=["runtime-callbacks"])


class TerminalCallbackRegistrationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["runtime_terminal_callback_registration.v1"]
    enabled: bool
    callback_url: str = Field(default="", max_length=2048)
    key_id: str = Field(default="", pattern=r"^[A-Za-z0-9._:-]{0,128}$")
    secret: SecretStr | None = Field(default=None)
    registration_id: str = Field(default="", pattern=r"^[A-Za-z0-9._:-]{0,128}$")

    @model_validator(mode="after")
    def validate_enabled_registration(self) -> TerminalCallbackRegistrationPayload:
        secret = self.secret.get_secret_value() if self.secret is not None else ""
        if self.enabled and (
            not self.callback_url.strip()
            or not self.key_id.strip()
            or len(secret) < 32
            or not self.registration_id.strip()
        ):
            raise ValueError(
                "enabled callback registration requires callback_url, key_id, "
                "a secret of at least 32 characters, and registration_id"
            )
        if len(secret) > 512:
            raise ValueError("callback secret exceeds the accepted length")
        return self


def _error_response(request: Request, error: CommercialServiceError, trace_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content=build_envelope(
            status="error",
            error_code=error.error_code,
            message=error.message,
            data=error.data,
            trace_id=trace_id,
            revision="m1",
        ),
    )


@router.post("/terminal")
async def put_terminal_callback_registration(
    request: Request,
    payload: TerminalCallbackRegistrationPayload,
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=True,
        required_scope="runtime:execute",
    )
    if isinstance(auth, JSONResponse):
        return auth

    secret = payload.secret.get_secret_value() if payload.secret is not None else ""
    terminal_callback: dict[str, object] = (
        {
            "enabled": True,
            "callback_url": payload.callback_url.strip(),
            "key_id": payload.key_id.strip(),
            "secret": secret,
            "registration_id": payload.registration_id.strip(),
        }
        if payload.enabled
        else {"enabled": False}
    )
    service = CommercialService(
        get_cloud_services(request).settings.database_url,
        settings=get_cloud_services(request).settings,
    )
    try:
        result = await run_in_threadpool(
            service.update_site_runtime_callbacks,
            site_id=auth.site_id,
            terminal_callback=terminal_callback,
            audit_context=ServiceAuditContext(
                trace_id=auth.trace_id,
                idempotency_key=auth.idempotency_key,
                method=request.method,
                path=request.url.path,
                actor_kind="site_key_operator",
                actor_ref=auth.key_id,
            ),
        )
    except CommercialServiceError as error:
        return _error_response(request, error, auth.trace_id)

    return JSONResponse(
        content=build_envelope(
            status="ok",
            message=(
                "terminal callback registered"
                if payload.enabled
                else "terminal callback disabled"
            ),
            data={
                "contract_version": "runtime_terminal_callback_registration.v1",
                **result,
            },
            trace_id=auth.trace_id,
            revision="m1",
        )
    )
