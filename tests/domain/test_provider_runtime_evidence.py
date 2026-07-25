from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.domain.runtime.provider_evidence import (
    ProviderEvidenceMeterEvent,
    ProviderEvidenceRecord,
    summarize_provider_runtime_evidence,
)


def _record(
    call_id: int,
    *,
    latency_ms: int = 100,
    tokens_in: int = 1000,
    tokens_out: int = 50,
    cost: float = 0.005,
    error_code: str = "",
    fallback_used: bool = False,
) -> ProviderEvidenceRecord:
    return ProviderEvidenceRecord(
        call_id=call_id,
        run_id=f"run_{call_id}",
        site_id="site_alpha",
        ability_name="npcink/test-provider-evidence",
        provider_id="openai",
        model_id="gpt-test",
        instance_id="openai-global-gpt-test",
        latency_ms=latency_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost=cost,
        retry_count=0,
        fallback_used=fallback_used,
        error_code=error_code,
        created_at=datetime.now(UTC) + timedelta(seconds=call_id),
    )


def _event(
    call_id: int,
    meter_key: str,
    quantity: float,
    *,
    payload: dict[str, object] | None = None,
) -> ProviderEvidenceMeterEvent:
    return ProviderEvidenceMeterEvent(
        provider_call_id=call_id,
        meter_key=meter_key,
        quantity=quantity,
        payload=dict(payload or {}),
    )


def test_provider_runtime_evidence_summarizes_cache_cost_and_preflight_truth() -> None:
    accepted_payload = {
        "cache_affinity_applied": True,
        "cost_estimate_mode": "cache_rates",
        "context_preflight": "accepted",
        "estimated_input_tokens": 900,
        "context_window": 4096,
    }
    unpriced_payload = {
        "cache_affinity_applied": True,
        "cost_estimate_mode": "unpriced",
        "context_preflight": "accepted",
        "estimated_input_tokens": 1200,
        "context_window": 4096,
    }
    rejected_payload = {
        "cache_affinity_applied": False,
        "context_preflight": "rejected",
        "estimated_input_tokens": 5000,
        "context_window": 4096,
    }
    records = [
        _record(1),
        _record(2, latency_ms=200, cost=0.0, fallback_used=True),
        _record(
            3,
            latency_ms=0,
            tokens_in=0,
            tokens_out=0,
            cost=0.0,
            error_code="provider.context_overflow",
        ),
    ]
    events = [
        _event(1, "provider_calls", 1, payload=accepted_payload),
        _event(1, "input_tokens_uncached", 100, payload=accepted_payload),
        _event(1, "cache_read_tokens", 800, payload=accepted_payload),
        _event(1, "cache_write_tokens", 100, payload=accepted_payload),
        _event(2, "provider_calls", 1, payload=unpriced_payload),
        _event(2, "input_tokens_uncached", 200, payload=unpriced_payload),
        _event(2, "cache_read_tokens", 800, payload=unpriced_payload),
        _event(3, "provider_calls", 1, payload=rejected_payload),
    ]

    result = summarize_provider_runtime_evidence(records, events, lane_limit=10)
    summary = result["summary"]

    assert summary["evidence_records_total"] == 3
    assert summary["successful_records"] == 2
    assert summary["error_records"] == 1
    assert summary["fallback_records"] == 1
    assert summary["latency_ms"] == {
        "sample_count": 2,
        "avg": 150.0,
        "p50": 100,
        "p95": 200,
        "max": 200,
    }
    assert summary["tokens"] == {
        "input": 2000,
        "output": 100,
        "uncached_input": 300.0,
        "cache_read": 1600.0,
        "cache_write": 100.0,
        "input_detail_coverage_ratio": 1.0,
    }
    assert summary["cache"]["read_ratio"] == 0.8
    assert summary["cache"]["affinity_applied_records"] == 2
    assert summary["cost"]["cache_monetary_evidence_status"] == (
        "blocked_missing_explicit_cache_rates"
    )
    assert summary["context_preflight"]["accepted_records"] == 2
    assert summary["context_preflight"]["rejected_records"] == 1
    assert summary["context_preflight"]["rejected_zero_usage_records"] == 1
    assert summary["context_preflight"]["rejected_usage_violation_records"] == 0
    assert summary["context_preflight"]["false_rejects_observable"] is False
    assert summary["context_preflight"]["calibration"]["sample_count"] == 2
    assert summary["context_preflight"]["calibration"]["underestimated_records"] == 1
    assert result["decision_support"] == {
        "cache_runtime_evidence_status": "observed",
        "cache_monetary_evidence_status": "blocked_missing_explicit_cache_rates",
        "context_preflight_evidence_status": "observed",
        "reason_codes": ["provider_evidence.cache_cost_unconfirmed"],
        "thresholds_are_external_acceptance_policy": True,
    }
    assert result["boundary"]["read_only"] is True
    assert result["boundary"]["contains_prompt_or_result_payloads"] is False


def test_provider_runtime_evidence_excludes_unknown_zero_latency_from_percentiles() -> None:
    records = [
        _record(1, latency_ms=100),
        _record(
            2,
            latency_ms=0,
            tokens_in=0,
            tokens_out=0,
            cost=0.0,
            error_code="provider.network_error",
        ),
    ]
    events = [
        _event(1, "provider_calls", 1),
        _event(2, "provider_calls", 1),
    ]

    summary = summarize_provider_runtime_evidence(
        records,
        events,
        lane_limit=10,
    )["summary"]

    assert summary["latency_ms"] == {
        "sample_count": 1,
        "avg": 100.0,
        "p50": 100,
        "p95": 100,
        "max": 100,
    }
