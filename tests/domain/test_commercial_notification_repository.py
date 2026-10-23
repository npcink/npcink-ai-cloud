from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, PortalNotification, Principal


@pytest.fixture
def inbox_db(tmp_path):
    url = f"sqlite+pysqlite:///{tmp_path / 'recipient-inbox.sqlite3'}"
    init_schema(url)
    with get_session(url) as session:
        session.add_all([
            Account(account_id="a", name="Shared account", status="active"),
            Account(account_id="b", name="Other account", status="active"),
            Principal(principal_id="alice", email="alice@example.test", status="active"),
            Principal(principal_id="bob", email="bob@example.test", status="active"),
        ])
        session.flush()
        repo = CommercialNotificationRepository(session)
        for notification_id, account, principal in [
            ("own", "a", "alice"), ("own_read", "a", "alice"),
            ("peer", "a", "bob"), ("foreign_account", "b", "alice"),
            ("unaddressed", "a", None),
        ]:
            item = repo.create_notification(
                notification_id=notification_id, account_id=account, principal_id=principal,
                event_type="support_request_replied", title="Private support title",
            )
            if notification_id == "own_read":
                item.is_read = True
                item.read_at = datetime.now(UTC)
        session.commit()
    try:
        yield url
    finally:
        dispose_engine(url)


def test_inbox_list_and_counts_require_both_account_and_recipient(inbox_db):
    with get_session(inbox_db) as session:
        repo = CommercialNotificationRepository(session)
        scope = {"account_id": "a", "principal_id": "alice"}
        assert {n.notification_id for n in repo.list_account_notifications(**scope)} == {
            "own", "own_read",
        }
        assert [n.notification_id for n in repo.list_account_notifications(
            **scope, unread_only=True,
        )] == ["own"]
        assert repo.count_account_notifications(**scope) == 2
        assert repo.count_account_notifications(**scope, unread_only=True) == 1
        assert repo.count_account_notifications(account_id="a", principal_id="bob") == 1
        assert repo.count_account_notifications(account_id="b", principal_id="alice") == 1


@pytest.mark.parametrize("notification_id", ["peer", "foreign_account", "unaddressed", "missing"])
def test_single_read_and_lookup_cannot_cross_recipient_or_account(inbox_db, notification_id):
    with get_session(inbox_db) as session:
        repo = CommercialNotificationRepository(session)
        scope = {"account_id": "a", "principal_id": "alice", "notification_id": notification_id}
        assert repo.get_notification(**scope) is None
        assert repo.mark_read(**scope, now=datetime.now(UTC)) == 0
        session.commit()
    if notification_id != "missing":
        with get_session(inbox_db) as session:
            item = session.get(PortalNotification, notification_id)
            assert not item.is_read and item.read_at is None


def test_bulk_and_single_read_preserve_other_recipients_and_accounts(inbox_db):
    now = datetime.now(UTC)
    with get_session(inbox_db) as session:
        repo = CommercialNotificationRepository(session)
        assert repo.mark_all_read(account_id="a", principal_id="alice", now=now) == 1
        assert repo.mark_all_read(account_id="a", principal_id="alice", now=now) == 0
        assert repo.mark_read(
            account_id="a", principal_id="bob", notification_id="peer", now=now,
        ) == 1
        session.commit()
    with get_session(inbox_db) as session:
        for notification_id in ("own", "own_read", "peer"):
            assert session.get(PortalNotification, notification_id).is_read
        for notification_id in ("foreign_account", "unaddressed"):
            item = session.get(PortalNotification, notification_id)
            assert not item.is_read and item.read_at is None
