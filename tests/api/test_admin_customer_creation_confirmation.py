from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.db import dispose_engine, get_session
from app.core.models import (
    Account,
    AccountSubscription,
    AccountUserMembership,
    Principal,
    ServiceAuditEvent,
)
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def test_creation_confirmation_is_exact_and_read_only(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    path = "/internal/service/admin/accounts/creation-operations/create_exact"
    query = {"primary_email": "owner@example.com"}
    assert client.get(path, params=query).status_code in {401, 403}
    assert (
        client.get(path, params=query, headers=build_internal_headers()).json()["data"]["state"]
        == "unconfirmed"
    )
    created = client.post(
        "/internal/service/accounts",
        json={
            "name": "Customer",
            "primary_email": "Owner@Example.com",
            "bind_default_free": True,
            "metadata": {"operator_note": "x" * 2500},
        },
        headers=build_internal_headers(idempotency_key="create_exact"),
    )
    assert created.status_code == 200, created.text
    data = created.json()["data"]
    assert data["creation_operation_id"] == "create_exact"
    assert data["creation_receipt"]["operation_id"] == "create_exact"
    assert data["creation_receipt"]["account_id"] == data["account_id"]
    assert data["creation_receipt"]["audit_event_id"] > 0
    assert data["metadata"]["operator_note"] == "x" * 2500
    models = (Account, Principal, AccountUserMembership, AccountSubscription, ServiceAuditEvent)

    def counts() -> list[int]:
        with get_session(database_url) as session:
            return [
                session.scalar(select(func.count()).select_from(model)) or 0 for model in models
            ]

    before = counts()
    for _ in range(3):
        result = client.get(path, params=query, headers=build_internal_headers())
        assert result.status_code == 200
        confirmed = result.json()["data"]
        assert confirmed["state"] == "confirmed" and confirmed["account_id"] == data["account_id"]
        assert confirmed["receipt"]["audit_event_id"] > 0
        assert set(confirmed) == {"operation_id", "state", "account_id", "receipt"}
    assert counts() == before
    wrong_email = client.get(
        path, params={"primary_email": "other@example.com"}, headers=build_internal_headers()
    )
    assert wrong_email.json()["data"]["state"] == "unconfirmed"
    service = CommercialService(database_url)
    for kind, ref in [("platform_admin", "other"), ("unexpected_kind", "internal")]:
        result = service.confirm_admin_account_creation(
            operation_id="create_exact",
            primary_email="owner@example.com",
            audit_context=ServiceAuditContext(
                trace_id="",
                idempotency_key="",
                method="GET",
                path=path,
                actor_kind=kind,
                actor_ref=ref,
            ),
        )
        assert result == {
            "operation_id": "create_exact",
            "state": "unconfirmed",
            "account_id": None,
            "receipt": None,
        }
    rejected = client.post(
        "/internal/service/accounts",
        json={
            "name": "Duplicate",
            "primary_email": "owner@example.com",
        },
        headers=build_internal_headers(idempotency_key="duplicate_email"),
    )
    assert rejected.status_code == 409
    assert rejected.json()["error_code"] == "service.single_account_membership_limit"
    assert (
        client.get(
            path.replace("create_exact", "duplicate_email"),
            params=query,
            headers=build_internal_headers(),
        ).json()["data"]["state"]
        == "unconfirmed"
    )
    dispose_engine(database_url)


@pytest.mark.parametrize(
    "damage", ["scope", "path", "email", "owner", "principal", "marker", "ambiguous"]
)
def test_creation_confirmation_does_not_guess_an_account(tmp_path: Path, damage: str) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    result = client.post(
        "/internal/service/accounts",
        json={
            "name": "Same display name",
            "primary_email": "owner@example.com",
        },
        headers=build_internal_headers(idempotency_key="create_damage"),
    )
    assert result.status_code == 200
    data = result.json()["data"]
    with get_session(database_url) as session:
        event = session.scalar(
            select(ServiceAuditEvent).where(ServiceAuditEvent.idempotency_key == "create_damage")
        )
        assert event is not None
        payload = deepcopy(event.payload_json)
        assert payload is not None
        if damage == "scope":
            event.scope_id = "acct_wrong"
        elif damage == "path":
            event.path = "/internal/service/not-creation"
        elif damage == "email":
            payload["primary_identity"]["email"] = "other@example.com"
        elif damage == "marker":
            payload.pop("creation_operation_id")
        elif damage == "owner":
            membership = session.get(AccountUserMembership, data["membership"]["membership_id"])
            assert membership is not None
            membership.status = "revoked"
        elif damage == "principal":
            principal = session.get(Principal, data["primary_identity"]["principal_id"])
            assert principal is not None
            principal.email = "changed@example.com"
        else:
            attrs = {
                column.name: getattr(event, column.name)
                for column in ServiceAuditEvent.__table__.columns
                if column.name != "id"
            }
            session.add(ServiceAuditEvent(**attrs))
        event.payload_json = payload
        session.commit()
    confirmed = client.get(
        "/internal/service/admin/accounts/creation-operations/create_damage",
        params={"primary_email": "owner@example.com"},
        headers=build_internal_headers(),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["data"] == {
        "operation_id": "create_damage",
        "state": "unconfirmed",
        "account_id": None,
        "receipt": None,
    }
    dispose_engine(database_url)
