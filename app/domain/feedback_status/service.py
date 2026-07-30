from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select

from app.core.db import get_session
from app.core.models import (
    SITE_API_KEY_STATUS_ACTIVE,
    SITE_STATUS_ACTIVE,
    PluginObservabilityEvent,
    RunRecord,
    Site,
    SiteApiKey,
    UsageMeterEvent,
)
from app.domain.agent_feedback.contracts import AGENT_FEEDBACK_EVENT_KIND
from app.domain.observability.editor_assist_quality import (
    ADDON_PLUGIN_SLUG,
    QUALITY_EVENT_KINDS,
)
from app.domain.observability.editor_assist_quality import (
    CONTRACT_VERSION as EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
)
from app.domain.observability.plugin_events import (
    MONITORING_STATE_CONTRACT_VERSION,
    MONITORING_STATE_EVENT_KIND,
    MONITORING_STATE_PLUGIN_SLUG,
)

STATUS_CONTRACT_VERSION = "cloud_feedback_operational_status.v2"
MINIMUM_VALIDATION_SAMPLE = 5
MINIMUM_OBSERVATION_SAMPLE = 50
MINIMUM_DECISION_SAMPLE = 200


class FeedbackOperationalStatusService:
    """Build aggregate, metadata-only feedback coverage evidence."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def get_status(
        self,
        *,
        window_hours: int = 168,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        bounded_hours = min(720, max(1, int(window_hours or 168)))
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        start_at = current_time - timedelta(hours=bounded_hours)

        with get_session(self.database_url) as session:
            connected_site_ids = (
                select(Site.site_id)
                .join(SiteApiKey, SiteApiKey.site_id == Site.site_id)
                .where(
                    Site.status == SITE_STATUS_ACTIVE,
                    SiteApiKey.status == SITE_API_KEY_STATUS_ACTIVE,
                    SiteApiKey.revoked_at.is_(None),
                    or_(
                        SiteApiKey.expires_at.is_(None),
                        SiteApiKey.expires_at > current_time,
                    ),
                )
                .distinct()
            )
            connected_sites = self._count(
                session,
                select(func.count()).select_from(connected_site_ids.subquery()),
            )
            active_runtime_sites = self._count(
                session,
                select(func.count(func.distinct(RunRecord.site_id))).where(
                    RunRecord.started_at >= start_at,
                    RunRecord.started_at <= current_time,
                ),
            )
            plugin_events, plugin_sites, plugin_last_at = self._event_summary(
                session,
                PluginObservabilityEvent,
                PluginObservabilityEvent.received_at,
                start_at=start_at,
                end_at=current_time,
                conditions=(PluginObservabilityEvent.event_kind != MONITORING_STATE_EVENT_KIND,),
            )
            (
                monitoring_projection_events,
                monitoring_projection_last_at,
                monitoring_enabled_sites,
                monitoring_disabled_sites,
                monitoring_reported_sites,
            ) = self._monitoring_state_summary(
                session,
                connected_site_ids=connected_site_ids,
                start_at=start_at,
                end_at=current_time,
            )
            monitoring_unknown_sites = max(
                0,
                connected_sites - monitoring_reported_sites,
            )
            plugin_observability_site_ids = set(
                session.scalars(
                    select(PluginObservabilityEvent.site_id)
                    .where(
                        PluginObservabilityEvent.received_at >= start_at,
                        PluginObservabilityEvent.received_at <= current_time,
                        PluginObservabilityEvent.event_kind != MONITORING_STATE_EVENT_KIND,
                    )
                    .distinct()
                )
            )
            plugin_observability_on_enabled_sites = len(
                plugin_observability_site_ids.intersection(monitoring_enabled_sites)
            )
            feedback_events, feedback_sites, feedback_last_at = self._event_summary(
                session,
                UsageMeterEvent,
                UsageMeterEvent.created_at,
                start_at=start_at,
                end_at=current_time,
                conditions=(UsageMeterEvent.event_kind == AGENT_FEEDBACK_EVENT_KIND,),
            )
            quality_conditions = (
                PluginObservabilityEvent.plugin_slug == ADDON_PLUGIN_SLUG,
                PluginObservabilityEvent.event_kind.in_(QUALITY_EVENT_KINDS),
                PluginObservabilityEvent.payload_json["quality_contract"].as_string()
                == EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
            )
            quality_events, quality_sites, quality_last_at = self._event_summary(
                session,
                PluginObservabilityEvent,
                PluginObservabilityEvent.received_at,
                start_at=start_at,
                end_at=current_time,
                conditions=quality_conditions,
            )
            quality_sessions = self._count(
                session,
                select(
                    func.count(
                        func.distinct(
                            PluginObservabilityEvent.payload_json["quality_session_id"].as_string()
                        )
                    )
                ).where(
                    *quality_conditions,
                    PluginObservabilityEvent.received_at >= start_at,
                    PluginObservabilityEvent.received_at <= current_time,
                ),
            )

        return {
            "artifact_type": "cloud_feedback_operational_status",
            "contract_version": STATUS_CONTRACT_VERSION,
            "generated_at": self._format_datetime(current_time),
            "window": {
                "hours": bounded_hours,
                "start_at": self._format_datetime(start_at),
                "end_at": self._format_datetime(current_time),
            },
            "sites": {
                "connected_total": connected_sites,
                "active_runtime_window": active_runtime_sites,
                "monitoring_state_reported_window": monitoring_reported_sites,
                "monitoring_enabled_window": len(monitoring_enabled_sites),
                "monitoring_disabled_window": monitoring_disabled_sites,
                "monitoring_state_unknown_total": monitoring_unknown_sites,
                "plugin_observability_window": plugin_sites,
                "plugin_observability_on_enabled_window": (plugin_observability_on_enabled_sites),
                "agent_feedback_window": feedback_sites,
                "editor_assist_quality_window": quality_sites,
            },
            "events": {
                "monitoring_state_projection_total": monitoring_projection_events,
                "monitoring_state_projection_last_at": self._format_datetime(
                    monitoring_projection_last_at
                ),
                "plugin_observability_total": plugin_events,
                "plugin_observability_last_at": self._format_datetime(plugin_last_at),
                "agent_feedback_total": feedback_events,
                "agent_feedback_last_at": self._format_datetime(feedback_last_at),
                "editor_assist_quality_total": quality_events,
                "editor_assist_quality_session_total": quality_sessions,
                "editor_assist_quality_last_at": self._format_datetime(quality_last_at),
            },
            "coverage": {
                "active_over_connected": self._ratio(active_runtime_sites, connected_sites),
                "monitoring_enabled_over_connected": self._ratio(
                    len(monitoring_enabled_sites),
                    connected_sites,
                ),
                "plugin_observability_over_monitoring_enabled": self._ratio(
                    plugin_observability_on_enabled_sites,
                    len(monitoring_enabled_sites),
                ),
                "plugin_observability_over_active": self._ratio(
                    plugin_sites,
                    active_runtime_sites,
                ),
                "agent_feedback_over_active": self._ratio(
                    feedback_sites,
                    active_runtime_sites,
                ),
                "editor_assist_quality_over_active": self._ratio(
                    quality_sites,
                    active_runtime_sites,
                ),
            },
            "sample_readiness": {
                "agent_feedback": {
                    "unit": "event",
                    "count": feedback_events,
                    "stage": self._sample_stage(feedback_events),
                },
                "editor_assist_quality": {
                    "unit": "quality_session",
                    "count": quality_sessions,
                    "stage": self._sample_stage(quality_sessions),
                },
            },
            "known_gaps": (
                [
                    {
                        "code": "monitoring_state_projection_incomplete",
                        "meaning": (
                            "One or more connected sites have no fresh "
                            "WordPress-local monitoring state projection in the "
                            "selected window."
                        ),
                        "site_count": monitoring_unknown_sites,
                    }
                ]
                if monitoring_unknown_sites > 0
                else []
            ),
            "read_only": True,
            "content_storage": "none",
            "boundary": {
                "production_mutation": False,
                "automatic_prompt_mutation": False,
                "automatic_model_mutation": False,
                "automatic_router_mutation": False,
                "approval_truth": "wordpress_local",
                "preflight_truth": "wordpress_local",
                "final_write_truth": "wordpress_local",
                "control_plane": "wordpress_local",
            },
        }

    @staticmethod
    def _count(session: Any, statement: Any) -> int:
        return int(session.scalar(statement) or 0)

    @staticmethod
    def _event_summary(
        session: Any,
        model: Any,
        timestamp_column: Any,
        *,
        start_at: datetime,
        end_at: datetime,
        conditions: tuple[Any, ...] = (),
    ) -> tuple[int, int, datetime | None]:
        row = session.execute(
            select(
                func.count(model.id),
                func.count(func.distinct(model.site_id)),
                func.max(timestamp_column),
            ).where(
                *conditions,
                timestamp_column >= start_at,
                timestamp_column <= end_at,
            )
        ).one()
        return int(row[0] or 0), int(row[1] or 0), row[2]

    @staticmethod
    def _monitoring_state_summary(
        session: Any,
        *,
        connected_site_ids: Any,
        start_at: datetime,
        end_at: datetime,
    ) -> tuple[int, datetime | None, set[str], int, int]:
        identity_conditions = (
            PluginObservabilityEvent.site_id.in_(connected_site_ids),
            PluginObservabilityEvent.plugin_slug == MONITORING_STATE_PLUGIN_SLUG,
            PluginObservabilityEvent.event_kind == MONITORING_STATE_EVENT_KIND,
            PluginObservabilityEvent.payload_json["monitoring_state_contract"].as_string()
            == MONITORING_STATE_CONTRACT_VERSION,
            PluginObservabilityEvent.payload_json["content_storage"].as_string()
            == "omitted_metadata_only",
        )
        conditions = (
            *identity_conditions,
            PluginObservabilityEvent.received_at >= start_at,
            PluginObservabilityEvent.received_at <= end_at,
        )
        event_count, _, last_at = FeedbackOperationalStatusService._event_summary(
            session,
            PluginObservabilityEvent,
            PluginObservabilityEvent.received_at,
            start_at=start_at,
            end_at=end_at,
            conditions=identity_conditions,
        )
        latest_ids = (
            select(func.max(PluginObservabilityEvent.id).label("event_id"))
            .where(*conditions)
            .group_by(PluginObservabilityEvent.site_id)
            .subquery()
        )
        latest_events = list(
            session.scalars(
                select(PluginObservabilityEvent).join(
                    latest_ids,
                    PluginObservabilityEvent.id == latest_ids.c.event_id,
                )
            )
        )
        enabled_site_ids: set[str] = set()
        disabled_sites = 0
        for event in latest_events:
            payload = event.payload_json if isinstance(event.payload_json, dict) else {}
            enabled = payload.get("monitoring_enabled")
            if not isinstance(enabled, bool):
                continue
            if enabled:
                enabled_site_ids.add(str(event.site_id))
            else:
                disabled_sites += 1
        reported_sites = len(enabled_site_ids) + disabled_sites
        return (
            event_count,
            last_at,
            enabled_site_ids,
            disabled_sites,
            reported_sites,
        )

    @staticmethod
    def _ratio(numerator: int, denominator: int) -> float | None:
        if denominator <= 0:
            return None
        return round(numerator / denominator, 4)

    @staticmethod
    def _sample_stage(count: int) -> str:
        if count < MINIMUM_VALIDATION_SAMPLE:
            return "insufficient"
        if count < MINIMUM_OBSERVATION_SAMPLE:
            return "validation"
        if count < MINIMUM_DECISION_SAMPLE:
            return "observation"
        return "decision"

    @staticmethod
    def _format_datetime(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()
