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
    _migrate(parent_database, "20261024_0091")
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

    _migrate(parent_database, "20261024_0091")
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


def _registry_table(session):
    """B1 historical0090 schema must not depend on later ORM columns."""
    from sqlalchemy import MetaData, Table

    return Table("portal_sessions", MetaData(), autoload_with=session.connection())


def _registry_row(**overrides):
    from datetime import timedelta

    now = datetime(2026, 10, 24, tzinfo=UTC)
    values = dict(
        session_id="session_registry",
        principal_id="prn_registry",
        session_version=1,
        created_at=now,
        absolute_expires_at=now + timedelta(hours=1),
        auth_method="email_code",
    )
    values.update(overrides)
    return values


def test_registry_postgres_migration_round_trip(registry_database):
    with get_session(registry_database) as session:
        inspector = inspect(session.connection())
        assert {i["name"] for i in inspector.get_indexes("portal_sessions")} == {
            "ix_portal_sessions_principal_created",
            "ix_portal_sessions_expiry",
        }
        assert len(inspector.get_check_constraints("portal_sessions")) == 6
        session.execute(_registry_table(session).insert().values(**_registry_row()))
        session.commit()
    with get_session(registry_database) as session:
        row = session.execute(select(_registry_table(session))).one()
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
        assert session.scalar(select(func.count()).select_from(_registry_table(session))) == 0


@pytest.mark.parametrize(
    "overrides,sqlstate",
    [
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
    ],
)
def test_registry_postgres_rejects_invalid_rows(registry_database, overrides, sqlstate):
    from sqlalchemy.exc import DataError, IntegrityError

    with get_session(registry_database) as session:
        with pytest.raises((IntegrityError, DataError)) as caught:
            session.execute(_registry_table(session).insert().values(**_registry_row(**overrides)))
            session.flush()
        assert getattr(caught.value.orig, "sqlstate", None) == sqlstate
        session.rollback()
    with get_session(registry_database) as session:
        assert session.scalar(select(func.count()).select_from(_registry_table(session))) == 0


def test_registry_postgres_unique_fk_and_caller_rollback(registry_database):
    from sqlalchemy.exc import IntegrityError

    with get_session(registry_database) as session:
        session.execute(_registry_table(session).insert().values(**_registry_row()))
        session.commit()
    with get_session(registry_database) as session:
        with pytest.raises(IntegrityError) as duplicate:
            session.execute(_registry_table(session).insert().values(**_registry_row()))
            session.flush()
        assert getattr(duplicate.value.orig, "sqlstate", None) == "23505"
        session.rollback()
        with pytest.raises(IntegrityError) as referenced:
            session.delete(session.get(Principal, "prn_registry"))
            session.flush()
        assert getattr(referenced.value.orig, "sqlstate", None) == "23503"
        session.rollback()
        session.execute(
            _registry_table(session).insert().values(**_registry_row(session_id="rolled_back"))
        )
        session.flush()
        session.rollback()
    with get_session(registry_database) as session:
        registry_table = _registry_table(session)
        assert (
            session.execute(
                select(registry_table).where(registry_table.c.session_id == "rolled_back")
            ).first()
            is None
        )
        assert (
            session.execute(
                select(registry_table).where(registry_table.c.session_id == "session_registry")
            ).first()
            is not None
        )
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
        assert (
            PortalSessionRepository(contender).lock_principal(principal_id="prn_registry")
            is not None
        )
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
    # Restore injection before readback and fixture/schema cleanup, even on failure.
    with monkeypatch.context() as injected:
        if failure == "sign":

            def fail(*args, **kwargs):
                raise RuntimeError("synthetic signing failure")

            injected.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
        else:

            def fail(self):
                raise RuntimeError("synthetic commit failure")

            injected.setattr(Session, "commit", fail)
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


def _b3a_issue(url):
    from app.domain.portal_sessions.service import (
        AuthenticatedSession,
        PortalSessionIssuer,
        lock_login_scope,
    )

    with get_session(url) as session:
        issued = PortalSessionIssuer(_registry_settings(url), 3600, "email_code").issue(
            session, lock_login_scope(session, "prn_close")
        )
        session.commit()
    return AuthenticatedSession(
        issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
    )


def _b3a_revoke(url, caller, target=None):
    from app.domain.portal_sessions.service import revoke_principal_sessions

    try:
        return revoke_principal_sessions(url, caller, target_session_id=target)
    except CommercialPermissionError as error:
        assert error.error_code == "auth.portal_session_revoked"
        return 401


@pytest.mark.parametrize("single_first", [True, False])
def test_sessions_postgres_single_vs_others_rechecks_caller(
    closure_database, monkeypatch, single_first
):
    from app.core.models import PortalSession

    url = closure_database
    a, b, c = [_b3a_issue(url) for _ in range(3)]

    def single():
        return _b3a_revoke(url, a, b.session_id)

    def others():
        return _b3a_revoke(url, b)

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, single if single_first else others, others if single_first else single
    )
    assert first.revoked_count == (1 if single_first else 3)  # includes export fixture
    assert second == 401
    _b3a_assert_auth(url, a, single_first)
    _b3a_assert_auth(url, b, not single_first)
    _b3a_assert_auth(url, c, single_first)
    with get_session(url) as session:
        assert (session.get(PortalSession, a.session_id).revoked_at is None) == single_first
        assert (session.get(PortalSession, b.session_id).revoked_at is not None) == single_first
        assert (session.get(PortalSession, c.session_id).revoked_at is None) == single_first
        assert session.get(Principal, "prn_close").session_version == 1


