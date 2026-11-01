from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.db import get_engine, get_session
from app.core.models import ServiceAuditEvent, ServiceSetting
from app.domain.commercial.service import CommercialService
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers

BASE = "/internal/service/admin/credit-packs"
SETTING = "commercial_credit_pack_catalog"
KEY = "credit-pack-original-operation"


def setup_operation(tmp_path, cookie=False):
    database_url, client = _build_client(tmp_path, providers={})
    if cookie:
        from starlette.requests import Request

        from app.api.routes.auth import ADMIN_SESSION_COOKIE, _build_admin_session_token

        request = Request({"type": "http", "app": client.app, "headers": []})
        client.cookies.set(ADMIN_SESSION_COOKIE, _build_admin_session_token(
            request, grant_id="", principal_id="platform:internal_root", is_persisted=False,
        ))
    catalog = client.get(BASE, headers=build_internal_headers()).json()["data"]
    items = catalog["items"]
    items[0]["amount"] = 0.000001
    items[0]["ai_credits"] = 10001
    response = client.patch(BASE, json={"items": items, "expected_revision": catalog["revision"]},
                            headers=build_internal_headers(idempotency_key=KEY))
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["catalog_operation"] == {
        "expected_revision": catalog["revision"], "items": result["items"],
    }
    return database_url, client, catalog["revision"], result


def read(client, revision, key=KEY):
    response = client.get(f"{BASE}/operations/{key}", params={"expected_revision": revision},
                          headers=build_internal_headers())
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.parametrize("cookie", [False, True])
def test_exact_authenticated_confirmation_chain_only_selects(tmp_path, monkeypatch, cookie):
    database_url, client, revision, result = setup_operation(tmp_path, cookie)

    def forbidden(*args, **kwargs):
        pytest.fail("confirmation called a write or unrelated projection")

    for name in [
        "get_admin_credit_pack_catalog", "get_admin_site", "reconcile_billing_snapshot",
        "update_admin_credit_pack_catalog", "_record_service_audit_in_session",
        "_effective_credit_pack_items_from_session",
    ]:
        monkeypatch.setattr(CommercialService, name, forbidden)
    monkeypatch.setattr(Session, "commit", forbidden)
    monkeypatch.setattr(Session, "flush", forbidden)
    statements = []

    def inspect_sql(conn, cursor, statement, parameters, context, executemany):
        verb = statement.lstrip().split(None, 1)[0].upper()
        statements.append(verb)
        assert verb in {"SELECT", "PRAGMA"}, statement

    engine = get_engine(database_url)
    event.listen(engine, "before_cursor_execute", inspect_sql)
    try:
        for _ in range(3):
            value = read(client, revision)
            assert value["state"] == "confirmed"
            assert value["current"] == result
            assert value["receipt"]["items"] == result["items"]
            assert value["receipt"]["revision"] == result["revision"]
            assert value["receipt"]["audit_event_id"] > 0
            assert value["receipt"]["actor_kind"] == (
                "platform_admin" if cookie else "internal_token"
            )
        for value in [read(client, revision, "not-sent"), read(client, "wrong-revision")]:
            assert value["state"] == "unconfirmed"
            assert value["receipt"] is None and value["current"] is None
        assert "SELECT" in statements
    finally:
        event.remove(engine, "before_cursor_execute", inspect_sql)


@pytest.mark.parametrize("damage", [
    "actor_kind", "actor_ref", "idempotency_key", "method", "path", "event_kind", "outcome",
    "scope_kind", "scope_id", "expected_revision", "submitted_other_pack", "missing_operation",
    "duplicate", "current_other_pack", "current_same_value_new_revision", "current_missing",
    "payload_revision", "malformed_payload",
])
def test_same_values_or_incomplete_other_ambiguous_evidence_never_confirm(tmp_path, damage):
    database_url, client, revision, _ = setup_operation(tmp_path)
    with get_session(database_url) as session:
        audit = session.scalar(select(ServiceAuditEvent).where(
            ServiceAuditEvent.idempotency_key == KEY,
        ))
        setting = session.get(ServiceSetting, SETTING)
        assert audit is not None and setting is not None
        payload, config = deepcopy(audit.payload_json), deepcopy(setting.config_json)
        if damage in {
            "actor_kind", "actor_ref", "idempotency_key", "method", "path", "event_kind",
            "outcome", "scope_kind", "scope_id",
        }:
            setattr(audit, damage, "wrong")
        elif damage == "expected_revision":
            payload["catalog_operation"]["expected_revision"] = "wrong"
        elif damage == "submitted_other_pack":
            payload["catalog_operation"]["items"][1]["amount"] = 1
        elif damage == "missing_operation":
            del payload["catalog_operation"]
        elif damage == "payload_revision":
            payload["revision"] = "wrong"
        elif damage == "duplicate":
            session.add(ServiceAuditEvent(**{column.name: getattr(audit, column.name)
                        for column in ServiceAuditEvent.__table__.columns if column.name != "id"}))
        elif damage == "current_other_pack":
            config["items"][1]["label"] = "changed other pack"
        elif damage == "current_same_value_new_revision":
            config["revision"] = "a" * 32
        elif damage == "current_missing":
            config.pop("items")
        audit.payload_json = [] if damage == "malformed_payload" else payload
        setting.config_json = config
        session.commit()
    value = read(client, revision)
    assert value["state"] == "unconfirmed"
    assert value["receipt"] is None and value["current"] is None


