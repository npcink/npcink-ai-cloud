from __future__ import annotations

import hashlib
import socket
from dataclasses import replace

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


def _signed_request(**overrides: str) -> RuntimeCallbackDispatchRequest:
    request = RuntimeCallbackDispatchRequest(
        run_id="run_signing",
        trace_id="trace-signing",
        callback_url="https://callbacks.magick.test/runtime?source=cloud",
        payload={"status": "succeeded"},
        site_id="site_signing",
        key_id="key_signing",
        secret="synthetic-signing-secret",
        timestamp="100",
        callback_id="callback_1",
    )
    return replace(request, **overrides)


def test_batch_reuses_key_but_signs_each_attempt_and_rotation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.security import build_hmac_signature, build_secret_hash

    derivations: list[str] = []

    def derive(secret: str) -> str:
        derivations.append(secret)
        return build_secret_hash(secret)

    monkeypatch.setattr("app.adapters.callbacks.http.build_secret_hash", derive)
    dispatcher = HttpRuntimeCallbackDispatcher()
    signatures: list[str] = []
    requests = [
        _signed_request(),
        _signed_request(timestamp="101", callback_id="callback_2"),
        _signed_request(secret="rotated-synthetic-secret"),
        _signed_request(secret="rotated-synthetic-secret", site_id="other_site"),
        _signed_request(
            secret="rotated-synthetic-secret", site_id="other_site", key_id="other_key"
        ),
        _signed_request(),  # Returning to an older identity must miss the single-entry cache.
    ]
    with dispatcher.signing_batch():
        for i, request in enumerate(requests):
            body = f'{{"attempt":{i}}}'.encode()
            headers = dispatcher._build_headers(request, body=body)
            canonical = "\n".join(
                [
                    "POST",
                    "/runtime?source=cloud",
                    request.site_id,
                    request.key_id,
                    request.timestamp,
                    request.event,
                    request.callback_id,
                    headers["traceparent"],
                    hashlib.sha256(body).hexdigest(),
                ]
            )
            expected = build_hmac_signature(build_secret_hash(request.secret), canonical)
            assert headers["X-Npcink-Signature"] == expected
            signatures.append(expected)
        assert len(derivations) == 5
    assert len(set(signatures)) == 6
    assert dispatcher._batch_signing_key.get() is None
    # A new batch and direct calls never retain a previous batch's key.
    with dispatcher.signing_batch():
        dispatcher._build_headers(requests[0], body=b"{}")
    dispatcher._build_headers(requests[0], body=b"{}")
    dispatcher._build_headers(requests[0], body=b"{}")
    assert len(derivations) == 8


def test_signing_batch_restores_nested_scope_and_clears_after_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        "app.adapters.callbacks.http.build_secret_hash",
        lambda secret: calls.append(secret) or "synthetic-derived-key",
    )
    dispatcher = HttpRuntimeCallbackDispatcher()
    request = _signed_request()
    with pytest.raises(RuntimeError, match="batch interrupted"):
        with dispatcher.signing_batch():
            dispatcher._build_headers(request, body=b"{}")
            outer = dispatcher._batch_signing_key.get()
            assert request.secret not in repr(outer)
            assert "synthetic-derived-key" not in repr(outer)
            with dispatcher.signing_batch():
                dispatcher._build_headers(request, body=b"{}")
            assert dispatcher._batch_signing_key.get() is outer
            dispatcher._build_headers(request, body=b"{}")
            raise RuntimeError("batch interrupted")
    assert dispatcher._batch_signing_key.get() is None
    assert len(calls) == 2
    with dispatcher.signing_batch():
        dispatcher._build_headers(request, body=b"{}")
    assert len(calls) == 3


def test_signing_batches_are_independent_between_threads_and_dispatchers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier, Lock

    calls: list[str] = []
    lock = Lock()
    barrier = Barrier(2)

    def derive(secret: str) -> str:
        with lock:
            calls.append(secret)
        return "synthetic-derived-key"

    monkeypatch.setattr("app.adapters.callbacks.http.build_secret_hash", derive)
    dispatcher = HttpRuntimeCallbackDispatcher()

    def sign() -> None:
        with dispatcher.signing_batch():
            dispatcher._build_headers(_signed_request(), body=b"{}")
            barrier.wait(timeout=5)
            dispatcher._build_headers(_signed_request(), body=b"{}")
        assert dispatcher._batch_signing_key.get() is None

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(sign) for _ in range(2)]
        for future in futures:
            future.result(timeout=10)
    assert len(calls) == 2
    with dispatcher.signing_batch():
        dispatcher._build_headers(_signed_request(), body=b"{}")
        other = HttpRuntimeCallbackDispatcher()
        with other.signing_batch():
            other._build_headers(_signed_request(), body=b"{}")
        dispatcher._build_headers(_signed_request(), body=b"{}")
    assert len(calls) == 4
