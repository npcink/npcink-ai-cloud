"""Pure statistics and time value helpers for usage projections."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import unquote_plus


def _average_latency(latencies: list[int]) -> int:
        if not latencies:
            return 0
        return int(round(sum(latencies) / len(latencies)))


def _safe_rate(numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0.0
        return round(numerator / denominator, 4)


def _normalize_datetime(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _normalize_required_datetime(value)


def _normalize_required_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


def _format_datetime(value: datetime) -> str:
        normalized = _normalize_datetime(value)
        if normalized is None:
            return ""
        return normalized.strftime("%Y-%m-%d %H:%M:%S")


def _format_datetime_or_empty(value: datetime | None) -> str:
        normalized = _normalize_datetime(value)
        if normalized is None:
            return ""
        return normalized.strftime("%Y-%m-%d %H:%M:%S")


def _parse_logs_analytics_datetime(value: str) -> datetime | None:
        normalized_value = str(value or "").strip()
        normalized_value = normalized_value.replace("%%20", " ").replace("%20", " ")
        normalized_value = normalized_value.replace("% ", " ")
        normalized_value = unquote_plus(normalized_value).strip()
        normalized_value = normalized_value.replace("T", " ")
        if not normalized_value:
            return None
        return datetime.strptime(normalized_value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)


def _coerce_non_negative_int(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0


def _calculate_percentile(values: list[int], percentile: float) -> int:
        if not values:
            return 0
        normalized = sorted(max(0, int(value)) for value in values)
        if len(normalized) == 1:
            return normalized[0]
        rank = max(
            0,
            min(
                len(normalized) - 1,
                int((len(normalized) * max(0.0, float(percentile))) / 100.0 + 0.999999) - 1,
            ),
        )
        return normalized[rank]
