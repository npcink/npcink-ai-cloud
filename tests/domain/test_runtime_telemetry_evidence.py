from datetime import UTC, datetime, timedelta

import pytest

from app.core.models import RunRecord
from app.domain.runtime.telemetry_evidence import observation_since, provider_evidence_state


@pytest.mark.parametrize(("status", "kind", "calls", "expected"), [
    ("queued", "text", 0, "pending"),
    ("running", "text", 0, "pending"),
    ("failed", "text", 0, "failed_without_call"),
    ("canceled", "text", 0, "canceled_without_call"),
    ("succeeded", "text", 0, "missing"),
    ("succeeded", "text", 2, "recorded"),
    ("succeeded", "media_upload", 0, "not_required"),
])
def test_call_evidence_does_not_invent_a_failure_cause(status, kind, calls, expected):
    assert provider_evidence_state(RunRecord(status=status, execution_kind=kind), calls) == expected


def test_review_start_intersects_the_window_and_normalizes_timezones():
    now = datetime(2026, 10, 27, 12, tzinfo=UTC)
    assert observation_since(now, 60, None) == now - timedelta(hours=1)
    assert observation_since(now, 60, now - timedelta(days=1)) == now - timedelta(hours=1)
    assert observation_since(now, 60, now + timedelta(hours=1)) == now
    assert observation_since(now, 60, now.replace(tzinfo=None)) == now
