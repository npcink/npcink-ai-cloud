from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol

CAPABILITY_EVIDENCE_MAX_AGE = timedelta(days=30)


class CapabilityEvidenceLike(Protocol):
    state: str
    route_fingerprint: str
    checked_at: datetime | None


def capability_evidence_is_current(
    evidence: CapabilityEvidenceLike | None,
    *,
    route_fingerprint: str,
    now: datetime | None = None,
) -> bool:
    return bool(
        evidence is not None
        and evidence.state == "verified"
        and capability_evidence_is_fresh(
            evidence,
            route_fingerprint=route_fingerprint,
            now=now,
        )
    )


def capability_evidence_is_fresh(
    evidence: CapabilityEvidenceLike | None,
    *,
    route_fingerprint: str,
    now: datetime | None = None,
) -> bool:
    if evidence is None or evidence.checked_at is None:
        return False
    checked_at = evidence.checked_at
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    resolved_now = now or datetime.now(UTC)
    return bool(
        evidence.route_fingerprint == route_fingerprint
        and checked_at >= resolved_now - CAPABILITY_EVIDENCE_MAX_AGE
    )
