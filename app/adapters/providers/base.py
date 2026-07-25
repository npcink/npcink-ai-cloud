from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core.error_taxonomy import get_error_taxonomy

IMAGE_GENERATION_PROVIDER_ERROR_MESSAGE = "image generation provider request failed"
VISION_PROVIDER_ERROR_MESSAGE = "vision provider request failed"


@dataclass(slots=True)
class CatalogInstanceSeed:
    instance_id: str
    endpoint_variant: str
    region: str
    capability_tags: list[str] = field(default_factory=list)
    health_status: str = "healthy"
    is_default: bool = False
    weight: int = 100


@dataclass(slots=True)
class CatalogModelSeed:
    model_id: str
    family: str
    feature: str
    status: str
    context_window: int | None = None
    price_input: float | None = None
    price_output: float | None = None
    is_deprecated: bool = False
    fallback_candidate: bool = False
    raw_json: dict[str, object] | None = None
    instances: list[CatalogInstanceSeed] = field(default_factory=list)


@dataclass(slots=True)
class ProviderCatalogSnapshot:
    provider_id: str
    display_name: str
    adapter_type: str
    models: list[CatalogModelSeed]


@dataclass(slots=True)
class ProviderExecutionRequest:
    run_id: str
    site_id: str
    ability_name: str
    profile_id: str
    execution_kind: str
    model_id: str
    instance_id: str
    endpoint_variant: str
    trace_id: str
    input_payload: dict[str, Any] = field(repr=False)
    policy: dict[str, Any]
    timeout_ms: int
    contract_version: str = ""
    context_window: int | None = None
    price_input: float | None = None
    price_output: float | None = None
    price_cache_read: float | None = None
    price_cache_write: float | None = None
    retry_count: int = 0


@dataclass(frozen=True, slots=True)
class ProviderMediaCandidate:
    """Provider-edge media source that must never be serialized as runtime output."""

    index: int
    content_bytes: bytes | None = field(default=None, repr=False)
    source_url: str | None = field(default=None, repr=False)
    image_output_hosts: tuple[str, ...] = ()
    claimed_mime_type: str = ""
    revised_prompt: str = ""
    claimed_width: int | None = None
    claimed_height: int | None = None

    def __post_init__(self) -> None:
        if self.index < 1:
            raise ValueError("provider media candidate index must be positive")
        has_content = self.content_bytes is not None
        if self.source_url is not None and (
            not isinstance(self.source_url, str)
            or not self.source_url
            or self.source_url != self.source_url.strip()
        ):
            raise ValueError("provider media candidate source_url must be a normalized string")
        has_url = self.source_url is not None
        if has_content == has_url:
            raise ValueError("provider media candidate must contain exactly one transient source")
        if has_content and not isinstance(self.content_bytes, bytes):
            raise TypeError("provider media candidate content_bytes must be bytes")
        if any(not isinstance(host, str) or not host for host in self.image_output_hosts):
            raise ValueError("provider media candidate image_output_hosts must be exact hosts")


@dataclass(slots=True)
class ProviderExecutionResult:
    output: dict[str, Any]
    latency_ms: int
    tokens_in: int
    tokens_out: int
    cost: float
    finish_reason: str = "stop"
    media_candidates: tuple[ProviderMediaCandidate, ...] = ()
    uncached_input_tokens: int | None = None
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0
    cost_estimate_mode: str = ""

    def usage_context(self) -> dict[str, object]:
        total_input_tokens = max(0, int(self.tokens_in or 0))
        cache_read_tokens = max(0, int(self.cache_read_tokens or 0))
        cache_write_tokens = max(0, int(self.cache_write_tokens or 0))
        uncached_input_tokens = (
            max(0, int(self.uncached_input_tokens or 0))
            if self.uncached_input_tokens is not None
            else max(0, total_input_tokens - cache_read_tokens - cache_write_tokens)
        )
        context: dict[str, object] = {}
        has_cache_evidence = cache_read_tokens > 0 or cache_write_tokens > 0
        if has_cache_evidence:
            context.update(
                {
                    "input_tokens_uncached": uncached_input_tokens,
                    "cache_read_tokens": cache_read_tokens,
                    "cache_write_tokens": cache_write_tokens,
                }
            )
        reasoning_tokens = max(0, int(self.reasoning_tokens or 0))
        if reasoning_tokens > 0:
            context["reasoning_tokens"] = reasoning_tokens
        if has_cache_evidence and total_input_tokens > 0:
            context["cache_hit_ratio"] = round(
                min(cache_read_tokens, total_input_tokens) / total_input_tokens,
                6,
            )
        if self.cost_estimate_mode:
            context["cost_estimate_mode"] = self.cost_estimate_mode
        return context


class ProviderExecutionError(Exception):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        retryable: bool | None = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost: float = 0.0,
        usage_context: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.retryable = (
            get_error_taxonomy(error_code).retryable if retryable is None else retryable
        )
        self.tokens_in = max(0, int(tokens_in))
        self.tokens_out = max(0, int(tokens_out))
        self.cost = max(0.0, float(cost))
        self.usage_context = dict(usage_context) if isinstance(usage_context, dict) else None


class ProviderAdapter(Protocol):
    provider_id: str
    display_name: str
    adapter_type: str

    def fetch_catalog(self) -> ProviderCatalogSnapshot: ...

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult: ...
