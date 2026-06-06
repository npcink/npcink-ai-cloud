from __future__ import annotations

import hashlib
import random
import time
from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import unquote, urlsplit

import httpx

from app.core.config import Settings
from app.domain.image_generation.contracts import (
    IMAGE_GENERATION_CLOUD_ABILITY,
    IMAGE_GENERATION_CONTRACT,
    IMAGE_GENERATION_EXECUTION_KIND,
    IMAGE_GENERATION_PROFILE_ID,
    IMAGE_GENERATION_RESULT_CONTRACT,
)
from app.domain.image_sources.contracts import (
    ALLOWED_IMAGE_SOURCE_ORIENTATIONS,
    ALLOWED_IMAGE_SOURCE_PROVIDERS,
    IMAGE_CANDIDATE_CONTRACT,
    ImageSourceContractViolation,
    coerce_positive_int,
    validate_image_source_runtime_contract,
)

MAX_QUERY_CHARS = 300
MAX_TEXT_CHARS = 300
MAX_PROVIDER_RESULTS = 30
AUTO_PROVIDER_ORDER = ("unsplash", "pixabay", "pexels")


@dataclass(slots=True)
class ImageSourceProviderUsage:
    provider_id: str
    model_id: str
    instance_id: str
    region: str
    latency_ms: int
    cost: float = 0.0
    error_code: str | None = None


@dataclass(slots=True)
class ImageSourceExecutionResult:
    result_json: dict[str, Any]
    usage: ImageSourceProviderUsage


class ImageSourceProviderError(RuntimeError):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        usage: ImageSourceProviderUsage | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.usage = usage


class ImageSourceService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def execute(
        self,
        *,
        site_id: str,
        ability_name: str,
        contract_version: str,
        input_payload: dict[str, Any],
        run_id: str,
    ) -> ImageSourceExecutionResult:
        validate_image_source_runtime_contract(
            ability_name=ability_name,
            contract_version=contract_version,
            input_payload=input_payload,
        )
        query = _normalize_text(input_payload.get("query"), limit=MAX_QUERY_CHARS)
        if not query:
            raise ImageSourceContractViolation(
                "image_source.query_required",
                "image source query is required",
            )
        options = _build_options(input_payload)
        provider_id = _resolve_provider(self.settings, str(options.get("provider") or "auto"))
        provider = _build_provider(provider_id, self.settings)
        return provider.search(query=query, options=options, site_id=site_id, run_id=run_id)


