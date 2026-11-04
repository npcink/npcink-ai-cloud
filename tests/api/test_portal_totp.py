"""Public Portal factor HTTP consumers on disposable identities."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.api.routes.portal_totp import CHALLENGE_COOKIE
from app.core.db import get_session
from app.core.models import PortalAuthChallenge, PortalRecoveryCode, PortalSession, PortalTotpFactor
from app.core.secrets import decrypt_portal_totp_seed
from app.domain.portal_totp.codec import hotp
from tests.api.test_portal_session_registry import login
from tests.api.test_portal_session_registry import setup as setup


def settings_of(client):
    return client.app.state.services.settings


def proof(url, client, offset=0):
    with get_session(url) as s:
        factor = s.get(PortalTotpFactor, "registry_p")
        seed = decrypt_portal_totp_seed(
            factor.pending_seed_ciphertext
            if factor.state == "disabled"
            else factor.active_seed_ciphertext,
            settings=settings_of(client),
        )
    return hotp(seed, int(datetime.now(UTC).timestamp()) // 30 + offset)


def enable(setup):
    url, client, _ = setup
    old, _, _ = login(setup)
    start = client.post("/portal/v1/totp/setup/start")
    assert start.status_code == 200
    data = start.json()["data"]
    response = client.post(
        "/portal/v1/totp/setup/confirm",
        json={
            "code": proof(url, client),
            "setup_id": data["setup_id"],
        },
    )
    assert response.status_code == 200
    codes = response.json()["data"]["recovery_codes"]
    assert len(codes) == len(set(codes)) == 8
    return old, codes, data


def primary(setup, remember=False):
    _, client, service = setup
    code = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
    return client.post(
        "/portal/v1/auth/code/verify",
        json={
            "email": "registry@example.test",
            "code": code["code"],
            "remember_me": remember,
        },
    )


def test_public_activation_session_replacement_status_and_once_only_codes(setup):
    _, client, _ = setup
    assert client.post("/portal/v1/totp/setup/start").status_code == 401
    old, codes, start = enable(setup)
    current = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    assert bool(current and current != old)
    assert (
        client.get("/portal/v1/session", headers={"Authorization": "Bearer " + old}).status_code
        == 401
    )
    status = client.get("/portal/v1/totp/status")
    assert status.json()["data"] == {"enabled": True, "recovery_codes_remaining": 8}
    assert not any(code in status.text for code in codes)
    replay = client.post(
        "/portal/v1/totp/setup/confirm", json={"setup_id": start["setup_id"], "code": "000000"}
    )
    assert replay.status_code == 401
    assert not any(code in replay.text for code in codes)
    assert client.get("/portal/v1/session").status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"setup_id": "x", "code": ""},
        {"setup_id": "x", "code": "000000", "extra": True},
        {"setup_id": "x" * 65, "code": "000000"},
    ],
)
def test_public_setup_rejects_invalid_body_privately(setup, payload):
    _, client, _ = setup
    login(setup)
    response = client.post("/portal/v1/totp/setup/confirm", json=payload)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("age, accepted", [(299, True), (300, False), (301, False), (-1, False)])
def test_public_setup_exact_primary_freshness_boundary(setup, monkeypatch, age, accepted):
    import app.domain.portal_totp.service as totp_service

    url, client, _ = setup
    login(setup)
    now = datetime.now(UTC).replace(microsecond=0)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now if tz else now.replace(tzinfo=None)

    monkeypatch.setattr(totp_service, "datetime", Clock)
    with get_session(url) as db:
        db.scalar(select(PortalSession)).primary_authenticated_at = now - timedelta(seconds=age)
        db.commit()
    response = client.post("/portal/v1/totp/setup/start")
    assert response.status_code == (200 if accepted else 401)
    if accepted:
        status = client.get("/portal/v1/totp/status")
        assert status.json()["data"] == {"enabled": False, "recovery_codes_remaining": 0}


def test_setup_recovery_method_and_other_tab_setup_id_fail_closed(setup):
    url, client, _ = setup
    login(setup)
    first = client.post("/portal/v1/totp/setup/start").json()["data"]
    second = client.post("/portal/v1/totp/setup/start").json()["data"]
    for setup_id, method in [(first["setup_id"], "totp"), (second["setup_id"], "recovery_code")]:
        response = client.post(
            "/portal/v1/totp/setup/confirm",
            json={
                "setup_id": setup_id,
                "method": method,
                "code": proof(url, client),
            },
        )
        assert response.status_code == 401
    assert client.get("/portal/v1/totp/status").json()["data"]["enabled"] is False


def test_public_setup_requires_fresh_trusted_primary(setup):
    url, client, _ = setup
    login(setup)
    assert client.post("/portal/v1/totp/setup/start").status_code == 200
    with get_session(url) as s:
        row = s.scalar(select(PortalSession))
        row.primary_authenticated_at = datetime.now(UTC) - timedelta(minutes=6)
        s.commit()
    result = client.post("/portal/v1/totp/setup/start")
    assert result.status_code == 401
    assert result.json()["error_code"] == "auth.portal_primary_reauthentication_required"


def test_enabled_primary_is_restricted_no_cookie_bearer_or_account_projection(setup):
    url, client, _ = setup
    old, _, _ = enable(setup)
    with get_session(url) as s:
        before = s.scalar(select(func.count()).select_from(PortalSession))
    response = primary(setup, remember=True)
    assert response.status_code == 200
    assert set(response.json()["data"]) == {"status", "expires_at"}
    assert response.json()["data"]["status"] == "second_factor_required"
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    credential = client.cookies.get(CHALLENGE_COOKIE)
    assert credential and "httponly" in response.headers.get("set-cookie").lower()
    assert client.get("/portal/v1/session").status_code == 401
    assert client.get(
        "/portal/v1/session", headers={"Authorization": "Bearer " + credential}
    ).status_code in (401, 403)
    assert (
        client.get("/portal/v1/session", headers={"Authorization": "Bearer " + old}).status_code
        == 401
    )
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalSession)) == before


def test_recovery_login_single_use_and_no_hash_or_secrets_in_session(setup):
    url, client, _ = setup
    _, codes, _ = enable(setup)
    assert primary(setup).status_code == 200
    response = client.post(
        "/portal/v1/totp/challenge/complete", json={"method": "recovery_code", "code": codes[0]}
    )
    assert response.status_code == 200
    assert client.cookies.get(CHALLENGE_COOKIE) is None
    assert client.get("/portal/v1/session").status_code == 200
    assert codes[0] not in response.text and "code_hash" not in response.text
    with get_session(url) as s:
        assert (
            s.scalar(select(PortalRecoveryCode).where(PortalRecoveryCode.consumed_at.is_not(None)))
            is not None
        )
    primary(setup)
    failed = client.post(
        "/portal/v1/totp/challenge/complete", json={"method": "recovery_code", "code": codes[0]}
    )
    assert failed.status_code == 401


def test_counter_across_setup_login_and_attempt_commit(setup):
    url, client, _ = setup
    enable(setup)
    primary(setup)
    reused = proof(url, client)
    failed = client.post("/portal/v1/totp/challenge/complete", json={"code": reused})
    assert failed.status_code == 401
    with get_session(url) as s:
        row = s.scalar(select(PortalAuthChallenge).where(PortalAuthChallenge.purpose == "login"))
        assert row.attempt_count == 1 and row.consumed_at is None
    successful = client.post(
        "/portal/v1/totp/challenge/complete", json={"code": proof(url, client, 1)}
    )
    assert successful.status_code == 200, successful.text
    with get_session(url) as s:
        row = s.scalar(select(PortalAuthChallenge).where(PortalAuthChallenge.purpose == "login"))
        factor = s.get(PortalTotpFactor, "registry_p")
        assert row.consumed_at is not None
        assert factor.last_accepted_counter >= int(datetime.now(UTC).timestamp()) // 30


@pytest.mark.parametrize("path", ["challenge/complete", "disable/start", "recovery-reset/start"])
def test_sensitive_headers_origin_and_no_receipt(setup, path):
    _, client, _ = setup
    response = client.post(
        "/portal/v1/totp/" + path, json={"code": "000000"}, headers={"Origin": "https://evil.test"}
    )
    assert response.status_code == 403
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["pragma"] == "no-cache"
    assert "Idempotency-Replayed" not in response.headers


@pytest.mark.parametrize("action", ["disable", "recovery-reset"])
def test_management_primary_factor_and_old_generation_invalidation(setup, action):
    url, client, _ = setup
    _, codes, _ = enable(setup)
    current = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    import jwt

    original_exp = jwt.decode(current, options={"verify_signature": False})["exp"]
    with get_session(url) as s:
        factor = s.get(PortalTotpFactor, "registry_p")
        generation, version = factor.recovery_generation, factor.factor_version
        watermark = factor.last_accepted_counter
    start = client.post(f"/portal/v1/totp/{action}/start")
    assert start.status_code == 200
    # Purpose cannot be exchanged for another management command.
    other = "disable" if action == "recovery-reset" else "recovery-reset"
    assert (
        client.post(
            f"/portal/v1/totp/{other}/confirm", json={"code": codes[0], "method": "recovery_code"}
        ).status_code
        == 401
    )
    response = client.post(
        f"/portal/v1/totp/{action}/confirm", json={"code": codes[0], "method": "recovery_code"}
    )
    assert response.status_code == 200
    assert (
        client.get("/portal/v1/session", headers={"Authorization": "Bearer " + current}).status_code
        == 401
    )
    assert client.get("/portal/v1/session").status_code == 200
    assert (
        jwt.decode(
            client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN), options={"verify_signature": False}
        )["exp"]
        == original_exp
    )
    with get_session(url) as s:
        factor = s.get(PortalTotpFactor, "registry_p")
        assert factor.state == ("disabled" if action == "disable" else "enabled")
        if action == "disable":
            assert factor.active_seed_ciphertext is None and factor.last_accepted_counter is None
            assert factor.factor_version == version + 1
        else:
            assert factor.recovery_generation == generation + 1
            assert factor.last_accepted_counter == watermark
            assert len(response.json()["data"]["recovery_codes"]) == 8
    if action == "recovery-reset":
        primary(setup)
        assert (
            client.post(
                "/portal/v1/totp/challenge/complete",
                json={"method": "recovery_code", "code": codes[1]},
            ).status_code
            == 401
        )


@pytest.mark.parametrize("failure", ["sign", "commit"])
@pytest.mark.parametrize("kind", ["setup", "recovery_login", "reset", "disable", "totp_login"])
def test_factor_transaction_failure_rolls_back_all_consumption(setup, monkeypatch, failure, kind):
    from sqlalchemy.orm import Session

    from app.core.models import Principal

    url, client, _ = setup
    if kind == "setup":
        login(setup)
        start = client.post("/portal/v1/totp/setup/start").json()["data"]
        path = "/portal/v1/totp/setup/confirm"
        payload = {"code": proof(url, client), "setup_id": start["setup_id"]}
    else:
        _, codes, _ = enable(setup)
        if kind in ("reset", "disable"):
            action = "recovery-reset" if kind == "reset" else "disable"
            assert client.post(f"/portal/v1/totp/{action}/start").status_code == 200
            path = f"/portal/v1/totp/{action}/confirm"
        else:
            primary(setup)
            path = "/portal/v1/totp/challenge/complete"
        payload = (
            {"code": proof(url, client, 1)}
            if kind == "totp_login"
            else {"method": "recovery_code", "code": codes[0]}
        )

    def state():
        with get_session(url) as s:
            f = s.get(PortalTotpFactor, "registry_p")
            return (
                f.state,
                f.factor_version,
                f.recovery_generation,
                f.last_accepted_counter,
                f.pending_seed_ciphertext,
                f.active_seed_ciphertext,
                s.get(Principal, "registry_p").session_version,
                s.scalar(select(func.count()).select_from(PortalSession)),
                s.scalar(select(func.count()).select_from(PortalRecoveryCode)),
                s.scalar(
                    select(func.count())
                    .select_from(PortalRecoveryCode)
                    .where(PortalRecoveryCode.consumed_at.is_not(None))
                ),
                s.scalar(
                    select(func.count())
                    .select_from(PortalAuthChallenge)
                    .where(PortalAuthChallenge.consumed_at.is_not(None))
                ),
            )

    before = state()
    original_commit = Session.commit

    def fail(*args, **kwargs):
        raise RuntimeError("synthetic T2 failure")

    def commit_fail(session):
        # Persisted request-budget transactions must still complete normally.
        if session.scalar(select(func.count()).select_from(PortalSession)) > before[7]:
            fail()
        return original_commit(session)

    with monkeypatch.context() as patch:
        if failure == "sign":
            patch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
        else:
            patch.setattr(Session, "commit", commit_fail)
        response = client.post(path, json=payload)
        assert response.status_code == 503, response.text
    assert state() == before
    assert client.post(path, json=payload).status_code == 200


@pytest.mark.parametrize("html", [True, False])
def test_qq_enabled_json_html_only_restricted_and_state_consumed(setup, monkeypatch, html):
    from app.api.routes import portal as routes
    from app.core.models import PortalOAuthState
    from tests.api import test_portal_routes as portal

    url, client, service = setup
    enable(setup)
    portal._configure_portal_qq_settings(client, idempotency_prefix="totp-qq")
    service.bind_portal_identity_provider(
        principal_id="registry_p", provider="qq", external_subject="totp-qq"
    )
    monkeypatch.setattr(routes, "_exchange_qq_code", lambda *a, **kw: {"access_token": "mock"})
    monkeypatch.setattr(routes, "_fetch_qq_openid", lambda *a, **kw: {"openid": "totp-qq"})
    start = client.get("/portal/v1/auth/qq/start").json()["data"]
    with get_session(url) as s:
        count = s.scalar(select(func.count()).select_from(PortalSession))
    response = client.get(
        f"/open/auth/qq/callback?code=mock&state={start['state']}",
        headers={"accept": "text/html" if html else "application/json"},
        follow_redirects=False,
    )
    assert response.status_code == (303 if html else 200), response.text
    if html:
        assert response.headers["location"] == "/portal/challenge"
    else:
        assert response.json()["data"]["status"] == "second_factor_required"
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    assert client.cookies.get(CHALLENGE_COOKIE)
    assert response.headers["cache-control"] == "private, no-store"
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalSession)) == count
        assert s.scalar(select(PortalOAuthState)).status == "consumed"


def test_existing_registration_enabled_restricted_and_no_secret_receipt(setup):
    from app.core.models import PortalMutationIdempotencyReceipt

    url, client, service = setup
    _, codes, data = enable(setup)
    code = service.issue_portal_registration_code(email="registry@example.test", ttl_seconds=600)
    response = client.post(
        "/portal/v1/register/verify",
        json={"email": "registry@example.test", "code": code["code"]},
        headers={"Idempotency-Key": "must-not-store-factor"},
    )
    assert (
        response.status_code == 200
        and response.json()["data"]["status"] == "second_factor_required"
    )
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalMutationIdempotencyReceipt)) == 0
    assert data["secret"] not in response.text
    assert all(c not in response.text for c in codes)


def test_signed_mfa_claims_cannot_replace_row_proof(setup):
    import jwt

    url, client, _ = setup
    enable(setup)
    token = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    claims = jwt.decode(token, options={"verify_signature": False})
    claims["mfa_ok"] = True
    claims["factor_version"] = 999
    with get_session(url) as s:
        row = s.get(PortalSession, claims["sid"])
        row.factor_version = row.second_factor_verified_at = row.second_factor_method = None
        s.commit()
    forged = jwt.encode(claims, settings_of(client).portal_jwt_secret, algorithm="HS256")
    assert (
        client.get("/portal/v1/session", headers={"Authorization": "Bearer " + forged}).status_code
        == 401
    )


def test_status_and_primary_budget_cannot_be_reset_by_debug_code_replacement(setup):
    from app.core.models import ReplayReceipt

    url, client, service = setup
    login(setup)
    status = client.get("/portal/v1/totp/status")
    assert status.json()["data"] == {"enabled": False, "recovery_codes_remaining": 0}
    # Seed the persisted budget, not the per-code attempt counter. New code
    # issuance and local debug delivery do not clear this principal window.
    with get_session(url) as s:
        template = s.scalar(
            select(ReplayReceipt).where(ReplayReceipt.scope_kind == "portal_primary_identity")
        )
        assert template is not None
        from fastapi import Request

        from app.api.auth import enforce_portal_primary_verify_rate_limit

        for _ in range(29):
            enforce_portal_primary_verify_rate_limit(
                Request(
                    {
                        "type": "http",
                        "app": client.app,
                        "method": "POST",
                        "path": "/portal/v1/auth/code/verify",
                        "headers": [],
                        "client": ("testclient", 50000),
                    }
                ),
                email="registry@example.test",
            )
    proof_code = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
    response = client.post(
        "/portal/v1/auth/code/verify",
        json={"email": "registry@example.test", "code": proof_code["code"]},
    )
    assert response.status_code == 429
    assert response.json()["error_code"] == "auth.portal_primary_rate_limited"


def test_missing_factor_tombstone_does_not_allow_email_only_fallback(setup):
    url, client, _ = setup
    enable(setup)
    with get_session(url) as s:
        s.delete(s.get(PortalTotpFactor, "registry_p"))
        s.commit()
    assert client.get("/portal/v1/session").status_code == 401
    result = primary(setup)
    assert result.status_code == 503
    assert result.json()["error_code"] == "auth.portal_factor_unavailable"


def test_challenge_status_bootstrap_uses_only_cookie_and_clears_invalid_semantics(setup):
    url, client, _ = setup
    enable(setup)
    response = primary(setup)
    assert response.json()["data"]["status"] == "second_factor_required"
    status = client.get("/portal/v1/totp/challenge/status")
    assert status.status_code == 200
    assert status.json()["data"]["status"] == "second_factor_required"
    assert status.json()["data"]["challenge_status"] == "pending"
    assert "credential" not in status.text and "secret" not in status.text
    assert status.headers["cache-control"] == "private, no-store"

    credential = client.cookies.get(CHALLENGE_COOKIE)
    with get_session(url) as session:
        row = session.get(PortalAuthChallenge, credential.split(".")[0])
        row.created_at = datetime.now(UTC) - timedelta(minutes=10)
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    expired = client.get("/portal/v1/totp/challenge/status")
    assert expired.status_code == 200
    assert expired.json()["data"]["status"] == "second_factor_required"
    assert expired.json()["data"]["challenge_status"] == "expired"
    failed = client.post("/portal/v1/totp/challenge/complete", json={"code": "000000"})
    assert failed.status_code == 401
    assert failed.json()["data"] == {"challenge_status": "terminal"}
    client.cookies.clear()
    missing = client.get("/portal/v1/totp/challenge/status")
    assert missing.status_code == 401
    assert missing.json()["data"] == {"challenge_status": "missing"}


def test_challenge_status_reports_consumed_after_success(setup):
    _, client, _ = setup
    _, codes, _ = enable(setup)
    primary(setup)
    credential = client.cookies.get(CHALLENGE_COOKIE)
    response = client.post(
        "/portal/v1/totp/challenge/complete",
        json={"method": "recovery_code", "code": codes[0]},
    )
    assert response.status_code == 200
    assert 'portal_totp_challenge="";' in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    client.cookies.set(CHALLENGE_COOKIE, credential, path="/")
    status = client.get("/portal/v1/totp/challenge/status")
    assert status.status_code == 200
    assert status.json()["data"]["challenge_status"] == "consumed"


def test_wrong_factor_is_retryable_with_attempts_remaining(setup):
    _, client, _ = setup
    enable(setup)
    primary(setup)
    response = client.post("/portal/v1/totp/challenge/complete", json={"code": "000000"})
    assert response.status_code == 401
    assert response.json()["data"]["challenge_status"] == "retryable"
    assert response.json()["data"]["attempts_remaining"] == 4


def test_wrong_factor_at_attempt_limit_is_terminal(setup):
    _, client, _ = setup
    enable(setup)
    primary(setup)
    for _ in range(4):
        response = client.post("/portal/v1/totp/challenge/complete", json={"code": "000000"})
        assert response.status_code == 401
        assert response.json()["data"]["challenge_status"] == "retryable"
    response = client.post("/portal/v1/totp/challenge/complete", json={"code": "000000"})
    assert response.status_code == 401
    assert response.json()["data"] == {
        "challenge_status": "attempt_limit",
        "attempts_remaining": 0,
    }
    status = client.get("/portal/v1/totp/challenge/status")
    assert status.status_code == 200
    assert status.json()["data"]["challenge_status"] == "attempts_exhausted"
    response = client.post("/portal/v1/totp/challenge/complete", json={"code": "000000"})
    assert response.status_code == 401
    assert response.json()["data"] == {"challenge_status": "terminal"}


@pytest.mark.parametrize("kind", ["email", "qq"])
def test_enabled_primary_commit_failure_preserves_primary_proof_and_no_challenge(
    setup, monkeypatch, kind
):
    from sqlalchemy.orm import Session

    from app.api.routes import portal as routes
    from app.core.models import PortalLoginCode, PortalOAuthState
    from tests.api import test_portal_routes as portal

    url, client, service = setup
    enable(setup)
    if kind == "email":
        code = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)

        def run():
            return client.post(
                "/portal/v1/auth/code/verify",
                json={"email": "registry@example.test", "code": code["code"]},
            )
    else:
        portal._configure_portal_qq_settings(client, idempotency_prefix="totp-qq-rollback")
        service.bind_portal_identity_provider(
            principal_id="registry_p", provider="qq", external_subject="totp-qq-rollback"
        )
        monkeypatch.setattr(routes, "_exchange_qq_code", lambda *a, **kw: {"access_token": "mock"})
        monkeypatch.setattr(
            routes, "_fetch_qq_openid", lambda *a, **kw: {"openid": "totp-qq-rollback"}
        )
        start = client.get("/portal/v1/auth/qq/start").json()["data"]

        def run():
            return client.get(f"/open/auth/qq/callback?code=mock&state={start['state']}")

    model = PortalLoginCode if kind == "email" else PortalOAuthState
    with get_session(url) as s:
        pending = s.scalar(select(model).where(model.status == "pending"))
        proof_id = pending.code_id if kind == "email" else pending.state_id
        before = s.scalar(select(func.count()).select_from(PortalAuthChallenge))
    original = Session.commit

    def fail(session):
        if session.scalar(select(func.count()).select_from(PortalAuthChallenge)) > before:
            raise RuntimeError("synthetic restricted-primary commit failure")
        return original(session)

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail)
        with pytest.raises(RuntimeError):
            run()
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalAuthChallenge)) == before
        proof_row = s.get(model, proof_id)
        assert proof_row.status == "pending" and proof_row.consumed_at is None
    assert run().status_code == 200


def test_restricted_remember_ttl_preserved_and_sensitive_errors_not_cached(setup):
    import jwt

    _, client, _ = setup
    _, codes, _ = enable(setup)
    primary(setup, remember=True)
    ttl = int(client.cookies.get(CHALLENGE_COOKIE).split(".")[2])
    result = client.post(
        "/portal/v1/totp/challenge/complete", json={"method": "recovery_code", "code": codes[0]}
    )
    assert result.status_code == 200
    claims = jwt.decode(
        client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN), options={"verify_signature": False}
    )
    assert claims["exp"] - claims["iat"] == ttl
    for path, method, body in [
        ("/portal/v1/totp/challenge/complete", "post", {}),
        ("/portal/v1/totp/challenge/complete", "get", None),
        ("/portal/v1/totp/setup/start", "get", None),
    ]:
        response = getattr(client, method)(path, **({"json": body} if body is not None else {}))
        assert response.status_code in (405, 422)
        assert response.headers["cache-control"] == "private, no-store"
