from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

PROVIDER_EVIDENCE_METER_KEYS = frozenset(
    {
        "provider_calls",
        "input_tokens_uncached",
        "cache_read_tokens",
        "cache_write_tokens",
    }
)
_EXPLICIT_CACHE_COST_MODES = frozenset({"cache_rates", "provider_reported"})
_MISSING_CACHE_COST_MODES = frozenset(
    {"conservative_input_rate", "partial_rates", "unpriced", "unreported"}
)


@dataclass(frozen=True, slots=True)
class ProviderEvidenceRecord:
    call_id: int
    run_id: str
    site_id: str
    ability_name: str
    provider_id: str
    model_id: str
    instance_id: str
    latency_ms: int
    tokens_in: int
    tokens_out: int
    cost: float
    retry_count: int
    fallback_used: bool
    error_code: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ProviderEvidenceMeterEvent:
    provider_call_id: int
    meter_key: str
    quantity: float
    payload: dict[str, Any]


def summarize_provider_runtime_evidence(
    records: list[ProviderEvidenceRecord],
    meter_events: list[ProviderEvidenceMeterEvent],
    *,
    lane_limit: int,
) -> dict[str, object]:
    events_by_call: dict[int, list[ProviderEvidenceMeterEvent]] = defaultdict(list)
    for event in meter_events:
        events_by_call[event.provider_call_id].append(event)

    summary = _summarize_records(records, events_by_call)
    lane_records: dict[tuple[str, str, str], list[ProviderEvidenceRecord]] = defaultdict(list)
    for record in records:
        lane_records[
            (record.provider_id, record.model_id, record.ability_name)
        ].append(record)

    lanes: list[dict[str, object]] = []
    for (provider_id, model_id, ability_name), grouped_records in lane_records.items():
        lane_summary = _summarize_records(grouped_records, events_by_call)
        lanes.append(
            {
                "provider_id": provider_id,
                "model_id": model_id,
                "ability_name": ability_name,
                **lane_summary,
            }
        )
    lanes.sort(
        key=lambda item: (
            -(_nonnegative_int(item["evidence_records_total"]) or 0),
            str(item["provider_id"]),
            str(item["model_id"]),
            str(item["ability_name"]),
        )
    )

    return {
        "summary": summary,
        "lanes": lanes[: max(1, lane_limit)],
        "lanes_total": len(lanes),
        "lanes_truncated": len(lanes) > max(1, lane_limit),
        "decision_support": _build_decision_support(summary),
        "boundary": {
            "surface": "internal_operator_runtime_evidence",
            "cloud_role": "runtime_detail",
            "read_only": True,
            "contains_prompt_or_result_payloads": False,
            "contains_cache_keys": False,
            "direct_wordpress_write": False,
            "local_prompt_workflow_and_write_truth_unchanged": True,
        },
    }


