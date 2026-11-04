"""B3a HTTP ownership, transport, private caching and receipt contracts."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.core.db import get_session
from app.core.models import PortalMutationIdempotencyReceipt, PortalSession, Principal
from app.core.secrets import decrypt_portal_idempotency_response
from app.domain.portal_sessions.service import PortalSessionIssuer
from tests.api.test_portal_routes import _build_client

PREFIX = "/portal/v1/sessions"


@pytest.fixture
def setup(tmp_path):
    url, client = _build_client(tmp_path)
    with get_session(url) as session:
        session.add_all(
            [
                Principal(principal_id="own", email="own@example.test"),
                Principal(principal_id="peer", email="peer@example.test"),
            ]
        )
        session.commit()
    yield url, client
    client.close()


def issue(setup, principal="own", ttl=3600):
    url, client = setup
    with get_session(url) as session:
        issued = PortalSessionIssuer(client.app.state.services.settings, ttl, "email_code").issue(
            session, session.get(Principal, principal)
        )
        session.commit()
        return issued


def auth(client, issued, transport):
    client.cookies.clear()
    if transport == "cookie":
        client.cookies.set(COOKIE_PORTAL_SESSION_TOKEN, issued.token)
        return {}
    return {"Authorization": f"Bearer {issued.token}"}


def private(response):
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["pragma"] == "no-cache"
    assert {"Cookie", "Authorization"} <= set(response.headers["vary"].split(", "))
    return response


def snapshot(url):
    with get_session(url) as session:
        return list(
            session.execute(
                select(
                    PortalSession.session_id,
                    PortalSession.session_version,
                    PortalSession.absolute_expires_at,
                    PortalSession.revoked_at,
                    PortalSession.revoke_reason,
                ).order_by(PortalSession.session_id)
            )
        )


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_list_own_active_stable_pagination_without_site_or_account_owner(setup, transport):
    url, client = setup
    caller, a, b = [issue(setup) for _ in range(3)]
    peer = issue(setup, "peer")
    expired, old, revoked = [issue(setup) for _ in range(3)]
    with get_session(url) as session:
        same_time = datetime.now(UTC) - timedelta(minutes=1)
        for row in session.scalars(select(PortalSession)):
            row.created_at = same_time
        session.get(PortalSession, expired.session_id).absolute_expires_at = datetime.now(
            UTC
        ) - timedelta(seconds=1)
        session.get(PortalSession, old.session_id).session_version = 9
        session.get(PortalSession, revoked.session_id).revoked_at = datetime.now(UTC)
        session.get(PortalSession, revoked.session_id).revoke_reason = "fixture"
        session.commit()
    before = snapshot(url)
    headers = auth(client, caller, transport)
    responses = [
        private(client.get(PREFIX, params={"limit": 1, "offset": offset}, headers=headers))
        for offset in range(4)
    ]
    assert all(response.status_code == 200 for response in responses)
    expected = sorted([caller.session_id, a.session_id, b.session_id], reverse=True)
    items = [r.json()["data"]["items"][0] for r in responses[:3]]
    assert [item["session_id"] for item in items] == expected
    assert responses[-1].json()["data"]["items"] == []
    assert responses[0].json()["data"]["pagination"] == {"limit": 1, "offset": 0, "total": 3}
    assert {"trace_id", "revision"} <= responses[0].json()["meta"].keys()
    for item in items:
        assert set(item) == {
            "session_id",
            "is_current",
            "created_at",
            "expires_at",
            "auth_method",
            "client_hint",
        }
        assert item["is_current"] == (item["session_id"] == caller.session_id)
        assert item["client_hint"] is None
        assert peer.session_id != item["session_id"]
    assert snapshot(url) == before
    assert "set-cookie" not in responses[0].headers


@pytest.mark.parametrize("target_kind", ["missing", "peer", "owned"])
def test_single_revoke_ownership_same_target_idempotency_and_receipts(setup, target_kind):
    url, client = setup
    caller = issue(setup)
    target = issue(setup, "peer" if target_kind == "peer" else "own")
    target_id = "unknown" if target_kind == "missing" else target.session_id
    headers = {**auth(client, caller, "bearer"), "Idempotency-Key": "single"}
    path = f"{PREFIX}/{target_id}/revoke"
    first = private(client.post(path, headers=headers))
    assert first.status_code == (200 if target_kind == "owned" else 404), first.text
    replay = private(client.post(path, headers=headers))
    assert replay.status_code == first.status_code and replay.content == first.content
    assert replay.headers["idempotency-replayed"] == "true"
    if target_kind == "owned":
        again = private(client.post(path, headers={**headers, "Idempotency-Key": "another"}))
        assert again.json()["data"]["revoked_count"] == 0
    with get_session(url) as session:
        row = session.get(PortalSession, target.session_id)
        assert (row.revoked_at is not None) == (target_kind == "owned")
        assert session.get(PortalSession, caller.session_id).revoked_at is None
        assert session.get(Principal, "own").session_version == 1
        for receipt in session.scalars(select(PortalMutationIdempotencyReceipt)):
            body = decrypt_portal_idempotency_response(
                receipt.response_body_ciphertext, settings=client.app.state.services.settings
            )
            assert caller.token.encode() not in body
            assert json.loads(body) == first.json() or (
                target_kind == "owned" and json.loads(body)["data"] == {"revoked_count": 0}
            )
            if target_kind == "owned":
                assert set(json.loads(body)["data"]) == {"revoked_count"}


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_self_revoke_clears_cookie_and_both_transports_then_blocks_receipt_replay(setup, transport):
    url, client = setup
    caller, other = issue(setup), issue(setup)
    headers = {**auth(client, caller, transport), "Idempotency-Key": "self"}
    path = f"{PREFIX}/{caller.session_id}/revoke"
    response = private(client.post(path, headers=headers))
    assert response.status_code == 200
    assert "Max-Age=0" in response.headers["set-cookie"]
    for mode in ("cookie", "bearer"):
        old_headers = {**auth(client, caller, mode), "Idempotency-Key": "self"}
        assert private(client.get(PREFIX, headers=old_headers)).status_code == 401
        retry = private(client.post(path, headers=old_headers))
        assert retry.status_code == 401 and "idempotency-replayed" not in retry.headers
    assert client.get(PREFIX, headers=auth(client, other, "bearer")).status_code == 200
    with get_session(url) as session:
        assert session.get(Principal, "own").session_version == 1
        assert session.get(PortalSession, caller.session_id).revoked_at is not None
        assert session.get(PortalSession, other.session_id).revoked_at is None


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_revoke_others_keeps_current_and_version_and_does_not_touch_peer(setup, transport):
    url, client = setup
    caller, other, peer = issue(setup), issue(setup), issue(setup, "peer")
    original_expiry = caller.expires_at
    response = private(
        client.post(
            f"{PREFIX}/revoke-others",
            headers={**auth(client, caller, transport), "Idempotency-Key": "others"},
        )
    )
    assert response.status_code == 200 and response.json()["data"] == {"revoked_count": 1}
    assert "set-cookie" not in response.headers
    assert client.get(PREFIX, headers=auth(client, caller, transport)).status_code == 200
    assert client.get(PREFIX, headers=auth(client, other, "bearer")).status_code == 401
    assert client.get(PREFIX, headers=auth(client, peer, "bearer")).status_code == 200
    with get_session(url) as session:
        assert session.get(Principal, "own").session_version == 1
        row = session.get(PortalSession, caller.session_id)
        assert (
            row.revoked_at is None
            and row.absolute_expires_at.replace(tzinfo=UTC) == original_expiry
        )


@pytest.mark.parametrize("query", ["limit=0", "limit=51", "offset=-1", "limit=x", "limit=true"])
def test_pagination_errors_private(setup, query):
    _, client = setup
    response = private(
        client.get(f"{PREFIX}?{query}", headers=auth(client, issue(setup), "bearer"))
    )
    assert response.status_code == 400 and response.json()["status"] == "error"


@pytest.mark.parametrize(
    "method,path", [("post", ""), ("get", "/revoke-others"), ("delete", "/unknown/revoke")]
)
def test_405_private(setup, method, path):
    _, client = setup
    assert private(getattr(client, method)(PREFIX + path)).status_code == 405


def test_auth_origin_idempotency_and_early_failures_are_private(setup):
    url, client = setup
    caller = issue(setup)
    assert private(client.get(PREFIX)).status_code == 401
    headers = auth(client, caller, "cookie")
    path = f"{PREFIX}/revoke-others"
    assert private(client.post(path, headers=headers)).status_code == 401  # missing receipt key
    response = private(
        client.post(
            path, headers={**headers, "Origin": "https://evil.example", "Idempotency-Key": "origin"}
        )
    )
    assert response.status_code == 403
    assert (
        private(client.get(PREFIX, headers={"x-forwarded-host": "untrusted.invalid"})).status_code
        == 400
    )
    with get_session(url) as session:
        assert (
            session.scalar(select(func.count()).select_from(PortalMutationIdempotencyReceipt)) == 0
        )


@pytest.mark.parametrize("replay", [False, True])
@pytest.mark.parametrize("invalidated", ["revoked", "expired", "version"])
def test_write_and_receipt_replay_revalidate_original_caller_under_lock(
    setup, monkeypatch, replay, invalidated
):
    from app.api.routes import portal_sessions as routes

    url, client = setup
    caller, target = issue(setup), issue(setup)
    headers = {**auth(client, caller, "bearer"), "Idempotency-Key": "race"}
    path = f"{PREFIX}/{target.session_id}/revoke"
    if replay:
        assert client.post(path, headers=headers).status_code == 200
    before = snapshot(url)
    original = routes.resolve_portal_request_context

    async def invalidate_after_auth(*args, **kwargs):
        context = await original(*args, **kwargs)
        with get_session(url) as session:
            row = session.get(PortalSession, caller.session_id)
            if invalidated == "revoked":
                row.revoked_at, row.revoke_reason = datetime.now(UTC), "fixture"
            elif invalidated == "expired":
                row.created_at = datetime.now(UTC) - timedelta(hours=2)
                row.absolute_expires_at = datetime.now(UTC) - timedelta(hours=1)
            else:
                session.get(Principal, "own").session_version = 2
            session.commit()
        return context

    monkeypatch.setattr(routes, "resolve_portal_request_context", invalidate_after_auth)
    response = private(client.post(path, headers=headers))
    assert response.status_code == 401 and "idempotency-replayed" not in response.headers
    with get_session(url) as session:
        target_row = session.get(PortalSession, target.session_id)
        old = next(row for row in before if row.session_id == target.session_id)
        assert target_row.revoked_at == old.revoked_at


@pytest.mark.parametrize("operation", ["list", "write"])
def test_database_fault_fails_closed_no_sensitive_error(setup, monkeypatch, operation):
    from app.domain.portal_sessions import service

    _, client = setup
    caller = issue(setup)

    def fail(*args, **kwargs):
        raise OperationalError("PRIVATE-SQL", {}, RuntimeError("PRIVATE-DETAIL"))

    monkeypatch.setattr(service, "get_session", fail)
    headers = {**auth(client, caller, "bearer"), "Idempotency-Key": "db-fail"}
    response = private(
        client.get(PREFIX, headers=headers)
        if operation == "list"
        else client.post(f"{PREFIX}/revoke-others", headers=headers)
    )
    assert response.status_code == 503
    assert "PRIVATE" not in response.text


@pytest.mark.parametrize("failure", ["commit", "unexpected", "replay_database"])
def test_command_faults_are_private_and_do_not_partially_revoke(setup, monkeypatch, failure):
    from sqlalchemy.orm import Session

    from app.api.routes import portal_sessions as routes
    from app.domain.portal_sessions import service

    url, client = setup
    caller, target = issue(setup), issue(setup)
    headers = {**auth(client, caller, "bearer"), "Idempotency-Key": "fault"}
    path = f"{PREFIX}/{target.session_id}/revoke"
    if failure == "replay_database":
        assert client.post(path, headers=headers).status_code == 200
    before = snapshot(url)
    with monkeypatch.context() as injected:
        if failure == "commit":
            original = Session.commit

            def fail_commit(session):
                if any(isinstance(row, PortalSession) for row in session.dirty):
                    session.flush()  # prove a flushed write still rolls back
                    raise OperationalError("PRIVATE-SQL", {}, RuntimeError("PRIVATE-DETAIL"))
                return original(session)

            injected.setattr(Session, "commit", fail_commit)
        elif failure == "unexpected":

            def fail(*args, **kwargs):
                raise RuntimeError("PRIVATE-DETAIL")

            injected.setattr(routes, "revoke_principal_sessions", fail)
        else:

            def fail(*args, **kwargs):
                raise OperationalError("PRIVATE-SQL", {}, RuntimeError("PRIVATE-DETAIL"))

            injected.setattr(service, "get_session", fail)
        response = private(client.post(path, headers=headers))
    assert response.status_code == 503 and "PRIVATE" not in response.text
    assert "idempotency-replayed" not in response.headers
    assert snapshot(url) == before


def test_receipt_from_self_revoke_does_not_clear_a_different_callers_cookie(setup):
    _, client = setup
    caller, survivor = issue(setup), issue(setup)
    path = f"{PREFIX}/{caller.session_id}/revoke"
    first = client.post(
        path, headers={**auth(client, caller, "cookie"), "Idempotency-Key": "shared"}
    )
    assert first.status_code == 200 and "set-cookie" in first.headers
    replay = private(
        client.post(path, headers={**auth(client, survivor, "cookie"), "Idempotency-Key": "shared"})
    )
    assert replay.status_code == 200 and replay.headers["idempotency-replayed"] == "true"
    assert "set-cookie" not in replay.headers
    assert client.get(PREFIX).status_code == 200


def test_private_middleware_preserves_existing_vary():
    from fastapi.testclient import TestClient
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    from app.api.routes.portal_sessions import PortalSessionsCacheMiddleware

    async def downstream(request):
        return JSONResponse({}, headers={"Vary": "Origin, Accept-Encoding"})

    app = Starlette(routes=[Route(PREFIX, downstream)])
    with TestClient(PortalSessionsCacheMiddleware(app)) as client:
        response = private(client.get(PREFIX))
    assert {"Origin", "Accept-Encoding"} <= set(response.headers["vary"].split(", "))


def test_receipt_persistence_failure_is_private_and_committed_revoke_is_not_undone(
    setup, monkeypatch
):
    from app.api import portal_idempotency_middleware

    url, client = setup
    caller, target = issue(setup), issue(setup)
    headers = {**auth(client, caller, "bearer"), "Idempotency-Key": "receipt-fault"}
    path = f"{PREFIX}/{target.session_id}/revoke"

    def fail(*args, **kwargs):
        raise OperationalError("synthetic receipt SQL", {}, RuntimeError("synthetic failure"))

    with monkeypatch.context() as injected:
        injected.setattr(portal_idempotency_middleware, "complete_portal_mutation", fail)
        response = private(client.post(path, headers=headers))
    assert response.status_code == 503
    assert response.json()["error_code"] == "portal.idempotency_persist_failed"
    with get_session(url) as session:
        assert session.get(PortalSession, target.session_id).revoked_at is not None
        assert session.get(PortalSession, caller.session_id).revoked_at is None
    retry = private(client.post(path, headers={**headers, "Idempotency-Key": "fresh"}))
    assert retry.status_code == 200 and retry.json()["data"] == {"revoked_count": 0}
