"""Portal factor transport for login and authenticated factor management.

No idempotency claims: one-shot secrets never enter generic receipts. Browser
credentials use a separate HttpOnly cookie and are never ordinary Bearer tokens.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.auth import (
    PortalBearerTokenError,
    _enforce_portal_request_rate_limit,
    get_cloud_services,
)
from app.api.browser_security import enforce_browser_same_origin
from app.api.envelope import build_envelope
from app.api.portal_session import (
    authenticated_session,
    clear_portal_session_cookies,
    portal_cookie_secure,
    portal_json_error,
    resolve_portal_request_context,
    serialize_portal_session,
    set_portal_session_cookies,
)
from app.domain.commercial.errors import CommercialServiceError
from app.domain.portal_sessions.service import IssuedPortalSession
from app.domain.portal_totp.contracts import RestrictedChallenge
from app.domain.portal_totp.service import challenge_status, complete, start_management

PREFIX = "/portal/v1/totp"
CHALLENGE_COOKIE = "portal_totp_challenge"
router = APIRouter(prefix=PREFIX, tags=["portal"])
# Composed alongside the login/management router with the account consumer.
setup_router = APIRouter(prefix=PREFIX, tags=["portal"])
PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "Pragma": "no-cache",
    "Vary": "Cookie, Authorization",
}


class TotpCacheMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not (
            path == PREFIX
            or path.startswith(PREFIX + "/")
            or path.startswith("/portal/v1/auth/")
            or path == "/portal/v1/register/verify"
            or path == "/open/auth/qq/callback"
        ):
            await self.app(scope, receive, send)
            return
        started = False

        async def private_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() not in (b"cache-control", b"pragma")
                ]
                headers.extend((k.lower().encode(), v.encode()) for k, v in PRIVATE_HEADERS.items())
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, private_send)
        except Exception:
            if started or not path.startswith(PREFIX):
                raise
            await JSONResponse(
                build_envelope(
                    status="error",
                    error_code="portal.factor_unavailable",
                    message="Authentication unavailable",
                ),
                status_code=503,
                headers=PRIVATE_HEADERS,
            )(scope, receive, send)


def set_challenge(request: Request, response: Response, challenge: RestrictedChallenge) -> None:
    response.set_cookie(
        CHALLENGE_COOKIE,
        challenge.credential,
        max_age=300,
        httponly=True,
        secure=portal_cookie_secure(request),
        samesite="lax",
        path="/",
    )


def clear_challenge(response: Response) -> None:
    response.delete_cookie(CHALLENGE_COOKIE, path="/", httponly=True, samesite="lax")


def restricted_response(
    request: Request, challenge: RestrictedChallenge, *, html: bool = False
) -> Response:
    from fastapi.responses import RedirectResponse

    response = (
        RedirectResponse("/portal/challenge", status_code=303)
        if html
        else JSONResponse(build_envelope(status="ok", data=challenge.projection()))
    )
    clear_portal_session_cookies(response)
    set_challenge(request, response, challenge)
    return response


class ProofPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=160)
    method: Literal["totp", "recovery_code"] = "totp"


class SetupPayload(ProofPayload):
    setup_id: str = Field(min_length=1, max_length=64)


def _guard(request: Request) -> None:
    enforce_browser_same_origin(request)
    # Persisted across replacement challenges and processes; direct peer is the
    # trusted transport scope, not arbitrary forwarded headers.
    _enforce_portal_request_rate_limit(
        request,
        scopes=(("portal_factor_ip", request.client.host if request.client else "unknown", 60),),
        error_code="auth.portal_factor_rate_limited",
        window_seconds=900,
    )


def _error(
    request: Request, error: CommercialServiceError | PortalBearerTokenError
) -> JSONResponse:
    data = None
    if error.error_code == "auth.portal_factor_invalid":
        if isinstance(error, CommercialServiceError) and error.data:
            data = error.data
        else:
            data = {"challenge_status": "terminal"}
    return portal_json_error(
        request,
        status_code=401 if error.error_code == "auth.portal_session_revoked" else error.status_code,
        error_code=error.error_code,
        message="Authentication failed",
        data=data,
    )


async def _start(request: Request, purpose: str) -> Response:
    try:
        _guard(request)
        auth = await resolve_portal_request_context(
            request, require_idempotency=False, allow_session_cookies=True
        )
        if isinstance(auth, JSONResponse):
            return auth
        identity = authenticated_session(auth)
        # Principal budget is also inside the locked domain transaction.
        _enforce_portal_request_rate_limit(
            request,
            scopes=(("portal_factor_principal", identity.principal_id, 30),),
            error_code="auth.portal_factor_rate_limited",
            window_seconds=900,
        )
        data = await run_in_threadpool(
            start_management, get_cloud_services(request).settings, identity, purpose
        )
        challenge = data.pop("_challenge")
        assert isinstance(challenge, RestrictedChallenge)
        response = JSONResponse(build_envelope(status="ok", data=data))
        set_challenge(request, response, challenge)
        return response
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)


async def _complete(request: Request, payload: ProofPayload, purpose: str) -> Response:
    try:
        _guard(request)
        identity = None
        if purpose != "login":
            auth = await resolve_portal_request_context(
                request, require_idempotency=False, allow_session_cookies=True
            )
            if isinstance(auth, JSONResponse):
                return auth
            identity = authenticated_session(auth)
        result = await run_in_threadpool(
            complete,
            get_cloud_services(request).settings,
            request.cookies.get(CHALLENGE_COOKIE, ""),
            payload.code,
            purpose=purpose,
            method=payload.method,
            identity=identity,
            setup_id=payload.setup_id if isinstance(payload, SetupPayload) else "",
        )
        issued = result.pop("_portal_session")
        assert isinstance(issued, IssuedPortalSession)
        data = serialize_portal_session(
            request,
            principal_id=issued.principal_id,
            site_id="",
            strict_site=False,
            session_metadata=issued.metadata(),
        )
        data.update(result)
        response = JSONResponse(build_envelope(status="ok", data=data))
        clear_challenge(response)
        set_portal_session_cookies(request, response, issued=issued)
        return response
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)


@router.post("/challenge/complete")
async def complete_login(request: Request, payload: ProofPayload) -> Response:
    return await _complete(request, payload, "login")


@router.get("/challenge/status")
async def get_challenge_status(request: Request) -> Response:
    try:
        data = await run_in_threadpool(
            challenge_status,
            get_cloud_services(request).settings,
            request.cookies.get(CHALLENGE_COOKIE, ""),
        )
        return JSONResponse(build_envelope(status="ok", data=data), headers=PRIVATE_HEADERS)
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)


@router.post("/disable/start")
async def start_disable(request: Request) -> Response:
    return await _start(request, "disable")


@router.post("/disable/confirm")
async def confirm_disable(request: Request, payload: ProofPayload) -> Response:
    return await _complete(request, payload, "disable")


@router.post("/recovery-reset/start")
async def start_reset(request: Request) -> Response:
    return await _start(request, "recovery_reset")


@router.post("/recovery-reset/confirm")
async def confirm_reset(request: Request, payload: ProofPayload) -> Response:
    return await _complete(request, payload, "recovery_reset")


@setup_router.post("/setup/start")
async def start_setup(request: Request) -> Response:
    return await _start(request, "setup")


@setup_router.post("/setup/confirm")
async def confirm_setup(request: Request, payload: SetupPayload) -> Response:
    return await _complete(request, payload, "setup")


@router.get("/status")
async def factor_status(request: Request) -> Response:
    from sqlalchemy import func, select

    from app.core.db import get_session
    from app.core.models import PortalRecoveryCode
    from app.domain.portal_sessions.service import lock_login_scope, validate_registered_session
    from app.domain.portal_totp.service import lock_primary_factor

    auth = await resolve_portal_request_context(
        request, require_idempotency=False, allow_session_cookies=True
    )
    if isinstance(auth, JSONResponse):
        return auth
    identity = authenticated_session(auth)

    def read_status() -> dict[str, object]:
        with get_session(get_cloud_services(request).settings.database_url) as session:
            lock_login_scope(session, identity.principal_id)
            factor = lock_primary_factor(session, identity.principal_id)
            validate_registered_session(session, identity, for_update=True)
            enabled = factor is not None and factor.state == "enabled"
            remaining = (
                session.scalar(
                    select(func.count())
                    .select_from(PortalRecoveryCode)
                    .where(
                        PortalRecoveryCode.principal_id == identity.principal_id,
                        PortalRecoveryCode.factor_version == factor.factor_version,
                        PortalRecoveryCode.generation == factor.recovery_generation,
                        PortalRecoveryCode.consumed_at.is_(None),
                    )
                )
                if enabled and factor is not None
                else 0
            )
            return {"enabled": enabled, "recovery_codes_remaining": remaining}

    try:
        data = await run_in_threadpool(read_status)
        return JSONResponse(build_envelope(status="ok", data=data))
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)
