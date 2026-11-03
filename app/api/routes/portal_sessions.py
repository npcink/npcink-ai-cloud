"""Own-principal session management, without site/owner or token projections."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.auth import PortalBearerTokenError, get_cloud_services
from app.api.browser_security import enforce_browser_same_origin
from app.api.envelope import build_envelope
from app.api.portal_session import (
    authenticated_session,
    clear_portal_session_cookies,
    portal_idempotency_replay_response,
    portal_json_error,
    resolve_portal_request_context,
)
from app.core.security import extract_trace_id
from app.domain.commercial.errors import CommercialServiceError
from app.domain.portal_sessions.service import (
    list_principal_sessions,
    revalidate_session_caller,
    revoke_principal_sessions,
)

PREFIX = "/portal/v1/sessions"
router = APIRouter(prefix=PREFIX, tags=["portal"])
PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "Pragma": "no-cache",
    "Vary": "Cookie, Authorization",
}


class PortalSessionsCacheMiddleware:
    """Headers also cover framework/early-auth/receipt/error exits on this seam."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not (path == PREFIX or path.startswith(PREFIX + "/")):
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
                    if k.lower() not in (b"cache-control", b"pragma", b"vary")
                ]
                vary = {b"cookie": "Cookie", b"authorization": "Authorization"}
                for key, value in message.get("headers", []):
                    if key.lower() == b"vary":
                        for name in value.decode("latin-1").split(","):
                            if name.strip():
                                vary[name.strip().lower().encode()] = name.strip()
                headers.extend(
                    (key.lower().encode(), value.encode())
                    for key, value in PRIVATE_HEADERS.items()
                    if key != "Vary"
                )
                headers.append((b"vary", ", ".join(vary.values()).encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, private_send)
        except Exception:
            if started:
                raise
            await JSONResponse(
                build_envelope(
                    status="error",
                    error_code="portal.sessions_unavailable",
                    message="Session management unavailable",
                ),
                status_code=503,
                headers=PRIVATE_HEADERS,
            )(scope, receive, send)


def _response(request: Request, data: dict[str, object]) -> JSONResponse:
    return JSONResponse(
        build_envelope(
            status="ok",
            data=data,
            trace_id=extract_trace_id(request.headers.get("traceparent", "")),
            revision="m7",
        )
    )


def _error(
    request: Request, error: CommercialServiceError | PortalBearerTokenError
) -> JSONResponse:
    status = 401 if error.error_code == "auth.portal_session_revoked" else error.status_code
    return portal_json_error(
        request, status_code=status, error_code=error.error_code, message=error.message
    )


@router.get("")
async def list_sessions(request: Request) -> Response:
    auth = await resolve_portal_request_context(
        request, require_idempotency=False, allow_session_cookies=True
    )
    if isinstance(auth, JSONResponse):
        return auth
    try:
        values = {}
        for name, default in (("limit", "20"), ("offset", "0")):
            raw = request.query_params.get(name, default)
            if len(raw) > 10 or not raw.isascii() or not raw.isdecimal():
                raise ValueError
            values[name] = int(raw)
        if not 1 <= values["limit"] <= 50 or values["offset"] < 0:
            raise ValueError
    except ValueError:
        return portal_json_error(
            request,
            status_code=400,
            error_code="portal.sessions_pagination_invalid",
            message="Invalid pagination",
        )
    try:
        page = await run_in_threadpool(
            list_principal_sessions,
            get_cloud_services(request).settings.database_url,
            authenticated_session(auth),
            limit=values["limit"],
            offset=values["offset"],
        )
        items = []
        for item in page.items:
            projection = asdict(item)
            for name, value in projection.items():
                if isinstance(value, datetime):
                    projection[name] = value.isoformat().replace("+00:00", "Z")
            items.append(projection)
        return _response(
            request,
            {
                "items": items,
                "pagination": {"limit": page.limit, "offset": page.offset, "total": page.total},
            },
        )
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)
    except SQLAlchemyError:
        return portal_json_error(
            request,
            status_code=503,
            error_code="portal.sessions_unavailable",
            message="Session management unavailable",
        )


async def _revoke(request: Request, target: str | None) -> Response:
    try:
        enforce_browser_same_origin(request)
    except PortalBearerTokenError as error:
        return _error(request, error)
    auth = await resolve_portal_request_context(
        request, require_idempotency=True, allow_session_cookies=True
    )
    if isinstance(auth, JSONResponse):
        return auth
    try:
        identity = authenticated_session(auth)
        database_url = get_cloud_services(request).settings.database_url
        replay = portal_idempotency_replay_response(request)
        if replay is not None:
            await run_in_threadpool(revalidate_session_caller, database_url, identity)
            # Self-revocation invalidated that caller; its retry fails auth.
            # Never replay another caller's cookie-clearing header from a receipt.
            return replay
        result = await run_in_threadpool(
            revoke_principal_sessions, database_url, identity, target_session_id=target
        )
        response = _response(request, {"revoked_count": result.revoked_count})
        if result.is_current:
            clear_portal_session_cookies(response)
        return response
    except (CommercialServiceError, PortalBearerTokenError) as error:
        return _error(request, error)
    except SQLAlchemyError:
        return portal_json_error(
            request,
            status_code=503,
            error_code="portal.sessions_unavailable",
            message="Session management unavailable",
        )


# Static route deliberately precedes the target command.
@router.post("/revoke-others")
async def revoke_others(request: Request) -> Response:
    return await _revoke(request, None)


@router.post("/{session_id}/revoke")
async def revoke_session(request: Request, session_id: str) -> Response:
    return await _revoke(request, session_id)
