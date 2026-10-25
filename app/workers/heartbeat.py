from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.config import Settings
from app.domain.commercial.service import CommercialService, ServiceAuditContext
from app.domain.observability.heartbeat import (
    WORKER_HEARTBEAT_EVENT_KIND,
    WORKER_SCOPE_KIND,
)


def _audit_context(worker_id: str) -> ServiceAuditContext:
    return ServiceAuditContext(
        trace_id="",
        idempotency_key="",
        method="POST",
        path=f"/internal/workers/{worker_id}/heartbeat",
        actor_kind="system_worker",
        actor_ref=worker_id,
    )


def record_worker_heartbeat(
    settings: Settings,
    *,
    worker_id: str,
    status: str = "idle",
    payload: dict[str, object] | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    heartbeat_payload = {
        "worker_id": worker_id,
        "status": status,
        "recorded_at": current_time.isoformat().replace("+00:00", "Z"),
        **(payload or {}),
    }
    CommercialService(settings.database_url, settings=settings).record_service_audit_event(
        audit_context=_audit_context(worker_id),
        event_kind=WORKER_HEARTBEAT_EVENT_KIND,
        outcome="succeeded",
        scope_kind=WORKER_SCOPE_KIND,
        scope_id=worker_id,
        payload_json=heartbeat_payload,
    )
    return heartbeat_payload


@dataclass
class WorkerHeartbeat:
    settings: Settings
    worker_id: str
    interval_seconds: int
    last_recorded_at: datetime | None = None

    def maybe_record(
        self,
        *,
        status: str,
        payload: dict[str, object] | None = None,
        now: datetime | None = None,
        force: bool = False,
    ) -> bool:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        if not force and self.last_recorded_at is not None:
            age_seconds = (current_time - self.last_recorded_at).total_seconds()
            if age_seconds < self.interval_seconds:
                return False
        record_worker_heartbeat(
            self.settings,
            worker_id=self.worker_id,
            status=status,
            payload=payload,
            now=current_time,
        )
        self.last_recorded_at = current_time
        return True
