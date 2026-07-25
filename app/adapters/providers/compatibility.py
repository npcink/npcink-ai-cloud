from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any

WORDPRESS_SCENE_MARKER = "\n\nScene input:\n"
PROMPT_CACHE_KEY_VERSION = "npcink-pc-v1"
DEFAULT_OUTPUT_TOKEN_BUDGET = 1024
ESTIMATED_IMAGE_TOKENS = 1200

_CONTEXT_OVERFLOW_ERROR_TYPES = frozenset(
    {
        "context_length_exceeded",
        "model_context_window_exceeded",
        "request_too_large",
    }
)
_CONTEXT_OVERFLOW_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"prompt is too long",
        r"request[_ ]too[_ ]large",
        r"exceeds (?:the )?context window",
        r"exceeds (?:the )?(?:model'?s )?maximum context length",
        r"input length .* exceeds .* context length",
        r"input token count .* exceeds the maximum",
        r"maximum prompt length is",
        r"reduce the length of the messages",
        r"longer than the model'?s context length",
        r"exceeds the available context size",
        r"greater than the context length",
        r"context window exceeds limit",
        r"context[_ ]length[_ ]exceeded",
        r"too many tokens",
        r"token limit exceeded",
        r"range of input length should be",
    )
)
_NON_OVERFLOW_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"rate limit",
        r"too many requests",
        r"throttl",
    )
)


@dataclass(frozen=True, slots=True)
class NormalizedProviderUsage:
    total_input_tokens: int
    output_tokens: int
    uncached_input_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    reasoning_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.total_input_tokens + self.output_tokens


@dataclass(frozen=True, slots=True)
class TokenCostEstimate:
    total_cost: float
    mode: str


@dataclass(frozen=True, slots=True)
class ContextBudgetAssessment:
    context_window: int
    estimated_input_tokens: int
    requested_output_tokens: int
    safety_margin_tokens: int

    @property
    def estimated_total_tokens(self) -> int:
        return (
            self.estimated_input_tokens
            + self.requested_output_tokens
            + self.safety_margin_tokens
        )

    @property
    def fits(self) -> bool:
        return self.estimated_total_tokens <= self.context_window

    def usage_context(self) -> dict[str, object]:
        return {
            "context_preflight": "accepted" if self.fits else "rejected",
            "estimated_input_tokens": self.estimated_input_tokens,
            "requested_output_tokens": self.requested_output_tokens,
            "context_safety_margin_tokens": self.safety_margin_tokens,
            "estimated_total_tokens": self.estimated_total_tokens,
            "context_window": self.context_window,
        }


def normalize_openai_usage(
    usage: object,
    *,
    input_field: str,
    output_field: str,
) -> NormalizedProviderUsage:
    payload = usage if isinstance(usage, dict) else {}
    details_field = (
        "input_tokens_details" if input_field == "input_tokens" else "prompt_tokens_details"
    )
    details = payload.get(details_field)
    details = details if isinstance(details, dict) else {}

    cache_read_tokens = _first_nonnegative_int(
        details.get("cached_tokens"),
        payload.get("prompt_cache_hit_tokens"),
        payload.get("cache_hit_tokens"),
        payload.get("input_cache_hit_tokens"),
    )
    cache_write_tokens = _first_nonnegative_int(
        details.get("cache_write_tokens"),
        payload.get("cache_write_tokens"),
        payload.get("cache_creation_input_tokens"),
    )
    cache_miss_tokens = _first_nonnegative_int(
        payload.get("prompt_cache_miss_tokens"),
        payload.get("cache_miss_tokens"),
        payload.get("input_cache_miss_tokens"),
    )
    total_input_tokens = _nonnegative_int(payload.get(input_field))
    output_tokens = _nonnegative_int(payload.get(output_field))

    if cache_miss_tokens > 0:
        uncached_input_tokens = cache_miss_tokens
    else:
        uncached_input_tokens = max(
            0,
            total_input_tokens - cache_read_tokens - cache_write_tokens,
        )

    categorized_input_tokens = (
        uncached_input_tokens + cache_read_tokens + cache_write_tokens
    )
    if total_input_tokens <= 0:
        total_input_tokens = categorized_input_tokens
    elif categorized_input_tokens < total_input_tokens:
        uncached_input_tokens += total_input_tokens - categorized_input_tokens
    elif categorized_input_tokens > total_input_tokens:
        total_input_tokens = categorized_input_tokens

    output_details = payload.get("output_tokens_details")
    if not isinstance(output_details, dict):
        output_details = payload.get("completion_tokens_details")
    output_details = output_details if isinstance(output_details, dict) else {}

    return NormalizedProviderUsage(
        total_input_tokens=total_input_tokens,
        output_tokens=output_tokens,
        uncached_input_tokens=uncached_input_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        reasoning_tokens=_nonnegative_int(output_details.get("reasoning_tokens")),
    )