def test_real_stale_revision_cas_and_single_success_receipt_remain(tmp_path):
    database_url, client, revision, result = setup_operation(tmp_path)
    response = client.patch(BASE, json={"items": result["items"], "expected_revision": revision},
                            headers=build_internal_headers(idempotency_key="second-stale-operation"))
    assert response.status_code == 409
    assert response.json()["error_code"] == "service.credit_pack_catalog_revision_conflict"
    assert read(client, revision)["state"] == "confirmed"
    with get_session(database_url) as session:
        events = list(session.scalars(select(ServiceAuditEvent).where(
            ServiceAuditEvent.event_kind == "payment.credit_pack_catalog.update",
            ServiceAuditEvent.outcome == "succeeded",
        )))
        assert len(events) == 1


def test_unauthenticated_and_invalid_admin_cookie_remain_rejected(tmp_path):
    _, client = _build_client(tmp_path, providers={})
    response = client.get(f"{BASE}/operations/not-sent",
                          params={"expected_revision": "unconfigured"})
    assert response.status_code == 401
    client.cookies.set("npcink_admin_session_token", "invalid-cookie")
    assert client.get(f"{BASE}/operations/not-sent", params={"expected_revision": "unconfigured"},
                      headers=build_internal_headers()).status_code == 401


def test_real_catalog_preserves_duplicate_recommendations_when_saving_another_pack(tmp_path):
    _, client = _build_client(tmp_path, providers={})
    original = client.get(BASE, headers=build_internal_headers()).json()["data"]
    items = deepcopy(original["items"])
    items[1]["recommended_for_tiers"] = ["plus", "plus"]
    saved = client.patch(BASE, json={"items": items, "expected_revision": original["revision"]},
                         headers=build_internal_headers(idempotency_key="duplicate-tier-setup"))
    assert saved.status_code == 200, saved.text
    actual = client.get(BASE, headers=build_internal_headers()).json()["data"]
    assert actual["items"][1]["recommended_for_tiers"] == ["plus", "plus"]
    if root := os.environ.get("NPCINK_CREDIT_PACK_REVIEW_EVIDENCE"):
        Path(root).mkdir(parents=True, exist_ok=True)
        (Path(root) / "real-catalog-duplicate-tiers.json").write_text(json.dumps(actual, indent=2))
    next_items = deepcopy(actual["items"])
    next_items[0]["amount"] = 88
    response = client.patch(BASE, json={"items": next_items,
                                      "expected_revision": actual["revision"]},
                            headers=build_internal_headers(idempotency_key="edit-other-pack"))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["items"][1] == items[1]
    evidence = read(client, actual["revision"], "edit-other-pack")
    assert evidence["state"] == "confirmed"
    assert evidence["current"]["items"][1] == items[1]


@pytest.mark.parametrize("amount, expected", [
    (99, 99), (0.123456, 0.123456), (0.000001, 0.000001),
    (0.0000006, 0.000001), (0, None), (-1, None), (0.0000001, None),
])
def test_existing_six_decimal_amount_and_round_to_zero_contract(tmp_path, amount, expected):
    _, client = _build_client(tmp_path, providers={})
    original = client.get(BASE, headers=build_internal_headers()).json()["data"]
    original["items"][0]["amount"] = amount
    response = client.patch(BASE, json={"items": original["items"],
                                      "expected_revision": original["revision"]},
                            headers=build_internal_headers(idempotency_key="amount-boundary"))
    assert response.status_code == (400 if expected is None else 200)
    if expected is not None:
        assert response.json()["data"]["items"][0]["amount"] == expected
    else:
        assert response.json()["error_code"] == "service.payment_amount_invalid"
        assert read(client, original["revision"], "amount-boundary")["state"] == "unconfirmed"
