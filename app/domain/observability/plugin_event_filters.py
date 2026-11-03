"""Shared retained-event categories; unknown events remain in activity, not status sync."""
from typing import Any

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

from app.core.models import PluginObservabilityEvent

STATUS_EVENT_KINDS = ("addon.monitoring.state_projected", "addon.monitoring.health_reported")


def plugin_event_category_conditions(category: str) -> list[ColumnElement[Any]]:
    status_event = func.coalesce(PluginObservabilityEvent.event_kind, "").in_(STATUS_EVENT_KINDS)
    if category == "status":
        return [status_event]
    if category == "activity":
        return [~status_event]
    if category != "all":
        raise ValueError("unsupported plugin event category")
    return []
