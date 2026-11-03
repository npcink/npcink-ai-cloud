from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, select

from app.core.db import dispose_engine, get_engine, get_session
from app.core.models import Account, ServiceAuditEvent, Site
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers

RELEASED = datetime(2026, 7, 1, 12, 34, 56, 123456, tzinfo=UTC)
SITE_ID = "site_confirmation"
BASE = f"/internal/service/admin/sites/{SITE_ID}"


def seed_site(database_url: str, *, status: str = "archived") -> None:
    with get_session(database_url) as session:
        session.add(Account(account_id="acct_site", name="Owner", status="active"))
        session.add(
            Site(
                site_id=SITE_ID,
                account_id="acct_site",
                name="Confirmation",
                status=status,
                ownership_released_at=RELEASED if status == "archived" else None,
                relink_cooldown_until=RELEASED + timedelta(days=180)
                if status == "archived"
                else None,
            )
        )
        session.commit()


def forbid_confirmation_writes(monkeypatch: pytest.MonkeyPatch, database_url: str) -> list[str]:
    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("confirmation must not enter a write/reconcile/detail path")

    for name in [
        "get_admin_site",
        "reconcile_billing_snapshot",
        "activate_site",
        "update_site_relink_cooldown",
        "_record_service_audit_in_session",
    ]:
        monkeypatch.setattr(CommercialService, name, forbidden)
    statements: list[str] = []

    def inspect_sql(
        conn: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        verb = statement.lstrip().split(None, 1)[0].upper()
        statements.append(verb)
        assert verb in {"SELECT", "PRAGMA"}, statement

    event.listen(get_engine(database_url), "before_cursor_execute", inspect_sql)
    return statements


@pytest.mark.parametrize("action", ["set", "clear", "reset"])
def test_cooldown_confirmation_exact_receipt_and_select_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    seed_site(database_url)
    until = datetime(2027, 1, 2, 3, 4, 5, 654321, tzinfo=UTC)
    body: dict[str, object] = {"action": action}
    if action == "set":
        body["cooldown_until"] = until.isoformat()
    response = client.patch(
        f"{BASE}/relink-cooldown",
        json=body,
        headers=build_internal_headers(idempotency_key="site_exact"),
    )
    assert response.status_code == 200, response.text
    saved = response.json()["data"]
    if action == "reset":
        assert datetime.fromisoformat(saved["relink_cooldown_until"]) == RELEASED + timedelta(
            days=90
        )
    elif action == "set":
        assert datetime.fromisoformat(saved["relink_cooldown_until"]) == until
    else:
        assert (
            abs(
                (
                    datetime.fromisoformat(saved["relink_cooldown_until"]) - datetime.now(UTC)
                ).total_seconds()
            )
            < 10
        )
    path = f"{BASE}/operations/site_exact"
    # Authentication rejection intentionally records a guard event; the authorized
    # confirmation chain below must be SELECT-only.
    assert client.get(path, params={"action": action}).status_code in {401, 403}
    statements = forbid_confirmation_writes(monkeypatch, database_url)
    for _ in range(3):
        response = client.get(path, params={"action": action}, headers=build_internal_headers())
        assert response.status_code == 200, response.text
        confirmed = response.json()["data"]
        assert confirmed["state"] == "confirmed"
        assert confirmed["receipt"] == {
            "site_id": SITE_ID,
            "operation_id": "site_exact",
            "action": action,
            "audit_event_id": confirmed["receipt"]["audit_event_id"],
            "resolved_cooldown_until": saved["relink_cooldown_until"],
        }
        assert confirmed["receipt"]["audit_event_id"] > 0
        assert confirmed["site"]["relink_cooldown_until"] == saved["relink_cooldown_until"]
        assert confirmed["site_relink_policy"]["cooldown_until"] == saved["relink_cooldown_until"]
    for wrong in [path.replace("site_exact", "missing"), path.replace(SITE_ID, "wrong")]:
        result = client.get(
            wrong, params={"action": action}, headers=build_internal_headers()
        ).json()["data"]
        assert (
            result["state"] == "unconfirmed"
            and result["site"] is None
            and result["receipt"] is None
        )
    assert statements and set(statements) <= {"SELECT", "PRAGMA"}
    dispose_engine(database_url)


@pytest.mark.parametrize(
    "damage",
    [
        "actor_kind",
        "actor_ref",
        "path",
        "method",
        "event",
        "outcome",
        "scope",
        "site",
        "action",
        "payload_site",
        "timestamp",
        "released",
        "current",
        "account",
        "ambiguous",
    ],
)
def test_cooldown_confirmation_never_guesses(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    damage: str,
) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    seed_site(database_url)
    created = client.patch(
        f"{BASE}/relink-cooldown",
        json={"action": "reset"},
        headers=build_internal_headers(idempotency_key="site_damage"),
    )
    assert created.status_code == 200
    with get_session(database_url) as session:
        audit = session.scalar(
            select(ServiceAuditEvent).where(ServiceAuditEvent.idempotency_key == "site_damage")
        )
        assert audit is not None
        payload = deepcopy(audit.payload_json)
        assert payload is not None
        field_values = {
            "actor_kind": ("actor_kind", "other"),
            "actor_ref": ("actor_ref", "other"),
            "path": ("path", "/internal/service/other"),
            "method": ("method", "POST"),
            "event": ("event_kind", "site.activate"),
            "outcome": ("outcome", "failed"),
            "scope": ("scope_id", "wrong"),
            "site": ("site_id", "wrong"),
            "account": ("account_id", "wrong"),
        }
        if damage in field_values:
            field, value = field_values[damage]
            setattr(audit, field, value)
        elif damage == "action":
            payload["action"] = "clear"
        elif damage == "payload_site":
            payload["site_id"] = "wrong"
        elif damage == "timestamp":
            payload["relink_cooldown_until"] = "not UTC"
        elif damage == "released":
            payload["ownership_released_at"] = (RELEASED + timedelta(days=1)).isoformat()
        elif damage == "current":
            site = session.get(Site, SITE_ID)
            assert site is not None
            site.relink_cooldown_until = RELEASED + timedelta(days=100)
        else:
            attrs = {
                column.name: getattr(audit, column.name)
                for column in ServiceAuditEvent.__table__.columns
                if column.name not in {"id", "created_at"}
            }
            session.add(ServiceAuditEvent(**attrs))
        audit.payload_json = payload
        session.commit()
    forbid_confirmation_writes(monkeypatch, database_url)
    response = client.get(
        f"{BASE}/operations/site_damage?action=reset", headers=build_internal_headers()
    )
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["state"] == "unconfirmed" and result["site"] is None and result["receipt"] is None
    dispose_engine(database_url)


def test_activation_confirmation_reads_actual_state_without_replaying(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    seed_site(database_url, status="provisioning")
    path = f"{BASE}/operations/site_activate?action=activate"
    initial = client.get(path, headers=build_internal_headers()).json()["data"]
    assert initial["state"] == "unconfirmed"
    response = client.post(
        f"/internal/service/sites/{SITE_ID}/activate",
        headers=build_internal_headers(idempotency_key="site_activate"),
        json={},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "active"
    forbid_confirmation_writes(monkeypatch, database_url)
    for operation in ["site_activate", "different_key"]:
        result = client.get(
            path.replace("site_activate", operation), headers=build_internal_headers()
        ).json()["data"]
        assert result["state"] == "confirmed" and result["site"]["status"] == "active"
        assert result["receipt"] is None  # Current active, not proof of a unique original POST.
    dispose_engine(database_url)
