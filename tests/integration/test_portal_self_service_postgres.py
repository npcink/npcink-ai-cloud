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
    _migrate(parent_database, "20261024_0090")
    _seed(parent_database)
    _seed_export_session(parent_database)
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

    _migrate(parent_database, "20261024_0090")
    assert_session_revocation_api_readback(parent_database)
# Data copy proof deliberately reuses the guarded, migrated disposable schema.
# Local opt-in skips are not PostgreSQL acceptance.
def _seed_export_session(url):
    from datetime import timedelta

    from app.core.models import PortalSession

    with get_session(url) as session:
        now = datetime.now(UTC).replace(microsecond=0)
        session.add(
            PortalSession(
                session_id="pg_export_fixture",
                principal_id="prn_close",
                session_version=1,
                created_at=now,
                absolute_expires_at=now + timedelta(hours=1),
                auth_method="email_code",
            )
        )
        session.commit()


def _export_call(url, operation, payload):
    from app.core.models import PortalSession
    from app.domain.portal_data_export import DataExportError, execute_data_export

    with get_session(url) as fixture_session:
        expiry = fixture_session.get(PortalSession, "pg_export_fixture").absolute_expires_at
    try:
        return execute_data_export(
            database_url=url,
            principal_id="prn_close",
            session_version=1,
            session_id="pg_export_fixture",
            session_expires_at=expiry,
            site_id="site_close",
            operation=operation,
            payload=payload,
            sender_available=True,
        )
    except DataExportError as error:
        return error.status


