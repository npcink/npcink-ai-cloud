from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.api.envelope import build_envelope
from app.api.routes.portal import finish_portal_qq_login

router = APIRouter(prefix="/open", tags=["open"])


def _not_enabled(
    *,
    error_code: str,
    message: str,
    data: dict[str, Any],
) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content=build_envelope(
            status="error",
            error_code=error_code,
            message=message,
            data={
                **data,
                "mutation_applied": False,
                "credential_value_exposure": "none",
            },
            revision="m7",
        ),
    )


@router.get("/auth/qq/callback")
async def finish_open_qq_login(
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
) -> Any:
    return await finish_portal_qq_login(request, code=code, state=state)


@router.get("/auth/wechat/callback")
async def finish_open_wechat_login(
    code: str = Query(default=""),
    state: str = Query(default=""),
) -> Any:
    return _not_enabled(
        error_code="open.wechat_login_not_enabled",
        message="WeChat login callback is reserved but not enabled",
        data={
            "surface": "open_auth_callback",
            "provider": "wechat",
            "callback_kind": "oauth_login",
            "code_received": bool(str(code or "").strip()),
            "state_received": bool(str(state or "").strip()),
        },
    )


@router.post("/payments/alipay/notify")
async def receive_open_alipay_payment_notify() -> Any:
    return _not_enabled(
        error_code="open.alipay_payment_notify_not_enabled",
        message="Alipay payment notify callback is reserved but not enabled",
        data={
            "surface": "open_payment_notify",
            "provider": "alipay",
            "callback_kind": "payment_notify",
        },
    )


@router.get("/payments/alipay/return")
async def receive_open_alipay_payment_return() -> Any:
    return _not_enabled(
        error_code="open.alipay_payment_return_not_enabled",
        message="Alipay payment return callback is reserved but not enabled",
        data={
            "surface": "open_payment_return",
            "provider": "alipay",
            "callback_kind": "payment_return",
        },
    )


@router.post("/payments/wechat/notify")
async def receive_open_wechat_payment_notify() -> Any:
    return _not_enabled(
        error_code="open.wechat_payment_notify_not_enabled",
        message="WeChat Pay notify callback is reserved but not enabled",
        data={
            "surface": "open_payment_notify",
            "provider": "wechat_pay",
            "callback_kind": "payment_notify",
        },
    )
