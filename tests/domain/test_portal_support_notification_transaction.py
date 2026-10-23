from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalNotification,
    Principal,
    ServiceAuditEvent,
    SupportRequest,
    SupportRequestMessage,
)
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import CommercialValidationError
from app.domain.commercial.service import CommercialService

AUDIT = ServiceAuditContext(
    trace_id="support-notification",
    idempotency_key="support-notification",
    method="POST",
    path="/internal/service/admin/support-requests/sr_reply/messages",
)


@pytest.fixture
def support_db(tmp_path: Path) -> Iterator[str]:
    url = f"sqlite+pysqlite:///{tmp_path / 'support-notification.sqlite3'}"
    init_schema(url)
    with get_session(url) as session:
        session.add(Account(account_id="acct_reply", name="Reply", status="active"))
        session.add(Principal(principal_id="prn_reply", email="reply@example.com", status="active"))
        session.add(Principal(
            principal_id="prn_peer", email="peer@example.com", status="active",
        ))
        session.flush()
        for principal_id in ("prn_reply", "prn_peer"):
            session.add(AccountUserMembership(
                membership_id=f"mem_{principal_id}", account_id="acct_reply",
                principal_id=principal_id, role="owner", status="active",
                allowed_actions_json=["view_audit"],
            ))
        session.add(
            SupportRequest(
                request_id="sr_reply",
                account_id="acct_reply",
                principal_id="prn_reply",
                email="reply@example.com",
                title="A support question",
                description="Details",
            )
        )
        session.commit()
    yield url
    dispose_engine(url)


def _reply(url: str, visibility: str = "public"):
    return CommercialService(url).create_admin_support_request_message(
        request_id="sr_reply",
        body="Here is your answer",
        visibility=visibility,
        audit_context=AUDIT,
    )


def _counts(url: str) -> tuple[int, int, int]:
    # Always re-read committed state using a fresh session.
    with get_session(url) as session:
        return tuple(
            session.scalar(select(func.count()).select_from(model))
            for model in (SupportRequestMessage, ServiceAuditEvent, PortalNotification)
        )


def test_reply_and_notification_and_audit_commit_together(support_db):
    result = _reply(support_db)
    assert _counts(support_db) == (1, 1, 1)
    with get_session(support_db) as session:
        message_id = result["message"]["message_id"]
        notification = session.get(PortalNotification, f"pnotif_support_{message_id}")
        assert notification.account_id == "acct_reply"
        assert notification.principal_id == session.get(SupportRequest, "sr_reply").principal_id
        assert notification.principal_id == "prn_reply"
        assert notification.principal_id != "prn_peer"
        assert notification.event_type == "support_request_replied"
        assert notification.link_href == "/portal/support/sr_reply"
        assert notification.body == "Here is your answer"
        assert not notification.is_read


def test_notification_insert_failure_rolls_back_reply_and_audit(support_db, monkeypatch):
    def fail(*args, **kwargs):
        raise SQLAlchemyError("injected notification failure")

    monkeypatch.setattr(CommercialNotificationRepository, "create_notification", fail)
    with pytest.raises(CommercialValidationError, match="could not be saved"):
        _reply(support_db)
    assert _counts(support_db) == (0, 0, 0)
    with get_session(support_db) as session:
        assert session.get(SupportRequest, "sr_reply").status == "open"


@pytest.mark.parametrize("stage", ["audit", "commit"])
def test_later_failure_cannot_leave_orphan_notification(support_db, monkeypatch, stage):
    def fail(*args, **kwargs):
        raise SQLAlchemyError(f"injected {stage} failure")

    if stage == "audit":
        monkeypatch.setattr(CommercialServiceAuditRepository, "record_service_audit_event", fail)
    else:
        monkeypatch.setattr(Session, "commit", fail)
    with pytest.raises(SQLAlchemyError):
        _reply(support_db)
    assert _counts(support_db) == (0, 0, 0)


