from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier

import pytest
from sqlalchemy import select

from app.core.db import get_session, init_schema
from app.core.models import ServiceAuditEvent
from app.domain.commercial.errors import CommercialConflictError, CommercialValidationError
from tests.domain.test_subscription_commerce import _audit, _service

PARAMETERS = dict(
    monthly_included_points=10000,
    site_limit=5,
    max_vector_documents=0,
    max_media_images=0,
    max_cost_cny_per_period=0,
    sales_price_cny=99,
    max_active_runs=0,
    max_batch_items=0,
    grace_period_days=0,
)


def seed_plan(database_url: str):
    init_schema(database_url)
    service = _service(database_url)
    service.now_factory = lambda: datetime(2026, 11, 1, tzinfo=UTC)
    service.upsert_plan(plan_id="pro", name="Pro", metadata_json={"tier_id": "pro"})
    service.publish_plan_version(
        plan_id="pro",
        plan_version_id="pro_v1",
        version_label="v1",
        sales_price_cny=99,
        budgets_json={"max_ai_credits_per_period": 10000},
        metadata_json={"tier_id": "pro", "site_limit": 5, "hidden": "preserved"},
    )
    return service


def save(service, revision, *, key="save", **changes):
    return service.update_admin_plan_parameters(
        plan_id="pro", revision=revision, **{**PARAMETERS, **changes}, audit_context=_audit(key)
    )


def assert_plan_concurrency(database_url: str):
    service = seed_plan(database_url)
    revision = service.get_admin_plan("pro")["revision"]
    barrier = Barrier(2)

    def writer(points):
        barrier.wait(timeout=10)
        try:
            save(service, revision, key=str(points), monthly_included_points=points)
            return points
        except CommercialConflictError as error:
            assert error.error_code == "service.admin_plan_revision_conflict"
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(writer, [20000, 30000]))
    assert results.count("conflict") == 1
    winner = next(result for result in results if result != "conflict")
    detail = service.get_admin_plan("pro")
    assert detail["latest_version"]["budgets"]["max_ai_credits_per_period"] == winner
    assert detail["sales_offer"]["amount"] == 99
    assert detail["revision"] != revision
    with get_session(database_url) as session:
        events = list(
            session.scalars(
                select(ServiceAuditEvent).where(
                    ServiceAuditEvent.idempotency_key.in_(["20000", "30000"])
                )
            )
        )
        assert len(events) == 1
    return results


def test_two_simultaneous_writers_have_one_winner(tmp_path: Path):
    assert_plan_concurrency(f"sqlite+pysqlite:///{tmp_path / 'concurrent.sqlite3'}")


def test_stale_full_form_and_same_field_cannot_overwrite(tmp_path: Path):
    service = seed_plan(f"sqlite+pysqlite:///{tmp_path / 'stale.sqlite3'}")
    initial = service.get_admin_plan("pro")
    save(service, initial["revision"], monthly_included_points=20000)
    before = service.get_admin_plan("pro")
    for changes in ({"sales_price_cny": 88}, {"monthly_included_points": 30000}):
        with pytest.raises(CommercialConflictError):
            save(service, initial["revision"], **changes)
        assert service.get_admin_plan("pro") == before
    latest = before["revision"]
    save(service, latest, sales_price_cny=88.88, monthly_included_points=20000.5)
    current = service.get_admin_plan("pro")
    assert current["sales_offer"]["amount"] == 88.88
    assert current["latest_version"]["budgets"]["max_ai_credits_per_period"] == 20000.5
    assert current["latest_version"]["metadata"]["hidden"] == "preserved"
    assert current["latest_version"]["plan_version_id"] == "pro_v1"
    assert current["latest_version"]["concurrency"]["max_active_runs"] == 0
    with pytest.raises(CommercialConflictError):
        save(service, "")
    with pytest.raises(CommercialConflictError):
        service.update_admin_plan_parameters(
            plan_id="pro", revision="plan-v1:" + "0" * 64, **PARAMETERS
        )
    # Same values still advance the epoch, with a frozen clock.
    save(service, current["revision"])
    assert service.get_admin_plan("pro")["revision"] != current["revision"]