def test_data_export_postgres_single_consume_and_no_receipt(closure_database):
    from app.core.models import ReplayReceipt

    url = closure_database
    issued = _export_call(url, "code", {})
    assert isinstance(issued, dict)
    payload = {"challenge_id": issued["challenge_id"], "code": issued["code"]}
    barrier = Barrier(2)

    def confirm():
        barrier.wait(timeout=10)
        return _export_call(url, "confirm", payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = [
            f.result(timeout=15) for f in [executor.submit(confirm), executor.submit(confirm)]
        ]
    assert sum(isinstance(r, bytes) for r in results) == 1
    assert [r for r in results if isinstance(r, int)][0] in (400, 409)
    with get_session(url) as session:
        assert session.get(PortalLoginCode, payload["challenge_id"]).status == "consumed"
        assert list(session.scalars(select(ReplayReceipt))) == []
        assert session.get(Principal, "prn_close").session_version == 1


@pytest.mark.parametrize("change", ["version", "email", "member", "account"])
def test_data_export_postgres_rechecks_after_scope_lock_wait(closure_database, change):
    from sqlalchemy.engine import Engine

    url = closure_database
    issued = _export_call(url, "code", {})
    assert isinstance(issued, dict)
    payload = {"challenge_id": issued["challenge_id"], "code": issued["code"]}
    waiting = Event()

    def before(conn, cursor, statement, parameters, context, many):
        if current_thread().name.startswith("export-race") and "FOR UPDATE" in statement:
            waiting.set()

    event.listen(Engine, "before_cursor_execute", before)
    try:
        with (
            get_session(url) as writer,
            ThreadPoolExecutor(max_workers=1, thread_name_prefix="export-race") as executor,
        ):
            account = writer.scalar(
                select(Account).where(Account.account_id == "acct_close").with_for_update()
            )
            principal = writer.scalar(
                select(Principal).where(Principal.principal_id == "prn_close").with_for_update()
            )
            if change == "version":
                principal.session_version += 1
            if change == "email":
                principal.email = "changed@example.test"
            if change == "account":
                account.status = "closed"
            if change == "member":
                writer.get(AccountUserMembership, "mem_close").status = "revoked"
            writer.flush()
            future = executor.submit(_export_call, url, "confirm", payload)
            assert waiting.wait(timeout=3), "export must reach the locked scope before release"
            writer.commit()
            assert future.result(timeout=10) in (400, 401, 403, 409)
    finally:
        event.remove(Engine, "before_cursor_execute", before)
    with get_session(url) as session:
        assert session.get(PortalLoginCode, payload["challenge_id"]).status != "consumed"


def test_data_export_postgres_bound_failure_preserves_code(closure_database):
    url = closure_database
    issued = _export_call(url, "code", {})
    assert isinstance(issued, dict)
    payload = {"challenge_id": issued["challenge_id"], "code": issued["code"]}
    with get_session(url) as session:
        session.add(
            SupportRequest(
                request_id="huge-export",
                account_id="acct_close",
                principal_id="prn_close",
                title="Huge text",
                description="界" * 800000,
            )
        )
        session.commit()
    assert _export_call(url, "confirm", payload) == 413
    with get_session(url) as session:
        code = session.get(PortalLoginCode, payload["challenge_id"])
        assert code.status == "pending" and code.attempt_count == 0
        session.get(SupportRequest, "huge-export").description = "Small"
        session.commit()
    assert isinstance(_export_call(url, "confirm", payload), bytes)


def test_data_export_postgres_lock_timeout_preserves_code(closure_database, monkeypatch):
    from app.domain import portal_data_export

    url = closure_database
    issued = _export_call(url, "code", {})
    assert isinstance(issued, dict)
    payload = {"challenge_id": issued["challenge_id"], "code": issued["code"]}
    monkeypatch.setattr(portal_data_export, "BUDGET_SECONDS", 0.25)
    with get_session(url) as writer, ThreadPoolExecutor(max_workers=1) as executor:
        writer.scalar(select(Account).where(Account.account_id == "acct_close").with_for_update())
        started = monotonic()
        assert executor.submit(_export_call, url, "confirm", payload).result(timeout=4) == 504
        assert monotonic() - started < 3
        writer.rollback()
    with get_session(url) as session:
        assert session.get(PortalLoginCode, payload["challenge_id"]).status == "pending"


# Registry B1: use real Alembic, not metadata.create_all/init_schema.
REGISTRY_REVISION = "20261024_0090"


@pytest.fixture
def registry_database(portal_database):
    _migrate(portal_database, REVISION)
    with get_session(portal_database) as session:
        assert "portal_sessions" not in inspect(session.connection()).get_table_names()
    _migrate(portal_database, REGISTRY_REVISION)
    with get_session(portal_database) as session:
        session.add(Principal(principal_id="prn_registry", email="registry@example.test"))
        session.commit()
    return portal_database


def _registry_row(**overrides):
    from datetime import timedelta

    now = datetime(2026, 10, 24, tzinfo=UTC)
    values = dict(
        session_id="session_registry", principal_id="prn_registry", session_version=1,
        created_at=now, absolute_expires_at=now + timedelta(hours=1),
        auth_method="email_code",
    )
    values.update(overrides)
    from app.core.models import PortalSession

    return PortalSession(**values)


def test_registry_postgres_migration_round_trip(registry_database):
    from app.core.models import PortalSession

    with get_session(registry_database) as session:
        inspector = inspect(session.connection())
        assert {i["name"] for i in inspector.get_indexes("portal_sessions")} == {
            "ix_portal_sessions_principal_created", "ix_portal_sessions_expiry"
        }
        assert len(inspector.get_check_constraints("portal_sessions")) == 6
        session.add(_registry_row())
        session.commit()
    with get_session(registry_database) as session:
        row = session.get(PortalSession, "session_registry")
        assert row.principal_id == "prn_registry"
        assert row.session_version == 1
        assert row.created_at == datetime(2026, 10, 24, tzinfo=UTC)
        assert row.revoked_at is None and row.client_hint is None
    _migrate(registry_database, REVISION, downgrade=True)
    with get_session(registry_database) as session:
        assert "portal_sessions" not in inspect(session.connection()).get_table_names()
        assert session.get(Principal, "prn_registry") is not None
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == REVISION
    _migrate(registry_database, REGISTRY_REVISION)
    with get_session(registry_database) as session:
        assert session.scalar(select(func.count()).select_from(PortalSession)) == 0


@pytest.mark.parametrize("overrides,sqlstate", [
    ({"session_id": ""}, "23514"),
    ({"session_version": 0}, "23514"),
    ({"session_version": None}, "23502"),
    ({"absolute_expires_at": datetime(2026, 10, 24, tzinfo=UTC)}, "23514"),
    ({"auth_method": "admin"}, "23514"),
    ({"revoke_reason": "logout"}, "23514"),
    ({"revoked_at": datetime(2026, 10, 24, tzinfo=UTC)}, "23514"),
    ({"revoked_at": datetime(2026, 10, 23, tzinfo=UTC), "revoke_reason": "logout"}, "23514"),
    ({"revoked_at": datetime(2026, 10, 24, tzinfo=UTC), "revoke_reason": ""}, "23514"),
    ({"client_hint": ""}, "23514"),
    ({"client_hint": "x" * 121}, "22001"),
    ({"principal_id": "missing-principal"}, "23503"),
])
def test_registry_postgres_rejects_invalid_rows(registry_database, overrides, sqlstate):
    from sqlalchemy.exc import DataError, IntegrityError

    from app.core.models import PortalSession

    with get_session(registry_database) as session:
        with pytest.raises((IntegrityError, DataError)) as caught:
            session.add(_registry_row(**overrides))
            session.flush()
        assert getattr(caught.value.orig, "sqlstate", None) == sqlstate
        session.rollback()
    with get_session(registry_database) as session:
        assert session.scalar(select(func.count()).select_from(PortalSession)) == 0


def test_registry_postgres_unique_fk_and_caller_rollback(registry_database):
    from sqlalchemy.exc import IntegrityError

    from app.core.models import PortalSession

    with get_session(registry_database) as session:
        session.add(_registry_row())
        session.commit()
    with get_session(registry_database) as session:
        with pytest.raises(IntegrityError) as duplicate:
            session.add(_registry_row())
            session.flush()
        assert getattr(duplicate.value.orig, "sqlstate", None) == "23505"
        session.rollback()
        with pytest.raises(IntegrityError) as referenced:
            session.delete(session.get(Principal, "prn_registry"))
            session.flush()
        assert getattr(referenced.value.orig, "sqlstate", None) == "23503"
        session.rollback()
        session.add(_registry_row(session_id="rolled_back"))
        session.flush()
        session.rollback()
    with get_session(registry_database) as session:
        assert session.get(PortalSession, "rolled_back") is None
        assert session.get(PortalSession, "session_registry") is not None
        assert session.get(Principal, "prn_registry") is not None


def test_registry_postgres_principal_lock_is_transaction_scoped(registry_database):
    from sqlalchemy.exc import OperationalError

    from app.adapters.repositories.portal_session_repository import PortalSessionRepository

    with get_session(registry_database) as owner, get_session(registry_database) as contender:
        repo = PortalSessionRepository(owner)
        assert repo.lock_principal(principal_id="prn_registry") is not None
        contender.execute(text("SET LOCAL lock_timeout = '150ms'"))
        with pytest.raises(OperationalError) as caught:
            PortalSessionRepository(contender).lock_principal(principal_id="prn_registry")
        assert getattr(caught.value.orig, "sqlstate", None) == "55P03"
        contender.rollback()
        owner.rollback()
        assert PortalSessionRepository(contender).lock_principal(
            principal_id="prn_registry"
        ) is not None
        contender.rollback()


# B2: actual transaction ordering on independent connections; never shared demo data.
@contextmanager
def _watch_registry_wait(url):
    ready, backend = Event(), []
    from sqlalchemy.engine import Engine

    engine = Engine

    def before(connection, cursor, statement, parameters, context, executemany):
        if (
            current_thread().name.startswith("registry-race")
            and "FROM ACCOUNTS" in statement.upper()
            and "FOR UPDATE" in statement.upper()
        ):
            connection.execute(text("SET LOCAL lock_timeout = '8s'"))
            backend.append(connection.scalar(text("SELECT pg_backend_pid()")))
            ready.set()

    event.listen(engine, "before_cursor_execute", before)

    def wait():
        assert ready.wait(5)
        observer = create_engine(url, hide_parameters=True)
        try:
            with observer.connect() as connection:
                deadline = monotonic() + 5
                while monotonic() < deadline:
                    if connection.scalar(
                        text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": backend[0]}
                    ):
                        return
                    sleep(0.02)
            pytest.fail("second transaction never reached an observed PostgreSQL lock wait")
        finally:
            observer.dispose()

    try:
        yield wait
    finally:
        event.remove(engine, "before_cursor_execute", before)


def _registry_settings(url):
    from app.core.config import Settings
    from tests.conftest import TEST_PORTAL_JWT_SECRET

    return Settings(
        _env_file=None,
        environment="test",
        database_url=url,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
    )


def _run_registry_ordered_pair(url, monkeypatch, first, second):
    """Pause first at its real commit; prove second blocked, then permit commit."""
    from sqlalchemy.orm import Session

    rendezvous, release = Barrier(2), Event()
    original = Session.commit

    def paused_commit(self):
        if current_thread().name.startswith("registry-first"):
            rendezvous.wait(timeout=5)
            assert release.wait(8)
        return original(self)

    monkeypatch.setattr(Session, "commit", paused_commit)
    with (
        ThreadPoolExecutor(1, thread_name_prefix="registry-first") as a,
        ThreadPoolExecutor(1, thread_name_prefix="registry-race") as b,
    ):
        first_future = a.submit(first)
        try:
            rendezvous.wait(timeout=5)
            with _watch_registry_wait(url) as wait:
                second_future = b.submit(second)
                try:
                    wait()
                finally:
                    release.set()
                return first_future.result(timeout=10), second_future.result(timeout=10)
        finally:
            release.set()


@pytest.mark.parametrize("invalidation", ["revoke", "disable"])
@pytest.mark.parametrize("issue_first", [True, False])
def test_registry_postgres_issuance_invalidation_commit_order(
    closure_database,
    monkeypatch,
    invalidation,
    issue_first,
):
    from app.api.auth import PortalBearerTokenError, validate_portal_principal_session
    from app.domain.portal_sessions.service import PortalSessionIssuer

    url = closure_database
    service, settings = CommercialService(url), _registry_settings(url)
    proof = service.issue_portal_login_code(email="close@example.test", ttl_seconds=600)

    def issue():
        try:
            return service.verify_portal_login_code(
                email="close@example.test",
                code=proof["code"],
                max_attempts=5,
                session_issuer=PortalSessionIssuer(settings, 3600, "email_code"),
            )["_portal_session"]
        except CommercialPermissionError:
            return "denied"

    def invalidate():
        if invalidation == "revoke":
            return service.revoke_portal_sessions(principal_id="prn_close")
        return service.disable_admin_portal_user(principal_id="prn_close", reason="PG fixture")

    first, second = _run_registry_ordered_pair(
        url,
        monkeypatch,
        issue if issue_first else invalidate,
        invalidate if issue_first else issue,
    )
    issued = first if issue_first else second
    with get_session(url) as session:
        principal = session.get(Principal, "prn_close")
        assert principal.session_version == 2
        assert principal.status == ("disabled" if invalidation == "disable" else "active")
        code = session.scalar(
            select(PortalLoginCode).where(PortalLoginCode.purpose == "portal_login")
        )
        assert code.status == (
            "pending" if not issue_first and invalidation == "disable" else "consumed"
        )
    if not issue_first and invalidation == "disable":
        assert issued == "denied"
    else:
        kwargs = dict(
            principal_id=issued.principal_id,
            session_id=issued.session_id,
            session_version=issued.session_version,
            expires_at=issued.expires_at,
        )
        if issue_first:
            with pytest.raises(PortalBearerTokenError) as error:
                validate_portal_principal_session(settings, **kwargs)
            assert error.value.status_code == 401
        else:
            assert issued.session_version == 2
            validate_portal_principal_session(settings, **kwargs)


@pytest.mark.parametrize("rotation_first", [True, False])
def test_registry_postgres_rotation_logout_cannot_resurrect(
    closure_database,
    monkeypatch,
    rotation_first,
):
    from types import SimpleNamespace

    from fastapi import Request

    from app.api.auth import (
        PortalAuthContext,
        PortalBearerTokenError,
        validate_portal_principal_session,
    )
    from app.api.portal_session import revoke_current_portal_session, rotate_portal_session
    from app.core.models import PortalSession
    from app.domain.portal_sessions.service import PortalSessionIssuer, lock_login_scope

    url, settings = closure_database, _registry_settings(closure_database)
    with get_session(url) as session:
        principal = lock_login_scope(session, "prn_close")
        issued = PortalSessionIssuer(settings, 3600, "email_code").issue(session, principal)
        session.commit()
    auth = PortalAuthContext("prn_close", "site_close", issued.session_id, 1, issued.expires_at)
    request = Request(
        {
            "type": "http",
            "app": SimpleNamespace(
                state=SimpleNamespace(services=SimpleNamespace(settings=settings))
            ),
        }
    )

    def rotate():
        try:
            return rotate_portal_session(request, auth, "site_close")
        except CommercialPermissionError:
            return "denied"

    def logout():
        revoke_current_portal_session(request, auth)
        return "revoked"

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, rotate if rotation_first else logout, logout if rotation_first else rotate
    )
    rotated = first if rotation_first else second
    if rotation_first:
        assert rotated.session_id == issued.session_id
        assert rotated.expires_at == issued.expires_at
    else:
        assert rotated == "denied"
    with get_session(url) as session:
        row = session.get(PortalSession, issued.session_id)
        assert row.revoked_at is not None
        assert session.get(Principal, "prn_close").session_version == 1
    with pytest.raises(PortalBearerTokenError):
        validate_portal_principal_session(
            settings,
            principal_id="prn_close",
            session_id=issued.session_id,
            session_version=1,
            expires_at=issued.expires_at,
        )


