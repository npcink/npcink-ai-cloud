"""Portal write acceptance on uniquely named, disposable M4 PostgreSQL schemas.

The explicit M4 runner supplies NPCINK_TEST_PORTAL_POSTGRES_URL and the original
NPCINK_TEST_PORTAL_ENVIRONMENT inside its container process, before clearing
runtime settings. Credentials never appear in argv or receipts. Normal CI does
not need a database. Emails and payment signatures use the existing test-only
transports; no message is delivered and no money moves.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from inspect import signature
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.db import dispose_engine, get_session
from tests.api import test_portal_routes as portal_tests
from tests.contract.test_portal_recent_activity_index_migration import (
    assert_activity_index_round_trip,
)


@pytest.fixture
def m4_database_url() -> str:
    raw_url = os.environ.get("NPCINK_TEST_PORTAL_POSTGRES_URL", "")
    if not raw_url:
        pytest.skip("explicit disposable M4 PostgreSQL runner is required")
    parsed = make_url(raw_url)
    assert parsed.get_backend_name() == "postgresql", "PostgreSQL is required"
    assert parsed.host == "postgres", "only the disposable Compose database is allowed"
    assert os.environ.get("NPCINK_TEST_PORTAL_ENVIRONMENT") in {
        "test", "development", "preview"
    }, "production acceptance is forbidden"
    return raw_url


@pytest.fixture
def portal_database(
    m4_database_url: str, monkeypatch: pytest.MonkeyPatch
) -> Iterator[str]:
    schema = f"portal_acceptance_{uuid4().hex}"
    with get_session(m4_database_url) as session:
        session.execute(text(f'CREATE SCHEMA "{schema}"'))
        session.commit()
    isolated_url = make_url(m4_database_url).update_query_dict(
        {"options": f"-csearch_path={schema}"}
    ).render_as_string(hide_password=False)
    monkeypatch.setattr(portal_tests, "_sqlite_url", lambda _: isolated_url)
    try:
        yield isolated_url
    finally:
        dispose_engine(isolated_url)
        with get_session(m4_database_url) as session:
            session.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            session.commit()
        dispose_engine(m4_database_url)


@pytest.mark.parametrize("scenario", [
    "test_portal_wordpress_addon_connection_issues_one_time_exchange_code",
    "test_portal_addon_connection_allows_new_site_after_inactive_site_releases_capacity",
    "test_portal_remove_site_soft_removes_record_and_revokes_active_keys",
    "test_portal_user_can_start_pro_trial_and_create_monthly_order",
    "test_open_alipay_notify_marks_pro_monthly_order_paid",
    "test_portal_account_email_change_verifies_new_email_before_switching",
    "test_portal_support_requests_flow_to_admin_queue",
])
def test_portal_write_scenario_on_postgres(
    portal_database: str, request: pytest.FixtureRequest, scenario: str
) -> None:
    # Reuse canonical API and persisted-state assertions, without mocking routes.
    scenario_test = getattr(portal_tests, scenario)
    fixtures = {
        name: request.getfixturevalue(name) for name in signature(scenario_test).parameters
    }
    scenario_test(**fixtures)


def test_verified_login_concurrency_on_postgres(
    m4_database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("NPCINK_CLOUD_DATABASE_URL", m4_database_url)
    monkeypatch.setenv("NPCINK_CLOUD_ENVIRONMENT", "test")
    portal_tests.test_concurrent_verified_logins_grant_one_free_on_disposable_postgres()


def test_activity_index_postgres_round_trip(portal_database: str) -> None:
    engine = create_engine(portal_database)
    try:
        assert_activity_index_round_trip(engine)
    finally:
        engine.dispose()


def test_plugin_error_aggregates_on_postgres(portal_database: str) -> None:
    """Admin and site summaries must execute their grouped binds on PostgreSQL."""
    from app.core.db import init_schema
    from app.domain.observability.plugin_events import PluginObservabilityService
    from tests.api.test_plugin_observability_admin import _seed_plugin_events
    from tests.conftest import seed_site_auth

    init_schema(portal_database)
    seed_site_auth(portal_database, site_id="site-001", scopes=["stats:read"])
    seed_site_auth(portal_database, site_id="site-002", scopes=["stats:read"])
    _seed_plugin_events(portal_database)
    service = PluginObservabilityService(portal_database)
    admin = service.get_admin_summary(window_hours=336)
    site = service.get_summary(site_id="site-001")
    assert admin["errors"]
    assert site["errors"]


@pytest.mark.parametrize("refund_status", ["requested", "unknown", "failed"])
def test_credit_consumption_rechecks_refund_after_grant_lock_on_postgres(
    portal_database: str, refund_status: str,
) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime
    from threading import Event
    from time import monotonic, sleep

    from app.adapters.repositories.commercial_repository import CommercialRepository
    from app.core.db import init_schema
    from tests.domain.test_payment_service import _seed_account_and_plan, _service

    init_schema(portal_database)
    service = _service(portal_database)
    _seed_account_and_plan(service)
    base = service.create_payment_order(
        account_id="acct_pay",
        plan_id="plan_pro",
        plan_version_id="plan_pro_v1",
        amount=199,
    )
    service.mark_payment_order_paid(order_id=str(base["order_id"]), amount=199)
    order = service.create_credit_pack_payment_order(account_id="acct_pay", pack_id="pack_small")
    service.mark_payment_order_paid(order_id=str(order["order_id"]), amount=99)
    ready = Event()
    consumer_pid: list[int] = []

    def consume() -> float:
        with get_session(portal_database) as session:
            consumer_pid.append(int(session.scalar(text("SELECT pg_backend_pid()"))))
            ready.set()
            amount = CommercialRepository(session).consume_paid_credit_grants(
                account_id="acct_pay",
                ai_credits=1,
                now=datetime.now(UTC),
            )
            session.commit()
            return amount

    with ThreadPoolExecutor(max_workers=1) as pool:
        with get_session(portal_database) as session:
            repo = CommercialRepository(session)
            repo.get_paid_credit_grant_by_order(str(order["order_id"]), for_update=True)
            repo.create_payment_refund(
                refund_id="concurrent-refund",
                order_id=str(order["order_id"]),
                account_id="acct_pay",
                subscription_id=None,
                provider="alipay",
                external_refund_no="concurrent-refund",
                status=refund_status,
                amount=99,
                currency="CNY",
                reason=None,
                requested_at=datetime.now(UTC),
                idempotency_key=None,
                metadata_json={},
            )
            pending = pool.submit(consume)
            try:
                assert ready.wait(5)
                deadline = monotonic() + 5
                blocked = False
                while monotonic() < deadline:
                    blocked = bool(
                        session.scalar(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"),
                            {"pid": consumer_pid[0]},
                        )
                    )
                    if blocked:
                        break
                    sleep(0.01)
                assert blocked, "consumer must wait on the grant lock before refund commits"
                assert not pending.done()
            finally:
                session.commit()
        assert pending.result(timeout=5) == (1 if refund_status == "failed" else 0)
