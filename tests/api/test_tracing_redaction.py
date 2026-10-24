from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from opentelemetry import propagate, trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from app.api import main as main_module
from app.api.routes import open as open_routes
from app.core.config import Settings
from app.core.services import CloudServices
from app.setup.service import SetupService
from app.setup.state import SetupConfigStore


class _CapturedSpan:
    def __init__(self) -> None:
        self.attributes: dict[str, object] = {}
        self.events: list[tuple[str, dict[str, object]]] = []
        self.statuses: list[object] = []

    def set_attribute(self, key: str, value: object) -> None:
        self.attributes[key] = value

    def add_event(
        self,
        name: str,
        attributes: dict[str, object] | None = None,
    ) -> None:
        self.events.append((name, dict(attributes or {})))

    def set_status(self, status: object) -> None:
        self.statuses.append(status)

    def record_exception(self, exception: BaseException, **kwargs: object) -> None:
        raise AssertionError("raw exceptions must not be recorded in tracing")


class _CapturedTracer:
    def __init__(self, span: _CapturedSpan) -> None:
        self.span = span
        self.start_kwargs: dict[str, object] = {}

    @contextmanager
    def start_as_current_span(self, *args: object, **kwargs: object) -> Iterator[_CapturedSpan]:
        self.start_kwargs = dict(kwargs)
        yield self.span


def test_http_trace_records_only_stable_exception_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    span = _CapturedSpan()
    tracer = _CapturedTracer(span)
    monkeypatch.setattr(
        main_module.trace,
        "get_tracer",
        lambda _name: tracer,
    )
    app = main_module.create_app()
    secret = "Bearer tracing-secret-value"

    @app.get("/__test__/tracing-redaction")
    async def tracing_failure() -> None:
        raise RuntimeError(secret)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__test__/tracing-redaction")

    assert response.status_code == 500
    assert span.events == [
        (
            "exception",
            {"exception.type": "RuntimeError"},
        )
    ]
    assert tracer.start_kwargs["record_exception"] is False
    assert tracer.start_kwargs["set_status_on_exception"] is False
    observed = f"{span.attributes!r} {span.events!r} {span.statuses!r}"
    assert secret not in observed


