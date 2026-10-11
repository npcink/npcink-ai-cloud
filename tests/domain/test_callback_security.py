from __future__ import annotations

import socket

import httpx
import pytest

from app.adapters.callbacks.base import RuntimeCallbackDispatchError, RuntimeCallbackDispatchRequest
from app.adapters.callbacks.http import HttpRuntimeCallbackDispatcher
from app.core.callback_security import (
    RuntimeCallbackTargetValidationError,
    resolve_runtime_callback_target,
    validate_runtime_callback_target,
)


def test_callback_target_requires_https() -> None:
    with pytest.raises(RuntimeCallbackTargetValidationError):
        validate_runtime_callback_target("http://callbacks.magick.test/runtime")


def test_callback_target_rejects_private_ip_literal() -> None:
    with pytest.raises(RuntimeCallbackTargetValidationError):
        validate_runtime_callback_target("https://127.0.0.1/runtime")


def test_callback_target_rejects_domain_resolving_to_private_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_getaddrinfo(*args, **kwargs):  # type: ignore[no-untyped-def]
        del args, kwargs
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.8", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    with pytest.raises(RuntimeCallbackTargetValidationError):
        validate_runtime_callback_target("https://callbacks.magick.test/runtime")


def test_http_callback_dispatcher_rejects_invalid_target_before_dispatch() -> None:
    dispatcher = HttpRuntimeCallbackDispatcher(
        transport=httpx.MockTransport(lambda request: httpx.Response(204)),
    )

    with pytest.raises(RuntimeCallbackDispatchError) as error:
        dispatcher.dispatch(
            RuntimeCallbackDispatchRequest(
                callback_url="http://callbacks.magick.test/runtime",
                event="runtime.run.terminal",
                run_id="run_test",
                trace_id="trace-test",
                site_id="site_test",
                payload={"status": "succeeded"},
                key_id="",
                secret="",
            )
        )

    assert error.value.error_code == "runtime.callback_target_invalid"
    assert "callback_url must use https" in str(error.value)


def test_http_callback_dispatcher_pins_validated_ip_and_preserves_host_and_sni(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolution_calls = 0
    requests: list[httpx.Request] = []

    def fake_getaddrinfo(*args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal resolution_calls
        del args, kwargs
        resolution_calls += 1
        address = "93.184.216.34" if resolution_calls == 1 else "10.0.0.8"
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    dispatcher = HttpRuntimeCallbackDispatcher(
        transport=httpx.MockTransport(
            lambda request: requests.append(request) or httpx.Response(204)
        )
    )

    result = dispatcher.dispatch(
        RuntimeCallbackDispatchRequest(
            callback_url="https://callbacks.magick.test:8443/runtime?source=cloud",
            event="runtime.run.terminal",
            run_id="run_pinned",
            trace_id="trace-pinned",
            site_id="site_pinned",
            payload={"status": "succeeded"},
            key_id="",
            secret="",
        )
    )

    assert result.status_code == 204
    assert resolution_calls == 1
    assert len(requests) == 1
    assert str(requests[0].url) == "https://93.184.216.34:8443/runtime?source=cloud"
    assert requests[0].headers["host"] == "callbacks.magick.test:8443"
    assert requests[0].headers["connection"] == "close"
    assert requests[0].extensions["sni_hostname"] == "callbacks.magick.test"


def test_callback_target_selects_a_stable_public_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.35", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", 443)),
        ],
    )

    target = resolve_runtime_callback_target("https://callbacks.magick.test/runtime")

    assert str(target.ip_address) == "93.184.216.34"
