"""Private, non-replayable current-principal download endpoints."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.adapters.notifications.base import PortalEmailDeliveryError
from app.adapters.notifications.smtp import build_portal_email_sender
from app.api.auth import (
    PortalBearerTokenError,
    get_cloud_services,
)
from app.api.browser_security import enforce_browser_same_origin
from app.api.envelope import build_envelope
from app.api.portal_locale import resolve_portal_email_locale
from app.api.portal_session import (
    portal_json_error,
    resolve_portal_request_context,
)
from app.domain.portal_data_export import DataExportError, execute_data_export

PREFIX = "/portal/v1/account/data-export"
PATHS = {f"{PREFIX}/code", f"{PREFIX}/confirm"}
router = APIRouter(prefix=PREFIX, tags=["portal"])
PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "Pragma": "no-cache",
    "Vary": "Cookie, Authorization",
}


class DataExportCacheMiddleware:
    """Covers route, framework/auth, method and unexpected-error exits alike."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") not in PATHS:
            await self.app(scope, receive, send)
            return
        started = False

        async def private_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = list(message.get("headers", []))
                vary = [v.decode("latin1") for k, v in headers if k.lower() == b"vary"]
                headers = [
                    (k, v)
                    for k, v in headers
                    if k.lower() not in (b"cache-control", b"pragma", b"vary")
                ]
                combined = ", ".join(dict.fromkeys([*vary, "Cookie", "Authorization"]))
                headers.extend(
                    [
                        (b"cache-control", b"private, no-store"),
                        (b"pragma", b"no-cache"),
                        (b"vary", combined.encode("latin1")),
                    ]
                )
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, private_send)
        except Exception:
            if started:
                raise
            # Never expose input or transport/SQL exception details.
            await JSONResponse(
                build_envelope(
                    status="error",
                    error_code="portal.data_export_unavailable",
                    message="Data copy unavailable",
                ),
                status_code=503,
                headers=PRIVATE_HEADERS,
            )(scope, receive, send)


async def _execute(request: Request, operation: str) -> Response:
    try:
        enforce_browser_same_origin(request)
    except PortalBearerTokenError as error:
        return portal_json_error(
            request,
            status_code=error.status_code,
            error_code=error.error_code,
            message=error.message,
        )
    auth = await resolve_portal_request_context(
        request, require_idempotency=False, allow_session_cookies=True
    )
    if isinstance(auth, JSONResponse):
        return auth
    services = get_cloud_services(request)
    if auth.expires_at is None:
        return portal_json_error(
            request,
            status_code=401,
            error_code="portal.data_export_session_invalid",
            message="Session unavailable",
        )
    # No Pydantic input reflection; malformed requests still debit purpose rate limits.
    payload: Any = None
    size = 0
    chunks: list[bytes] = []
    async for chunk in request.stream():
        size += len(chunk)
        if size > 2048:
            break
        chunks.append(chunk)
    if size <= 2048 and not request.url.query:
        try:
            payload = json.loads(b"".join(chunks))
        except (ValueError, UnicodeDecodeError):
            pass
    sender = services.portal_email_sender or build_portal_email_sender(
        services.settings, database_url=services.settings.database_url
    )
    try:
        result = await run_in_threadpool(
            execute_data_export,
            database_url=services.settings.database_url,
            principal_id=auth.principal_id,
            session_version=auth.session_version,
            session_id=auth.session_id,
            session_expires_at=auth.expires_at,
            site_id=auth.site_id,
            operation=operation,
            payload=payload,
            sender_available=bool(sender and getattr(sender, "supports_data_export", False)),
        )
        if operation == "confirm":
            assert isinstance(result, bytes)
            return Response(
                result,
                media_type="application/json",
                headers={
                    **PRIVATE_HEADERS,
                    "Content-Disposition": 'attachment; filename="cloud-personal-data.json"',
                },
            )
        assert isinstance(result, dict)
        assert sender is not None
        try:
            await run_in_threadpool(
                sender.send_data_export_code,
                recipient_email=result["email"],
                principal_id=auth.principal_id,
                code=result["code"],
                expires_in_seconds=300,
                project_name=services.settings.project_name,
                locale=resolve_portal_email_locale(request, payload.get("locale", "")),
            )
        except PortalEmailDeliveryError:
            raise DataExportError(502, "portal.data_export_delivery_failed") from None
        return JSONResponse(
            build_envelope(
                status="ok",
                data={"challenge_id": result["challenge_id"], "expires_in_seconds": 300},
            ),
            headers=PRIVATE_HEADERS,
        )
    except DataExportError as error:
        return portal_json_error(
            request,
            status_code=error.status,
            error_code=error.code,
            message="Personal data copy request could not be completed",
            headers=PRIVATE_HEADERS,
        )


@router.post("/code")
async def issue_code(request: Request) -> Response:
    return await _execute(request, "code")


@router.post("/confirm")
async def confirm_code(request: Request) -> Response:
    return await _execute(request, "confirm")
