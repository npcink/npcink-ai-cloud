"""Explicit disposable PG lane; absence is pending, never a passed concurrency gate.

Runner: inject NPCINK_TEST_PORTAL_POSTGRES_URL and
NPCINK_TEST_PORTAL_ENVIRONMENT=test exactly as for portal acceptance; invoke
pytest tests/integration/test_admin_plan_postgres.py -v -s inside that runner.
The URL must use the disposable Compose host ``postgres``. Do not pass a live
catalog. M4 runner's explicit target injection list is intentionally unchanged.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Event, get_ident
from time import monotonic, sleep

import pytest
from sqlalchemy import text

from app.adapters.repositories.commercial_plan_queries import CommercialPlanQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_session
from app.domain.commercial.errors import CommercialConflictError
from tests.domain.test_admin_plan_concurrency import (
    assert_plan_concurrency,
    assert_plan_rollback,
    save,
    seed_plan,
)
from tests.integration.test_portal_postgres_acceptance import (  # noqa: F401
    m4_database_url,
    portal_database,
)


def test_plan_concurrent_transactions_on_postgres(request):
    results = assert_plan_concurrency(request.getfixturevalue("portal_database"))
    print(f"PostgreSQL concurrent writers: {results}; exactly one commit and one conflict")


@pytest.mark.parametrize("failure", ["audit", "offer"])
def test_plan_rollback_on_postgres(request, monkeypatch, failure):
    assert_plan_rollback(request.getfixturevalue("portal_database"), monkeypatch, failure)


@pytest.mark.parametrize("writer", ["parameters", "publish", "bootstrap"])
def test_plan_writer_waits_for_withdrawal_on_postgres(request, monkeypatch, writer):
    database_url = request.getfixturevalue("portal_database")
    service = seed_plan(database_url)
    old_revision = service.get_admin_plan("pro")["revision"]
    ready = Event()
    worker_pid = []
    writer_ident = []
    withdrawal_ready = Event()
    release_withdrawal = Event()
    original_audit = service._record_service_audit_in_session

    def held_audit(**kwargs):
        original_audit(**kwargs)
        if kwargs.get("event_kind") == "plan_offer.sales_status.update":
            withdrawal_ready.set()
            assert release_withdrawal.wait(10)

    monkeypatch.setattr(service, "_record_service_audit_in_session", held_audit)
    original_lock = CommercialPlanQueries.get_plan_for_update

    def observed_lock(repo, plan_id):
        if writer_ident and get_ident() == writer_ident[0] and not ready.is_set():
            worker_pid.append(int(repo.session.scalar(text("SELECT pg_backend_pid()"))))
            ready.set()
        return original_lock(repo, plan_id)

    def write():
        writer_ident.append(get_ident())
        if writer == "parameters":
            with pytest.raises(CommercialConflictError):
                save(service, old_revision, sales_price_cny=88)
        elif writer == "publish":
            service.publish_plan_version(
                plan_id="pro", plan_version_id="pro_v2", version_label="v2", sales_price_cny=88
            )
        else:
            with get_session(database_url) as session:
                repo = CommercialRepository(session)
                service._sync_standard_plan_offer_in_session(
                    repo,
                    tier_id="pro",
                    plan_id="pro",
                    plan_version_id="pro_v1",
                    sales_price_cny=None,
                )
                session.commit()

    monkeypatch.setattr(CommercialPlanQueries, "get_plan_for_update", observed_lock)
    with ThreadPoolExecutor(max_workers=2) as executor:
        withdrawal = executor.submit(
            service.update_admin_plan_sales_status, plan_id="pro", status="retired"
        )
        pending = None
        try:
            assert withdrawal_ready.wait(5)
            pending = executor.submit(write)
            assert ready.wait(5)
            with get_session(database_url) as session:
                deadline = monotonic() + 5
                blocked = False
                while monotonic() < deadline:
                    blocked = bool(
                        session.scalar(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"),
                            {"pid": worker_pid[0]},
                        )
                    )
                    if blocked:
                        break
                    sleep(0.01)
                assert blocked, "writer must wait on the actual withdrawal transaction"
                assert not pending.done()
                print(f"PostgreSQL {writer}: pg_blocking_pids observed before withdrawal commit")
        finally:
            release_withdrawal.set()
        withdrawal.result(timeout=10)
        assert pending is not None
        pending.result(timeout=10)
    detail = service.get_admin_plan("pro")
    assert detail["sales_offer"]["status"] == "retired"
    assert detail["sales_offer"]["amount"] == (88 if writer == "publish" else 99)


def test_missing_canonical_offer_initialization_on_postgres(request):
    from tests.domain.test_admin_plan_concurrency import assert_missing_offer_initialization

    assert_missing_offer_initialization(request.getfixturevalue("portal_database"))


@pytest.mark.parametrize("first_writer", ["retarget", "parameters"])
def test_cross_parent_move_serializes_with_parameter_revision_on_postgres(
    request, monkeypatch, first_writer
):
    from sqlalchemy import select

    from app.core.db import init_schema
    from app.core.models import PlanVersion, ServiceAuditEvent
    from tests.domain.test_subscription_commerce import _audit, _service

    database_url = request.getfixturevalue("portal_database")
    init_schema(database_url)
    service = _service(database_url)
    source = "plan_move_source"
    destination = "plan_move_destination"
    version_id = "move_shared_v1"
    for plan_id in [source, destination]:
        service.upsert_plan(plan_id=plan_id, name=plan_id, metadata_json={"tier_id": "agency"})
    service.publish_plan_version(
        plan_id=source,
        plan_version_id=version_id,
        version_label="v1",
        budgets_json={"max_ai_credits_per_period": 10000},
    )
    revision = service.get_admin_plan(source)["revision"]
    holder_ready = Event()
    release_holder = Event()
    waiter_ready = Event()
    waiter_pid = []
    waiter_ident = []
    holder_plan = destination if first_writer == "retarget" else source
    original_audit = service._record_service_audit_in_session

    def held_audit(**kwargs):
        original_audit(**kwargs)
        if (
            kwargs.get("event_kind") == "plan_version.publish"
            and kwargs.get("plan_id") == holder_plan
        ):
            holder_ready.set()
            assert release_holder.wait(10)

    monkeypatch.setattr(service, "_record_service_audit_in_session", held_audit)
    original_lock = CommercialPlanQueries.get_plan_for_update

    def observed_parent_lock(repo, plan_id):
        if waiter_ident and get_ident() == waiter_ident[0] and not waiter_ready.is_set():
            waiter_pid.append(int(repo.session.scalar(text("SELECT pg_backend_pid()"))))
            waiter_ready.set()
        return original_lock(repo, plan_id)

    monkeypatch.setattr(CommercialPlanQueries, "get_plan_for_update", observed_parent_lock)

    def retarget():
        return service.publish_plan_version(
            plan_id=destination,
            plan_version_id=version_id,
            version_label="v1",
            budgets_json={"max_ai_credits_per_period": 20000},
            audit_context=_audit("cross-parent-retarget"),
        )

    def parameters():
        from tests.domain.test_admin_plan_concurrency import PARAMETERS

        try:
            return service.update_admin_plan_parameters(
                plan_id=source,
                revision=revision,
                **{**PARAMETERS, "monthly_included_points": 15000},
                audit_context=_audit("cross-parent-parameters"),
            )
        except CommercialConflictError as error:
            assert first_writer == "retarget"
            assert error.error_code == "service.admin_plan_revision_conflict"
            return "conflict"

    holder_call, waiter_call = (
        (retarget, parameters) if first_writer == "retarget" else (parameters, retarget)
    )

    def wait_and_write():
        waiter_ident.append(get_ident())
        return waiter_call()

    with ThreadPoolExecutor(max_workers=2) as executor:
        holder = executor.submit(holder_call)
        waiter = None
        try:
            assert holder_ready.wait(5)
            waiter = executor.submit(wait_and_write)
            assert waiter_ready.wait(5)
            with get_session(database_url) as session:
                deadline = monotonic() + 5
                observation = None
                while monotonic() < deadline:
                    session.execute(text("SELECT pg_stat_clear_snapshot()"))
                    observation = session.execute(
                        text(
                            "SELECT query, wait_event_type, cardinality(pg_blocking_pids(pid)) "
                            "FROM pg_stat_activity WHERE pid = :pid"
                        ),
                        {"pid": waiter_pid[0]},
                    ).one()
                    if observation[2] > 0:
                        break
                    # Only yield between measured blocking-pid observations;
                    # elapsed time is never accepted as proof of a lock wait.
                    sleep(0.01)
                assert observation is not None and observation[2] > 0
                assert observation[1] == "Lock"
                assert "plan_versions" in observation[0]
                assert "FOR UPDATE" in observation[0].upper()
                assert not waiter.done()
                print(
                    f"PG cross-parent {first_writer}-first: measured Version FOR UPDATE lock wait"
                )
        finally:
            release_holder.set()
        holder_result = holder.result(timeout=10)
        assert waiter is not None
        waiter_result = waiter.result(timeout=10)
    if first_writer == "retarget":
        assert holder_result["plan_id"] == destination
        assert waiter_result == "conflict"
    else:
        assert holder_result["plan_id"] == source
        assert holder_result["budgets"]["max_ai_credits_per_period"] == 15000
        assert waiter_result["plan_id"] == destination
    with get_session(database_url) as session:
        row = session.get(PlanVersion, version_id)
        assert row.plan_id == destination
        assert row.budgets_json["max_ai_credits_per_period"] == 20000
        events = list(
            session.scalars(
                select(ServiceAuditEvent).where(
                    ServiceAuditEvent.idempotency_key.in_(
                        ["cross-parent-retarget", "cross-parent-parameters"]
                    )
                )
            )
        )
        assert len(events) == (1 if first_writer == "retarget" else 2)
        if first_writer == "retarget":
            assert events[0].idempotency_key == "cross-parent-retarget"
    assert service.get_admin_plan(source)["latest_version"] is None
