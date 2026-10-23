"""Opt-in Portal closure/notification proof on a disposable Compose PostgreSQL schema.

Uses the existing guarded fixture; never creates 0089 via init_schema. URLs stay
inside the process. Unconfigured local runs skip, and are not PostgreSQL evidence.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier, Event, current_thread
from time import monotonic, sleep

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, func, inspect, select, text

from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_engine, get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PaymentOrder,
    PortalLoginCode,
    PortalNotification,
    Principal,
    PrincipalSiteBinding,
    ServiceAuditEvent,
    Site,
    SiteAccountBinding,
    SiteApiKey,
    SupportRequest,
    SupportRequestMessage,
)
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import CommercialPermissionError, CommercialValidationError
from app.domain.commercial.identity import resolve_principal_allowed_actions
from app.domain.commercial.service import CommercialService
from tests.integration.test_portal_postgres_acceptance import (
    m4_database_url as m4_database_url,
)
from tests.integration.test_portal_postgres_acceptance import (
    portal_database as portal_database,
)

PARENT = "20261017_0088"
REVISION = "20261023_0089"
AUDIT = ServiceAuditContext(
    trace_id="closure-pg-proof",
    idempotency_key="closure-pg-proof",
    method="POST",
    path="/portal/v1/account/deletion/confirm",
)


def _migrate(url, revision, *, downgrade=False):
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    engine = create_engine(url, hide_parameters=True)
    try:
        with engine.connect() as connection:
            config.attributes["connection"] = connection
            (command.downgrade if downgrade else command.upgrade)(config, revision)
            connection.commit()
    finally:
        engine.dispose()


@pytest.fixture
def parent_database(portal_database):
    _migrate(portal_database, PARENT)
    with get_session(portal_database) as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == PARENT
        assert "portal_notifications" not in inspect(session.connection()).get_table_names()
    return portal_database


def _seed(url):
    with get_session(url) as session:
        session.add_all(
            [
                Account(account_id="acct_close", name="Closure proof", status="active"),
                Principal(principal_id="prn_close", email="close@example.test", status="active"),
                Principal(principal_id="prn_peer", email="peer@example.test", status="active"),
            ]
        )
        session.flush()
        session.add(
            Site(
                site_id="site_close",
                account_id="acct_close",
                name="Site",
                site_url="https://example.test",
                status="active",
            )
        )
        session.flush()
        session.add_all(
            [
                AccountUserMembership(
                    membership_id="mem_close",
                    account_id="acct_close",
                    principal_id="prn_close",
                    role="owner",
                    status="active",
                    allowed_actions_json=list(resolve_principal_allowed_actions()),
                ),
                SiteAccountBinding(
                    binding_id="sab_close",
                    site_id="site_close",
                    account_id="acct_close",
                    status="active",
                    bound_at=datetime.now(UTC),
                ),
                PrincipalSiteBinding(
                    binding_id="psb_close",
                    site_id="site_close",
                    account_id="acct_close",
                    principal_id="prn_close",
                    status="active",
                    bound_at=datetime.now(UTC),
                ),
                SiteApiKey(
                    key_id="key_close",
                    site_id="site_close",
                    secret_hash="test-only-hash",
                    label="test",
                    scopes_json=[],
                    status="active",
                ),
            ]
        )
        session.commit()


@pytest.fixture
def closure_database(parent_database):
    _migrate(parent_database, REVISION)
    _seed(parent_database)
    return parent_database


def _issue(url):
    return CommercialService(url).issue_portal_account_deletion_code(
        principal_id="prn_close",
        ttl_seconds=600,
    )["code"]


def _confirm(url, code):
    try:
        CommercialService(url).verify_and_execute_portal_account_deletion(
            principal_id="prn_close",
            code=code,
            max_attempts=5,
            audit_context=AUDIT,
        )
        return "closed"
    except CommercialPermissionError:
        return "rejected"


def _assert_unchanged(url):
    with get_session(url) as session:
        assert session.get(Account, "acct_close").status == "active"
        assert session.get(Principal, "prn_close").status == "active"
        assert session.get(SiteApiKey, "key_close").status == "active"
        assert session.get(SiteAccountBinding, "sab_close").released_at is None
        assert session.get(PrincipalSiteBinding, "psb_close").released_at is None
        assert session.scalar(select(PortalLoginCode)).status == "pending"
        assert (
            session.scalar(
                select(func.count())
                .select_from(ServiceAuditEvent)
                .where(
                    ServiceAuditEvent.event_kind == "account.self_service_deletion",
                )
            )
            == 0
        )


@contextmanager
def _watch_account_wait(url):
    """Observe a real backend wait, rather than assuming a thread/sleep means locked."""
    ready = Event()
    backend = []
    engine = get_engine(url)

    def before_execute(connection, cursor, statement, parameters, context, executemany):
        if (
            current_thread().name.startswith("closure-proof")
            and "FROM ACCOUNTS" in statement.upper()
            and "FOR UPDATE" in statement.upper()
        ):
            connection.execute(text("SET LOCAL lock_timeout = '8s'"))
            backend.append(connection.scalar(text("SELECT pg_backend_pid()")))
            ready.set()

    event.listen(engine, "before_cursor_execute", before_execute)

    def wait():
        assert ready.wait(5), "closure did not reach the Account row lock"
        observer = create_engine(url, hide_parameters=True)
        try:
            deadline = monotonic() + 5
            with observer.connect() as connection:
                while monotonic() < deadline:
                    if connection.scalar(
                        text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": backend[0]}
                    ):
                        return
                    sleep(0.02)
            pytest.fail("closure was not observed waiting on a real PostgreSQL row lock")
        finally:
            observer.dispose()

    try:
        yield wait
    finally:
        event.remove(engine, "before_cursor_execute", before_execute)


def test_actual_0088_to_0089_committed_migration_round_trip(parent_database):
    url = parent_database
    with get_session(url) as session:
        parent_tables = set(inspect(session.connection()).get_table_names())
        parent_health_indexes = inspect(session.connection()).get_indexes("health_snapshots")
    _migrate(url, REVISION)
    _seed(url)
    with get_session(url) as session:
        inspector = inspect(session.connection())
        assert {
            fk["referred_table"]
            for fk in inspector.get_foreign_keys(
                "portal_notifications",
            )
        } == {"accounts", "principals"}
        assert {i["name"] for i in inspector.get_indexes("portal_notifications")} == {
            "ix_portal_notifications_account_created",
            "ix_portal_notifications_account_unread",
        }
        CommercialNotificationRepository(session).create_notification(
            notification_id="notification",
            account_id="acct_close",
            principal_id="prn_close",
            event_type="support_request_replied",
            title="Reply",
        )
        session.commit()
    with get_session(url) as session:
        repo = CommercialNotificationRepository(session)
        assert (
            repo.count_account_notifications(account_id="acct_close", principal_id="prn_close") == 1
        )
        assert (
            repo.mark_read(
                notification_id="notification",
                account_id="acct_close",
                principal_id="prn_close",
                now=datetime.now(UTC),
            )
            == 1
        )
        session.commit()
    with get_session(url) as session:
        item = session.get(PortalNotification, "notification")
        assert item.is_read and item.read_at is not None
    _migrate(url, PARENT, downgrade=True)
    with get_session(url) as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == PARENT
        assert "portal_notifications" not in inspect(session.connection()).get_table_names()
        assert set(inspect(session.connection()).get_table_names()) == parent_tables
        assert (
            inspect(session.connection()).get_indexes("health_snapshots") == parent_health_indexes
        )
        assert session.get(Account, "acct_close") is not None
        assert session.get(Principal, "prn_close") is not None


def test_same_code_two_sessions_close_at_most_once(closure_database):
    code = _issue(closure_database)
    barrier = Barrier(2)

    def attempt():
        barrier.wait(timeout=5)
        return _confirm(closure_database, code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt) for _ in range(2)]
        results = [future.result(timeout=15) for future in futures]
    assert sorted(results) == ["closed", "rejected"]
    with get_session(closure_database) as session:
        assert session.get(Account, "acct_close").status == "closed"
        assert session.get(Principal, "prn_close").status == "disabled"
        assert session.scalar(select(PortalLoginCode)).status == "consumed"
        assert (
            session.scalar(
                select(func.count())
                .select_from(ServiceAuditEvent)
                .where(
                    ServiceAuditEvent.event_kind == "account.self_service_deletion",
                )
            )
            == 1
        )


@pytest.mark.parametrize("change", ["permission", "shared_member", "pending_payment"])
def test_waiting_confirmation_rechecks_committed_changes(closure_database, change):
    url = closure_database
    code = _issue(url)
    with _watch_account_wait(url) as wait, get_session(url) as writer:
        writer.scalar(select(Account).where(Account.account_id == "acct_close").with_for_update())
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="closure-proof") as pool:
            pending = pool.submit(_confirm, url, code)
            try:
                wait()
                if change == "permission":
                    writer.get(AccountUserMembership, "mem_close").allowed_actions_json = []
                elif change == "shared_member":
                    writer.add(
                        AccountUserMembership(
                            membership_id="mem_peer",
                            account_id="acct_close",
                            principal_id="prn_peer",
                            role="owner",
                            status="active",
                            allowed_actions_json=["view_audit"],
                        )
                    )
                else:
                    writer.add(
                        PaymentOrder(
                            order_id="pending",
                            account_id="acct_close",
                            plan_id="plus",
                            plan_version_id="fixture",
                            provider="alipay",
                            external_order_no="pg-pending",
                            status="pending",
                            amount=15,
                            currency="CNY",
                            subject="test",
                        )
                    )
                writer.commit()
            finally:
                writer.rollback()  # Release the lock even when an assertion fails.
            assert pending.result(timeout=12) == "rejected"
    _assert_unchanged(url)


def test_member_update_and_closure_share_account_first_lock_order(closure_database, monkeypatch):
    url = closure_database
    code = _issue(url)
    locked, proceed = Event(), Event()
    original = CommercialRepository.get_account_for_update

    def member_account_lock(repository, account_id):
        account = original(repository, account_id)
        locked.set()
        assert proceed.wait(8)
        return account

    monkeypatch.setattr(CommercialRepository, "get_account_for_update", member_account_lock)
    with _watch_account_wait(url) as wait:
        with (
            ThreadPoolExecutor(max_workers=1) as members,
            ThreadPoolExecutor(
                max_workers=1,
                thread_name_prefix="closure-proof",
            ) as closures,
        ):
            update = members.submit(
                CommercialService(url).upsert_account_member_access,
                account_id="acct_close",
                email="close@example.test",
                status="disabled",
            )
            try:
                assert locked.wait(5)
                closing = closures.submit(_confirm, url, code)
                wait()
            finally:
                proceed.set()
            assert update.result(timeout=12)["membership_status"] == "revoked"
            assert closing.result(timeout=12) == "rejected"
    _assert_unchanged(url)


@pytest.mark.parametrize("notification_failure", [False, True])
def test_public_reply_recipient_isolation_and_atomic_pg_readback(
    closure_database,
    monkeypatch,
    notification_failure,
):
    url = closure_database
    with get_session(url) as session:
        session.add(
            AccountUserMembership(
                membership_id="mem_peer",
                account_id="acct_close",
                principal_id="prn_peer",
                role="owner",
                status="active",
                allowed_actions_json=["view_audit"],
            )
        )
        session.add(
            SupportRequest(
                request_id="request",
                account_id="acct_close",
                principal_id="prn_close",
                email="close@example.test",
                title="Private title",
                description="Private question",
            )
        )
        session.commit()
    if notification_failure:
        original_create = CommercialNotificationRepository.create_notification

        def fail(repository, **payload):
            # Exercise a real PostgreSQL FK/flush failure inside the reply transaction.
            return original_create(repository, **{**payload, "account_id": "missing-account"})

        monkeypatch.setattr(CommercialNotificationRepository, "create_notification", fail)
    service = CommercialService(url)
    if notification_failure:
        with pytest.raises(CommercialValidationError):
            service.create_admin_support_request_message(
                request_id="request",
                body="Private reply",
                audit_context=AUDIT,
            )
    else:
        service.create_admin_support_request_message(
            request_id="request",
            body="Private reply",
            audit_context=AUDIT,
        )
    with get_session(url) as session:
        expected = 0 if notification_failure else 1
        for model in (SupportRequestMessage, PortalNotification, ServiceAuditEvent):
            assert session.scalar(select(func.count()).select_from(model)) == expected
        repo = CommercialNotificationRepository(session)
        scope = {"account_id": "acct_close", "principal_id": "prn_peer"}
        assert repo.list_account_notifications(**scope) == []
        assert repo.count_account_notifications(**scope, unread_only=True) == 0
        assert repo.mark_all_read(**scope, now=datetime.now(UTC)) == 0
        if not notification_failure:
            item = session.scalar(select(PortalNotification))
            assert item.principal_id == "prn_close" and item.body == "Private reply"
            assert (
                repo.mark_read(notification_id=item.notification_id, **scope, now=datetime.now(UTC))
                == 0
            )
        else:
            assert session.get(SupportRequest, "request").status == "open"
        session.commit()
    with get_session(url) as session:
        if not notification_failure:
            assert not session.scalar(select(PortalNotification)).is_read


def test_all_portal_sessions_revoked_api_and_version_readback(parent_database):
    """Actual API against a unique guarded PG schema; never touches demo sessions."""
    from tests.api.test_portal_session_revocation import assert_session_revocation_api_readback

    _migrate(parent_database, REVISION)
    assert_session_revocation_api_readback(parent_database)