@pytest.mark.parametrize("export_first", [True, False])
def test_sessions_postgres_individual_revoke_vs_export_commit_order(
    closure_database, monkeypatch, export_first
):
    from app.core.models import PortalSession

    url = closure_database
    revoker = _b3a_issue(url)
    challenge = _export_call(url, "code", {})
    assert isinstance(challenge, dict)
    payload = {"challenge_id": challenge["challenge_id"], "code": challenge["code"]}

    def export():
        return _export_call(url, "confirm", payload)

    def revoke():
        return _b3a_revoke(url, revoker, "pg_export_fixture")

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, export if export_first else revoke, revoke if export_first else export
    )
    exported, revoked = (first, second) if export_first else (second, first)
    assert isinstance(exported, bytes) if export_first else exported in (401, 409)
    assert revoked.revoked_count == 1
    _b3a_assert_auth(url, revoker, True)
    with get_session(url) as session:
        assert session.get(PortalSession, "pg_export_fixture").revoked_at is not None
        assert session.get(PortalSession, revoker.session_id).revoked_at is None
        assert session.get(PortalLoginCode, payload["challenge_id"]).status == (
            "consumed" if export_first else "pending"
        )
        assert session.get(Principal, "prn_close").session_version == 1


@pytest.mark.parametrize("operation", ["write", "replay"])
def test_sessions_postgres_expiry_while_waiting_rejects_original_caller(
    closure_database, monkeypatch, operation
):
    from datetime import timedelta

    from app.core.models import PortalSession
    from app.domain.portal_sessions import service

    url = closure_database
    caller, target = _b3a_issue(url), _b3a_issue(url)
    clock = [datetime.now(UTC)]

    class ControlledClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0] if tz is not None else clock[0].replace(tzinfo=None)

    def command():
        if operation == "write":
            return _b3a_revoke(url, caller, target.session_id)
        try:
            service.revalidate_session_caller(url, caller)
        except CommercialPermissionError as error:
            assert error.error_code == "auth.portal_session_revoked"
            return 401
        return 200

    with monkeypatch.context() as injected:
        injected.setattr(service, "datetime", ControlledClock)
        with get_session(url) as owner:
            owner.scalar(
                select(Account).where(Account.account_id == "acct_close").with_for_update()
            )
            with _watch_registry_wait(url) as wait:
                with ThreadPoolExecutor(1, thread_name_prefix="registry-race") as executor:
                    future = executor.submit(command)
                    try:
                        wait()  # real second-connection PostgreSQL lock wait
                        clock[0] = caller.expires_at + timedelta(seconds=1)
                    finally:
                        owner.rollback()
                    assert future.result(timeout=10) == 401
    with get_session(url) as session:
        assert session.get(PortalSession, target.session_id).revoked_at is None
        assert session.get(PortalSession, caller.session_id).revoked_at is None
        assert session.get(Principal, "prn_close").session_version == 1


def _b3a_assert_auth(url, identity, valid):
    from app.api.auth import PortalBearerTokenError, validate_portal_principal_session

    def check():
        validate_portal_principal_session(
            _registry_settings(url),
            principal_id=identity.principal_id,
            session_id=identity.session_id,
            session_version=identity.session_version,
            expires_at=identity.expires_at,
        )

    if valid:
        check()
    else:
        with pytest.raises(PortalBearerTokenError) as error:
            check()
        assert error.value.status_code == 401


def test_sessions_postgres_replay_waiting_for_caller_revoke_fails_closed(
    closure_database, monkeypatch
):
    from app.domain.portal_sessions.service import revalidate_session_caller

    url = closure_database
    caller, revoker = _b3a_issue(url), _b3a_issue(url)

    def revoke():
        return _b3a_revoke(url, revoker, caller.session_id)

    def replay():
        try:
            revalidate_session_caller(url, caller)
        except CommercialPermissionError as error:
            assert error.error_code == "auth.portal_session_revoked"
            return 401
        return 200

    first, second = _run_registry_ordered_pair(url, monkeypatch, revoke, replay)
    assert first.revoked_count == 1 and second == 401
    _b3a_assert_auth(url, caller, False)
    _b3a_assert_auth(url, revoker, True)


# T1 dormant storage; no issuer, factor verifier or user activation path.
TOTP_REVISION = "20261024_0091"


@pytest.fixture
def totp_database(portal_database):
    _migrate(portal_database, REGISTRY_REVISION)
    with get_session(portal_database) as session:
        session.add(Principal(principal_id="prn_registry", email="totp-storage@example.test"))
        session.flush()
        session.execute(_registry_table(session).insert().values(**_registry_row()))
        session.commit()
    _migrate(portal_database, TOTP_REVISION)
    return portal_database


