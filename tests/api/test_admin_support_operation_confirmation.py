from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import event, select

from app.api.routes import service as service_routes
from app.core.db import get_engine, get_session
from app.core.models import Account, ReplayReceipt, SupportRequest
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def test_support_confirmation_real_auth_chain_is_select_only_and_retains_replay_guard(
    tmp_path, monkeypatch
):
    deliveries = []
    monkeypatch.setattr(
        service_routes,
        "_send_support_request_update_notification",
        lambda request, *, result: (
            deliveries.append(result["message"]["message_id"]) or {"delivered": True}
        ),
    )
    url, client = _build_client(tmp_path, providers={})
    with get_session(url) as session:
        session.add(Account(account_id="acct_support", name="Synthetic"))
        session.flush()
        session.add(
            SupportRequest(
                request_id="sr_support",
                account_id="acct_support",
                title="Synthetic",
                email="",
                description="Test",
            )
        )
        session.commit()
    path = "/internal/service/admin/support-requests/sr_support"
    headers = build_internal_headers(idempotency_key="same-support-intent")
    response = client.post(
        path + "/messages",
        json={"body": "Synthetic reply", "visibility": "public"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    receipt = response.json()["data"]["operation_receipt"]
    blocked = client.post(
        path + "/messages",
        json={"body": "Synthetic reply", "visibility": "public"},
        headers=headers,
    )
    assert blocked.status_code == 409
    assert blocked.json()["error_code"] == "auth.replay_blocked"
    confirmation = path + "/operations/same-support-intent"
    params = {"action": "message", "digest": receipt["digest"]}
    assert client.get(confirmation, params=params).status_code == 401
    statements = []

    def inspect_sql(conn, cursor, statement, parameters, context, many):
        statements.append(statement.split(None, 1)[0].upper())

    engine = get_engine(url)
    event.listen(engine, "before_cursor_execute", inspect_sql)
    try:
        result = client.get(confirmation, params=params, headers=build_internal_headers())
        assert result.status_code == 200, result.text
        assert result.json()["data"]["state"] == "confirmed"
        assert result.json()["data"]["result"]["message"]["body"] == "Synthetic reply"
        missing = client.get(
            path + "/operations/never-sent", params=params, headers=build_internal_headers()
        )
        assert missing.json()["data"]["state"] == "unconfirmed"
        wrong = client.get(
            confirmation, params={**params, "digest": "a" * 64}, headers=build_internal_headers()
        )
        assert wrong.json()["data"]["state"] == "unconfirmed"
    finally:
        event.remove(engine, "before_cursor_execute", inspect_sql)
    assert statements and set(statements) == {"SELECT"}

    # Expire only the synthetic guard receipt. The next request still traverses
    # normal authorization; durable business dedup survives its replay window.
    with get_session(url) as session:
        for guard in session.scalars(select(ReplayReceipt)):
            guard.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    replay = client.post(
        path + "/messages",
        json={"body": "Synthetic reply", "visibility": "public"},
        headers=headers,
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["data"]["replayed"] is True
    assert (
        replay.json()["data"]["message"]["message_id"]
        == response.json()["data"]["message"]["message_id"]
    )
    assert replay.json()["data"]["notification"]["reason"] == "operation_replayed"
    assert len(deliveries) == 1
    with get_session(url) as session:
        for guard in session.scalars(select(ReplayReceipt)):
            guard.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    conflict = client.post(
        path + "/messages", json={"body": "Changed reply", "visibility": "public"}, headers=headers
    )
    assert conflict.status_code == 409
    assert conflict.json()["error_code"] == "service.support_operation_conflict"
    assert len(deliveries) == 1
