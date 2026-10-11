"""Bounded, payload-free provider failure evidence for internal operators."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import Row

from app.core.models import ProviderCallRecord, RunRecord


def provider_failure_evidence(
    rows: Iterable[Row[tuple[ProviderCallRecord, RunRecord]]], *, limit: int
) -> list[dict[str, str]]:
    failures = []
    for call, run in rows:
        if not call.error_code:
            continue
        message = str(run.error_message or "")
        reason = "unknown"
        if call.error_code == "provider.invalid_request":
            reason = "invalid_request"
            if "additionalProperties" in message and "required" in message:
                reason = "output_schema_invalid"
        elif "timeout" in call.error_code:
            reason = "timeout"
        failures.append(
            {
                "run_id": run.run_id,
                "site_id": run.site_id,
                "profile_id": run.profile_id,
                "ability_family": run.ability_family,
                "provider_id": call.provider_id,
                "model_id": call.model_id,
                "error_code": call.error_code,
                "reason": reason,
                "occurred_at": call.created_at.isoformat() if call.created_at else "",
                "recovery": "unverified",
            }
        )
        if len(failures) >= limit:
            break
    return failures