def _totp_factor(**overrides):
    from app.core.models import PortalTotpFactor

    values = dict(
        principal_id="prn_registry",
        factor_version=1,
        state="disabled",
        recovery_generation=0,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    values.update(overrides)
    return PortalTotpFactor(**values)


def test_totp_postgres_migration_preserves_legacy_session_and_safe_downgrade(totp_database):
    from app.core.models import PortalSession

    url = totp_database
    with get_session(url) as session:
        row = session.get(PortalSession, "session_registry")
        assert (
            row.factor_version,
            row.primary_authenticated_at,
            row.second_factor_verified_at,
            row.second_factor_method,
        ) == (None,) * 4
        original = row.session_version, row.created_at, row.absolute_expires_at
        inspector = inspect(session.connection())
        assert {"portal_totp_factors", "portal_recovery_codes", "portal_auth_challenges"} <= set(
            inspector.get_table_names()
        )
        assert len(inspector.get_check_constraints("portal_totp_factors")) == 6
        assert len(inspector.get_check_constraints("portal_sessions")) == 7
    _migrate(url, REGISTRY_REVISION, downgrade=True)
    with get_session(url) as session:
        row = session.execute(select(_registry_table(session))).one()
        assert (row.session_version, row.created_at, row.absolute_expires_at) == original
        assert "factor_version" not in row._mapping
        assert "portal_totp_factors" not in inspect(session.connection()).get_table_names()
    _migrate(url, TOTP_REVISION)
    with get_session(url) as session:
        assert session.get(PortalSession, "session_registry").factor_version is None


@pytest.mark.parametrize(
    "overrides,sqlstate",
    [
        ({"factor_version": 0}, "23514"),
        ({"state": "enabled"}, "23514"),
        ({"pending_setup_id": "incomplete"}, "23514"),
        ({"last_accepted_counter": -1}, "23514"),
        ({"principal_id": "missing"}, "23503"),
        ({"recovery_generation": None}, "23502"),
    ],
)
def test_totp_postgres_factor_constraints(totp_database, overrides, sqlstate):
    from sqlalchemy.exc import IntegrityError

    from app.core.models import PortalTotpFactor

    with get_session(totp_database) as session:
        session.add(_totp_factor(**overrides))
        with pytest.raises(IntegrityError) as error:
            session.flush()
        assert error.value.orig.sqlstate == sqlstate
        session.rollback()
    with get_session(totp_database) as session:
        assert session.scalar(select(func.count()).select_from(PortalTotpFactor)) == 0


def test_totp_postgres_unique_fk_rollback_and_downgrade_guard(totp_database):
    from sqlalchemy.exc import IntegrityError

    from app.core.models import PortalTotpFactor

    url = totp_database
    with get_session(url) as session:
        session.add(_totp_factor())
        session.flush()
        session.rollback()
    with get_session(url) as session:
        assert session.get(PortalTotpFactor, "prn_registry") is None
        session.add(_totp_factor())
        session.commit()
    with get_session(url) as session:
        session.add(_totp_factor())
        with pytest.raises(IntegrityError) as error:
            session.flush()
        assert error.value.orig.sqlstate == "23505"
        session.rollback()
        # Remove only the preexisting registry row to isolate the new FK floor.
        session.execute(_registry_table(session).delete())
        session.commit()
        session.delete(session.get(Principal, "prn_registry"))
        with pytest.raises(IntegrityError) as error:
            session.flush()
        assert error.value.orig.sqlstate == "23503"
        session.rollback()
    with pytest.raises(RuntimeError, match="empty dormant storage"):
        _migrate(url, REGISTRY_REVISION, downgrade=True)
    with get_session(url) as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == TOTP_REVISION
        assert session.get(PortalTotpFactor, "prn_registry").factor_version == 1


def test_totp_postgres_factor_locks_refresh_and_serialize(closure_database, monkeypatch):
    from app.adapters.repositories.portal_totp_repository import PortalTotpRepository
    from app.core.models import PortalTotpFactor
    from app.domain.portal_sessions.service import lock_login_scope

    url = closure_database
    with get_session(url) as session:
        session.add(_totp_factor(principal_id="prn_close"))
        session.commit()

    def increment():
        with get_session(url) as session:
            # Pre-read to exercise populate_existing after a real waiting lock.
            stale = session.get(PortalTotpFactor, "prn_close")
            lock_login_scope(session, "prn_close")
            row = PortalTotpRepository(session).lock_factor(principal_id="prn_close")
            assert row is stale
            row.factor_version += 1
            version = row.factor_version
            session.commit()
            return version

    assert _run_registry_ordered_pair(url, monkeypatch, increment, increment) == (2, 3)
    with get_session(url) as session:
        assert session.get(PortalTotpFactor, "prn_close").factor_version == 3
        assert session.get(Principal, "prn_close").session_version == 1


def test_totp_postgres_seed_inventory_apply_and_flushed_rollback(totp_database, monkeypatch):
    from app.core.models import PortalTotpFactor
    from app.domain.runtime import runtime_data_reencryption as module
    from tests.contract.test_runtime_data_encryption_migration import (
        _seed_totp_slots,
        _settings,
        _totp_snapshot,
    )

    url = totp_database
    old = _seed_totp_slots(url)
    settings = _settings(url)
    mapping = (module.LegacyRuntimeDataKey("old-totp", old.runtime_data_encryption_secret),)
    from app.core.secrets import encrypt_portal_totp_seed

    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        row.pending_seed_ciphertext = encrypt_portal_totp_seed(b"synthetic-pending", settings=old)
        session.commit()
    before = _totp_snapshot(url)
    original_set = module._set_ciphertext
    with monkeypatch.context() as injected:

        def fail(record, ciphertext):
            from sqlalchemy.orm import object_session

            original_set(record, ciphertext)
            object_session(record.owner).flush()
            raise RuntimeError("synthetic flushed write failure")

        injected.setattr(module, "_set_ciphertext", fail)
        with pytest.raises(module.RuntimeDataReencryptionError, match="re-encryption failed"):
            module.apply_runtime_data_reencryption(
                url,
                settings=settings,
                legacy_root_secrets=(),
                legacy_envelope_keys=mapping,
                maintenance_confirmed=True,
            )
    assert _totp_snapshot(url) == before
    result = module.apply_runtime_data_reencryption(
        url,
        settings=settings,
        legacy_root_secrets=(),
        legacy_envelope_keys=mapping,
        maintenance_confirmed=True,
    )
    assert (result.total, result.current, result.migrated) == (2, 2, 2)
    assert module.verify_runtime_data_ciphertexts(url, settings=settings).current == 2
    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        assert (row.factor_version, row.last_accepted_counter, row.recovery_generation) == (
            4,
            42,
            3,
        )


def test_totp_postgres_new_revision_missing_table_fails_closed(totp_database):
    from app.domain.runtime.runtime_data_reencryption import (
        RuntimeDataReencryptionError,
        inventory_runtime_data_ciphertexts,
    )
    from tests.contract.test_runtime_data_encryption_migration import _settings

    url = totp_database
    with get_session(url) as session:
        session.execute(text("DROP TABLE portal_totp_factors"))
        session.commit()
    with pytest.raises(RuntimeDataReencryptionError, match="incomplete"):
        inventory_runtime_data_ciphertexts(url, settings=_settings(url))


@pytest.mark.parametrize(
    "kind,overrides",
    [
        ("recovery", {"generation": 0}),
        ("recovery", {"factor_version": 0}),
        ("recovery", {"code_hash": ""}),
        ("recovery", {"consumed_at": datetime(2026, 10, 23, tzinfo=UTC)}),
        ("challenge", {"attempt_count": 6}),
        ("challenge", {"purpose": "admin"}),
        ("challenge", {"purpose": "disable"}),
        ("challenge", {"bound_factor_version": -1}),
        ("challenge", {"bound_session_id": "sid"}),
    ],
)
def test_totp_postgres_recovery_challenge_constraints(totp_database, kind, overrides):
    from sqlalchemy.exc import IntegrityError

    from app.core.models import PortalRecoveryCode
    from tests.domain.test_portal_totp_repository import NOW, challenge

    if kind == "recovery":
        values = dict(
            code_id="recovery",
            principal_id="prn_registry",
            factor_version=1,
            generation=1,
            code_hash="synthetic-hash",
            created_at=NOW,
        )
        values.update(overrides)
        row = PortalRecoveryCode(**values)
    else:
        row = challenge(principal_id="prn_registry", **overrides)
    with get_session(totp_database) as session:
        session.add(row)
        with pytest.raises(IntegrityError) as error:
            session.flush()
        assert error.value.orig.sqlstate == "23514"
        session.rollback()


def test_totp_postgres_factor_row_lock_is_transaction_owned(totp_database):
    from sqlalchemy.exc import OperationalError

    from app.adapters.repositories.portal_totp_repository import PortalTotpRepository
    from app.core.models import PortalTotpFactor

    url = totp_database
    with get_session(url) as session:
        session.add(_totp_factor())
        session.commit()
    with get_session(url) as owner, get_session(url) as contender:
        stale = contender.get(PortalTotpFactor, "prn_registry")
        locked = PortalTotpRepository(owner).lock_factor(principal_id="prn_registry")
        locked.factor_version = 2
        contender.execute(text("SET LOCAL lock_timeout = '150ms'"))
        with pytest.raises(OperationalError) as error:
            PortalTotpRepository(contender).lock_factor(principal_id="prn_registry")
        assert error.value.orig.sqlstate == "55P03"
        contender.rollback()
        owner.commit()
        refreshed = PortalTotpRepository(contender).lock_factor(principal_id="prn_registry")
        assert refreshed is stale and refreshed.factor_version == 2
        contender.rollback()


@pytest.mark.parametrize(
    "evidence",
    [
        {"factor_version": 1},
        {"second_factor_method": "totp"},
        {"factor_version": 1, "primary_authenticated_at": datetime(2026, 10, 24, tzinfo=UTC)},
        {
            "primary_authenticated_at": datetime(2026, 10, 24, tzinfo=UTC),
            "second_factor_verified_at": datetime(2026, 10, 24, tzinfo=UTC),
            "second_factor_method": "totp",
        },
    ],
)
def test_totp_postgres_partial_session_evidence_rejected(totp_database, evidence):
    from sqlalchemy.exc import IntegrityError

    from app.core.models import PortalSession

    with get_session(totp_database) as session:
        row = session.get(PortalSession, "session_registry")
        for name, value in evidence.items():
            setattr(row, name, value)
        with pytest.raises(IntegrityError) as error:
            session.flush()
        assert error.value.orig.sqlstate == "23514"
        session.rollback()
    with get_session(totp_database) as session:
        assert session.get(PortalSession, "session_registry").factor_version is None


# T2 real factor concurrency. Existing guarded schema/runner, no new database target.
def _t2_material(url):
    from datetime import timedelta

    from app.core.models import PortalTotpFactor
    from app.core.secrets import encrypt_portal_totp_seed
    from app.domain.portal_sessions.service import issue_verified_session, lock_login_scope
    from app.domain.portal_totp.service import create_challenge
    from tests.contract.test_runtime_data_encryption_migration import CURRENT_ROOT

    settings = _registry_settings(url).model_copy(
        update={
            "runtime_data_encryption_secret": CURRENT_ROOT,
            "runtime_data_encryption_key_id": "t2-pg-fixture",
        }
    )
    now = datetime.now(UTC).replace(microsecond=0)
    seed = b"12345678901234567890"
    with get_session(url) as session:
        principal = lock_login_scope(session, "prn_close")
        factor = PortalTotpFactor(
            principal_id="prn_close",
            factor_version=1,
            state="enabled",
            recovery_generation=1,
            active_seed_ciphertext=encrypt_portal_totp_seed(seed, settings=settings),
            enabled_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(factor)
        session.flush()
        issued = issue_verified_session(
            session,
            settings,
            principal,
            ttl_seconds=3600,
            auth_method="email_code",
            primary_at=now - timedelta(seconds=1),
            factor=factor,
            second_at=now,
            second_method="totp",
        )
        credentials = [
            create_challenge(
                session,
                principal,
                factor,
                purpose="login",
                primary_method="email_code",
                primary_at=now,
                ttl_seconds=3600,
                now=now,
            ).credential
            for _ in range(2)
        ]
        session.commit()
    from app.domain.portal_sessions.service import AuthenticatedSession

    caller = AuthenticatedSession(
        issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
    )
    return settings, seed, credentials, caller


def _t2_finish(settings, credential, code, *, purpose="login", method="totp", identity=None):
    from app.domain.commercial.errors import CommercialServiceError
    from app.domain.portal_totp.service import complete

    try:
        return complete(
            settings, credential, code, purpose=purpose, method=method, identity=identity
        )
    except CommercialServiceError as error:
        return 401 if error.error_code == "auth.portal_session_revoked" else error.status_code


@pytest.mark.parametrize("lose_response", [False, True])
def test_totp_postgres_public_activation_replacement_and_lost_response(
    closure_database, monkeypatch, lose_response
):
    """Public ASGI route, real registry/PG readback; no dynamic router composition."""
    import base64

    import jwt
    from fastapi.testclient import TestClient

    from app.api.main import create_app
    from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
    from app.core.models import (
        PortalAuthChallenge,
        PortalRecoveryCode,
        PortalSession,
        PortalTotpFactor,
    )
    from app.core.services import CloudServices
    from app.domain.portal_sessions.service import AuthenticatedSession
    from app.domain.portal_totp.codec import hotp
    from tests.contract.test_runtime_data_encryption_migration import CURRENT_ROOT

    url = closure_database
    settings = _registry_settings(url).model_copy(
        update={
            "runtime_data_encryption_secret": CURRENT_ROOT,
            "runtime_data_encryption_key_id": "public-activation-pg",
            "debug_local_origin_allowlist": "http://testserver",
        }
    )
    service = CommercialService(url)
    app = create_app(CloudServices(settings=settings, providers={}))
    with TestClient(app, raise_server_exceptions=False) as client:
        client.headers.update({"Origin": "http://testserver"})

        def primary():
            code = service.issue_portal_login_code(email="close@example.test", ttl_seconds=600)
            result = client.post(
                "/portal/v1/auth/code/verify",
                json={
                    "email": "close@example.test",
                    "code": code["code"],
                },
            )
            assert result.status_code == 200
            return client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)

        other = primary()
        old = primary()
        old_claims = jwt.decode(old, options={"verify_signature": False})
        original_expiry = old_claims["exp"]
        with get_session(url) as db:
            original_version = db.get(Principal, "prn_close").session_version
            old_rows = list(
                db.scalars(select(PortalSession).where(PortalSession.principal_id == "prn_close"))
            )
            old_identities = {
                row.session_id: AuthenticatedSession(
                    row.principal_id, row.session_id, row.session_version, row.absolute_expires_at
                )
                for row in old_rows
            }
            primary_at = db.get(PortalSession, old_claims["sid"]).primary_authenticated_at
        assert "pg_export_fixture" in old_identities
        for token in [old, other]:
            claims = jwt.decode(token, options={"verify_signature": False})
            identity = old_identities[claims["sid"]]
            assert identity.session_version == claims["session_version"] == original_version
            assert identity.expires_at == datetime.fromtimestamp(claims["exp"], UTC)
        for identity in old_identities.values():
            _b3a_assert_auth(url, identity, True)
        response = client.post("/portal/v1/totp/setup/start")
        assert response.status_code == 200
        started = response.json()["data"]
        assert client.get("/portal/v1/totp/status").json()["data"]["enabled"] is False
        proof = hotp(base64.b32decode(started["secret"]), int(datetime.now(UTC).timestamp()) // 30)
        payload = {"setup_id": started["setup_id"], "method": "totp", "code": proof}

        def unavailable(*args, **kwargs):
            raise RuntimeError("synthetic post-commit response loss")

        with monkeypatch.context() as patch:
            if lose_response:
                patch.setattr("app.api.routes.portal_totp.serialize_portal_session", unavailable)
            completed = client.post("/portal/v1/totp/setup/confirm", json=payload)
        assert completed.status_code == (503 if lose_response else 200)
        assert completed.headers["cache-control"] == "private, no-store"
        for token in [old, other]:
            assert (
                client.get(
                    "/portal/v1/session", headers={"Authorization": "Bearer " + token}
                ).status_code
                == 401
            )
        with get_session(url) as db:
            factor = db.get(PortalTotpFactor, "prn_close")
            challenge = db.get(PortalAuthChallenge, started["setup_id"])
            assert factor.state == "enabled" and factor.pending_setup_id is None
            assert factor.last_accepted_counter is not None
            assert challenge.consumed_at is not None
            recovery_rows = list(
                db.scalars(
                    select(PortalRecoveryCode).where(PortalRecoveryCode.principal_id == "prn_close")
                )
            )
            assert len(recovery_rows) == 8 and all(row.code_hash for row in recovery_rows)
            rows = {
                row.session_id: row
                for row in db.scalars(
                    select(PortalSession).where(PortalSession.principal_id == "prn_close")
                )
            }
            # Retained historical rows are invalidated by the principal epoch.
            assert old_identities.keys() <= rows.keys()
            new_sids = rows.keys() - old_identities.keys()
            assert len(new_sids) == 1
            replacement_row = rows[new_sids.pop()]
            assert (
                replacement_row.session_version
                == db.get(Principal, "prn_close").session_version
                == original_version + 1
            )
            assert replacement_row.revoked_at is None
            assert replacement_row.factor_version == factor.factor_version == 2
            assert replacement_row.primary_authenticated_at == primary_at is not None
            assert replacement_row.primary_authenticated_at == challenge.primary_authenticated_at
            assert replacement_row.auth_method == challenge.primary_method == "email_code"
            assert replacement_row.second_factor_method == "totp"
            assert replacement_row.second_factor_verified_at == challenge.consumed_at
            assert replacement_row.second_factor_verified_at >= primary_at
            assert (
                replacement_row.absolute_expires_at == old_identities[old_claims["sid"]].expires_at
            )
            registered_replacement = AuthenticatedSession(
                replacement_row.principal_id,
                replacement_row.session_id,
                replacement_row.session_version,
                replacement_row.absolute_expires_at,
            )
            for sid, identity in old_identities.items():
                assert (
                    AuthenticatedSession(
                        rows[sid].principal_id,
                        sid,
                        rows[sid].session_version,
                        rows[sid].absolute_expires_at,
                    )
                    == identity
                )
        for identity in old_identities.values():
            _b3a_assert_auth(url, identity, False)
        # Even a lost HTTP response commits exactly one actually valid session.
        _b3a_assert_auth(url, registered_replacement, True)
        if not lose_response:
            data = completed.json()["data"]
            assert len(data["recovery_codes"]) == len(set(data["recovery_codes"])) == 8
            replacement = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
            replacement_claims = jwt.decode(replacement, options={"verify_signature": False})
            assert replacement_claims["exp"] == original_expiry
            assert (
                AuthenticatedSession(
                    replacement_claims["sub"],
                    replacement_claims["sid"],
                    replacement_claims["session_version"],
                    datetime.fromtimestamp(replacement_claims["exp"], UTC),
                )
                == registered_replacement
            )
            assert client.get("/portal/v1/session").status_code == 200
            status = client.get("/portal/v1/totp/status")
            assert status.json()["data"] == {"enabled": True, "recovery_codes_remaining": 8}
            assert not any(code in status.text for code in data["recovery_codes"])
        else:
            assert client.get("/portal/v1/session").status_code == 401
        assert client.post("/portal/v1/totp/setup/confirm", json=payload).status_code == 401


def test_totp_postgres_same_setup_serializes_one_recovery_batch(closure_database, monkeypatch):
    """Independent connections observe a lock wait on the same setup completion."""
    import base64

    from app.core.models import (
        PortalAuthChallenge,
        PortalRecoveryCode,
        PortalSession,
        PortalTotpFactor,
    )
    from app.domain.commercial.errors import CommercialServiceError
    from app.domain.portal_sessions.service import AuthenticatedSession, PortalSessionIssuer
    from app.domain.portal_totp.codec import hotp
    from app.domain.portal_totp.service import complete, start_management
    from tests.contract.test_runtime_data_encryption_migration import CURRENT_ROOT

    url = closure_database
    settings = _registry_settings(url).model_copy(
        update={
            "runtime_data_encryption_secret": CURRENT_ROOT,
            "runtime_data_encryption_key_id": "setup-race-pg",
        }
    )
    service = CommercialService(url)
    primary = service.issue_portal_login_code(email="close@example.test", ttl_seconds=600)
    issued = service.verify_portal_login_code(
        email="close@example.test",
        code=primary["code"],
        max_attempts=5,
        session_issuer=PortalSessionIssuer(settings, 3600, "email_code"),
    )["_portal_session"]
    caller = AuthenticatedSession(
        issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
    )
    with get_session(url) as db:
        original_version = db.get(Principal, "prn_close").session_version
        old_identities = {
            row.session_id: AuthenticatedSession(
                row.principal_id, row.session_id, row.session_version, row.absolute_expires_at
            )
            for row in db.scalars(
                select(PortalSession).where(PortalSession.principal_id == "prn_close")
            )
        }
        primary_at = db.get(PortalSession, caller.session_id).primary_authenticated_at
    assert "pg_export_fixture" in old_identities
    assert old_identities[caller.session_id] == caller
    for identity in old_identities.values():
        _b3a_assert_auth(url, identity, True)
    started = start_management(settings, caller, "setup")
    code = hotp(base64.b32decode(started["secret"]), int(datetime.now(UTC).timestamp()) // 30)

    def finish():
        try:
            return complete(
                settings,
                started["_challenge"].credential,
                code,
                purpose="setup",
                method="totp",
                identity=caller,
                setup_id=started["setup_id"],
            )
        except CommercialServiceError as error:
            return 401 if error.error_code == "auth.portal_session_revoked" else error.status_code

    first, second = _run_registry_ordered_pair(url, monkeypatch, finish, finish)
    assert isinstance(first, dict) and second == 401
    assert len(first["recovery_codes"]) == len(set(first["recovery_codes"])) == 8
    with get_session(url) as db:
        factor = db.get(PortalTotpFactor, "prn_close")
        assert factor.state == "enabled" and factor.factor_version == 2
        assert factor.recovery_generation == 1 and factor.pending_setup_id is None
        assert factor.last_accepted_counter is not None
        challenge = db.get(PortalAuthChallenge, started["setup_id"])
        assert challenge.consumed_at is not None
        assert db.scalar(select(func.count()).select_from(PortalRecoveryCode)) == 8
        rows = {
            row.session_id: row
            for row in db.scalars(
                select(PortalSession).where(PortalSession.principal_id == "prn_close")
            )
        }
        assert old_identities.keys() <= rows.keys()
        new_sids = rows.keys() - old_identities.keys()
        assert len(new_sids) == 1
        replacement_row = rows[new_sids.pop()]
        assert (
            replacement_row.session_version
            == db.get(Principal, "prn_close").session_version
            == original_version + 1
        )
        assert replacement_row.revoked_at is None
        assert replacement_row.factor_version == factor.factor_version
        assert replacement_row.primary_authenticated_at == primary_at is not None
        assert replacement_row.primary_authenticated_at == challenge.primary_authenticated_at
        assert replacement_row.auth_method == challenge.primary_method == "email_code"
        assert replacement_row.second_factor_method == "totp"
        assert replacement_row.second_factor_verified_at == challenge.consumed_at
        assert replacement_row.second_factor_verified_at >= primary_at
        assert replacement_row.absolute_expires_at == caller.expires_at
        registered_replacement = AuthenticatedSession(
            replacement_row.principal_id,
            replacement_row.session_id,
            replacement_row.session_version,
            replacement_row.absolute_expires_at,
        )
        for sid, identity in old_identities.items():
            assert (
                AuthenticatedSession(
                    rows[sid].principal_id,
                    sid,
                    rows[sid].session_version,
                    rows[sid].absolute_expires_at,
                )
                == identity
            )
    for identity in old_identities.values():
        _b3a_assert_auth(url, identity, False)
    replacement = first["_portal_session"]
    assert replacement.expires_at == caller.expires_at
    assert (
        AuthenticatedSession(
            replacement.principal_id,
            replacement.session_id,
            replacement.session_version,
            replacement.expires_at,
        )
        == registered_replacement
    )
    _b3a_assert_auth(url, registered_replacement, True)


@pytest.mark.parametrize("same_resource", ["counter", "challenge", "recovery"])
def test_totp_postgres_concurrent_single_consume(closure_database, monkeypatch, same_resource):
    from app.core.models import (
        PortalAuthChallenge,
        PortalRecoveryCode,
        PortalSession,
        PortalTotpFactor,
    )
    from app.core.security import build_secret_hash
    from app.domain.portal_totp.codec import hotp

    url = closure_database
    settings, seed, credentials, caller = _t2_material(url)
    code = hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + 1)
    method = "totp"
    if same_resource == "challenge":
        credentials[1] = credentials[0]
    if same_resource == "recovery":
        method, code = "recovery_code", "pg-code.pg-synthetic-secret"
        with get_session(url) as session:
            session.add(
                PortalRecoveryCode(
                    code_id="pg-code",
                    principal_id="prn_close",
                    factor_version=1,
                    generation=1,
                    code_hash=build_secret_hash("pg-synthetic-secret"),
                    created_at=datetime.now(UTC).replace(microsecond=0),
                )
            )
            session.commit()
    with get_session(url) as session:
        before = session.scalar(select(func.count()).select_from(PortalSession))
    first, second = _run_registry_ordered_pair(
        url,
        monkeypatch,
        lambda: _t2_finish(settings, credentials[0], code, method=method),
        lambda: _t2_finish(settings, credentials[1], code, method=method),
    )
    assert isinstance(first, dict) and second == 401
    issued = first["_portal_session"]
    with get_session(url) as session:
        assert session.scalar(select(func.count()).select_from(PortalSession)) == before + 1
        assert (
            session.scalar(
                select(func.count())
                .select_from(PortalAuthChallenge)
                .where(PortalAuthChallenge.consumed_at.is_not(None))
            )
            == 1
        )
        factor = session.get(PortalTotpFactor, "prn_close")
        if method == "totp":
            assert factor.last_accepted_counter is not None
        else:
            assert session.get(PortalRecoveryCode, "pg-code").consumed_at is not None
        if same_resource != "challenge":
            assert session.get(PortalAuthChallenge, credentials[1].split(".")[0]).attempt_count == 1
    from app.domain.portal_sessions.service import AuthenticatedSession

    _b3a_assert_auth(
        url,
        AuthenticatedSession(
            issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
        ),
        True,
    )


@pytest.mark.parametrize(
    "operation",
    ["global_revoke", "admin_disable", "closure", "email_change", "disable", "recovery_reset"],
)
@pytest.mark.parametrize("completion_first", [True, False])
def test_totp_postgres_completion_lifecycle_commit_orders(
    closure_database, monkeypatch, operation, completion_first
):
    from app.core.models import PortalAuthChallenge, PortalTotpFactor
    from app.domain.portal_totp.codec import hotp
    from app.domain.portal_totp.service import start_management

    url = closure_database
    settings, seed, credentials, caller = _t2_material(url)
    service = CommercialService(url)
    code = hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + 1)
    management = None
    email_proof = closure_proof = None
    if operation in ("disable", "recovery_reset"):
        management = start_management(settings, caller, operation)
    elif operation == "email_change":
        email_proof = service.issue_portal_email_change_code(
            principal_id="prn_close", new_email="totp-new@example.test", ttl_seconds=600
        )
    elif operation == "closure":
        closure_proof = _issue(url)

    def finish():
        return _t2_finish(settings, credentials[0], code)

    def invalidate():
        if operation == "global_revoke":
            return service.revoke_portal_sessions(principal_id="prn_close")
        if operation == "admin_disable":
            return service.disable_admin_portal_user(
                principal_id="prn_close", reason="T2 PG fixture"
            )
        if operation == "closure":
            return _confirm(url, closure_proof)
        if operation == "email_change":
            return service.verify_portal_email_change_code(
                principal_id="prn_close",
                new_email="totp-new@example.test",
                code=email_proof["code"],
                max_attempts=5,
            )
        return _t2_finish(
            settings, management["_challenge"].credential, code, purpose=operation, identity=caller
        )

    first, second = _run_registry_ordered_pair(
        url,
        monkeypatch,
        finish if completion_first else invalidate,
        invalidate if completion_first else finish,
    )
    completed = first if completion_first else second
    if completion_first:
        assert isinstance(completed, dict)
        # The identical OTP cannot be reused across lifecycle purposes.
        if operation in ("disable", "recovery_reset"):
            assert second == 401
    else:
        assert completed == 401
    with get_session(url) as session:
        challenge = session.get(PortalAuthChallenge, credentials[0].split(".")[0])
        assert (challenge.consumed_at is not None) == completion_first
        factor = session.get(PortalTotpFactor, "prn_close")
        if not completion_first and operation == "disable":
            assert factor.state == "disabled"
        elif not completion_first and operation == "recovery_reset":
            assert factor.recovery_generation == 2
    if isinstance(completed, dict):
        issued = completed["_portal_session"]
        from app.domain.portal_sessions.service import AuthenticatedSession

        _b3a_assert_auth(
            url,
            AuthenticatedSession(
                issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
            ),
            operation in ("disable", "recovery_reset"),
        )


@pytest.mark.parametrize("enable_first", [True, False])
def test_totp_postgres_enable_vs_primary_issuance(closure_database, monkeypatch, enable_first):
    from app.core.models import PortalTotpFactor
    from app.core.secrets import decrypt_portal_totp_seed
    from app.domain.portal_sessions.service import PortalSessionIssuer
    from app.domain.portal_totp.codec import hotp
    from app.domain.portal_totp.contracts import RestrictedChallenge
    from app.domain.portal_totp.service import complete, start_management
    from tests.contract.test_runtime_data_encryption_migration import CURRENT_ROOT

    url = closure_database
    settings = _registry_settings(url).model_copy(
        update={
            "runtime_data_encryption_secret": CURRENT_ROOT,
            "runtime_data_encryption_key_id": "t2-enable-fixture",
        }
    )
    caller = _b3a_issue(url)
    started = start_management(settings, caller, "setup")
    with get_session(url) as session:
        seed = decrypt_portal_totp_seed(
            session.get(PortalTotpFactor, "prn_close").pending_seed_ciphertext, settings=settings
        )
    service = CommercialService(url)
    primary = service.issue_portal_login_code(email="close@example.test", ttl_seconds=600)

    def activate():
        return complete(
            settings,
            started["_challenge"].credential,
            hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + 1),
            purpose="setup",
            identity=caller,
            setup_id=started["setup_id"],
        )

    def issue():
        return service.verify_portal_login_code(
            email="close@example.test",
            code=primary["code"],
            max_attempts=5,
            session_issuer=PortalSessionIssuer(settings, 3600, "email_code"),
        )["_portal_session"]

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, activate if enable_first else issue, issue if enable_first else activate
    )
    issued = second if enable_first else first
    if enable_first:
        assert isinstance(issued, RestrictedChallenge)
    else:
        from app.domain.portal_sessions.service import AuthenticatedSession

        _b3a_assert_auth(
            url,
            AuthenticatedSession(
                issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
            ),
            False,
        )
    with get_session(url) as session:
        assert session.get(PortalTotpFactor, "prn_close").state == "enabled"
        assert session.get(Principal, "prn_close").session_version == 2


