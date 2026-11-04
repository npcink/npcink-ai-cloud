from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountUserMembership,
    CustomerNotificationDispatch,
    PortalNotification,
    Principal,
    ServiceAuditEvent,
)
from app.domain.commercial import customer_notifications as notices
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import (
    CommercialConflictError,
    CommercialPermissionError,
    CommercialValidationError,
)

NOTICE = "notice_" + "a" * 32
CONTEXT = ServiceAuditContext(
    trace_id="notice-test",
    idempotency_key="notice-test",
    method="POST",
    path="/internal/service/admin/customer-notifications",
    actor_kind="platform_admin",
    actor_ref="operator-one",
)


def seed(url, account_id, principal_id=None, *, status="active"):
    with get_session(url) as session:
        session.add(Account(account_id=account_id, name=account_id, status=status))
        if principal_id:
            session.add(
                Principal(
                    principal_id=principal_id, email=f"{principal_id}@example.test", status="active"
                )
            )
            session.flush()
            session.add(
                AccountUserMembership(
                    membership_id=f"mem_{account_id}",
                    account_id=account_id,
                    principal_id=principal_id,
                    role="owner",
                    status="active",
                )
            )
        session.commit()


@pytest.fixture
def db(tmp_path):
    url = f"sqlite+pysqlite:///{tmp_path / 'notices.sqlite3'}"
    init_schema(url)
    seed(url, "acct_one", "owner_one")
    seed(url, "acct_two", "owner_two")
    seed(url, "acct_missing_owner")
    yield url
    dispose_engine(url)


def preview(db, **overrides):
    values = dict(
        dispatch_id=NOTICE,
        title="Maintenance",
        body="Tonight 22:00–22:30",
        link_href="/portal/usage",
        audience="all",
        account_ids=[],
        context=CONTEXT,
    )
    values.update(overrides)
    return notices.preview_notice(db, **values)


def test_preview_does_not_deliver_and_send_is_durable_idempotent_and_readable(db):
    result = preview(db)
    assert (result["target_count"], result["ready_count"], result["skipped_count"]) == (3, 2, 1)
    with get_session(db) as session:
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 0
    sent = notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    assert (sent["sent_count"], sent["read_count"]) == (2, 0)
    assert notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT) == sent
    with get_session(db) as session:
        rows = list(session.scalars(select(PortalNotification)))
        assert len(rows) == 2
        assert {(row.account_id, row.principal_id) for row in rows} == {
            ("acct_one", "owner_one"),
            ("acct_two", "owner_two"),
        }
        rows[0].is_read = True
        assert session.scalar(select(func.count()).select_from(ServiceAuditEvent)) == 2
        session.commit()
    assert notices.get_notice(db, NOTICE)["read_count"] == 1
    assert notices.list_notices(db, limit=1, offset=0)["total_count"] == 1
    assert notices.list_notices(db, limit=1, offset=1)["items"] == []


def test_all_audience_is_snapshot_new_accounts_are_not_backfilled(db):
    preview(db)
    seed(db, "acct_later", "owner_later")
    sent = notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    assert sent["target_count"] == 3
    assert "acct_later" not in {row["account_id"] for row in sent["recipients"]}


def test_owner_change_is_skipped_never_redirected(db):
    preview(db)
    with get_session(db) as session:
        session.get(AccountUserMembership, "mem_acct_one").principal_id = "owner_two"
        session.commit()
    sent = notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    row = next(row for row in sent["recipients"] if row["account_id"] == "acct_one")
    assert (row["status"], row["reason"], row["principal_id"]) == (
        "skipped",
        "recipient_changed",
        "owner_one",
    )
    assert sent["sent_count"] == 1


@pytest.mark.parametrize(
    "change", ["disabled_principal", "disabled_account", "email", "extra_owner"]
)
def test_recheck_skips_changed_eligibility(db, change):
    preview(db)
    with get_session(db) as session:
        if change == "disabled_principal":
            session.get(Principal, "owner_one").status = "disabled"
        elif change == "disabled_account":
            session.get(Account, "acct_one").status = "suspended"
        elif change == "email":
            session.get(Principal, "owner_one").email = "changed@example.test"
        else:
            session.add(
                AccountUserMembership(
                    membership_id="mem_extra",
                    account_id="acct_one",
                    principal_id="owner_two",
                    status="active",
                    role="owner",
                )
            )
        session.commit()
    assert notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)["sent_count"] == 1