def normalize_anthropic_usage(usage: object) -> NormalizedProviderUsage:
    payload = usage if isinstance(usage, dict) else {}
    uncached_input_tokens = _nonnegative_int(payload.get("input_tokens"))
    cache_read_tokens = _nonnegative_int(payload.get("cache_read_input_tokens"))
    cache_write_tokens = _nonnegative_int(payload.get("cache_creation_input_tokens"))
    return NormalizedProviderUsage(
        total_input_tokens=(
            uncached_input_tokens + cache_read_tokens + cache_write_tokens
        ),
        output_tokens=_nonnegative_int(payload.get("output_tokens")),
        uncached_input_tokens=uncached_input_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        reasoning_tokens=_nonnegative_int(
            _nested_value(payload, "output_tokens_details", "thinking_tokens")
        ),
    )


def estimate_token_cost(
    usage: NormalizedProviderUsage,
    *,
    price_input: float | None,
    price_output: float | None,
    price_cache_read: float | None,
    price_cache_write: float | None,
) -> TokenCostEstimate:
    relevant_rates = (
        price_input,
        price_output,
        price_cache_read,
        price_cache_write,
    )
    if all(rate is None for rate in relevant_rates):
        return TokenCostEstimate(total_cost=0.0, mode="unpriced")

    cache_read_rate = (
        price_cache_read if price_cache_read is not None else price_input
    )
    cache_write_rate = (
        price_cache_write if price_cache_write is not None else price_input
    )
    missing_required_rate = (
        usage.uncached_input_tokens > 0
        and price_input is None
        or usage.output_tokens > 0
        and price_output is None
        or usage.cache_read_tokens > 0
        and cache_read_rate is None
        or usage.cache_write_tokens > 0
        and cache_write_rate is None
    )
    used_conservative_cache_rate = (
        usage.cache_read_tokens > 0
        and price_cache_read is None
        and price_input is not None
        or usage.cache_write_tokens > 0
        and price_cache_write is None
        and price_input is not None
    )

    total_cost = (
        ((price_input or 0.0) * usage.uncached_input_tokens)
        + ((cache_read_rate or 0.0) * usage.cache_read_tokens)
        + ((cache_write_rate or 0.0) * usage.cache_write_tokens)
        + ((price_output or 0.0) * usage.output_tokens)
    ) / 1_000_000

    if missing_required_rate:
        mode = "partial_rates"
    elif used_conservative_cache_rate:
        mode = "conservative_input_rate"
    elif usage.cache_read_tokens > 0 or usage.cache_write_tokens > 0:
        mode = "cache_rates"
    else:
        mode = "standard_rates"
    return TokenCostEstimate(total_cost=round(total_cost, 6), mode=mode)