@pytest.mark.parametrize("failure", ["sign", "commit"])
def test_registry_postgres_failed_issue_preserves_proof(closure_database, monkeypatch, failure):
    from sqlalchemy.orm import Session

    from app.core.models import PortalSession
    from app.domain.portal_sessions.service import PortalSessionIssuer

    url, service = closure_database, CommercialService(closure_database)
    proof = service.issue_portal_login_code(email="close@example.test", ttl_seconds=600)
    if failure == "sign":

        def fail(*args, **kwargs):
            raise RuntimeError("synthetic signing failure")

        monkeypatch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
    else:

        def fail(self):
            raise RuntimeError("synthetic commit failure")

        monkeypatch.setattr(Session, "commit", fail)
    with pytest.raises(RuntimeError):
        service.verify_portal_login_code(
            email="close@example.test",
            code=proof["code"],
            max_attempts=5,
            session_issuer=PortalSessionIssuer(_registry_settings(url), 3600, "email_code"),
        )
    with get_session(url) as session:
        assert (
            session.scalar(
                select(PortalLoginCode).where(PortalLoginCode.purpose == "portal_login")
            ).status
            == "pending"
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(PortalSession)
                .where(PortalSession.session_id != "pg_export_fixture")
            )
            == 0
        )


@pytest.mark.parametrize("export_first", [True, False])
def test_registry_postgres_export_logout_commit_order(closure_database, monkeypatch, export_first):
    from types import SimpleNamespace

    from fastapi import Request

    from app.api.auth import PortalAuthContext
    from app.api.portal_session import revoke_current_portal_session
    from app.core.models import PortalSession

    url = closure_database
    issued = _export_call(url, "code", {})
    assert isinstance(issued, dict)
    payload = {"challenge_id": issued["challenge_id"], "code": issued["code"]}
    with get_session(url) as session:
        expiry = session.get(PortalSession, "pg_export_fixture").absolute_expires_at
    auth = PortalAuthContext("prn_close", "site_close", "pg_export_fixture", 1, expiry)
    request = Request(
        {
            "type": "http",
            "app": SimpleNamespace(
                state=SimpleNamespace(services=SimpleNamespace(settings=_registry_settings(url)))
            ),
        }
    )

    def export():
        return _export_call(url, "confirm", payload)

    def logout():
        revoke_current_portal_session(request, auth)
        return "revoked"

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, export if export_first else logout, logout if export_first else export
    )
    result = first if export_first else second
    assert isinstance(result, bytes) if export_first else result in (401, 409)
    with get_session(url) as session:
        assert session.get(PortalLoginCode, payload["challenge_id"]).status == (
            "consumed" if export_first else "pending"
        )
        assert session.get(Principal, "prn_close").session_version == 1
        assert session.get(PortalSession, "pg_export_fixture").revoked_at is not None


