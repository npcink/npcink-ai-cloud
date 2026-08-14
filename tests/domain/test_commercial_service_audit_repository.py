from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ServiceAuditEvent


def _record(
    repository: CommercialServiceAuditRepository,
    *,
    site_id: str,
    scope_id: str,
    outcome: str,
) -> int:
    event = repository.record_service_audit_event(
        account_id="account-a",
        site_id=site_id,
        key_id=None,
        subscription_id=None,
        plan_id=None,
        plan_version_id=None,
        scope_kind="principal",
        scope_id=scope_id,
        event_kind="audit.test",
        outcome=outcome,
        method="POST",
        path="/test",
        trace_id=None,
        idempotency_key=None,
        actor_kind="principal",
        actor_ref=scope_id,
        payload_json={"outcome": outcome},
    )
    return int(event.id or 0)


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialServiceAuditRepository],
)
def test_service_audit_repository_preserves_write_filters_principal_and_summary(
    tmp_path: Path,
    repository_type: type[CommercialServiceAuditRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    with get_session(database_url) as session:
        repository = repository_type(session)
        first_event_id = _record(
            repository,
            site_id="site-a",
            scope_id="principal-a",
            outcome="success",
        )
        _record(repository, site_id="site-b", scope_id="prefix:principal-a", outcome="blocked")

        assert [event.site_id for event in repository.list_service_audit_events(limit=1)] == [
            "site-b"
        ]
        assert repository.list_service_audit_events(site_ids=[], account_id=None) == []
        assert len(repository.list_service_audit_events(site_ids=[], account_id="account-a")) == 2
        assert [
            event.id
            for event in repository.list_service_audit_events(
                event_id=first_event_id,
                scope_kind="principal",
                scope_id="principal-a",
                limit=20,
            )
        ] == [first_event_id]
        assert [
            event.site_id
            for event in repository.list_service_audit_events(limit=1, offset=1)
        ] == ["site-a"]
        principal_events = repository.list_service_audit_events_for_principal(
            principal_id=" principal-a "
        )
        assert len(principal_events) == 2
        assert repository.list_service_audit_events_for_principal(principal_id=" ") == []
        assert (
            repository.count_service_audit_events(
                account_id="account-a",
                outcome="success",
                since=datetime.now(UTC) - timedelta(days=1),
            )
            == 1
        )
        summary = repository.summarize_service_audit_events(account_id="account-a")
        assert {(item["outcome"], item["count"]) for item in summary} == {
            ("success", 1),
            ("blocked", 1),
        }
        assert all(str(item["first_seen_at"]).endswith("Z") for item in summary)

    dispose_engine(database_url)


def test_service_audit_repository_bounds_high_cardinality_deep_page(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'audit-high-cardinality.sqlite3'}"
    init_schema(database_url)
    base_time = datetime(2026, 8, 15, 0, 0, tzinfo=UTC)
    with get_session(database_url) as session:
        session.add_all(
            ServiceAuditEvent(
                account_id="account-large",
                site_id=f"site-{index % 7}",
                scope_kind="subscription",
                scope_id=f"subscription-{index}",
                event_kind="audit.high_cardinality",
                outcome="succeeded" if index % 2 == 0 else "error",
                actor_kind="platform_admin",
                actor_ref="operator",
                created_at=base_time + timedelta(seconds=index),
            )
            for index in range(525)
        )
        session.flush()
        repository = CommercialServiceAuditRepository(session)

        events = repository.list_service_audit_events(
            account_id="account-large",
            event_kind="audit.high_cardinality",
            limit=25,
            offset=500,
        )

        assert len(events) == 25
        assert [event.scope_id for event in events] == [
            f"subscription-{index}" for index in range(24, -1, -1)
        ]
        assert repository.count_service_audit_events(
            account_id="account-large",
            event_kind="audit.high_cardinality",
        ) == 525

    dispose_engine(database_url)
