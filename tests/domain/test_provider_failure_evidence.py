"""Behavior evidence for the provider failure evidence projection."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.domain.runtime.failure_evidence import provider_failure_evidence


def _row(
    *,
    run_id: str = "run-1",
    error_code: str | None,
    error_message: str | None = None,
    provider_id: str = "openai",
    model_id: str = "gpt-test",
) -> tuple[SimpleNamespace, SimpleNamespace]:
    call = SimpleNamespace(
        error_code=error_code,
        provider_id=provider_id,
        model_id=model_id,
        created_at=datetime(2026, 9, 26, tzinfo=UTC),
    )
    run = SimpleNamespace(
        run_id=run_id,
        site_id="site-1",
        profile_id="profile-1",
        ability_family="wordpress.title",
        error_message=error_message,
    )
    return call, run


def test_failure_evidence_skips_successful_calls_and_classifies_reasons() -> None:
    rows = [
        _row(error_code=None),
        _row(run_id="run-timeout", error_code="provider.timeout"),
        _row(
            run_id="run-schema",
            error_code="provider.invalid_request",
            error_message='payload additionalProperties failed; "required" missing',
        ),
        _row(run_id="run-other", error_code="provider.rate_limited"),
    ]

    evidence = provider_failure_evidence(rows, limit=10)

    assert [item["run_id"] for item in evidence] == [
        "run-timeout",
        "run-schema",
        "run-other",
    ]
    assert [item["reason"] for item in evidence] == [
        "timeout",
        "output_schema_invalid",
        "unknown",
    ]
    assert evidence[0]["recovery"] == "unverified"
    assert evidence[0]["occurred_at"] == "2026-09-26T00:00:00+00:00"


def test_failure_evidence_respects_limit_and_serializes_missing_timestamp() -> None:
    rows = [
        _row(run_id=f"run-{index}", error_code="provider.timeout")
        for index in range(5)
    ]
    limited = provider_failure_evidence(rows, limit=2)
    assert len(limited) == 2

    untimestamped = [
        _row(run_id="run-none", error_code="provider.timeout"),
    ]
    untimestamped[0][0].created_at = None
    evidence = provider_failure_evidence(untimestamped, limit=5)
    assert evidence[0]["occurred_at"] == ""
