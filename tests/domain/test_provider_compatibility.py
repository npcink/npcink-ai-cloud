from __future__ import annotations

import pytest

from app.adapters.providers.compatibility import (
    assess_context_budget,
    build_prompt_cache_key,
    estimate_text_tokens,
    estimate_token_cost,
    is_context_overflow_error,
    normalize_anthropic_usage,
    normalize_openai_usage,
)


def test_normalizes_openai_cache_usage_without_double_counting_input() -> None:
    usage = normalize_openai_usage(
        {
            "input_tokens": 1000,
            "output_tokens": 50,
            "input_tokens_details": {
                "cached_tokens": 800,
                "cache_write_tokens": 100,
            },
            "output_tokens_details": {"reasoning_tokens": 20},
        },
        input_field="input_tokens",
        output_field="output_tokens",
    )

    assert usage.total_input_tokens == 1000
    assert usage.uncached_input_tokens == 100
    assert usage.cache_read_tokens == 800
    assert usage.cache_write_tokens == 100
    assert usage.output_tokens == 50
    assert usage.reasoning_tokens == 20
    assert usage.total_tokens == 1050


def test_normalizes_deepseek_flat_cache_usage() -> None:
    usage = normalize_openai_usage(
        {
            "prompt_tokens": 3000,
            "completion_tokens": 500,
            "prompt_cache_hit_tokens": 1000,
            "prompt_cache_miss_tokens": 2000,
        },
        input_field="prompt_tokens",
        output_field="completion_tokens",
    )

    assert usage.total_input_tokens == 3000
    assert usage.uncached_input_tokens == 2000
    assert usage.cache_read_tokens == 1000
    assert usage.cache_write_tokens == 0


def test_normalizes_anthropic_cache_usage_into_total_input() -> None:
    usage = normalize_anthropic_usage(
        {
            "input_tokens": 100,
            "output_tokens": 50,
            "cache_read_input_tokens": 800,
            "cache_creation_input_tokens": 100,
        }
    )

    assert usage.total_input_tokens == 1000
    assert usage.uncached_input_tokens == 100
    assert usage.cache_read_tokens == 800
    assert usage.cache_write_tokens == 100
    assert usage.total_tokens == 1050


def test_cache_aware_cost_uses_explicit_rates() -> None:
    usage = normalize_anthropic_usage(
        {
            "input_tokens": 100,
            "output_tokens": 50,
            "cache_read_input_tokens": 800,
            "cache_creation_input_tokens": 100,
        }
    )

    estimate = estimate_token_cost(
        usage,
        price_input=10.0,
        price_output=20.0,
        price_cache_read=1.0,
        price_cache_write=12.0,
    )

    assert estimate.total_cost == 0.004
    assert estimate.mode == "cache_rates"


def test_cache_cost_is_conservative_when_cache_rates_are_unknown() -> None:
    usage = normalize_openai_usage(
        {
            "input_tokens": 1000,
            "output_tokens": 50,
            "input_tokens_details": {"cached_tokens": 800},
        },
        input_field="input_tokens",
        output_field="output_tokens",
    )

    estimate = estimate_token_cost(
        usage,
        price_input=10.0,
        price_output=20.0,
        price_cache_read=None,
        price_cache_write=None,
    )

    assert estimate.total_cost == 0.011
    assert estimate.mode == "conservative_input_rate"


def test_prompt_cache_key_is_stable_site_isolated_and_prompt_free() -> None:
    stable_prefix = (
        "Generate exactly one concise title faithful to the main topic. "
        "Return only the title text."
    )
    first_payload = {"input": f"{stable_prefix}\n\nScene input:\nfirst article"}
    second_payload = {"input": f"{stable_prefix}\n\nScene input:\nsecond article"}

    first_key = build_prompt_cache_key(
        site_id="site_alpha",
        profile_id="text.balanced",
        model_id="gpt-4.1-mini",
        ability_name="npcink/title-generation",
        contract_version="wordpress_operation.v1",
        input_payload=first_payload,
    )
    second_key = build_prompt_cache_key(
        site_id="site_alpha",
        profile_id="text.balanced",
        model_id="gpt-4.1-mini",
        ability_name="npcink/title-generation",
        contract_version="wordpress_operation.v1",
        input_payload=second_payload,
    )
    other_site_key = build_prompt_cache_key(
        site_id="site_beta",
        profile_id="text.balanced",
        model_id="gpt-4.1-mini",
        ability_name="npcink/title-generation",
        contract_version="wordpress_operation.v1",
        input_payload=first_payload,
    )

    assert first_key == second_key
    assert first_key != other_site_key
    assert first_key.startswith("npcink-pc-v1-")
    assert len(first_key) <= 64
    assert "site_alpha" not in first_key
    assert "title" not in first_key
    assert "article" not in first_key


def test_prompt_cache_key_requires_a_recognized_stable_prefix() -> None:
    assert (
        build_prompt_cache_key(
            site_id="site_alpha",
            profile_id="text.balanced",
            model_id="gpt-4.1-mini",
            ability_name="npcink/title-generation",
            contract_version="wordpress_operation.v1",
            input_payload={"input": "fully dynamic prompt"},
        )
        == ""
    )


@pytest.mark.parametrize(
    ("message", "error_type", "status_code"),
    [
        ("prompt is too long: 210000 tokens > 200000 maximum", "", 400),
        ("Your input exceeds the context window of this model", "", 400),
        ("Input length (265330) exceeds model's maximum context length", "", 400),
        ("Please reduce the length of the messages or completion", "", 400),
        ("Range of input length should be [1, 131072]", "", 400),
        ("Request exceeds the maximum size", "request_too_large", 413),
        ("", "context_length_exceeded", 400),
    ],
)
def test_detects_cross_provider_context_overflow(
    message: str,
    error_type: str,
    status_code: int,
) -> None:
    assert is_context_overflow_error(
        message,
        error_type=error_type,
        status_code=status_code,
    )


@pytest.mark.parametrize(
    ("message", "status_code"),
    [
        ("rate limit: too many tokens, retry later", 429),
        ("too many requests", 429),
        ("Throttling error: too many tokens", 400),
        ("messages must not be empty", 400),
        ("too many tokens while the upstream is unavailable", 503),
        ("token limit exceeded for this credential", 401),
    ],
)
def test_context_overflow_detection_excludes_rate_and_validation_errors(
    message: str,
    status_code: int,
) -> None:
    assert not is_context_overflow_error(message, status_code=status_code)


def test_context_budget_counts_cjk_and_rejects_before_the_provider_limit() -> None:
    assert estimate_text_tokens("标题生成") == 4
    payload = {
        "input": "a" * 300,
        "max_output_tokens": 20,
    }

    rejected = assess_context_budget(
        payload,
        context_window=100,
        execution_kind="text",
        endpoint_variant="responses",
    )
    accepted = assess_context_budget(
        payload,
        context_window=200,
        execution_kind="text",
        endpoint_variant="responses",
    )

    assert rejected is not None
    assert rejected.estimated_input_tokens == 75
    assert rejected.estimated_total_tokens == 111
    assert rejected.fits is False
    assert accepted is not None
    assert accepted.fits is True