def _summarize_records(
    records: list[ProviderEvidenceRecord],
    events_by_call: dict[int, list[ProviderEvidenceMeterEvent]],
) -> dict[str, object]:
    latencies = sorted(
        record.latency_ms
        for record in records
        if record.latency_ms > 0
        if not _is_preflight_rejected(_provider_payload(events_by_call, record.call_id))
    )
    successful_records = sum(1 for record in records if not record.error_code)
    error_records = len(records) - successful_records
    fallback_records = sum(1 for record in records if record.fallback_used)
    tokens_in = sum(max(0, record.tokens_in) for record in records)
    tokens_out = sum(max(0, record.tokens_out) for record in records)
    cost_total = round(sum(max(0.0, record.cost) for record in records), 6)

    meter_totals: dict[str, float] = defaultdict(float)
    provider_event_records = 0
    cost_modes: Counter[str] = Counter()
    affinity_applied_records = 0
    affinity_not_applied_records = 0
    cache_read_records = 0
    cache_write_records = 0
    accepted_preflight_records = 0
    rejected_preflight_records = 0
    rejected_zero_usage_records = 0
    rejected_usage_violation_records = 0
    calibration_ratios: list[float] = []
    calibration_absolute_errors: list[int] = []
    calibration_underestimates: list[int] = []
    cache_cost_modes: list[str] = []

    for record in records:
        events = events_by_call.get(record.call_id, [])
        quantities: dict[str, float] = defaultdict(float)
        for event in events:
            quantities[event.meter_key] += max(0.0, event.quantity)
            meter_totals[event.meter_key] += max(0.0, event.quantity)
        payload = _provider_payload(events_by_call, record.call_id)
        if payload:
            provider_event_records += 1
        cost_mode = str(payload.get("cost_estimate_mode") or "unreported")
        cost_modes[cost_mode] += 1

        affinity_applied = payload.get("cache_affinity_applied")
        if affinity_applied is True:
            affinity_applied_records += 1
        elif affinity_applied is False:
            affinity_not_applied_records += 1

        cache_read = quantities["cache_read_tokens"]
        cache_write = quantities["cache_write_tokens"]
        if cache_read > 0:
            cache_read_records += 1
        if cache_write > 0:
            cache_write_records += 1
        if cache_read > 0 or cache_write > 0:
            cache_cost_modes.append(cost_mode)

        preflight_state = str(payload.get("context_preflight") or "")
        if preflight_state == "accepted":
            accepted_preflight_records += 1
            estimated_input = _nonnegative_int(payload.get("estimated_input_tokens"))
            if record.tokens_in > 0 and estimated_input is not None:
                calibration_ratios.append(estimated_input / record.tokens_in)
                absolute_error = abs(estimated_input - record.tokens_in)
                calibration_absolute_errors.append(absolute_error)
                if estimated_input < record.tokens_in:
                    calibration_underestimates.append(record.tokens_in - estimated_input)
        elif preflight_state == "rejected":
            rejected_preflight_records += 1
            zero_usage = record.tokens_in == 0 and record.tokens_out == 0 and record.cost == 0
            if zero_usage:
                rejected_zero_usage_records += 1
            else:
                rejected_usage_violation_records += 1

    cache_read_tokens = round(meter_totals["cache_read_tokens"], 6)
    cache_write_tokens = round(meter_totals["cache_write_tokens"], 6)
    uncached_input_tokens = round(meter_totals["input_tokens_uncached"], 6)
    detailed_input_tokens = (
        uncached_input_tokens + cache_read_tokens + cache_write_tokens
    )
    cache_read_ratio = _ratio(cache_read_tokens, tokens_in)
    detail_coverage_ratio = _ratio(min(detailed_input_tokens, float(tokens_in)), tokens_in)
    metering_completeness_ratio = _ratio(provider_event_records, len(records))

    return {
        "evidence_records_total": len(records),
        "successful_records": successful_records,
        "error_records": error_records,
        "fallback_records": fallback_records,
        "success_rate": _ratio(successful_records, len(records)),
        "error_rate": _ratio(error_records, len(records)),
        "fallback_rate": _ratio(fallback_records, len(records)),
        "latency_ms": {
            "sample_count": len(latencies),
            "avg": round(sum(latencies) / len(latencies), 2) if latencies else None,
            "p50": _percentile(latencies, 50),
            "p95": _percentile(latencies, 95),
            "max": max(latencies) if latencies else None,
        },
        "tokens": {
            "input": tokens_in,
            "output": tokens_out,
            "uncached_input": uncached_input_tokens,
            "cache_read": cache_read_tokens,
            "cache_write": cache_write_tokens,
            "input_detail_coverage_ratio": detail_coverage_ratio,
        },
        "cache": {
            "affinity_applied_records": affinity_applied_records,
            "affinity_not_applied_records": affinity_not_applied_records,
            "affinity_unreported_records": max(
                0,
                len(records)
                - affinity_applied_records
                - affinity_not_applied_records,
            ),
            "read_records": cache_read_records,
            "write_records": cache_write_records,
            "read_ratio": cache_read_ratio,
        },
        "cost": {
            "total_usd": cost_total,
            "per_success_usd": (
                round(cost_total / successful_records, 6)
                if successful_records
                else None
            ),
            "estimate_modes": dict(sorted(cost_modes.items())),
            "cache_monetary_evidence_status": _cache_monetary_status(
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                cache_cost_modes=cache_cost_modes,
            ),
        },
        "context_preflight": {
            "accepted_records": accepted_preflight_records,
            "rejected_records": rejected_preflight_records,
            "rejected_zero_usage_records": rejected_zero_usage_records,
            "rejected_usage_violation_records": rejected_usage_violation_records,
            "false_rejects_observable": False,
            "calibration": {
                "sample_count": len(calibration_ratios),
                "estimate_to_actual_ratio_p50": _percentile_float(
                    calibration_ratios,
                    50,
                ),
                "estimate_to_actual_ratio_p95": _percentile_float(
                    calibration_ratios,
                    95,
                ),
                "absolute_error_tokens_p95": _percentile(
                    sorted(calibration_absolute_errors),
                    95,
                ),
                "underestimated_records": len(calibration_underestimates),
                "max_underestimate_tokens": (
                    max(calibration_underestimates)
                    if calibration_underestimates
                    else 0
                ),
            },
        },
        "metering": {
            "provider_call_event_records": provider_event_records,
            "completeness_ratio": metering_completeness_ratio,
        },
        "last_observed_at": max(
            (record.created_at.isoformat() for record in records),
            default="",
        ),
    }


