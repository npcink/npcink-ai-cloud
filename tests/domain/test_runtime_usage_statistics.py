from datetime import UTC, datetime, timedelta

from app.core.models import RunRecord
from app.domain.runtime.usage_statistics import build_usage_statistics


def test_usage_counts_sites_statuses_and_utc_days_without_payloads() -> None:
    now = datetime(2026, 9, 10, 12, tzinfo=UTC)
    runs = [
        RunRecord(
            site_id="site-a",
            profile_id="classification",
            status="succeeded",
            started_at=now - timedelta(days=1),
            finished_at=now - timedelta(days=1) + timedelta(seconds=2),
        ),
        RunRecord(site_id="site-a", profile_id="classification", status="failed", started_at=now),
        RunRecord(site_id="site-b", profile_id="text", status="running", started_at=now),
    ]
    result = build_usage_statistics(runs, since=now - timedelta(days=2), until=now)
    assert result["runs"] == 3
    assert result["active_sites"] == 2
    assert result["success_rate"] == 1 / 3
    assert result["failed"] == 1
    assert result["avg_latency_ms"] == 2000
    assert result["latency_samples"] == 1
    assert [row["runs"] for row in result["timeline"]] == [0, 1, 2]
    assert result["sites"][0]["id"] == "site-a"
    assert result["functions"][0]["runs"] == 2
    assert "input" not in str(result)


def test_empty_usage_has_no_success_rate_or_duration() -> None:
    now = datetime.now(UTC)
    result = build_usage_statistics([], since=now, until=now)
    assert result["runs"] == 0
    assert result["success_rate"] is None
    assert result["avg_latency_ms"] is None
    assert result["possibly_truncated"] is False
