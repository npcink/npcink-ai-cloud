"""Read-only database pagination over retained plugin metadata, never event payloads."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, func, select

from app.core.db import get_session
from app.core.models import PluginObservabilityEvent as Event
from app.core.models import RunRecord


def get_plugin_event_history(
    database_url: str,
    *,
    window_hours: int = 168,
    site_id: str = "",
    plugin_slug: str = "",
    event_kind: str = "",
    record_scope: str = "operational",
    status: str = "all",
    sort: str = "latest",
    view: str = "groups",
    page: int = 1,
    page_size: int = 20,
    snapshot_at: datetime | None = None,
    snapshot_id: int | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    if (snapshot_at is None) != (snapshot_id is None):
        raise ValueError("snapshot time and id must be supplied together")
    end = snapshot_at.astimezone(UTC) if snapshot_at and snapshot_at.tzinfo else snapshot_at
    if end is not None and (end.tzinfo is None or end > now or end.year < 2000):
        raise ValueError("invalid snapshot time")
    end = end or now
    start = end - timedelta(hours=window_hours)
    conditions = [Event.received_at >= start, Event.received_at <= end]
    for column, value in [
        (Event.site_id, site_id),
        (Event.plugin_slug, plugin_slug),
        (Event.event_kind, event_kind),
    ]:
        if value:
            conditions.append(column == value)
    test_event = Event.event_kind == "validation.technical_monitoring_only"
    if record_scope == "operational":
        conditions.append(~test_event)
    elif record_scope == "test":
        conditions.append(test_event)
    failed = Event.status.in_(["error", "failed"])
    succeeded = Event.status.in_(["ok", "succeeded"])
    if status == "failed":
        conditions.append(failed)
    elif status == "ok":
        conditions.append(succeeded)
    elif status == "other":
        conditions.append(
            func.coalesce(Event.status, "").not_in(["error", "failed", "ok", "succeeded"])
        )

    with get_session(database_url) as session:
        ceiling = (
            snapshot_id
            if snapshot_id is not None
            else int(session.scalar(select(func.max(Event.id)).where(*conditions)) or 0)
        )
        conditions.append(Event.id <= ceiling)
        totals = session.execute(
            select(
                func.count(Event.id),
                func.sum(case((failed, 1), else_=0)),
                func.sum(case((succeeded, 1), else_=0)),
            ).where(*conditions)
        ).one()
        if view == "groups":
            grouped = (
                select(
                    Event.site_id,
                    Event.plugin_slug,
                    Event.event_kind,
                    func.count(Event.id).label("events"),
                    func.sum(case((failed, 1), else_=0)).label("failed"),
                    func.max(Event.received_at).label("received_at"),
                )
                .where(*conditions)
                .group_by(Event.site_id, Event.plugin_slug, Event.event_kind)
                .subquery()
            )
            count = int(session.scalar(select(func.count()).select_from(grouped)) or 0)
            query = select(grouped)
            if sort == "failures":
                query = query.order_by(grouped.c.failed.desc())
            query = query.order_by(
                grouped.c.received_at.desc(),
                grouped.c.site_id,
                grouped.c.plugin_slug,
                grouped.c.event_kind,
            )
        else:
            count = int(totals[0])
            query = (
                select(
                    Event.id,
                    Event.event_id,
                    Event.site_id,
                    Event.plugin_slug,
                    Event.event_kind,
                    Event.status,
                    Event.received_at,
                    RunRecord.run_id,
                )
                .outerjoin(
                    RunRecord,
                    (RunRecord.run_id == Event.correlation_id)
                    & (RunRecord.site_id == Event.site_id),
                )
                .where(*conditions)
            )
            if sort == "failures":
                query = query.order_by(case((failed, 1), else_=0).desc())
            query = query.order_by(Event.received_at.desc(), Event.id.desc())
        pages = max(1, (count + page_size - 1) // page_size)
        current_page = min(page, pages)
        rows = (
            session.execute(query.offset((current_page - 1) * page_size).limit(page_size))
            .mappings()
            .all()
        )
        items = []
        for row in rows:
            item = dict(row)
            stamp = item["received_at"]
            item["received_at"] = (
                stamp.replace(tzinfo=UTC).isoformat() if stamp.tzinfo is None else stamp.isoformat()
            )
            items.append(item)
    return {
        "items": items,
        "view": view,
        "page": current_page,
        "page_size": page_size,
        "total": count,
        "pages": pages,
        "totals": {
            "events": int(totals[0]),
            "failed": int(totals[1] or 0),
            "succeeded": int(totals[2] or 0),
        },
        "snapshot": {"at": end.isoformat(), "id": ceiling},
        "window": {"start_at": start.isoformat(), "end_at": end.isoformat(), "hours": window_hours},
        "boundary": {"retained_records_only": True, "contains_payloads": False},
    }
