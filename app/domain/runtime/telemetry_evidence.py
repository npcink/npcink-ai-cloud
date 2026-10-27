"""Payload-free evidence states shared by diagnostic counts and run records."""

from datetime import UTC, datetime, timedelta

from app.core.models import RunRecord

NON_AI_ZERO_CREDIT_EXECUTION_KINDS = frozenset({"media_upload"})
PENDING_PROVIDER_EVIDENCE_STATUSES = frozenset({"queued", "running"})


def observation_since(now: datetime, recent_minutes: int, since: datetime | None) -> datetime:
    lower = now - timedelta(minutes=max(1, recent_minutes))
    if since is None:
        return lower
    aware = since.replace(tzinfo=UTC) if since.tzinfo is None else since.astimezone(UTC)
    return min(now, max(lower, aware))


def provider_evidence_state(run: RunRecord, call_count: int) -> str:
    if run.execution_kind in NON_AI_ZERO_CREDIT_EXECUTION_KINDS:
        return "not_required"
    if call_count:
        return "recorded"
    if run.status in PENDING_PROVIDER_EVIDENCE_STATUSES:
        return "pending"
    if run.status == "failed":
        return "failed_without_call"
    if run.status == "canceled":
        return "canceled_without_call"
    return "missing"
