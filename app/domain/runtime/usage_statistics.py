"""Payload-free usage projections over the bounded diagnostic run sample."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.models import RunRecord


def build_usage_statistics(
    runs: list[RunRecord], *, since: datetime, until: datetime
) -> dict[str, object]:
    def summary(items: list[RunRecord]) -> dict[str, object]:
        succeeded = sum(run.status == "succeeded" for run in items)
        failed = sum(run.status == "failed" for run in items)
        durations = []
        for run in items:
            if run.started_at and run.finished_at:
                durations.append(max(0, (run.finished_at - run.started_at).total_seconds() * 1000))
        return {
            "runs": len(items),
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": succeeded / len(items) if items else None,
            "avg_latency_ms": sum(durations) / len(durations) if durations else None,
            "latency_samples": len(durations),
        }

    def groups(attribute: str) -> list[dict[str, object]]:
        buckets: dict[str, list[RunRecord]] = {}
        for run in runs:
            key = str(getattr(run, attribute) or "unknown")
            buckets.setdefault(key, []).append(run)
        return [
            {"id": key, **summary(items)}
            for key, items in sorted(buckets.items(), key=lambda pair: (-len(pair[1]), pair[0]))
        ]

    daily: dict[str, list[RunRecord]] = {}
    day = since.date()
    while day <= until.date():
        daily[day.isoformat()] = []
        day += timedelta(days=1)
    for run in runs:
        started = run.started_at
        if started:
            key = (
                started.replace(tzinfo=UTC).date().isoformat()
                if started.tzinfo is None
                else started.astimezone(UTC).date().isoformat()
            )
            daily.setdefault(key, []).append(run)
    return {
        **summary(runs),
        "active_sites": len({run.site_id for run in runs}),
        "sample_limit": 5000,
        "possibly_truncated": len(runs) >= 5000,
        "sites": groups("site_id"),
        "functions": groups("profile_id"),
        "timeline": [{"day": day, **summary(items)} for day, items in sorted(daily.items())],
        "timezone": "UTC",
    }
