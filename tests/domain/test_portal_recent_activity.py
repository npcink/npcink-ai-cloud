from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import inspect

from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ServiceAuditEvent
from app.domain.commercial.service import CommercialService


def test_recent_activity_is_bounded_authorized_and_avoids_all_history_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite+pysqlite:///{tmp_path / 'recent-activity.sqlite3'}"
    init_schema(url)
    now = datetime.now(UTC)
    with get_session(url) as session:
        for index in range(205):
            session.add(
                ServiceAuditEvent(
                    account_id="account-a",
                    site_id="site-a",
                    event_kind="site.connected",
                    outcome="success",
                    actor_kind="principal",
                    created_at=now - timedelta(seconds=index),
                    payload_json={"secret": "private"},
                )
            )
        session.add(
            ServiceAuditEvent(
                account_id="account-a",
                site_id="foreign-site",
                event_kind="foreign",
                outcome="success",
                actor_kind="principal",
                created_at=now,
            )
        )
        session.commit()

    def forbidden_scan(*args, **kwargs):
        raise AssertionError("Portal must not count or group lifetime audit history")

    monkeypatch.setattr(
        CommercialServiceAuditRepository, "count_service_audit_events", forbidden_scan
    )
    monkeypatch.setattr(
        CommercialServiceAuditRepository, "summarize_service_audit_events", forbidden_scan
    )
    service = CommercialService(url)
    with get_session(url) as session:
        events = CommercialServiceAuditRepository(session).list_portal_activity_events(
            account_id="account-a", site_ids=["site-a"]
        )
        assert all("payload_json" in inspect(event).unloaded for event in events)
    result = service.get_portal_recent_activity(
        account_id="account-a", site_ids=["site-a"], limit=10
    )
    assert result["total"] == 200
    assert result["totals"] == {"events": 200, "success": 200}
    assert len(result["items"]) == 10
    assert {item["event_kind"] for item in result["items"]} == {"site.connected"}
    assert all("payload" not in item for item in result["items"])
    filtered = service.get_portal_recent_activity(
        account_id="account-a", site_ids=["site-a"], site_id="site-a", event_kind="foreign"
    )
    assert filtered["items"] == []
    dispose_engine(url)


def test_recent_activity_merges_authorized_subjects_with_stable_tie_order(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{tmp_path / 'recent-subjects.sqlite3'}"
    init_schema(url)
    now = datetime.now(UTC)
    with get_session(url) as session:
        for account, site, kind in [
            ("account-a", None, "account-login"),
            ("account-b", "site-a", "authorized-site"),
            ("account-a", "foreign-site", "foreign-site"),
            ("account-b", None, "foreign-account"),
            ("account-a", "site-b", "authorized-second-site"),
        ]:
            session.add(ServiceAuditEvent(
                account_id=account, site_id=site, event_kind=kind, outcome="success",
                actor_kind="principal", created_at=now,
            ))
        session.commit()
    service = CommercialService(url)
    merged = service.get_portal_recent_activity(
        account_id="account-a", site_ids=["site-a", "site-b", "site-a"]
    )
    assert [item["event_kind"] for item in merged["items"]] == [
        "authorized-second-site", "authorized-site", "account-login",
    ]
    account_only = service.get_portal_recent_activity(account_id="account-a", site_ids=[])
    assert [item["event_kind"] for item in account_only["items"]] == ["account-login"]
    site_only = service.get_portal_recent_activity(
        account_id="account-a", site_ids=["site-a", "site-b"], site_id="site-a"
    )
    assert [item["event_kind"] for item in site_only["items"]] == ["authorized-site"]
    dispose_engine(url)
