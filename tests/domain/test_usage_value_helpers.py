from datetime import UTC, datetime

from app.domain.usage.value_helpers import (
    _calculate_percentile,
    _format_datetime,
    _parse_logs_analytics_datetime,
    _safe_rate,
)


def test_usage_value_helpers_preserve_time_and_rate_contracts() -> None:
    value = datetime(2026, 9, 9, 12, 30, tzinfo=UTC)
    assert _format_datetime(value) == '2026-09-09 12:30:00'
    assert _parse_logs_analytics_datetime('2026-09-09T12%3A30%3A00') == value
    assert _safe_rate(3, 4) == 0.75
    assert _safe_rate(1, 0) == 0.0


def test_usage_percentile_is_deterministic_for_empty_and_ordered_values() -> None:
    assert _calculate_percentile([], 0.95) == 0
    assert _calculate_percentile([10, 20, 30, 40], 50) == 20
    assert _calculate_percentile([40, 10, 30, 20], 95) == 40