@pytest.mark.parametrize("revoke_first", [True, False])
@pytest.mark.parametrize("others", [True, False])
def test_totp_postgres_management_binding_vs_single_others(
    closure_database, monkeypatch, revoke_first, others
):
    from app.core.models import PortalTotpFactor
    from app.domain.commercial.errors import CommercialServiceError
    from app.domain.portal_sessions.service import (
        AuthenticatedSession,
        issue_verified_session,
        lock_login_scope,
        revoke_principal_sessions,
    )
    from app.domain.portal_totp.codec import hotp
    from app.domain.portal_totp.service import start_management

    url = closure_database
    settings, seed, credentials, caller = _t2_material(url)
    management = start_management(settings, caller, "disable")
    with get_session(url) as session:
        principal = lock_login_scope(session, "prn_close")
        factor = session.get(PortalTotpFactor, "prn_close")
        now = datetime.now(UTC).replace(microsecond=0)
        issued = issue_verified_session(
            session,
            settings,
            principal,
            ttl_seconds=3600,
            auth_method="email_code",
            primary_at=now,
            factor=factor,
            second_at=now,
            second_method="totp",
        )
        session.commit()
    revoker = AuthenticatedSession(
        issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
    )
    code = hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + 1)

    def revoke():
        try:
            return revoke_principal_sessions(
                url, revoker, target_session_id=None if others else caller.session_id
            )
        except CommercialServiceError as error:
            return error.status_code

    def manage():
        return _t2_finish(
            settings, management["_challenge"].credential, code, purpose="disable", identity=caller
        )

    first, second = _run_registry_ordered_pair(
        url, monkeypatch, revoke if revoke_first else manage, manage if revoke_first else revoke
    )
    assert second == (403 if not revoke_first else 401)
    # Single/others do not bump principal version; fresh pending login has no SID.
    login = _t2_finish(settings, credentials[0], code)
    assert isinstance(login, dict) if revoke_first else login == 401
    with get_session(url) as session:
        assert session.get(Principal, "prn_close").session_version == (1 if revoke_first else 2)