def assert_plan_rollback(database_url, monkeypatch, failure):
    service = seed_plan(database_url)
    before = service.get_admin_plan("pro")
    if failure == "audit":

        def fail(**kwargs):
            raise RuntimeError("audit unavailable")

        monkeypatch.setattr(service, "_record_service_audit_in_session", fail)
        with pytest.raises(RuntimeError, match="audit unavailable"):
            save(service, before["revision"], monthly_included_points=20000, sales_price_cny=88)
    else:
        with pytest.raises(CommercialValidationError):
            save(service, before["revision"], monthly_included_points=20000, sales_price_cny=0)
    assert service.get_admin_plan("pro") == before


@pytest.mark.parametrize("failure", ["audit", "offer"])
def test_plan_offer_and_audit_rollback_together(tmp_path: Path, monkeypatch, failure):
    assert_plan_rollback(
        f"sqlite+pysqlite:///{tmp_path / 'rollback.sqlite3'}", monkeypatch, failure
    )


def test_withdrawal_republication_and_aba_expire_revision(tmp_path: Path):
    service = seed_plan(f"sqlite+pysqlite:///{tmp_path / 'sales.sqlite3'}")
    before = service.get_admin_plan("pro")
    service.update_admin_plan_sales_status(plan_id="pro", status="retired")
    retired = service.get_admin_plan("pro")
    with pytest.raises(CommercialConflictError):
        save(service, before["revision"])
    save(service, retired["revision"], sales_price_cny=88)
    assert service.get_admin_plan("pro")["sales_offer"]["status"] == "retired"
    service.update_admin_plan_sales_status(plan_id="pro", status="active")
    with pytest.raises(CommercialConflictError):
        save(service, before["revision"])
    revision = service.get_admin_plan("pro")["revision"]
    service.publish_plan_version(
        plan_id="pro", plan_version_id="pro_v2", version_label="v2", sales_price_cny=77
    )
    with pytest.raises(CommercialConflictError):
        save(service, revision)


def assert_missing_offer_initialization(database_url: str):
    from app.adapters.repositories.commercial_repository import CommercialRepository
    from app.core.models import PlanOffer

    service = seed_plan(database_url)
    with get_session(database_url) as session:
        session.delete(session.get(PlanOffer, "pro_monthly_v1"))
        session.commit()
    before = service.get_admin_plan("pro")
    assert before["sales_offer"] is None
    barrier = Barrier(2)

    def initialize(_):
        barrier.wait(timeout=10)
        with get_session(database_url) as session:
            repo = CommercialRepository(session)
            offer = service._sync_standard_plan_offer_in_session(
                repo, tier_id="pro", plan_id="pro", plan_version_id="pro_v1", sales_price_cny=None
            )
            session.commit()
            return offer.offer_id

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert list(executor.map(initialize, [0, 1])) == ["pro_monthly_v1"] * 2
    assert service.get_admin_plan("pro")["sales_offer"]["status"] == "active"
    with pytest.raises(CommercialConflictError):
        save(service, before["revision"])


def test_missing_canonical_offer_initializers_share_parent_lock(tmp_path: Path):
    assert_missing_offer_initialization(f"sqlite+pysqlite:///{tmp_path / 'initialize.sqlite3'}")


def test_epoch_coexists_with_metadata_survives_upsert_and_get_is_stable(tmp_path: Path):
    from app.adapters.repositories.commercial_repository import CommercialRepository

    database_url = f"sqlite+pysqlite:///{tmp_path / 'epoch.sqlite3'}"
    service = seed_plan(database_url)
    initial = service.get_admin_plan("pro")
    assert service.get_admin_plan("pro")["revision"] == initial["revision"]
    epoch = initial["plan"]["metadata"]["admin_parameters_epoch"]
    with get_session(database_url) as session:
        repo = CommercialRepository(session)
        plan = repo.upsert_plan(
            plan_id="pro",
            name="Pro",
            status="active",
            description="",
            metadata_json={"tier_id": "pro", "business_note": "keep"},
        )
        assert plan.metadata_json["business_note"] == "keep"
        assert plan.metadata_json["admin_parameters_epoch"] != epoch
        session.commit()
    current = service.get_admin_plan("pro")
    assert current["revision"] != initial["revision"]
    save(service, current["revision"], sales_price_cny=0.01, site_limit=1)
    final = service.get_admin_plan("pro")
    assert final["plan"]["metadata"]["business_note"] == "keep"
    assert final["sales_offer"]["amount"] == 0.01
    assert final["latest_version"]["metadata"]["site_limit"] == 1
    assert service.get_admin_plan("pro")["revision"] == final["revision"]
