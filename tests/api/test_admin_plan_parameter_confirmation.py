from __future__ import annotations

from copy import deepcopy

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.db import get_engine, get_session
from app.core.models import PlanOffer, PlanVersion, ServiceAuditEvent
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers
from tests.domain.test_admin_plan_concurrency import PARAMETERS, seed_plan

BASE = "/internal/service/admin/plans/pro"


def setup_operation(tmp_path, cookie=False):
    database_url, client = _build_client(tmp_path, providers={})
    seed_plan(database_url)
    if cookie:
        from starlette.requests import Request

        from app.api.routes.auth import ADMIN_SESSION_COOKIE, _build_admin_session_token

        request = Request({"type": "http", "app": client.app, "headers": []})
        client.cookies.set(ADMIN_SESSION_COOKIE, _build_admin_session_token(
            request, grant_id="", principal_id="platform:internal_root", is_persisted=False,
        ))
    revision = client.get(BASE, headers=build_internal_headers()).json()["data"]["revision"]
    values = {**PARAMETERS, "sales_price_cny": 88.88, "monthly_included_points": 20000.5}
    response = client.patch(BASE, json={"revision": revision, **values},
                            headers=build_internal_headers(idempotency_key="plan-confirm-original"))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["parameter_operation"] == {
        "action": "parameters.update", "source_revision": revision, "parameters": values,
    }
    return database_url, client, revision, values


def read(client, revision, operation="plan-confirm-original", plan="pro"):
    response = client.get(f"/internal/service/admin/plans/{plan}/parameter-operations/{operation}",
                          params={"source_revision": revision}, headers=build_internal_headers())
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.parametrize("cookie", [False, True])
def test_exact_receipt_current_values_and_authorized_chain_are_select_only(tmp_path, monkeypatch, cookie):
    database_url, client, revision, values = setup_operation(tmp_path, cookie=cookie)

    def forbidden(*args, **kwargs):
        pytest.fail("confirmation entered a write/heavy projection")

    for name in ["get_admin_plan", "get_admin_site", "list_admin_plans", "update_admin_plan_parameters",
                 "reconcile_billing_snapshot", "_record_service_audit_in_session"]:
        monkeypatch.setattr(CommercialService, name, forbidden)
    monkeypatch.setattr(Session, "commit", forbidden)
    statements = []

    def inspect_sql(conn, cursor, statement, parameters, context, executemany):
        verb = statement.lstrip().split(None, 1)[0].upper()
        statements.append(verb)
        assert verb in {"SELECT", "PRAGMA"}, statement

    engine = get_engine(database_url)
    event.listen(engine, "before_cursor_execute", inspect_sql)
    try:
        for _ in range(3):
            result = read(client, revision)
            assert result["state"] == "confirmed"
            assert result["receipt"]["audit_event_id"] > 0
            assert result["receipt"]["parameters"] == values
            assert result["current"]["parameters"] == values
            assert result["current"]["revision"] != revision
        for result in [read(client, revision, operation="not-sent"), read(client, revision, plan="plus"),
                       read(client, "plan-v1:" + "a" * 64)]:
            assert result["state"] == "unconfirmed" and result["current"] is None and result["receipt"] is None
        assert statements and "SELECT" in statements
    finally:
        event.remove(engine, "before_cursor_execute", inspect_sql)


@pytest.mark.parametrize("damage", [
    "actor_kind", "actor_ref", "key", "method", "path", "event_kind", "outcome", "plan_id",
    "scope_kind", "scope_id", "version", "action", "revision", "snapshot", "legacy", "duplicate",
    "current_price", "current_credits", "moved_version",
])
def test_missing_wrong_or_ambiguous_evidence_never_confirms_same_value(tmp_path, damage):
    database_url, client, revision, values = setup_operation(tmp_path)
    with get_session(database_url) as session:
        row = session.scalar(select(ServiceAuditEvent).where(ServiceAuditEvent.idempotency_key == "plan-confirm-original"))
        assert row is not None
        payload = deepcopy(row.payload_json)
        if damage in {"actor_kind", "actor_ref", "method", "path", "event_kind", "outcome", "plan_id", "scope_kind", "scope_id"}:
            setattr(row, damage, "wrong")
        elif damage == "key":
            row.idempotency_key = "other-key"
        elif damage == "version":
            row.plan_version_id = "other-version"
        elif damage == "action":
            payload["parameter_operation"]["action"] = "sales.update"
        elif damage == "revision":
            payload["parameter_operation"]["source_revision"] = "other"
        elif damage == "snapshot":
            payload["parameter_operation"]["parameters"]["sales_price_cny"] = 1
        elif damage == "legacy":
            del payload["parameter_operation"]
        elif damage == "duplicate":
            session.add(ServiceAuditEvent(**{column.name: getattr(row, column.name)
                        for column in ServiceAuditEvent.__table__.columns if column.name != "id"}))
        elif damage == "current_price":
            session.get(PlanOffer, "pro_monthly_v1").amount = 1
        elif damage == "current_credits":
            version = session.get(PlanVersion, "pro_v1")
            version.budgets_json = {**version.budgets_json, "max_ai_credits_per_period": 1}
        elif damage == "moved_version":
            # Existing cross-parent semantics stay allowed; confirmation must not
            # adopt a row that no longer belongs to its submitted target.
            from app.core.models import Plan

            session.add(Plan(plan_id="other-plan", name="Other", status="active"))
            session.flush()
            session.get(PlanVersion, "pro_v1").plan_id = "other-plan"
        row.payload_json = payload
        session.commit()
    result = read(client, revision)
    assert result["state"] == "unconfirmed" and result["current"] is None and result["receipt"] is None