def build_prompt_cache_key(
    *,
    site_id: str,
    profile_id: str,
    model_id: str,
    ability_name: str,
    contract_version: str,
    input_payload: dict[str, Any],
) -> str:
    stable_prefix = _stable_prompt_prefix(input_payload)
    if not site_id or len(stable_prefix) < 32:
        return ""

    prefix_digest = hashlib.sha256(stable_prefix.encode("utf-8")).hexdigest()
    scope_material = "\x1f".join(
        (
            site_id,
            profile_id,
            model_id,
            ability_name,
            contract_version,
            prefix_digest,
        )
    )
    scope_digest = hashlib.sha256(scope_material.encode("utf-8")).hexdigest()
    return f"{PROMPT_CACHE_KEY_VERSION}-{scope_digest[:48]}"


def is_context_overflow_error(
    message: object,
    *,
    error_type: object = "",
    status_code: int | None = None,
) -> bool:
    if status_code == 429:
        return False

    normalized_message = str(message or "").strip()
    normalized_type = str(error_type or "").strip().lower()
    combined = f"{normalized_type} {normalized_message}".strip()
    if any(pattern.search(combined) for pattern in _NON_OVERFLOW_PATTERNS):
        return False
    if normalized_type in _CONTEXT_OVERFLOW_ERROR_TYPES:
        return True
    if status_code is not None and status_code not in {400, 413, 422}:
        return False
    if status_code == 413 and re.search(
        r"(request|payload).*(too large|maximum size)|request[_ ]too[_ ]large",
        combined,
        re.IGNORECASE,
    ):
        return True
    return any(pattern.search(combined) for pattern in _CONTEXT_OVERFLOW_PATTERNS)


def normalize_provider_error_code(
    default_error_code: str,
    *,
    message: object,
    error_type: object = "",
    status_code: int | None = None,
) -> str:
    if is_context_overflow_error(
        message,
        error_type=error_type,
        status_code=status_code,
    ):
        return "provider.context_overflow"
    return default_error_code


