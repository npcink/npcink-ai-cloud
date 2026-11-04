from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier

import pytest
from sqlalchemy import select

from app.core.db import get_session, init_schema
from app.core.models import ServiceAuditEvent, ServiceSetting
from app.domain.commercial.errors import CommercialConflictError
from tests.domain.test_payment_service import _audit, _service


def assert_catalog_concurrency(database_url: str, initial: str) -> None:
    init_schema(database_url)
    service = _service(database_url)
    # A frozen clock must still produce a new revision on every successful save.
    service.now_factory = lambda: datetime(2026, 10, 30, tzinfo=UTC)
    if initial == "legacy":
        with get_session(database_url) as session:
            session.add(
                ServiceSetting(
                    setting_id="commercial_credit_pack_catalog",
                    setting_kind="commercial",
                    config_json={"items": []},
                    updated_at=service.now_factory(),
                )
            )
            session.commit()
    elif initial == "configured":
        service.update_admin_credit_pack_catalog(
            expected_revision=str(service.get_admin_credit_pack_catalog()["revision"]),
            items=[],
        )

    revision = str(service.get_admin_credit_pack_catalog()["revision"])
    barrier = Barrier(2)

    def save(label: str) -> str:
        barrier.wait(timeout=10)
        try:
            service.update_admin_credit_pack_catalog(
                expected_revision=revision,
                items=[{"pack_id": "pack_small", "label": label}],
                audit_context=_audit(label),
            )
            return label
        except CommercialConflictError as error:
            assert error.error_code == "service.credit_pack_catalog_revision_conflict"
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(save, ["operator-a", "operator-b"]))
    assert outcomes.count("conflict") == 1
    winner = next(outcome for outcome in outcomes if outcome != "conflict")
    catalog = service.get_admin_credit_pack_catalog()
    assert catalog["revision"] != revision
    assert catalog["items"][0]["label"] == winner
    with get_session(database_url) as session:
        events = list(
            session.scalars(
                select(ServiceAuditEvent).where(
                    ServiceAuditEvent.event_kind == "payment.credit_pack_catalog.update",
                    ServiceAuditEvent.outcome == "succeeded",
                )
            )
        )
        assert len(events) == 1
    with pytest.raises(CommercialConflictError):
        service.update_admin_credit_pack_catalog(expected_revision=revision, items=[])
    with pytest.raises(CommercialConflictError) as missing:
        service.update_admin_credit_pack_catalog(items=[])
    assert missing.value.error_code == "service.credit_pack_catalog_revision_required"
    # Reopening explicitly with the latest revision succeeds, even with the same clock.
    updated = service.update_admin_credit_pack_catalog(
        expected_revision=str(catalog["revision"]), items=[]
    )
    assert updated["revision"] != catalog["revision"]


@pytest.mark.parametrize("initial", ["unconfigured", "legacy", "configured"])
def test_credit_pack_two_operators_have_exactly_one_winner(tmp_path: Path, initial: str) -> None:
    assert_catalog_concurrency(f"sqlite+pysqlite:///{tmp_path / 'catalog.sqlite3'}", initial)


def test_credit_pack_audit_failure_rolls_back_catalog(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'rollback.sqlite3'}"
    init_schema(database_url)
    service = _service(database_url)
    original = service.get_admin_credit_pack_catalog()

    def fail_audit(**_kwargs: object) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(service, "_record_service_audit_in_session", fail_audit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        service.update_admin_credit_pack_catalog(
            expected_revision=str(original["revision"]),
            items=[{"pack_id": "pack_small", "amount": 119}],
            audit_context=_audit("rollback"),
        )
    assert service.get_admin_credit_pack_catalog() == original
