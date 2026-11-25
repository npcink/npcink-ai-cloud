from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import select

from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.api.routes import portal as portal_routes
from app.core.db import dispose_engine, get_session
from app.core.models import (
    PORTAL_OAUTH_STATE_STATUS_CONSUMED,
    PORTAL_OAUTH_STATE_STATUS_PENDING,
    PortalOAuthState,
    Principal,
)
from app.domain.commercial.errors import CommercialPermissionError
from app.domain.commercial.service import CommercialService
from app.domain.portal_sessions.service import OAuthLoginProof
from tests.api.test_portal_routes import (
    FakePortalEmailSender,
    _build_client,
    _configure_portal_qq_settings,
    _grant_account_member_access,
    _request_portal_login_code,
    _verify_portal_login_code,
)
from tests.conftest import TEST_PORTAL_JWT_SECRET, build_internal_headers


def _seed_portal_member(client: Any, *, prefix: str, email: str) -> None:
    account_id = f"acct_{prefix}"
    site_id = f"site_{prefix}"
    client.post(
        "/internal/service/accounts",
        json={"account_id": account_id, "name": prefix},
        headers=build_internal_headers(idempotency_key=f"{prefix}-account"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": site_id,
            "account_id": account_id,
            "name": prefix,
            "status": "provisioning",
        },
        headers=build_internal_headers(idempotency_key=f"{prefix}-site"),
    )
    client.post(
        f"/internal/service/sites/{site_id}/activate",
        headers=build_internal_headers(idempotency_key=f"{prefix}-activate"),
    )
    _grant_account_member_access(
        client,
        site_id=site_id,
        email=email,
        idempotency_key=f"{prefix}-member",
    )
    login_code = _request_portal_login_code(
        client,
        email=email,
        headers={"x-npcink-debug-portal-link": "1"},
    )
    _verify_portal_login_code(client, email=email, code=str(login_code["code"]))


def _install_qq_provider(
    monkeypatch: pytest.MonkeyPatch,
    *,
    openid: str,
    unionid: str,
    exchange: Any | None = None,
) -> None:
    monkeypatch.setattr(
        portal_routes,
        "_exchange_qq_code",
        exchange or (lambda request, *, code: {"access_token": f"token-{code}"}),
    )
    monkeypatch.setattr(
        portal_routes,
        "_fetch_qq_openid",
        lambda request, *, access_token: {"openid": openid, "unionid": unionid},
    )
    monkeypatch.setattr(
        portal_routes,
        "_fetch_qq_profile",
        lambda request, *, access_token, openid: {"display_name": "Return To User"},
    )
    monkeypatch.setattr(
        portal_routes,
        "_try_fetch_qq_profile",
        lambda request, *, access_token, openid: {"display_name": "Return To User"},
    )