def _provider_payload(
    events_by_call: dict[int, list[ProviderEvidenceMeterEvent]],
    call_id: int,
) -> dict[str, Any]:
    for event in events_by_call.get(call_id, []):
        if event.meter_key == "provider_calls":
            return event.payload
    return {}


def _is_preflight_rejected(payload: dict[str, Any]) -> bool:
    return str(payload.get("context_preflight") or "") == "rejected"


def _cache_monetary_status(
    *,
    cache_read_tokens: float,
    cache_write_tokens: float,
    cache_cost_modes: list[str],
) -> str:
    if cache_read_tokens <= 0 and cache_write_tokens <= 0:
        return "not_observed"
    if any(mode in _MISSING_CACHE_COST_MODES for mode in cache_cost_modes):
        return "blocked_missing_explicit_cache_rates"
    if cache_cost_modes and all(mode in _EXPLICIT_CACHE_COST_MODES for mode in cache_cost_modes):
        return "confirmed"
    return "blocked_unknown_cost_mode"


def _build_decision_support(summary: dict[str, object]) -> dict[str, object]:
    cache = _dict(summary.get("cache"))
    cost = _dict(summary.get("cost"))
    preflight = _dict(summary.get("context_preflight"))
    metering = _dict(summary.get("metering"))
    reason_codes: list[str] = []
    if (_nonnegative_int(summary.get("evidence_records_total")) or 0) == 0:
        reason_codes.append("provider_evidence.no_records")
    if float(metering.get("completeness_ratio") or 0.0) < 1.0:
        reason_codes.append("provider_evidence.metering_incomplete")
    if int(cache.get("read_records") or 0) == 0:
        reason_codes.append("provider_evidence.cache_read_not_observed")
    monetary_status = str(cost.get("cache_monetary_evidence_status") or "")
    if monetary_status.startswith("blocked_"):
        reason_codes.append("provider_evidence.cache_cost_unconfirmed")
    if (
        int(preflight.get("accepted_records") or 0) == 0
        and int(preflight.get("rejected_records") or 0) == 0
    ):
        reason_codes.append("provider_evidence.context_metadata_missing")
    if int(preflight.get("rejected_usage_violation_records") or 0) > 0:
        reason_codes.append("provider_evidence.preflight_usage_violation")
    return {
        "cache_runtime_evidence_status": (
            "observed" if int(cache.get("read_records") or 0) > 0 else "not_observed"
        ),
        "cache_monetary_evidence_status": monetary_status,
        "context_preflight_evidence_status": (
            "observed"
            if int(preflight.get("accepted_records") or 0) > 0
            or int(preflight.get("rejected_records") or 0) > 0
            else "not_observed"
        ),
        "reason_codes": reason_codes,
        "thresholds_are_external_acceptance_policy": True,
    }


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _nonnegative_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if isinstance(value, str):
        try:
            return max(0, int(value))
        except ValueError:
            return None
    return None


def _ratio(numerator: int | float, denominator: int | float) -> float:
    if denominator <= 0:
        return 0.0
    return round(float(numerator) / float(denominator), 6)


def _percentile(values: list[int], percentile: int) -> int | None:
    if not values:
        return None
    index = max(0, math.ceil((percentile / 100) * len(values)) - 1)
    return values[min(index, len(values) - 1)]


def _percentile_float(values: list[float], percentile: int) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    index = max(0, math.ceil((percentile / 100) * len(sorted_values)) - 1)
    return round(sorted_values[min(index, len(sorted_values) - 1)], 6)