@pytest.fixture
def sdk_span_exporter(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[InMemorySpanExporter]:
    # Use the same real SDK provider for custom and FastAPI native instrumentation.
    # Patch provider lookup rather than OTel's write-once process-global registration.
    exporter = InMemorySpanExporter()
    provider = TracerProvider(
        resource=Resource({"service.name": "tracing-redaction-test"}),
        shutdown_on_exit=False,
    )
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(trace, "get_tracer_provider", lambda: provider)
    monkeypatch.setattr(main_module, "configure_tracing", lambda _settings: None)
    propagator = TraceContextTextMapPropagator()
    monkeypatch.setattr(propagate, "get_global_textmap", lambda: propagator)
    # Exercise explicit opt-out even when automatic setup is requested externally.
    monkeypatch.setenv("FASTAPI_OTEL_AUTO_CONFIGURE", "true")
    try:
        yield exporter
    finally:
        provider.shutdown()


def _sdk_test_app() -> FastAPI:
    return main_module.create_app(
        CloudServices(
            settings=Settings(
                _env_file=None,
                environment="test",
                database_url="sqlite+pysqlite:///:memory:",
                otel_exporter_otlp_endpoint="",
            )
        )
    )


def test_native_tracing_positive_control_exports_with_the_sdk_provider(
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    # This must fail on pre-native FastAPI, so ignored constructor kwargs cannot
    # masquerade as coverage of 0.150 native instrumentation.
    app = FastAPI(telemetry={"auto_configure": False})

    @app.get("/__test__/native-probe")
    async def native_probe() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app) as client:
        response = client.get("/__test__/native-probe?marker=native-probe")

    assert response.status_code == 200
    server_spans = [
        span for span in sdk_span_exporter.get_finished_spans() if span.kind == SpanKind.SERVER
    ]
    assert len(server_spans) == 1
    assert server_spans[0].instrumentation_scope.name == "fastapi"
    assert server_spans[0].attributes["url.query"] == "marker=native-probe"


def test_http_sdk_exports_one_server_span_and_preserves_inbound_context(
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    app = _sdk_test_app()

    @app.get("/__test__/tracing-ok")
    async def tracing_ok() -> dict[str, bool]:
        return {"ok": True}

    trace_id = "1234567890abcdef1234567890abcdef"
    parent_id = "1234567890abcdef"
    with TestClient(app) as client:
        response = client.get(
            "/__test__/tracing-ok",
            headers={"traceparent": f"00-{trace_id}-{parent_id}-01"},
        )

    assert response.status_code == 200
    spans = sdk_span_exporter.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.kind == SpanKind.SERVER
    assert span.instrumentation_scope.name == "npcink_ai_cloud.http"
    assert span.context.trace_id == int(trace_id, 16)
    assert span.parent is not None
    assert span.parent.span_id == int(parent_id, 16)
    assert span.parent.is_remote
    assert span.attributes["http.response.status_code"] == 200


def test_http_sdk_does_not_export_callback_query_secrets(
    monkeypatch: pytest.MonkeyPatch,
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    app = _sdk_test_app()
    received: dict[str, str] = {}

    # Exercise the real callback route/parser; stub only the OAuth exchange
    # boundary so neither a real code exchange nor database access is needed.
    async def finish_callback(request: Request, *, code: str, state: str) -> dict[str, bool]:
        received.update(code=code, state=state)
        return {"ok": True}

    monkeypatch.setattr(open_routes, "finish_qq_login_callback", finish_callback)

    secrets = {
        "code": "oauth-code-sentinel-7821",
        "state": "oauth-state-sentinel-7821",
        "token": "oauth-token-sentinel-7821",
    }
    with TestClient(app) as client:
        response = client.get("/open/auth/qq/callback", params=secrets)

    assert response.status_code == 200
    spans = sdk_span_exporter.get_finished_spans()
    assert len(spans) == 1
    assert spans[0].kind == SpanKind.SERVER
    assert received == {"code": secrets["code"], "state": secrets["state"]}
    assert spans[0].attributes["url.path"] == "/open/auth/qq/callback"
    assert "url.query" not in spans[0].attributes
    observed = "\n".join(span.to_json() for span in spans)
    assert all(secret not in observed for secret in secrets.values())


def test_http_sdk_exports_only_stable_exception_type(
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    app = _sdk_test_app()
    secret = "Bearer sdk-exception-sentinel-7821"

    @app.get("/__test__/sdk-tracing-failure")
    async def tracing_failure() -> None:
        raise RuntimeError(secret)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__test__/sdk-tracing-failure")

    assert response.status_code == 500
    spans = sdk_span_exporter.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.kind == SpanKind.SERVER
    assert span.status.status_code == StatusCode.ERROR
    assert [(event.name, dict(event.attributes)) for event in span.events] == [
        ("exception", {"exception.type": "RuntimeError"})
    ]
    assert secret not in span.to_json()


def test_setup_app_disables_all_native_telemetry(
    tmp_path: Path,
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    setup_service = SetupService(SetupConfigStore(tmp_path / "setup-config"))
    app = main_module._create_setup_app(setup_service)
    # Also cover metrics/logs/auto-config, which a trace-only exporter cannot see.
    assert all(
        app._telemetry[key] is False
        for key in ("tracing", "metrics", "logs", "operation_spans", "auto_configure")
    )

    with TestClient(app, base_url="http://localhost") as client:
        response = client.get(
            "/health/live",
            params={"code": "setup-code-sentinel", "state": "setup-state-sentinel"},
        )
        unavailable = client.get("/health/ready")

    assert response.status_code == 200
    assert unavailable.status_code == 503
    assert sdk_span_exporter.get_finished_spans() == ()


def test_runtime_app_disables_all_native_telemetry(
    sdk_span_exporter: InMemorySpanExporter,
) -> None:
    app = _sdk_test_app()
    assert all(
        app._telemetry[key] is False
        for key in ("tracing", "metrics", "logs", "operation_spans", "auto_configure")
    )