@pytest.mark.parametrize(
    ("return_to", "expected"),
    [
        ("/portal/../admin", "/portal"),
        ("/portal/%2e%2e/admin", "/portal"),
        ("//evil.example", "/portal"),
        ("https://evil.example/phish", "/portal"),
        ("/portal/account?tab=orders", "/portal/account?tab=orders"),
        ("/portal/" + ("a" * 300), "/portal"),
    ],
)
def test_portal_qq_start_sanitizes_return_to(
    tmp_path: Path,
    return_to: str,
    expected: str,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _configure_portal_qq_settings(client, idempotency_prefix="return-to-start")
    response = client.get("/portal/v1/auth/qq/start", params={"return_to": return_to})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["return_to"] == expected
    dispose_engine(database_url)


def test_portal_qq_callback_retries_after_provider_exchange_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts = {"count": 0}

    def exchange(request: Any, *, code: str) -> dict[str, str]:
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise httpx.ConnectError("provider unavailable")
        return {"access_token": f"token-{code}"}

    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _configure_portal_qq_settings(client, idempotency_prefix="oauth-retry")
    _install_qq_provider(
        monkeypatch,
        openid="qq-openid-retry",
        unionid="qq-union-retry",
        exchange=exchange,
    )
    started = client.get("/portal/v1/auth/qq/start", params={"return_to": "/portal/account"})
    assert started.status_code == 200, started.text
    state = started.json()["data"]["state"]

    first = client.get(f"/open/auth/qq/callback?code=retry-code&state={state}")
    assert first.status_code == 502, first.text
    assert first.json()["error_code"] == "portal.qq_provider_unavailable"
    with get_session(database_url) as session:
        row = session.scalar(select(PortalOAuthState))
        assert row is not None
        assert row.status == PORTAL_OAUTH_STATE_STATUS_PENDING
        assert row.consumed_at is None

    second = client.get(f"/open/auth/qq/callback?code=retry-code&state={state}")
    assert second.status_code == 200, second.text
    assert second.json()["data"]["session"]["transport"] == "cookie"
    with get_session(database_url) as session:
        row = session.scalar(select(PortalOAuthState))
        assert row is not None
        assert row.status == PORTAL_OAUTH_STATE_STATUS_CONSUMED
        assert row.consumed_at is not None
    assert attempts["count"] == 2
    dispose_engine(database_url)


def test_portal_qq_successful_login_callback_replay_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _configure_portal_qq_settings(client, idempotency_prefix="oauth-login-replay")
    _install_qq_provider(
        monkeypatch,
        openid="qq-openid-login-replay",
        unionid="qq-union-login-replay",
    )
    started = client.get("/portal/v1/auth/qq/start", params={"return_to": "/portal/usage"})
    state = started.json()["data"]["state"]
    first = client.get(f"/open/auth/qq/callback?code=login-code&state={state}")
    assert first.status_code == 200, first.text
    replay = client.get(f"/open/auth/qq/callback?code=login-code&state={state}")
    assert replay.status_code in {401, 403}, replay.text
    assert "oauth" in str(replay.json().get("error_code") or "")
    dispose_engine(database_url)


def test_portal_qq_successful_bind_callback_replay_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _configure_portal_qq_settings(client, idempotency_prefix="oauth-bind-replay")
    _install_qq_provider(
        monkeypatch,
        openid="qq-openid-bind-replay",
        unionid="qq-union-bind-replay",
    )
    _seed_portal_member(client, prefix="oauth_bind_replay", email="oauth-bind-replay@example.com")
    started = client.get(
        "/portal/v1/auth/qq/start",
        params={"intent": "bind", "return_to": "/portal/account"},
    )
    assert started.json()["data"]["intent"] == "bind"
    state = started.json()["data"]["state"]
    first = client.get(f"/open/auth/qq/callback?code=bind-code&state={state}")
    assert first.status_code == 200, first.text
    assert first.json()["data"]["status"] == "bound"
    replay = client.get(f"/open/auth/qq/callback?code=bind-code&state={state}")
    assert replay.status_code in {401, 403}, replay.text
    assert "oauth" in str(replay.json().get("error_code") or "")
    dispose_engine(database_url)


def test_portal_oauth_proof_consume_is_atomic_after_entry_lookup(
    tmp_path: Path,
) -> None:
    """consume=False leaves the proof retryable; success consume is one-shot."""
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _configure_portal_qq_settings(client, idempotency_prefix="oauth-proof-consume")
    started = client.get("/portal/v1/auth/qq/start", params={"return_to": "/portal"})
    state = started.json()["data"]["state"]
    nonce = client.cookies.get("npcink_portal_qq_oauth_nonce") or ""
    service = CommercialService(database_url, settings=client.app.state.services.settings)

    first_lookup = service.consume_portal_oauth_state(
        provider="qq",
        state=state,
        nonce=nonce,
        consume=False,
    )
    retry_lookup = service.consume_portal_oauth_state(
        provider="qq",
        state=state,
        nonce=nonce,
        consume=False,
    )
    assert first_lookup["return_to"] == retry_lookup["return_to"] == "/portal"
    with get_session(database_url) as session:
        row = session.scalar(select(PortalOAuthState))
        assert row is not None
        assert row.status == PORTAL_OAUTH_STATE_STATUS_PENDING

    proof = OAuthLoginProof(state, nonce)
    with get_session(database_url) as session:
        proof.consume(session)
        session.commit()
    with get_session(database_url) as session:
        row = session.scalar(select(PortalOAuthState))
        assert row is not None
        assert row.status == PORTAL_OAUTH_STATE_STATUS_CONSUMED
        with pytest.raises(CommercialPermissionError) as replayed:
            proof.consume(session)
        assert replayed.value.error_code == "service.portal_oauth_state_invalid"
    dispose_engine(database_url)


def test_portal_email_change_reports_old_email_notice_failure(
    tmp_path: Path,
) -> None:
    fake_sender = FakePortalEmailSender()
    fake_sender.email_changed_notice_error = "old-email notice unavailable"
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "portal_jwt_secret": TEST_PORTAL_JWT_SECRET,
            "portal_login_code_ttl_seconds": 300,
        },
        portal_email_sender=fake_sender,
    )
    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_email_notice_fail", "name": "Notice Fail"},
        headers=build_internal_headers(idempotency_key="email-notice-fail-account"),
    )
    client.post(
        "/internal/service/sites",
        json={
            "site_id": "site_email_notice_fail",
            "account_id": "acct_email_notice_fail",
            "name": "Notice Fail Site",
            "status": "active",
        },
        headers=build_internal_headers(idempotency_key="email-notice-fail-site"),
    )
    _grant_account_member_access(
        client,
        site_id="site_email_notice_fail",
        email="notice-old@example.com",
        idempotency_key="email-notice-fail-grant",
    )
    login_code = _request_portal_login_code(
        client,
        email="notice-old@example.com",
        headers={"x-npcink-debug-portal-link": "1"},
    )
    _verify_portal_login_code(
        client,
        email="notice-old@example.com",
        code=str(login_code["code"]),
    )
    request_response = client.post(
        "/portal/v1/account/email-change/request",
        json={"new_email": "notice-new@example.com", "locale": "zh-CN"},
        headers={
            "Idempotency-Key": "email-notice-fail-request",
            "x-npcink-dev-login-code": "1",
        },
    )
    assert request_response.status_code == 200, request_response.text
    code = str(request_response.json()["data"]["code"])
    verify_response = client.post(
        "/portal/v1/account/email-change/verify",
        json={"new_email": "notice-new@example.com", "code": code},
        headers={"Idempotency-Key": "email-notice-fail-verify"},
    )
    assert verify_response.status_code == 200, verify_response.text
    verify_data = verify_response.json()["data"]
    assert verify_data["old_email"] == "notice-old@example.com"
    assert verify_data["new_email"] == "notice-new@example.com"
    assert verify_data["old_email_notice_delivered"] is False
    assert all(message["kind"] != "email_changed_notice" for message in fake_sender.messages)
    with get_session(database_url) as session:
        old_identity = session.scalar(
            select(Principal).where(Principal.email == "notice-old@example.com")
        )
        assert old_identity is None
        identity = session.scalar(
            select(Principal).where(Principal.email == "notice-new@example.com")
        )
        assert identity is not None
    dispose_engine(database_url)


def test_portal_logout_clears_session_cookie_with_aligned_attributes(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"portal_jwt_secret": TEST_PORTAL_JWT_SECRET},
    )
    _seed_portal_member(client, prefix="cookie_logout", email="cookie-logout@example.com")
    https_client = client
    response = https_client.post(
        "/portal/v1/logout",
        headers={"x-forwarded-proto": "https"},
    )
    assert response.status_code == 200, response.text
    set_cookie = response.headers.get("set-cookie", "")
    assert COOKIE_PORTAL_SESSION_TOKEN in set_cookie
    assert "Max-Age=0" in set_cookie
    assert "Path=/" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie or "SameSite=Lax" in set_cookie
    assert "Secure" in set_cookie
    dispose_engine(database_url)
