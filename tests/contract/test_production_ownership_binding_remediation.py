from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from importlib import util
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.models import (
    PRINCIPAL_SITE_BINDING_STATUS_RELEASED,
    SITE_STATUS_ARCHIVED,
    Account,
    AccountUserMembership,
    Base,
    Principal,
    PrincipalSiteBinding,
    ServiceAuditEvent,
    Site,
)

ROOT = Path(__file__).resolve().parents[2]


def _load_module() -> ModuleType:
    path = ROOT / ".github/scripts/production-ownership-binding-remediation.py"
    spec = util.spec_from_file_location("production_ownership_binding_remediation", path)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULE = _load_module()


@contextmanager
def _database() -> Iterator[Session]:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _add_archived_site_with_stale_binding(session: Session) -> None:
    account_id = "acct_stale"
    principal_id = "prn_stale"
    site_id = "site_stale"
    session.add(Account(account_id=account_id, name="Private account"))
    session.add(Principal(principal_id=principal_id, email="private@example.test"))
    session.add(
        AccountUserMembership(
            membership_id="membership_stale",
            principal_id=principal_id,
            account_id=account_id,
            role="owner",
            status="active",
            allowed_actions_json=[],
        )
    )
    session.add(
        Site(
            site_id=site_id,
            account_id=account_id,
            name="Private site",
            site_url="https://private.example.test",
            status=SITE_STATUS_ARCHIVED,
            ownership_released_at=datetime.now(UTC),
        )
    )
    session.add(
        PrincipalSiteBinding(
            binding_id="binding_stale",
            principal_id=principal_id,
            account_id=account_id,
            site_id=site_id,
            status="active",
            bound_at=datetime.now(UTC),
        )
    )
    session.commit()


def test_diagnose_reports_only_reason_codes_and_finding_token() -> None:
    with _database() as session:
        _add_archived_site_with_stale_binding(session)

        report = MODULE.diagnose(session)

    serialized = json.dumps(report, sort_keys=True)
    assert report["status"] == "repairable"
    assert report["read_only"] is True
    assert report["invalid_current_bindings"]["count"] == 1
    sample = report["invalid_current_bindings"]["samples"][0]
    assert len(sample["finding_token"]) == 64
    assert sample["reasons"] == ["site_not_active", "site_ownership_released"]
    assert "acct_stale" not in serialized
    assert "prn_stale" not in serialized
    assert "site_stale" not in serialized
    assert "private@example.test" not in serialized


def test_release_requires_exact_token_and_confirmation_then_audits() -> None:
    with _database() as session:
        _add_archived_site_with_stale_binding(session)
        report = MODULE.diagnose(session)
        token = report["invalid_current_bindings"]["samples"][0]["finding_token"]

        repaired = MODULE.release_invalid_binding(
            session,
            expected_finding_token=token,
            confirmation=MODULE.REPAIR_CONFIRMATION,
        )

        binding = session.get(PrincipalSiteBinding, "binding_stale")
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.event_kind == "ownership.binding.release"
            )
        )

    assert repaired["status"] == "repaired"
    assert repaired["released_bindings"] == 1
    assert repaired["site_account_or_principal_changed"] is False
    assert binding is not None
    assert binding.status == PRINCIPAL_SITE_BINDING_STATUS_RELEASED
    assert binding.released_at is not None
    assert binding.release_reason == MODULE.RELEASE_REASON
    assert audit is not None
    assert audit.actor_kind == "platform_admin"
    assert audit.idempotency_key == token


def test_release_fails_closed_for_stale_token_or_wrong_confirmation() -> None:
    with _database() as session:
        _add_archived_site_with_stale_binding(session)
        report = MODULE.diagnose(session)
        token = report["invalid_current_bindings"]["samples"][0]["finding_token"]

        with pytest.raises(RuntimeError, match="confirmation"):
            MODULE.release_invalid_binding(
                session,
                expected_finding_token=token,
                confirmation="wrong",
            )
        with pytest.raises(RuntimeError, match="no longer matches"):
            MODULE.release_invalid_binding(
                session,
                expected_finding_token="0" * 64,
                confirmation=MODULE.REPAIR_CONFIRMATION,
            )


def test_workflow_requires_diagnosis_token_and_exact_confirmation() -> None:
    workflow = (ROOT / ".github/workflows/production-maintenance.yml").read_text(
        encoding="utf-8"
    )
    helper = (
        ROOT / ".github/scripts/production-ownership-binding-remediation-ssh.sh"
    ).read_text(encoding="utf-8")
    script = (
        ROOT / ".github/scripts/production-ownership-binding-remediation.py"
    ).read_text(encoding="utf-8")

    assert '- "ownership-binding-diagnose"' in workflow
    assert '- "ownership-binding-release"' in workflow
    assert "ownership_binding_finding_token" in workflow
    assert "ownership_binding_repair_confirmation" in workflow
    assert MODULE.REPAIR_CONFIRMATION in workflow
    assert "bash .github/scripts/production-ownership-binding-remediation-ssh.sh" in workflow
    assert "set +x" in helper
    assert "SET TRANSACTION READ ONLY" in script
    assert "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE" in script
    assert "with_for_update()" in script
    assert "result.rowcount != 1" in script
    assert "session.commit()" in script
    assert "Principal.email" not in script
    assert "Site.site_url" not in script
