"""Read-only diagnostic estimates; never feed reference prices into billing/budgets."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from app.adapters.providers.base import ProviderExecutionResult
from app.core.models import CatalogModel
from app.domain.model_references import MODEL_REFERENCE_PRICE_UNIT, ModelReferenceService


def _rate(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and value >= 0 else None


def _timestamp(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    except (ValueError, TypeError):
        return None


def model_test_cost(
    database_url: str,
    model: CatalogModel,
    upstream_model_id: str,
    result: ProviderExecutionResult,
) -> dict[str, Any]:
    unknown = {"amount_usd": None, "basis": "unavailable"}
    if result.cost_estimate_mode == "provider_reported" and _rate(result.cost) is not None:
        return {"amount_usd": result.cost, "basis": "provider_reported"}
    # Missing usage is not evidence of a free call.
    if result.tokens_in + result.tokens_out <= 0:
        return unknown
    cached = max(0, result.cache_read_tokens)
    written = max(0, result.cache_write_tokens)
    uncached = (
        result.uncached_input_tokens
        if result.uncached_input_tokens is not None
        else max(0, result.tokens_in - cached - written)
    )
    if uncached < 0 or uncached + cached + written != result.tokens_in:
        return unknown
    runtime_prices = (model.raw_json or {}).get("runtime_pricing") or {}
    if not isinstance(runtime_prices, dict):
        runtime_prices = {}
    catalog_prices = {
        "input": model.price_input,
        "output": model.price_output,
        "cache_read": runtime_prices.get("cache_read"),
        "cache_write": runtime_prices.get("cache_write"),
    }

    def estimate(prices: dict[str, Any], basis: str, checked_at: str) -> dict[str, Any] | None:
        rates = {key: _rate(prices.get(key)) for key in catalog_prices}
        counts = {
            "input": uncached,
            "output": result.tokens_out,
            "cache_read": cached,
            "cache_write": written,
        }
        effective = {
            **rates,
            "cache_read": rates["cache_read"]
            if rates["cache_read"] is not None
            else rates["input"],
            "cache_write": rates["cache_write"]
            if rates["cache_write"] is not None
            else rates["input"],
        }
        if any(count > 0 and effective[key] is None for key, count in counts.items()):
            return None
        amount = sum(count * (effective[key] or 0) for key, count in counts.items()) / 1_000_000
        if not math.isfinite(amount):
            return None
        return {
            "amount_usd": amount,
            "basis": basis,
            "price_checked_at": checked_at,
            "rates": rates,
            "conservative_cache_rate": any(
                counts[key] > 0 and rates[key] is None for key in ("cache_read", "cache_write")
            ),
        }

    catalog = estimate(catalog_prices, "catalog", model.updated_at.isoformat())
    if catalog:
        return catalog
    try:
        references = ModelReferenceService(database_url).list_references(
            provider_id=model.provider_id,
            model_ids=[upstream_model_id],
            include_deprecated=False,
        )
    except SQLAlchemyError:
        return unknown  # Optional price metadata must not hide an already successful call.
    sources = {row["source_id"]: row for row in references["source_summary"]}
    now = datetime.now(UTC)
    for reference in references["items"]:
        source = sources.get(reference["source_id"], {})
        recorded = _timestamp(reference["synced_at"])
        checked = _timestamp(source.get("last_synced_at", ""))
        if (
            source.get("status") != "active"
            or recorded is None
            or checked != recorded
            or not 0 <= (now - recorded).total_seconds() < 86400
            or reference["price"]["unit"] != MODEL_REFERENCE_PRICE_UNIT
            or reference["status"] not in {"reference", "available"}
        ):
            continue
        estimated = estimate(reference["price"], "reference", reference["synced_at"])
        if estimated:
            return {
                **estimated,
                "source": reference["source_label"],
                "overridden": reference["override_present"],
            }
    return unknown