class _BaseImageProvider:
    provider_id = ""
    model_id = "image-source-search"
    instance_id = "cloud-managed"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def search(
        self,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> ImageSourceExecutionResult:
        raise NotImplementedError

    def _usage(self, started: float, *, error_code: str | None = None) -> ImageSourceProviderUsage:
        return ImageSourceProviderUsage(
            provider_id=self.provider_id,
            model_id=self.model_id,
            instance_id=self.instance_id,
            region=str(self.settings.deployment_region or "unspecified"),
            latency_ms=max(0, int((time.monotonic() - started) * 1000)),
            cost=max(0.0, float(self.settings.image_source_cost_per_query or 0.0)),
            error_code=error_code,
        )

    def _request_json(
        self,
        *,
        started: float,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            timeout_seconds = float(self.settings.image_source_timeout_seconds)
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.request(
                    method,
                    url,
                    headers=headers or {},
                    params=params or {},
                )
                response.raise_for_status()
        except httpx.TimeoutException as error:
            raise ImageSourceProviderError(
                "provider.timeout",
                f"{self.provider_id} image source search timed out",
                usage=self._usage(started, error_code="provider.timeout"),
            ) from error
        except httpx.HTTPStatusError as error:
            error_code = _map_http_error(error.response)
            raise ImageSourceProviderError(
                error_code,
                _extract_http_error_message(error.response),
                usage=self._usage(started, error_code=error_code),
            ) from error
        except httpx.RequestError as error:
            raise ImageSourceProviderError(
                "provider.network_error",
                f"{self.provider_id} image source request failed",
                usage=self._usage(started, error_code="provider.network_error"),
            ) from error

        try:
            payload = response.json()
        except ValueError as error:
            raise ImageSourceProviderError(
                "provider.invalid_response",
                f"{self.provider_id} image source returned invalid JSON",
                usage=self._usage(started, error_code="provider.invalid_response"),
            ) from error
        return payload if isinstance(payload, dict) else {}


class UnsplashImageSourceProvider(_BaseImageProvider):
    provider_id = "unsplash"

    def search(
        self,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> ImageSourceExecutionResult:
        api_key = str(self.settings.image_source_unsplash_access_key or "").strip()
        if not api_key:
            raise ImageSourceProviderError(
                "image_source.unsplash_key_missing",
                "Cloud-managed Unsplash access key is not configured",
            )
        base_url = str(self.settings.image_source_unsplash_base_url or "").strip().rstrip("/")
        params: dict[str, Any] = {
            "query": query,
            "per_page": int(options["per_page"]),
        }
        if options.get("orientation") in {"landscape", "portrait", "squarish"}:
            params["orientation"] = options["orientation"]
        if options.get("color"):
            params["color"] = options["color"]
        started = time.monotonic()
        payload = self._request_json(
            started=started,
            method="GET",
            url=f"{base_url}/search/photos",
            headers={"Authorization": f"Client-ID {api_key}"},
            params=params,
        )
        candidates = [_normalize_unsplash(item) for item in _list(payload.get("results"))]
        return _build_result(
            provider_id=self.provider_id,
            auto_strategy=str(self.settings.image_source_auto_strategy or "first_available"),
            query=query,
            options=options,
            candidates=candidates,
            usage=self._usage(started),
        )


class PixabayImageSourceProvider(_BaseImageProvider):
    provider_id = "pixabay"

    def search(
        self,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> ImageSourceExecutionResult:
        api_key = str(self.settings.image_source_pixabay_api_key or "").strip()
        if not api_key:
            raise ImageSourceProviderError(
                "image_source.pixabay_key_missing",
                "Cloud-managed Pixabay API key is not configured",
            )
        base_url = str(self.settings.image_source_pixabay_base_url or "").strip()
        if base_url and not base_url.endswith("/"):
            base_url = f"{base_url}/"
        params: dict[str, Any] = {
            "key": api_key,
            "q": query,
            "per_page": int(options["per_page"]),
            "image_type": "photo",
            "safesearch": "true",
        }
        orientation = options.get("orientation")
        if orientation == "landscape":
            params["orientation"] = "horizontal"
        if orientation == "portrait":
            params["orientation"] = "vertical"
        started = time.monotonic()
        payload = self._request_json(
            started=started,
            method="GET",
            url=base_url,
            params=params,
        )
        candidates = [_normalize_pixabay(item) for item in _list(payload.get("hits"))]
        return _build_result(
            provider_id=self.provider_id,
            auto_strategy=str(self.settings.image_source_auto_strategy or "first_available"),
            query=query,
            options=options,
            candidates=candidates,
            usage=self._usage(started),
        )


class PexelsImageSourceProvider(_BaseImageProvider):
    provider_id = "pexels"

    def search(
        self,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> ImageSourceExecutionResult:
        api_key = str(self.settings.image_source_pexels_api_key or "").strip()
        if not api_key:
            raise ImageSourceProviderError(
                "image_source.pexels_key_missing",
                "Cloud-managed Pexels API key is not configured",
            )
        base_url = str(self.settings.image_source_pexels_base_url or "").strip().rstrip("/")
        params: dict[str, Any] = {
            "query": query,
            "per_page": int(options["per_page"]),
        }
        if options.get("orientation") in {"landscape", "portrait", "square"}:
            params["orientation"] = options["orientation"]
        started = time.monotonic()
        payload = self._request_json(
            started=started,
            method="GET",
            url=f"{base_url}/search",
            headers={"Authorization": api_key},
            params=params,
        )
        candidates = [_normalize_pexels(item) for item in _list(payload.get("photos"))]
        return _build_result(
            provider_id=self.provider_id,
            auto_strategy=str(self.settings.image_source_auto_strategy or "first_available"),
            query=query,
            options=options,
            candidates=candidates,
            usage=self._usage(started),
        )


def _build_options(input_payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(input_payload.get("provider") or "auto").strip().lower()
    if provider not in ALLOWED_IMAGE_SOURCE_PROVIDERS:
        provider = "auto"
    orientation = str(input_payload.get("orientation") or "").strip().lower()
    if orientation == "horizontal":
        orientation = "landscape"
    if orientation == "vertical":
        orientation = "portrait"
    if orientation not in ALLOWED_IMAGE_SOURCE_ORIENTATIONS:
        orientation = ""
    return {
        "provider": provider,
        "per_page": coerce_positive_int(
            input_payload.get("per_page"),
            default=8,
            maximum=MAX_PROVIDER_RESULTS,
        ),
        "orientation": orientation,
        "color": _normalize_token(input_payload.get("color"), limit=40),
        "purpose": _normalize_token(
            input_payload.get("purpose"),
            limit=80,
        )
        or "image_reference_candidate",
    }


def _resolve_provider(settings: Settings, requested_provider: str) -> str:
    configured_provider = str(settings.image_source_provider or "disabled").strip().lower()
    if configured_provider == "disabled":
        raise ImageSourceProviderError(
            "image_source.provider_not_configured",
            "Cloud-managed image source provider is not configured",
        )
    if requested_provider not in {"auto", "cloud"}:
        configured_provider = requested_provider
    elif configured_provider == "auto":
        configured_provider = _resolve_auto_provider(settings)
    if configured_provider not in {"unsplash", "pixabay", "pexels"}:
        raise ImageSourceProviderError(
            "image_source.provider_not_configured",
            "Cloud-managed image source provider is not configured",
        )
    return configured_provider


def _resolve_auto_provider(settings: Settings) -> str:
    available_provider_ids = [
        provider_id
        for provider_id in AUTO_PROVIDER_ORDER
        if _provider_has_key(settings, provider_id)
    ]
    strategy = str(settings.image_source_auto_strategy or "first_available").strip().lower()
    if strategy == "random" and available_provider_ids:
        return random.choice(available_provider_ids)
    return available_provider_ids[0] if available_provider_ids else "auto"


def _build_provider(provider_id: str, settings: Settings) -> _BaseImageProvider:
    if provider_id == "pixabay":
        return PixabayImageSourceProvider(settings)
    if provider_id == "pexels":
        return PexelsImageSourceProvider(settings)
    return UnsplashImageSourceProvider(settings)


def _provider_has_key(settings: Settings, provider_id: str) -> bool:
    if provider_id == "unsplash":
        return bool(str(settings.image_source_unsplash_access_key or "").strip())
    if provider_id == "pixabay":
        return bool(str(settings.image_source_pixabay_api_key or "").strip())
    if provider_id == "pexels":
        return bool(str(settings.image_source_pexels_api_key or "").strip())
    return False


def _normalize_unsplash(raw: Any) -> dict[str, Any]:
    item = _dict(raw)
    urls = _dict(item.get("urls"))
    links = _dict(item.get("links"))
    user = _dict(item.get("user"))
    photographer = _normalize_text(user.get("name"), limit=MAX_TEXT_CHARS)
    source_url = _normalize_url(links.get("html"))
    user_links = _dict(user.get("links"))
    return _candidate(
        provider="unsplash",
        candidate_id=str(item.get("id") or ""),
        description=_normalize_text(
            item.get("alt_description") or item.get("description"),
            limit=MAX_TEXT_CHARS,
        ),
        download_url=_normalize_url(urls.get("regular")),
        thumbnail_url=_normalize_url(urls.get("thumb") or urls.get("small")),
        source_url=source_url,
        photographer=photographer,
        photographer_url=_normalize_url(user_links.get("html")),
        attribution=_attribution(
            provider="Unsplash",
            photographer=photographer,
            source_url=source_url,
        ),
        download_location=_normalize_url(links.get("download_location")),
    )


def _normalize_pixabay(raw: Any) -> dict[str, Any]:
    item = _dict(raw)
    photographer = _normalize_text(item.get("user"), limit=MAX_TEXT_CHARS)
    source_url = _normalize_url(item.get("pageURL"))
    return _candidate(
        provider="pixabay",
        candidate_id=str(item.get("id") or ""),
        description=_normalize_text(item.get("tags"), limit=MAX_TEXT_CHARS),
        download_url=_normalize_url(item.get("largeImageURL") or item.get("webformatURL")),
        thumbnail_url=_normalize_url(item.get("previewURL") or item.get("webformatURL")),
        source_url=source_url,
        photographer=photographer,
        photographer_url="",
        attribution=_attribution(
            provider="Pixabay",
            photographer=photographer,
            source_url=source_url,
        ),
        download_location="",
    )


def _normalize_pexels(raw: Any) -> dict[str, Any]:
    item = _dict(raw)
    src = _dict(item.get("src"))
    photographer = _normalize_text(item.get("photographer"), limit=MAX_TEXT_CHARS)
    source_url = _normalize_url(item.get("url"))
    return _candidate(
        provider="pexels",
        candidate_id=str(item.get("id") or ""),
        description=_normalize_text(item.get("alt"), limit=MAX_TEXT_CHARS),
        download_url=_normalize_url(src.get("large") or src.get("original")),
        thumbnail_url=_normalize_url(src.get("tiny") or src.get("medium")),
        source_url=source_url,
        photographer=photographer,
        photographer_url=_normalize_url(item.get("photographer_url")),
        attribution=_attribution(
            provider="Pexels",
            photographer=photographer,
            source_url=source_url,
        ),
        download_location="",
    )


def _candidate(
    *,
    provider: str,
    candidate_id: str,
    description: str,
    download_url: str,
    thumbnail_url: str,
    source_url: str,
    photographer: str,
    photographer_url: str,
    attribution: str,
    download_location: str,
) -> dict[str, Any]:
    stable_id = candidate_id or _hash_text(download_url or source_url)
    suggested_filename = _suggested_candidate_filename(
        provider=provider,
        stable_id=stable_id,
        download_url=download_url,
        source_url=source_url,
    )
    return {
        "contract_version": IMAGE_CANDIDATE_CONTRACT,
        "id": stable_id,
        "provider": provider,
        "provider_origin": "cloud",
        "source_type": "stock",
        "description": description,
        "alt_description": description,
        "download_url": download_url,
        "regular_url": download_url,
        "thumbnail_url": thumbnail_url,
        "thumb_url": thumbnail_url,
        "source_url": source_url,
        "html_url": source_url,
        "download_location": download_location,
        "suggested_filename": suggested_filename,
        "filename_basis": {
            "owner": "wordpress_write_ability_final",
            "strategy": "provider_candidate_id",
            "final_sanitize_unique_required": True,
        },
        "photographer": photographer,
        "photographer_url": photographer_url,
        "attribution": attribution,
        "license_review_status": "required",
        "requires_human_license_review": True,
        "warnings": [
            "Review provider license, attribution, and usage restrictions before adoption."
        ],
        "provenance": {
            "provider": provider,
            "provider_origin": "cloud",
            "source_type": "stock",
            "source_url": source_url,
            "download_location": download_location,
            "photographer": photographer,
        },
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
    }


def _build_result(
    *,
    provider_id: str,
    auto_strategy: str,
    query: str,
    options: dict[str, Any],
    candidates: list[dict[str, Any]],
    usage: ImageSourceProviderUsage,
) -> ImageSourceExecutionResult:
    candidates = [
        item for item in candidates if item.get("download_url") or item.get("source_url")
    ][: int(options["per_page"])]
    query_hash = _hash_text(query)
    ai_generation_handoff = _build_ai_generation_handoff(
        query_hash=query_hash,
        options=options,
    )
    result_json = {
        "artifact_type": "image_source_candidates",
        "composition_role": "image_source_candidates",
        "status": "ready",
        "provider": "magick_ai_cloud",
        "provider_mode": provider_id,
        "requested_provider_mode": str(options.get("provider") or "auto"),
        "resolved_provider": provider_id,
        "auto_strategy": auto_strategy,
        "candidate_contract_version": IMAGE_CANDIDATE_CONTRACT,
        "query_hash": query_hash,
        "query_chars": len(query),
        "active_sources": [{"provider": provider_id, "count": len(candidates)}],
        "provider_errors": [],
        "images": candidates,
        "candidates": candidates,
        "ai_generation_handoff": ai_generation_handoff,
        "handoff": {
            "candidate_contract": IMAGE_CANDIDATE_CONTRACT,
            "final_writes": "core_proposal_required",
            "direct_wordpress_write": False,
            "available_actions": [ai_generation_handoff],
        },
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
    }
    return ImageSourceExecutionResult(result_json=result_json, usage=usage)


def _build_ai_generation_handoff(
    *,
    query_hash: str,
    options: dict[str, Any],
) -> dict[str, Any]:
    return {
        "action_id": "ai_generate_image",
        "action_kind": "runtime_handoff",
        "trigger": "manual_user_action",
        "label": "ai_generate",
        "runtime": {
            "ability_name": IMAGE_GENERATION_CLOUD_ABILITY,
            "contract_version": IMAGE_GENERATION_CONTRACT,
            "profile_id": IMAGE_GENERATION_PROFILE_ID,
            "execution_kind": IMAGE_GENERATION_EXECUTION_KIND,
            "execution_pattern": "inline",
            "ability_family": "vision",
            "data_classification": "internal",
            "storage_mode": "result_only",
            "policy": {"allow_fallback": False},
        },
        "input_contract": IMAGE_GENERATION_CONTRACT,
        "result_contract": IMAGE_GENERATION_RESULT_CONTRACT,
        "input_defaults": {
            "contract_version": IMAGE_GENERATION_CONTRACT,
            "aspect_ratio": _default_generation_aspect_ratio(
                str(options.get("orientation") or "")
            ),
            "resolution": "high",
            "response_format": "url",
            "n": 1,
        },
        "required_local_fields": ["prompt"],
        "local_prompt_sources": [
            "image_source_runtime_input.query",
            "post_title",
            "post_excerpt",
            "selected_text_context",
        ],
        "prompt_prefill_plan": _build_prompt_prefill_plan(options),
        "batch_generation_plan": _build_batch_generation_plan(options),
        "source_context": {
            "query_hash": query_hash,
            "purpose": str(options.get("purpose") or "image_reference_candidate"),
            "orientation": str(options.get("orientation") or ""),
        },
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
    }


def _build_batch_generation_plan(options: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "local_reviewed_batch_plan",
        "status": "available_with_local_orchestration",
        "owner": "local_plugin_control_plane",
        "requires_entitlement": True,
        "requires_user_review": True,
        "requires_per_item_prompt_review": True,
        "default_item_count": 1,
        "max_items_per_user_action": min(10, max(1, int(options.get("per_page") or 1))),
        "recommended_execution_pattern": "inline",
        "future_execution_pattern": "whole_run_offload",
        "queue_owner": "cloud_runtime_worker",
        "quota_owner": "cloud_runtime_entitlement",
        "result_owner": "cloud_runtime_result",
        "write_owner": "local_wordpress_approval_flow",
        "direct_wordpress_write": False,
        "do_not_autorun": True,
        "failure_policy": {
            "partial_results_allowed": True,
            "failed_items_require_user_retry": True,
        },
    }


def _build_prompt_prefill_plan(options: dict[str, Any]) -> dict[str, Any]:
    orientation = str(options.get("orientation") or "").strip().lower()
    purpose = str(options.get("purpose") or "image_reference_candidate").strip()
    return {
        "mode": "local_context_prefill",
        "owner": "local_plugin_ui",
        "requires_user_review": True,
        "max_prompt_chars": 1200,
        "source_priority": [
            "user_edited_prompt",
            "image_source_runtime_input.query",
            "post_title",
            "post_excerpt",
            "selected_text_context",
        ],
        "local_prompt_fields": [
            {
                "field": "subject",
                "required": True,
                "sources": ["user_edited_prompt", "image_source_runtime_input.query"],
                "max_chars": 220,
            },
            {
                "field": "context",
                "required": False,
                "sources": ["post_title", "post_excerpt", "selected_text_context"],
                "max_chars": 420,
            },
            {
                "field": "composition",
                "required": False,
                "default": _composition_hint(orientation),
                "max_chars": 180,
            },
            {
                "field": "style",
                "required": False,
                "default": _style_hint(purpose),
                "max_chars": 180,
            },
            {
                "field": "constraints",
                "required": False,
                "default": (
                    "No text overlays, no logos, no direct trademark use unless "
                    "supplied by the user."
                ),
                "max_chars": 180,
            },
        ],
        "assembly": {
            "format": "plain_text_sections",
            "section_order": ["subject", "context", "composition", "style", "constraints"],
            "joiner": ". ",
        },
        "safety": {
            "must_review_before_execute": True,
            "do_not_autorun": True,
            "do_not_include_secrets": True,
            "do_not_include_wordpress_credentials": True,
            "direct_wordpress_write": False,
        },
    }


def _composition_hint(orientation: str) -> str:
    normalized = str(orientation or "").strip().lower()
    if normalized == "portrait":
        return "Portrait composition, clear central subject, editorial crop."
    if normalized in {"square", "squarish"}:
        return "Square composition, balanced subject placement, clean margins."
    return "Wide editorial hero composition, clear focal point, usable negative space."


def _style_hint(purpose: str) -> str:
    normalized = str(purpose or "").strip().lower()
    if "product" in normalized:
        return "Professional product photography, natural lighting, realistic materials."
    if "featured" in normalized or "hero" in normalized:
        return "Editorial hero image, polished but realistic, publication-ready."
    return "Realistic editorial image, natural lighting, high visual clarity."


def _default_generation_aspect_ratio(orientation: str) -> str:
    normalized = str(orientation or "").strip().lower()
    if normalized == "portrait":
        return "3:4"
    if normalized in {"square", "squarish"}:
        return "1:1"
    return "16:9"


def _normalize_text(value: Any, *, limit: int) -> str:
    text = str(value or "").strip()
    text = " ".join(text.split())
    return text[:limit]


def _normalize_token(value: Any, *, limit: int) -> str:
    return "".join(
        ch for ch in str(value or "").strip().lower()[:limit] if ch.isalnum() or ch in {"_", "-"}
    )


def _normalize_url(value: Any) -> str:
    url = str(value or "").strip()
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return url


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _dict(value: Any) -> dict[str, Any]:
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _suggested_candidate_filename(
    *,
    provider: str,
    stable_id: str,
    download_url: str,
    source_url: str,
) -> str:
    provider_slug = _filename_slug(provider, fallback="image")
    identity = _hash_text(stable_id or download_url or source_url)[:12]
    extension = _safe_image_extension(download_url) or _safe_image_extension(source_url) or "jpg"
    return f"{provider_slug}-image-{identity}.{extension}"


def _filename_slug(value: str, *, fallback: str) -> str:
    slug = []
    for ch in value.strip().lower():
        if ch.isalnum():
            slug.append(ch)
        elif ch in {"-", "_", "."}:
            slug.append("-")
    normalized = "-".join(part for part in "".join(slug).split("-") if part)
    return normalized[:80] or fallback


def _safe_image_extension(url: str) -> str:
    path = unquote(urlsplit(url).path or "")
    extension = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    if extension == "jpeg":
        return "jpg"
    return extension if extension in {"jpg", "png", "webp", "avif"} else ""


def _attribution(*, provider: str, photographer: str, source_url: str) -> str:
    creator = photographer or "Unknown creator"
    suffix = f" {source_url}" if source_url else ""
    return f"{provider} image by {creator}.{suffix}".strip()


def _map_http_error(response: httpx.Response) -> str:
    status = response.status_code
    if status in {401, 403}:
        return "provider.auth_error"
    if status == 429:
        return "provider.rate_limited"
    if status >= 500:
        return "provider.upstream_error"
    return "provider.http_error"


def _extract_http_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        data = {}
    if isinstance(data, dict):
        message = data.get("message") or data.get("error") or data.get("errors")
        if isinstance(message, list):
            return _normalize_text("; ".join(str(item) for item in message), limit=200)
        if message:
            return _normalize_text(message, limit=200)
    return f"Image source provider request failed with HTTP {response.status_code}"