def test_immutable_preview_and_operator_binding(db):
    first = preview(db)
    assert preview(db) == first
    with pytest.raises(CommercialConflictError):
        preview(db, body="Different message")
    other = ServiceAuditContext("", "other", "POST", "", "platform_admin", "operator-two")
    with pytest.raises(CommercialConflictError):
        preview(db, context=other)
    with pytest.raises(CommercialPermissionError):
        notices.send_notice(db, dispatch_id=NOTICE, context=other)


def test_preview_expiry_prevents_stale_send_but_sent_replay_survives_expiry(db):
    preview(db)
    with get_session(db) as session:
        session.get(CustomerNotificationDispatch, NOTICE).created_at = datetime.now(
            UTC
        ) - timedelta(hours=1)
        session.commit()
    with pytest.raises(CommercialConflictError, match="Preview expired"):
        notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)


def test_transaction_failure_rolls_back_all_inboxes_and_audit(db, monkeypatch):
    preview(db)
    original = CommercialNotificationRepository.create_notification
    calls = []

    def fail_second(self, **kwargs):
        calls.append(kwargs)
        if len(calls) == 2:
            raise SQLAlchemyError("simulated storage failure")
        return original(self, **kwargs)

    monkeypatch.setattr(CommercialNotificationRepository, "create_notification", fail_second)
    with pytest.raises(SQLAlchemyError):
        notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    with get_session(db) as session:
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 0
        assert session.scalar(select(func.count()).select_from(ServiceAuditEvent)) == 1
        assert session.get(CustomerNotificationDispatch, NOTICE).status == "preview"
    monkeypatch.setattr(CommercialNotificationRepository, "create_notification", original)
    assert notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)["sent_count"] == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"link_href": "https://outside.test"},
        {"link_href": "/portal/../admin"},
        {"audience": "all", "account_ids": ["acct_one"]},
        {"audience": "selected", "account_ids": []},
        {"title": "  "},
    ],
)
def test_invalid_notice_rejected(db, overrides):
    with pytest.raises(CommercialValidationError):
        preview(db, **overrides)


def test_oversized_audience_is_rejected_without_partial_preview(db, monkeypatch):
    monkeypatch.setattr(notices, "MAX_ACCOUNTS", 2)
    with pytest.raises(CommercialValidationError):
        preview(db)
    with get_session(db) as session:
        assert session.scalar(select(func.count()).select_from(CustomerNotificationDispatch)) == 0


def test_selected_scope_deduplicates_accounts_and_records_unknowns(db):
    result = preview(db, audience="selected", account_ids=["acct_one", "acct_one", "missing"])
    assert (result["target_count"], result["ready_count"], result["skipped_count"]) == (2, 1, 1)


def test_audit_failure_rolls_back_delivery_and_terminal_state(db, monkeypatch):
    preview(db)
    original = notices._audit

    def fail_audit(*args, **kwargs):
        raise SQLAlchemyError("simulated audit failure")

    monkeypatch.setattr(notices, "_audit", fail_audit)
    with pytest.raises(SQLAlchemyError):
        notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    with get_session(db) as session:
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 0
        assert session.scalar(select(func.count()).select_from(ServiceAuditEvent)) == 1
        assert session.get(CustomerNotificationDispatch, NOTICE).status == "preview"
    monkeypatch.setattr(notices, "_audit", original)
    assert notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)["sent_count"] == 2


def test_sent_replay_remains_idempotent_after_preview_expiry(db):
    preview(db)
    notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)
    with get_session(db) as session:
        session.get(CustomerNotificationDispatch, NOTICE).created_at = datetime.now(
            UTC
        ) - timedelta(hours=1)
        session.commit()
    assert notices.send_notice(db, dispatch_id=NOTICE, context=CONTEXT)["sent_count"] == 2
    with get_session(db) as session:
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 2
