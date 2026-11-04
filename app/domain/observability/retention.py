"""Bound operational history without changing business/security audit retention."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.models import HealthSnapshot, ServiceAuditEvent


def health_candidates(session: Session, cutoff: datetime, limit: int) -> list[int]:
    # Keep all latest-timestamp ties: existing readers use both first/last ID ties.
    latest = select(
        HealthSnapshot.provider_id, HealthSnapshot.instance_id,
        func.max(HealthSnapshot.measured_at).label("measured_at"),
    ).group_by(HealthSnapshot.provider_id, HealthSnapshot.instance_id).subquery()
    protected = select(HealthSnapshot.id).join(latest, and_(
        HealthSnapshot.provider_id == latest.c.provider_id,
        or_(HealthSnapshot.instance_id == latest.c.instance_id, and_(
            HealthSnapshot.instance_id.is_(None), latest.c.instance_id.is_(None))),
        HealthSnapshot.measured_at == latest.c.measured_at,
    ))
    return list(session.scalars(select(HealthSnapshot.id).where(
        HealthSnapshot.measured_at < cutoff, HealthSnapshot.id.not_in(protected),
    ).order_by(HealthSnapshot.id).limit(limit)))


def heartbeat_candidates(session: Session, cutoff: datetime, limit: int) -> list[int]:
    eligible = (
        ServiceAuditEvent.event_kind == "worker.heartbeat",
        ServiceAuditEvent.outcome == "succeeded",
        ServiceAuditEvent.actor_kind == "system_worker",
        ServiceAuditEvent.scope_kind == "worker",
        ServiceAuditEvent.scope_id.is_not(None),
        ServiceAuditEvent.account_id.is_(None), ServiceAuditEvent.site_id.is_(None),
        ServiceAuditEvent.key_id.is_(None), ServiceAuditEvent.subscription_id.is_(None),
        ServiceAuditEvent.plan_id.is_(None), ServiceAuditEvent.plan_version_id.is_(None),
    )
    latest = select(
        ServiceAuditEvent.scope_id, func.max(ServiceAuditEvent.created_at).label("created_at"),
    ).where(*eligible).group_by(ServiceAuditEvent.scope_id).subquery()
    protected = select(ServiceAuditEvent.id).join(latest, and_(
        ServiceAuditEvent.scope_id == latest.c.scope_id,
        ServiceAuditEvent.created_at == latest.c.created_at,
    )).where(*eligible)
    return list(session.scalars(select(ServiceAuditEvent.id).where(
        *eligible, ServiceAuditEvent.created_at < cutoff, ServiceAuditEvent.id.not_in(protected),
    ).order_by(ServiceAuditEvent.created_at, ServiceAuditEvent.id).limit(limit)))


def cleanup_operational_evidence(
    database_url: str, *, health_days: int = 30, heartbeat_days: int = 90,
    batch_size: int = 5000, now: datetime | None = None, dry_run: bool = False,
) -> dict[str, Any]:
    if health_days < 30 or heartbeat_days < 90 or not 1 <= batch_size <= 5000:
        raise ValueError("health >=30d, heartbeat >=90d, batch 1..5000 required")
    current = (now or datetime.now(UTC)).astimezone(UTC)
    result: dict[str, Any] = {"dry_run": dry_run}
    # Separate short transactions limit the locks/WAL generated per batch.
    for model, reader, days, label in (
        (HealthSnapshot, health_candidates, health_days, "health_snapshots"),
        (ServiceAuditEvent, heartbeat_candidates, heartbeat_days, "worker_heartbeats"),
    ):
        with get_session(database_url) as session:
            if session.get_bind().dialect.name == "postgresql":
                if dry_run:
                    session.execute(text("SET TRANSACTION READ ONLY"))
                session.execute(text("SET LOCAL statement_timeout='10s'"))
                session.execute(text("SET LOCAL lock_timeout='1s'"))
            ids = reader(session, current - timedelta(days=days), batch_size)
            deleted = 0
            if ids and not dry_run:
                mutation = session.execute(delete(model).where(model.id.in_(ids)))
                deleted = int(getattr(mutation, "rowcount", 0) or 0)
                session.commit()
            result[label] = {"eligible_in_batch": len(ids), "deleted": deleted,
                             "batch_full": len(ids) == batch_size, "retention_days": days}
    return result
