from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from importlib import util
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
    Account,
    AccountUserMembership,
    Base,
    Principal,
    PrincipalSiteBinding,
    Site,
)

ROOT = Path(__file__).resolve().parents[2]


def _load_inventory_module() -> ModuleType:
    path = ROOT / ".github/scripts/production-ownership-inventory.py"
    spec = util.spec_from_file_location("production_ownership_inventory", path)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


INVENTORY_MODULE = _load_inventory_module()
CONTRACT = INVENTORY_MODULE.CONTRACT
collect_inventory = INVENTORY_MODULE.collect_inventory
database_url_from_environment = INVENTORY_MODULE.database_url_from_environment


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


def _add_account_member(
    session: Session,
    *,
    account_id: str,
    principal_id: str,
    membership_status: str = ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
) -> None:
    if session.get(Account, account_id) is None:
        session.add(Account(account_id=account_id, name="Private test account"))
        session.flush()
    session.add(
        Principal(
            principal_id=principal_id,
            email=f"{principal_id}@sensitive.example",
        )
    )
    session.add(
        AccountUserMembership(
            membership_id=f"membership_{principal_id}",
            principal_id=principal_id,
            account_id=account_id,
            role="owner",
            status=membership_status,
            allowed_actions_json=[],
        )
    )


def _add_site(session: Session, *, account_id: str, site_id: str) -> None:
    session.add(
        Site(
            site_id=site_id,
            account_id=account_id,
            name="Private test site",
            site_url="https://sensitive.example",
        )
    )


def _bind(
    session: Session,
    *,
    account_id: str,
    principal_id: str,
    site_id: str,
) -> None:
    session.add(
        PrincipalSiteBinding(
            binding_id=f"binding_{principal_id}_{site_id}",
            principal_id=principal_id,
            account_id=account_id,
            site_id=site_id,
            status=PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
            bound_at=datetime.now(UTC),
        )
    )


def test_single_member_valid_binding_passes_without_private_fields() -> None:
    with _database() as session:
        _add_account_member(
            session,
            account_id="acct_private",
            principal_id="prn_private",
        )
        _add_site(session, account_id="acct_private", site_id="site_private")
        _bind(
            session,
            account_id="acct_private",
            principal_id="prn_private",
            site_id="site_private",
        )
        session.commit()

        report = collect_inventory(session)

    serialized = json.dumps(report, sort_keys=True)
    assert report["contract"] == CONTRACT
    assert report["status"] == "passed"
    assert report["counts"]["valid_current_site_bindings"] == 1
    assert "sensitive.example" not in serialized
    assert "@sensitive.example" not in serialized
    assert "site_url" not in serialized
    assert report["privacy"] == {
        "identifiers": "opaque principal/account/site IDs only",
        "customer_content": False,
        "emails": False,
        "credentials": False,
        "provider_subjects": False,
    }


def test_multi_user_active_site_without_binding_blocks_release() -> None:
    with _database() as session:
        _add_account_member(session, account_id="acct_shared", principal_id="prn_a")
        _add_account_member(session, account_id="acct_shared", principal_id="prn_b")
        _add_site(session, account_id="acct_shared", site_id="site_shared")
        session.commit()

        report = collect_inventory(session)

    finding = report["violations"]["ambiguous_multi_user_active_sites"]
    assert report["status"] == "blocked"
    assert finding == {
        "count": 1,
        "samples": [{"account_id": "acct_shared", "site_id": "site_shared"}],
        "truncated": False,
    }


def test_multi_user_active_site_with_one_valid_owner_passes() -> None:
    with _database() as session:
        _add_account_member(session, account_id="acct_shared", principal_id="prn_a")
        _add_account_member(session, account_id="acct_shared", principal_id="prn_b")
        _add_site(session, account_id="acct_shared", site_id="site_shared")
        _bind(
            session,
            account_id="acct_shared",
            principal_id="prn_a",
            site_id="site_shared",
        )
        session.commit()

        report = collect_inventory(session)

    assert report["status"] == "passed"
    assert report["counts"]["multi_user_accounts"] == 1
    assert report["counts"]["valid_current_site_bindings"] == 1
    assert report["violations"]["ambiguous_multi_user_active_sites"]["count"] == 0


