"""Disposable PostgreSQL proof; the guarded M4 runner supplies credentials privately."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from sqlalchemy import func, inspect, select, text

from app.core.db import get_session
from app.core.models import CustomerNotificationDispatch, PortalNotification, ServiceAuditEvent
from app.domain.commercial.customer_notifications import get_notice, send_notice
from tests.domain.test_customer_notifications import CONTEXT, NOTICE, preview, seed
from tests.integration.test_portal_postgres_acceptance import (
    m4_database_url as m4_database_url,
)
from tests.integration.test_portal_postgres_acceptance import (
    portal_database as portal_database,
)
from tests.integration.test_portal_self_service_postgres import _migrate


def setup(url):
    _migrate(url, "20261103_0092")
    seed(url, "acct_one", "owner_one")
    seed(url, "acct_two", "owner_two")


def test_simultaneous_send_commits_one_batch_and_audit(portal_database):
    setup(portal_database)
    preview(portal_database)
    barrier = Barrier(2)

    def send():
        barrier.wait(timeout=10)
        return send_notice(portal_database, dispatch_id=NOTICE, context=CONTEXT)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(send) for _ in range(2)]
        results = [future.result(timeout=30) for future in futures]
    assert [row["sent_count"] for row in results] == [2, 2]
    with get_session(portal_database) as session:
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 2
        assert (
            session.scalar(
                select(func.count())
                .select_from(ServiceAuditEvent)
                .where(ServiceAuditEvent.event_kind == "customer_notification.sent")
            )
            == 1
        )
        assert session.get(CustomerNotificationDispatch, NOTICE).status == "sent"


def test_simultaneous_preview_reuses_one_snapshot(portal_database):
    setup(portal_database)
    barrier = Barrier(2)

    def prepare():
        barrier.wait(timeout=10)
        return preview(portal_database)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(prepare) for _ in range(2)]
        results = [future.result(timeout=30) for future in futures]
    assert results[0] == results[1]
    with get_session(portal_database) as session:
        assert session.scalar(select(func.count()).select_from(CustomerNotificationDispatch)) == 1
        assert session.scalar(select(func.count()).select_from(ServiceAuditEvent)) == 1


def test_migration_downgrade_preserves_sent_inbox(portal_database):
    setup(portal_database)
    preview(portal_database)
    send_notice(portal_database, dispatch_id=NOTICE, context=CONTEXT)
    assert get_notice(portal_database, NOTICE)["sent_count"] == 2
    _migrate(portal_database, "20261024_0091", downgrade=True)
    with get_session(portal_database) as session:
        assert (
            "customer_notification_dispatches"
            not in inspect(session.connection()).get_table_names()
        )
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 2
    _migrate(portal_database, "20261103_0092")
    with get_session(portal_database) as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "20261103_0092"
        assert session.scalar(select(func.count()).select_from(CustomerNotificationDispatch)) == 0
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 2
