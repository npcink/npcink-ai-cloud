from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import HealthSnapshot, ServiceAuditEvent
from app.domain.observability.retention import cleanup_operational_evidence

NOW = datetime(2026, 11, 4, tzinfo=UTC)


@pytest.fixture
def database_url(tmp_path: Path):
    # The optional URL is only for a fresh, isolated PostgreSQL validation target.
    url = os.environ.get("NPCINK_RETENTION_TEST_DATABASE_URL") or (
        f"sqlite+pysqlite:///{tmp_path / 'retention.sqlite3'}")
    init_schema(url)
    yield url
    dispose_engine(url)


def test_cleanup_preserves_current_truth_and_commits_only_expired_history(database_url: str):
    with get_session(database_url) as session:
        for identity, provider, instance, days in (
            (1, "a", "active", 40), (2, "a", "active", 30), (3, "a", "active", 0),
            (4, "a", "dormant", 80), (5, "a", "ties", 60), (6, "a", "ties", 60),
            (7, "a", None, 80), (8, "b", None, 50), (9, "a", None, 70),
        ):
            session.add(HealthSnapshot(id=identity, provider_id=provider, instance_id=instance,
                                       status="unknown", reason="test",
                                       measured_at=NOW - timedelta(days=days)))
        for identity, worker, days, overrides in (
            (1, "active", 100, {}), (2, "active", 90, {}), (3, "active", 0, {}),
            (4, "dormant", 150, {}), (5, "active", 150, {"outcome": "failed"}),
            (6, "active", 150, {"event_kind": "payment.order_expiration.cadence"}),
            (7, "active", 150, {"actor_kind": "platform_admin"}),
            (8, "active", 150, {"account_id": "business"}),
            (9, "active", 150, {"scope_kind": "security"}),
        ):
            values = dict(id=identity, event_kind="worker.heartbeat", outcome="succeeded",
                          actor_kind="system_worker", scope_kind="worker", scope_id=worker,
                          created_at=NOW - timedelta(days=days))
            values.update(overrides)
            session.add(ServiceAuditEvent(**values))
        session.commit()

    dry = cleanup_operational_evidence(database_url, now=NOW, dry_run=True)
    assert dry["health_snapshots"]["eligible_in_batch"] == 2
    assert dry["worker_heartbeats"]["eligible_in_batch"] == 1
    assert dry["health_snapshots"]["deleted"] == 0
    result = cleanup_operational_evidence(database_url, now=NOW, batch_size=1)
    assert result["health_snapshots"]["deleted"] == 1
    assert result["worker_heartbeats"]["deleted"] == 1
    assert result["health_snapshots"]["batch_full"]
    cleanup_operational_evidence(database_url, now=NOW)
    with get_session(database_url) as session:
        assert list(session.scalars(select(HealthSnapshot.id).order_by(HealthSnapshot.id))) == [
            2, 3, 4, 5, 6, 8, 9,
        ]
        audit_ids = session.scalars(select(ServiceAuditEvent.id).order_by(ServiceAuditEvent.id))
        assert list(audit_ids) == [
            2, 3, 4, 5, 6, 7, 8, 9,
        ]
    # A rerun is safe and does not erase an old last-known state.
    assert cleanup_operational_evidence(database_url, now=NOW)["health_snapshots"]["deleted"] == 0


def test_retention_floors_and_batch_bounds_are_enforced(database_url: str):
    for options in ({"health_days": 29}, {"heartbeat_days": 89}, {"batch_size": 5001}):
        with pytest.raises(ValueError):
            cleanup_operational_evidence(database_url, **options)
    with pytest.raises(ValueError):
        Settings(health_snapshot_retention_days=14)