@pytest.mark.parametrize("method", ["totp", "recovery_code"])
@pytest.mark.parametrize("failure", ["sign", "commit"])
def test_totp_postgres_sign_commit_fault_atomic_readback(
    closure_database, monkeypatch, method, failure
):
    from sqlalchemy.orm import Session

    from app.core.models import (
        PortalAuthChallenge,
        PortalRecoveryCode,
        PortalSession,
        PortalTotpFactor,
    )
    from app.core.security import build_secret_hash
    from app.domain.portal_totp.codec import hotp
    from app.domain.portal_totp.service import complete

    url = closure_database
    settings, seed, credentials, caller = _t2_material(url)
    code = hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + 1)
    if method == "recovery_code":
        code = "pg-rollback.pg-rollback-secret"
        with get_session(url) as session:
            session.add(
                PortalRecoveryCode(
                    code_id="pg-rollback",
                    principal_id="prn_close",
                    factor_version=1,
                    generation=1,
                    code_hash=build_secret_hash("pg-rollback-secret"),
                    created_at=datetime.now(UTC).replace(microsecond=0),
                )
            )
            session.commit()
    with get_session(url) as session:
        before = session.scalar(select(func.count()).select_from(PortalSession))

    def fail(*args, **kwargs):
        raise RuntimeError("synthetic PG T2 transaction failure")

    with monkeypatch.context() as patch:
        if failure == "sign":
            patch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
        else:
            patch.setattr(Session, "commit", fail)
        with pytest.raises(RuntimeError):
            complete(settings, credentials[0], code, purpose="login", method=method)
    # Fault patch is restored before readback, retry and guarded schema teardown.
    with get_session(url) as session:
        assert session.get(PortalAuthChallenge, credentials[0].split(".")[0]).consumed_at is None
        assert session.get(PortalTotpFactor, "prn_close").last_accepted_counter is None
        assert session.scalar(select(func.count()).select_from(PortalSession)) == before
        if method == "recovery_code":
            assert session.get(PortalRecoveryCode, "pg-rollback").consumed_at is None
    assert isinstance(
        complete(settings, credentials[0], code, purpose="login", method=method), dict
    )