@pytest.mark.parametrize("phase", ["proof_wait", "before_insert"])
def test_registry_postgres_registration_reserved_identity_race(closure_database, phase):
    """Realize a reserved principal on another connection at either discovery gap."""
    from sqlalchemy.engine import Engine

    from app.core.models import PortalSession
    from app.domain.commercial.errors import CommercialServiceError
    from app.domain.portal_sessions.service import PortalSessionIssuer

    url, settings = closure_database, _registry_settings(closure_database)
    service = CommercialService(url)
    email = "reserved-race@example.test"
    proof = service.issue_portal_registration_code(email=email, ttl_seconds=600)
    with get_session(url) as session:
        code = session.scalar(select(PortalLoginCode).where(PortalLoginCode.email == email))
        code_id, principal_id = code.code_id, code.principal_id
        reserved_account = code.metadata_json["account_id"]
        original_counts = tuple(
            session.scalar(select(func.count()).select_from(model))
            for model in (Account, AccountUserMembership, PortalSession)
        )
    ready, release, rendezvous, backend = Event(), Event(), Barrier(2), []

    def before(connection, cursor, statement, parameters, context, executemany):
        if not current_thread().name.startswith("registration-reservation-race"):
            return
        sql = statement.upper()
        matches = (
            phase == "proof_wait" and "FROM PORTAL_LOGIN_CODES" in sql and "FOR UPDATE" in sql
        ) or (phase == "before_insert" and "INSERT INTO PRINCIPALS" in sql)
        if not matches:
            return
        connection.execute(text("SET LOCAL lock_timeout = '8s'"))
        backend.append(connection.scalar(text("SELECT pg_backend_pid()")))
        ready.set()
        rendezvous.wait(timeout=5)
        if phase == "before_insert":
            assert release.wait(8)

    def verify():
        try:
            service.verify_portal_registration_code(
                email=email,
                code=proof["code"],
                max_attempts=5,
                session_issuer=PortalSessionIssuer(settings, 3600, "registration"),
            )
        except CommercialServiceError as error:
            return error.status_code
        return 200

    event.listen(Engine, "before_cursor_execute", before)
    try:
        with (
            get_session(url) as owner,
            ThreadPoolExecutor(1, thread_name_prefix="registration-reservation-race") as executor,
        ):
            if phase == "proof_wait":
                owner.scalar(
                    select(PortalLoginCode)
                    .where(PortalLoginCode.code_id == code_id)
                    .with_for_update()
                )
            future = executor.submit(verify)
            try:
                assert ready.wait(5)
                rendezvous.wait(timeout=5)
                if phase == "proof_wait":
                    # Observe actual proof-row lock wait before making the reserved
                    # identity visible. The other connection retains the pending code.
                    observer = create_engine(url, hide_parameters=True)
                    try:
                        with observer.connect() as connection:
                            deadline = monotonic() + 5
                            while not connection.scalar(
                                text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"),
                                {"pid": backend[0]},
                            ):
                                assert monotonic() < deadline, (
                                    "proof query never reached a PostgreSQL lock wait"
                                )
                                sleep(0.02)
                    finally:
                        observer.dispose()
                owner.add(
                    Principal(
                        principal_id=principal_id,
                        email="realized-owner@example.test",
                        status="disabled",
                        session_version=7,
                    )
                )
                owner.commit()
                release.set()
                assert future.result(timeout=10) == (403 if phase == "proof_wait" else 409)
            finally:
                release.set()
                owner.rollback()
    finally:
        event.remove(Engine, "before_cursor_execute", before)
    with get_session(url) as session:
        principal = session.get(Principal, principal_id)
        assert (principal.email, principal.status, principal.session_version) == (
            "realized-owner@example.test",
            "disabled",
            7,
        )
        code = session.get(PortalLoginCode, code_id)
        assert code.status == "pending" and code.consumed_at is None
        assert session.get(Account, reserved_account) is None
        assert (
            tuple(
                session.scalar(select(func.count()).select_from(model))
                for model in (Account, AccountUserMembership, PortalSession)
            )
            == original_counts
        )
