"""Pure value and report helpers for plugin observability."""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, cast


def _parse_datetime(value: object) -> datetime | None:
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)


def _optional_int(value: object) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(cast(Any, value))
        except (TypeError, ValueError):
            return None


def _coerce_int(value: object, default: int = 0) -> int:
        try:
            return int(cast(Any, value))
        except (TypeError, ValueError):
            return default


def _coerce_float(value: object, default: float = 0.0) -> float:
        try:
            return float(cast(Any, value))
        except (TypeError, ValueError):
            return default


def _dict_items(value: object) -> list[dict[str, object]]:
        if not isinstance(value, list):
            return []
        return [
            {str(key): item for key, item in candidate.items()}
            for candidate in value
            if isinstance(candidate, dict)
        ]


def _string_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]


def _rowcount(result: object) -> int:
        return _coerce_int(getattr(result, "rowcount", 0))


def _is_safe_scalar(value: object) -> bool:
        return value is None or isinstance(value, str | int | float | bool)


def _hour_floor(value: datetime) -> datetime:
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.replace(minute=0, second=0, microsecond=0)


def _attention_key(

        *,
        code: str,
        site_id: str = "",
        plugin_slug: str = "",
        event_kind: str = "",
        error_code: str = "",
    ) -> str:
        source = "|".join(
            [
                str(code or ""),
                str(site_id or ""),
                str(plugin_slug or ""),
                str(event_kind or ""),
                str(error_code or ""),
            ]
        )
        return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _health_summary(status: str) -> str:
        if status == "error":
            return "Error pressure needs operator attention."
        if status == "warning":
            return "Review the highlighted monitoring signals."
        if status == "inactive":
            return "No plugin events in the selected window."
        return "Plugin telemetry is reporting normally."


def _stale_detail(

        last_seen_at: str,
        *,
        current_time: datetime,
        window_hours: int,
    ) -> str:
        last_seen = _parse_datetime(last_seen_at)
        if not last_seen:
            return ""
        stale_threshold = timedelta(hours=min(24, max(2, window_hours // 4)))
        age = current_time - last_seen
        if age <= stale_threshold:
            return ""
        age_hours = round(age.total_seconds() / 3600, 1)
        return f"Last plugin event was received {age_hours} hours ago."


def _success_rate(events_total: int, error_total: int) -> float:
        if events_total <= 0:
            return 0.0
        return round(max(0, events_total - error_total) / events_total, 4)


def _optional_avg(value: object) -> int:
        if value is None:
            return 0
        return int(round(_coerce_float(value)))


def _format_datetime(value: object) -> str:
        if not isinstance(value, datetime):
            return ""
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.isoformat().replace("+00:00", "Z")
