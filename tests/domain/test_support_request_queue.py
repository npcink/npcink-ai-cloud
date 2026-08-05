from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, SupportRequest


def test_support_request_risk_order_and_summary_are_global_before_pagination(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'support-request-queue.sqlite3'}"
    init_schema(database_url)
    risk_as_of = datetime(2026, 7, 30, 8, 0, tzinfo=UTC)
    fixtures = [
        {
            "request_id": "sr_stable",
            "status": "resolved",
            "priority": "normal",
            "waiting_on": "none",
            "waiting_since": None,
            "created_at": risk_as_of - timedelta(days=4),
            "updated_at": risk_as_of - timedelta(hours=1),
        },
        {
            "request_id": "sr_monitor",
            "status": "in_progress",
            "priority": "normal",
            "waiting_on": "customer",
            "waiting_since": risk_as_of - timedelta(hours=8),
            "created_at": risk_as_of - timedelta(days=3),
            "updated_at": risk_as_of - timedelta(hours=8),
        },
        {
            "request_id": "sr_warning",
            "status": "open",
            "priority": "normal",
            "waiting_on": "operator",
            "waiting_since": risk_as_of - timedelta(hours=2),
            "created_at": risk_as_of - timedelta(hours=2),
            "updated_at": risk_as_of - timedelta(hours=2),
        },
        {
            "request_id": "sr_urgent",
            "status": "in_progress",
            "priority": "urgent",
            "waiting_on": "customer",
            "waiting_since": risk_as_of - timedelta(minutes=30),
            "created_at": risk_as_of - timedelta(hours=3),
            "updated_at": risk_as_of - timedelta(minutes=30),
        },
        {
            "request_id": "sr_overdue",
            "status": "in_progress",
            "priority": "normal",
            "waiting_on": "operator",
            "waiting_since": risk_as_of - timedelta(hours=72),
            "created_at": risk_as_of - timedelta(hours=72),
            "updated_at": risk_as_of - timedelta(hours=24),
        },
    ]
    fixtures.extend(
        {
            "request_id": f"sr_closed_{index:02d}",
            "status": "closed",
            "priority": "normal",
            "waiting_on": "none",
            "waiting_since": None,
            "created_at": risk_as_of - timedelta(days=10, minutes=index),
            "updated_at": risk_as_of - timedelta(days=1, minutes=index),
        }
        for index in range(25)
    )
    try:
        with get_session(database_url) as session:
            session.add(
                Account(
                    account_id="acct_support",
                    name="Support account",
                    status="active",
                )
            )
            for fixture in fixtures:
                session.add(
                    SupportRequest(
                        account_id="acct_support",
                        email="support@example.com",
                        topic="billing",
                        title=fixture["request_id"],
                        description="Queue ordering fixture",
                        **fixture,
                    )
                )
            session.commit()

        with get_session(database_url) as session:
            repository = CommercialRepository(session)
            first_page = repository.list_support_requests(
                topic="billing",
                sort="risk",
                risk_as_of=risk_as_of,
                limit=2,
                offset=0,
            )
            second_page = repository.list_support_requests(
                topic="billing",
                sort="risk",
                risk_as_of=risk_as_of,
                limit=2,
                offset=2,
            )
            summary = repository.summarize_support_request_queue(
                topic="billing",
                risk_as_of=risk_as_of,
            )
            overdue = repository.list_support_requests(
                topic="billing",
                attention="overdue",
                sort="risk",
                risk_as_of=risk_as_of,
                limit=20,
            )

        assert [item.request_id for item in first_page] == [
            "sr_overdue",
            "sr_urgent",
        ]
        assert [item.request_id for item in second_page] == [
            "sr_warning",
            "sr_monitor",
        ]
        assert summary == {
            "open": 1,
            "in_progress": 3,
            "critical": 2,
            "warning": 1,
            "monitor": 1,
            "stable": 26,
            "waiting_for_operator": 2,
            "waiting_for_customer": 2,
            "overdue": 1,
        }
        assert [item.request_id for item in overdue] == ["sr_overdue"]
    finally:
        dispose_engine(database_url)
