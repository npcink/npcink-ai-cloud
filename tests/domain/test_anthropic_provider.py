from __future__ import annotations

import json

import httpx
import pytest

from app.adapters.providers.anthropic import AnthropicProviderAdapter
from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest


def _build_request(
    *,
    model_id: str,
    input_payload: dict[str, object],
) -> ProviderExecutionRequest:
    return ProviderExecutionRequest(
        run_id="run_anthropic_provider_test",
        site_id="site_alpha",
        ability_name="npcink-abilities-toolkit/build-article-block-plan",
        profile_id="text.balanced",
        execution_kind="text",
        model_id=model_id,
        instance_id="anthropic-global-text-balanced",
        endpoint_variant="messages",
        trace_id="trace_anthropic_provider_test",
        input_payload=input_payload,
        policy={},
        timeout_ms=5_000,
    )


def test_anthropic_adapter_fetches_catalog_over_http() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/v1/models")
        assert request.headers["x-api-key"] == "test-api-key"
        assert request.headers["anthropic-version"] == "2023-06-01"
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "claude-3-5-haiku-latest",
                        "display_name": "Claude Haiku",
                        "pricing": {"cache_read": 0.08, "cache_write": 1.0},
                    },
                    {"id": "claude-3-7-sonnet-latest", "display_name": "Claude Sonnet"},
                    {"id": "claude-3-opus-latest", "display_name": "Claude Opus"},
                ]
            },
        )

    adapter = AnthropicProviderAdapter(
        api_key="test-api-key",
        transport=httpx.MockTransport(handler),
    )

    snapshot = adapter.fetch_catalog()

    assert snapshot.provider_id == "anthropic"
    assert [model.model_id for model in snapshot.models] == [
        "claude-3-5-haiku-latest",
        "claude-3-7-sonnet-latest",
        "claude-3-opus-latest",
    ]
    assert snapshot.models[0].instances[0].endpoint_variant == "messages"
    assert snapshot.models[0].instances[0].capability_tags == ["text", "economy"]
    assert snapshot.models[0].raw_json["runtime_pricing"] == {
        "cache_read": 0.08,
        "cache_write": 1.0,
    }
    assert snapshot.models[1].instances[0].capability_tags == ["text", "balanced"]
    assert snapshot.models[2].instances[0].capability_tags == ["text", "quality"]


def test_anthropic_adapter_executes_messages_over_http() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/v1/messages")
        assert request.headers["x-api-key"] == "test-api-key"
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["model"] == "claude-3-7-sonnet-latest"
        assert payload["system"] == "be concise"
        assert payload["messages"][0]["content"] == "write a short draft"
        return httpx.Response(
            200,
            json={
                "model": "claude-3-7-sonnet-latest",
                "content": [{"type": "text", "text": "anthropic hosted response"}],
                "usage": {"input_tokens": 12, "output_tokens": 6},
                "stop_reason": "end_turn",
            },
        )

    adapter = AnthropicProviderAdapter(
        api_key="test-api-key",
        transport=httpx.MockTransport(handler),
    )

    result = adapter.execute(
        _build_request(
            model_id="claude-3-7-sonnet-latest",
            input_payload={
                "messages": [
                    {"role": "system", "content": "be concise"},
                    {"role": "user", "content": "write a short draft"},
                ],
                "max_tokens": 256,
            },
        )
    )

    assert result.output["output_text"] == "anthropic hosted response"
    assert result.output["model_id"] == "claude-3-7-sonnet-latest"
    assert result.tokens_in == 12
    assert result.tokens_out == 6
    assert result.finish_reason == "end_turn"


def test_anthropic_adapter_maps_http_errors_to_runtime_taxonomy() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            400,
            json={
                "error": {
                    "type": "invalid_request_error",
                    "message": "messages must not be empty",
                }
            },
        )

    adapter = AnthropicProviderAdapter(
        api_key="test-api-key",
        transport=httpx.MockTransport(handler),
    )

    try:
        adapter.execute(
            _build_request(
                model_id="claude-3-7-sonnet-latest",
                input_payload={"messages": []},
            )
        )
    except ProviderExecutionError as error:
        assert error.error_code == "provider.invalid_request"
        assert error.retryable is False
    else:
        raise AssertionError("expected provider execution error")


def test_anthropic_adapter_bounds_upstream_error_message() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            500,
            json={"error": {"type": "server_error", "message": "x" * 5000}},
        )

    adapter = AnthropicProviderAdapter(
        api_key="test-api-key",
        transport=httpx.MockTransport(handler),
    )

    try:
        adapter.execute(
            _build_request(
                model_id="claude-3-7-sonnet-latest",
                input_payload={"messages": [{"role": "user", "content": "fail"}]},
            )
        )
    except ProviderExecutionError as error:
        assert error.error_code == "provider.upstream_error"
        assert len(error.message) < 4100
        assert error.message.endswith("...[truncated]")
    else:
        raise AssertionError("expected provider execution error")


def test_anthropic_adapter_rejects_sample_execution_when_fallback_is_disabled() -> None:
    adapter = AnthropicProviderAdapter(
        allow_sample_catalog=False,
        allow_sample_execution=False,
    )

    try:
        adapter.execute(
            _build_request(
                model_id="claude-3-7-sonnet-latest",
                input_payload={"messages": [{"role": "user", "content": "hello"}]},
            )
        )
    except ProviderExecutionError as error:
        assert error.error_code == "provider.auth_invalid"
        assert error.retryable is False
    else:
        raise AssertionError("expected provider execution error")


def test_anthropic_adapter_normalizes_cached_usage_and_cost() -> None:
    adapter = AnthropicProviderAdapter(api_key="test-api-key")
    request = _build_request(
        model_id="claude-sonnet",
        input_payload={"messages": [{"role": "user", "content": "hello"}]},
    )
    request.price_input = 10.0
    request.price_output = 20.0
    request.price_cache_read = 1.0
    request.price_cache_write = 12.0

    result = adapter._build_messages_result(
        request,
        {
            "model": "claude-sonnet",
            "content": [{"type": "text", "text": "cached response"}],
            "usage": {
                "input_tokens": 100,
                "output_tokens": 50,
                "cache_read_input_tokens": 800,
                "cache_creation_input_tokens": 100,
            },
            "stop_reason": "end_turn",
        },
        10,
    )

    assert result.tokens_in == 1000
    assert result.tokens_out == 50
    assert result.uncached_input_tokens == 100
    assert result.cache_read_tokens == 800
    assert result.cache_write_tokens == 100
    assert result.cost == 0.004
    assert result.cost_estimate_mode == "cache_rates"


def test_anthropic_adapter_maps_context_overflow_separately_from_invalid_request() -> None:
    adapter = AnthropicProviderAdapter(
        api_key="test-api-key",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                400,
                json={
                    "error": {
                        "type": "invalid_request_error",
                        "message": "prompt is too long: 210000 tokens > 200000 maximum",
                    }
                },
            )
        ),
    )

    with pytest.raises(ProviderExecutionError) as error:
        adapter.execute(
            _build_request(
                model_id="claude-sonnet",
                input_payload={"messages": [{"role": "user", "content": "long"}]},
            )
        )

    assert error.value.error_code == "provider.context_overflow"
    assert error.value.retryable is False