def assess_context_budget(
    input_payload: dict[str, Any],
    *,
    context_window: int | None,
    execution_kind: str,
    endpoint_variant: str,
) -> ContextBudgetAssessment | None:
    if not isinstance(context_window, int) or context_window <= 0:
        return None
    if execution_kind not in {"text", "vision", "embedding"}:
        return None

    estimated_input_tokens = estimate_provider_input_tokens(
        input_payload,
        endpoint_variant=endpoint_variant,
    )
    requested_output_tokens = estimate_output_token_budget(
        input_payload,
        execution_kind=execution_kind,
    )
    safety_margin_tokens = min(
        2048,
        max(16, math.ceil(context_window * 0.02)),
        max(16, context_window // 4),
    )
    return ContextBudgetAssessment(
        context_window=context_window,
        estimated_input_tokens=estimated_input_tokens,
        requested_output_tokens=requested_output_tokens,
        safety_margin_tokens=safety_margin_tokens,
    )


def estimate_provider_input_tokens(
    input_payload: dict[str, Any],
    *,
    endpoint_variant: str,
) -> int:
    options = _merged_request_options(input_payload)
    messages = options.get("messages")
    explicit_input = options.get("input")

    if endpoint_variant in {"responses", "embeddings"} and "input" in options:
        estimated_tokens = _estimate_content_tokens(explicit_input)
    elif isinstance(messages, list) and messages:
        estimated_tokens = sum(_estimate_message_tokens(message) for message in messages)
        estimated_tokens += 2
    elif "input" in options:
        estimated_tokens = _estimate_content_tokens(explicit_input)
    elif "text" in options:
        estimated_tokens = _estimate_content_tokens(options.get("text"))
    else:
        estimated_tokens = _estimate_content_tokens(options.get("prompt"))

    if not isinstance(messages, list):
        estimated_tokens += _estimate_content_tokens(options.get("system"))

    tools = options.get("tools")
    if isinstance(tools, list) and tools:
        estimated_tokens += estimate_text_tokens(_safe_json_dumps(tools))
    return max(0, estimated_tokens)


def estimate_output_token_budget(
    input_payload: dict[str, Any],
    *,
    execution_kind: str,
) -> int:
    if execution_kind == "embedding":
        return 0
    options = _merged_request_options(input_payload)
    for key in ("max_output_tokens", "max_completion_tokens", "max_tokens"):
        value = _nonnegative_int(options.get(key))
        if value > 0:
            return value
    return DEFAULT_OUTPUT_TOKEN_BUDGET


def estimate_text_tokens(text: object) -> int:
    if not isinstance(text, str) or not text:
        return 0
    ascii_characters = sum(1 for character in text if ord(character) < 128)
    non_ascii_characters = len(text) - ascii_characters
    return math.ceil(ascii_characters / 4) + non_ascii_characters


def _stable_prompt_prefix(input_payload: dict[str, Any]) -> str:
    explicit_input = input_payload.get("input")
    if isinstance(explicit_input, str) and WORDPRESS_SCENE_MARKER in explicit_input:
        return explicit_input.split(WORDPRESS_SCENE_MARKER, 1)[0].strip()

    fragments: list[str] = []
    system = input_payload.get("system")
    if isinstance(system, str) and system.strip():
        fragments.append(system.strip())

    messages = input_payload.get("messages")
    if not isinstance(messages, list) and isinstance(explicit_input, list):
        messages = explicit_input
    if isinstance(messages, list):
        for message in messages:
            if not isinstance(message, dict):
                continue
            if message.get("role") not in {"system", "developer"}:
                continue
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                fragments.append(content.strip())
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    text = block.get("text") or block.get("content")
                    if isinstance(text, str) and text.strip():
                        fragments.append(text.strip())
    return "\n\n".join(fragments)


def _merged_request_options(input_payload: dict[str, Any]) -> dict[str, Any]:
    options: dict[str, Any] = {}
    params = input_payload.get("params")
    if isinstance(params, dict):
        options.update(params)
    for key, value in input_payload.items():
        if key != "params" and key not in options:
            options[key] = value
    return options


def _estimate_message_tokens(message: object) -> int:
    if not isinstance(message, dict):
        return 0
    tokens = 4
    tokens += _estimate_content_tokens(message.get("content"))
    if isinstance(message.get("name"), str):
        tokens += estimate_text_tokens(message["name"])
    tool_calls = message.get("tool_calls")
    if isinstance(tool_calls, list):
        tokens += estimate_text_tokens(_safe_json_dumps(tool_calls))
    return tokens


def _estimate_content_tokens(value: object) -> int:
    if isinstance(value, str):
        return estimate_text_tokens(value)
    if isinstance(value, bytes):
        return ESTIMATED_IMAGE_TOKENS
    if isinstance(value, list):
        return sum(_estimate_content_tokens(item) for item in value)
    if isinstance(value, dict):
        content_type = str(value.get("type") or "").lower()
        if content_type in {
            "image",
            "image_url",
            "input_image",
            "input_file",
        } or any(
            key in value
            for key in (
                "b64_json",
                "base64",
                "image_base64",
                "image_data",
                "image_url",
            )
        ):
            text_tokens = _estimate_content_tokens(value.get("text"))
            return ESTIMATED_IMAGE_TOKENS + text_tokens
        return sum(
            _estimate_content_tokens(item)
            for key, item in value.items()
            if key not in {"metadata", "role", "type"}
        )
    if value is None:
        return 0
    return estimate_text_tokens(str(value))


def _nested_value(payload: dict[str, Any], *path: str) -> object:
    current: object = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _safe_json_dumps(value: object) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError):
        return "[unserializable]"


def _first_nonnegative_int(*values: object) -> int:
    for value in values:
        normalized = _nonnegative_int(value)
        if normalized > 0:
            return normalized
    return 0


def _nonnegative_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        if not math.isfinite(value):
            return 0
        return max(0, int(value))
    if isinstance(value, str):
        try:
            return max(0, int(value))
        except ValueError:
            return 0
    return 0