def test_internal_note_does_not_notify(support_db):
    _reply(support_db, visibility="internal")
    assert _counts(support_db) == (1, 1, 0)


def test_same_message_notification_id_is_deduplicated_without_resetting_read_state(support_db):
    result = _reply(support_db)
    notification_id = f"pnotif_support_{result['message']['message_id']}"
    with get_session(support_db) as session:
        existing = session.get(PortalNotification, notification_id)
        existing.is_read = True
        session.commit()
    with get_session(support_db) as session:
        again = CommercialNotificationRepository(session).create_notification(
            notification_id=notification_id,
            account_id="acct_reply",
            principal_id="prn_reply",
            event_type="support_request_replied",
            title="A support question",
            body="Here is your answer",
            link_href="/portal/support/sr_reply",
        )
        assert again.is_read
        session.commit()
    assert _counts(support_db) == (1, 1, 1)
    with get_session(support_db) as session:
        with pytest.raises(ValueError, match="another recipient"):
            CommercialNotificationRepository(session).create_notification(
                notification_id=notification_id,
                account_id="another_account",
                principal_id="prn_reply",
                event_type="support_request_replied",
                title="different",
            )


@pytest.mark.parametrize("mail_failure", [False, True])
def test_http_reply_commits_before_mail_and_replay_cannot_duplicate(support_db, mail_failure):
    from fastapi.testclient import TestClient

    from app.adapters.notifications.base import PortalEmailDeliveryError
    from app.api.main import create_app
    from app.core.config import Settings
    from app.core.services import CloudServices
    from tests.conftest import (
        TEST_ADMIN_SESSION_SECRET,
        TEST_INTERNAL_AUTH_TOKEN,
        TEST_PORTAL_JWT_SECRET,
        build_internal_headers,
    )

    class Sender:
        calls = 0

        def send_support_request_update(self, **kwargs):
            self.calls += 1
            # SMTP observes an already durable reply and notification.
            assert _counts(support_db) == (1, 1, 1)
            if mail_failure:
                raise PortalEmailDeliveryError("injected email failure")

    sender = Sender()
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=support_db,
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
    )
    with TestClient(
        create_app(CloudServices(settings=settings, portal_email_sender=sender))
    ) as client:
        url = "/internal/service/admin/support-requests/sr_reply/messages"
        headers = build_internal_headers(idempotency_key="reply-replay")
        response = client.post(
            url, json={"body": "Here is your answer", "visibility": "public"}, headers=headers
        )
        assert response.status_code == 200, response.text
        receipt = response.json()["data"]["notification"]
        assert receipt["attempted"] is True
        assert receipt["delivered"] is not mail_failure
        replay = client.post(
            url, json={"body": "Here is your answer", "visibility": "public"}, headers=headers
        )
        assert replay.status_code == 409
        assert sender.calls == 1
    assert _counts(support_db) == (1, 1, 1)


def test_http_notification_failure_does_not_send_mail(support_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.api.main import create_app
    from app.core.config import Settings
    from app.core.services import CloudServices
    from tests.conftest import (
        TEST_ADMIN_SESSION_SECRET,
        TEST_INTERNAL_AUTH_TOKEN,
        TEST_PORTAL_JWT_SECRET,
        build_internal_headers,
    )

    class Sender:
        def send_support_request_update(self, **kwargs):
            pytest.fail("email must not run after failed transaction")

    def fail(*args, **kwargs):
        raise SQLAlchemyError("notification unavailable")

    monkeypatch.setattr(CommercialNotificationRepository, "create_notification", fail)
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=support_db,
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
    )
    with TestClient(
        create_app(CloudServices(settings=settings, portal_email_sender=Sender()))
    ) as client:
        result = client.post(
            "/internal/service/admin/support-requests/sr_reply/messages",
            json={"body": "Here is your answer"},
            headers=build_internal_headers(idempotency_key="reply-fail"),
        )
        assert result.status_code == 400
        assert result.json()["error_code"] == "service.support_reply_notification_failed"
    assert _counts(support_db) == (0, 0, 0)