def test_revoked_membership_cannot_keep_an_effective_binding() -> None:
    with _database() as session:
        _add_account_member(
            session,
            account_id="acct_revoked",
            principal_id="prn_revoked",
            membership_status=ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
        )
        _add_site(session, account_id="acct_revoked", site_id="site_revoked")
        _bind(
            session,
            account_id="acct_revoked",
            principal_id="prn_revoked",
            site_id="site_revoked",
        )
        session.commit()

        report = collect_inventory(session)

    finding = report["violations"]["invalid_current_bindings"]
    assert report["status"] == "blocked"
    assert finding["count"] == 1
    assert finding["samples"] == [
        {
            "account_id": "acct_revoked",
            "principal_id": "prn_revoked",
            "site_id": "site_revoked",
        }
    ]


def test_unbound_single_member_site_warns_without_inferred_assignment() -> None:
    with _database() as session:
        _add_account_member(session, account_id="acct_single", principal_id="prn_single")
        _add_site(session, account_id="acct_single", site_id="site_single")
        session.commit()

        report = collect_inventory(session)

    assert report["status"] == "passed"
    assert report["counts"]["valid_current_site_bindings"] == 0
    assert report["warnings"]["unbound_single_member_active_sites"]["count"] == 1


def test_unsafe_identifier_is_counted_but_never_printed() -> None:
    with _database() as session:
        _add_account_member(
            session,
            account_id="acct_unsafe@example.com",
            principal_id="prn_safe",
        )
        session.commit()

        report = collect_inventory(session)

    serialized = json.dumps(report, sort_keys=True)
    assert report["status"] == "blocked"
    assert report["violations"]["unsafe_identifiers"]["count"] > 0
    assert "acct_unsafe@example.com" not in serialized


def test_inventory_reads_only_the_database_url_from_process_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = "postgresql+psycopg://inventory:private@postgres/inventory"
    monkeypatch.setenv("NPCINK_CLOUD_ENVIRONMENT", "production")
    monkeypatch.delenv("NPCINK_CLOUD_ADMIN_SESSION_SECRET", raising=False)
    monkeypatch.setenv("NPCINK_CLOUD_DATABASE_URL", database_url)

    assert database_url_from_environment() == database_url


@pytest.mark.parametrize(
    "database_url",
    ["", "://malformed", " sqlite+pysqlite:///:memory:", "sqlite+pysqlite:///:memory:"],
)
def test_inventory_rejects_missing_malformed_or_non_postgres_database_url(
    monkeypatch: pytest.MonkeyPatch,
    database_url: str,
) -> None:
    monkeypatch.setenv("NPCINK_CLOUD_DATABASE_URL", database_url)

    with pytest.raises(RuntimeError, match="database URL|requires PostgreSQL"):
        database_url_from_environment()


def test_workflow_routes_inventory_through_read_only_ssh_helper() -> None:
    workflow = (ROOT / ".github/workflows/production-maintenance.yml").read_text(
        encoding="utf-8"
    )
    helper = (ROOT / ".github/scripts/production-ownership-inventory-ssh.sh").read_text(
        encoding="utf-8"
    )
    inventory = (ROOT / ".github/scripts/production-ownership-inventory.py").read_text(
        encoding="utf-8"
    )

    assert '- "ownership-inventory"' in workflow
    assert "ownership-inventory:" in workflow
    assert (
        "if: github.ref == 'refs/heads/production' && "
        "inputs.action == 'ownership-inventory'"
    ) in workflow
    assert "permissions:\n      contents: read" in workflow
    assert (
        "if: github.ref == 'refs/heads/production' && "
        "inputs.action != 'ownership-inventory'"
    ) in workflow
    assert "permissions: {}" in workflow
    assert "Checkout ownership inventory helper" in workflow
    assert "if: inputs.action == 'ownership-inventory'" not in workflow
    assert workflow.index("Checkout ownership inventory helper") < workflow.index(
        "bash .github/scripts/production-ownership-inventory-ssh.sh"
    )
    assert "bash .github/scripts/production-ownership-inventory-ssh.sh" in workflow
    assert "docker compose exec" not in helper
    assert 'npcink_ai_cloud_compose "${current_release}" exec -T api python -' in helper
    assert "SET TRANSACTION READ ONLY" in inventory
    assert "Settings()" not in inventory
    assert 'os.environ.get("NPCINK_CLOUD_DATABASE_URL", "")' in inventory
    assert "select(Principal.principal_id, Principal.status)" in inventory
    assert "select(Site)" not in inventory
    assert "select(Principal)" not in inventory
    assert "session.add(" not in inventory
    assert "session.delete(" not in inventory
    assert "session.commit(" not in inventory
    assert "Principal.email" not in inventory
    assert "site_url" not in inventory