def test_totp_postgres_attempt_commits_and_replacement_budget(closure_database):
    from app.core.models import PortalAuthChallenge
    from app.domain.commercial.errors import CommercialServiceError
    from app.domain.portal_sessions.service import lock_login_scope
    from app.domain.portal_totp.service import complete, create_challenge, lock_primary_factor

    url = closure_database
    settings, seed, credentials, caller = _t2_material(url)
    for batch in range(3):
        if batch == 2:
            with get_session(url) as session:
                principal = lock_login_scope(session, "prn_close")
                factor = lock_primary_factor(session, "prn_close")
                now = datetime.now(UTC).replace(microsecond=0)
                credential = create_challenge(
                    session,
                    principal,
                    factor,
                    purpose="login",
                    primary_method="email_code",
                    primary_at=now,
                    ttl_seconds=3600,
                    now=now,
                ).credential
                session.commit()
        else:
            credential = credentials[batch]
        for attempt in range(5):
            with pytest.raises(CommercialServiceError) as error:
                complete(
                    settings,
                    credential,
                    "unknown.bad-recovery",
                    purpose="login",
                    method="recovery_code",
                )
            assert error.value.status_code == 401
            with get_session(url) as session:
                row = session.get(PortalAuthChallenge, credential.split(".")[0])
                assert row.attempt_count == attempt + 1 and row.consumed_at is None
    with get_session(url) as session:
        principal = lock_login_scope(session, "prn_close")
        factor = lock_primary_factor(session, "prn_close")
        now = datetime.now(UTC).replace(microsecond=0)
        with pytest.raises(CommercialServiceError) as error:
            create_challenge(
                session,
                principal,
                factor,
                purpose="login",
                primary_method="email_code",
                primary_at=now,
                ttl_seconds=3600,
                now=now,
            )
        assert error.value.status_code == 429
        session.rollback()
        assert session.scalar(select(func.sum(PortalAuthChallenge.attempt_count))) == 15
