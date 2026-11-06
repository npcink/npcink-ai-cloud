from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.api.routes import portal as portal_routes
from app.core.db import get_session
from app.core.models import Account, AccountSubscription, PortalLoginCode, Principal, ServiceSetting
from app.domain.commercial.errors import CommercialPermissionError
from app.domain.commercial.service import CommercialService
from app.domain.portal_registration import SERVICE_SETTING_PORTAL_REGISTRATION
from tests.api.test_portal_routes import (
    FakePortalEmailSender,
    _build_client,
    _configure_portal_qq_settings,
)
from tests.conftest import build_internal_headers

POLICY_PATH = "/internal/service/admin/service-settings/portal-registration"


def save_policy(client: Any, *, public: bool = False, emails: list[str] | None = None) -> Any:
    response = client.patch(
        POLICY_PATH,
        headers=build_internal_headers(idempotency_key=uuid4().hex),
        json={"public_registration_enabled": public, "email_allowlist": emails or []},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_policy_defaults_validation_and_private_admin_read(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    initial = client.get(
        "/internal/service/admin/service-settings", headers=build_internal_headers()
    ).json()["data"]["settings"]["portal_registration"]
    assert initial["config"] == {"public_registration_enabled": True, "email_allowlist": []}
    valid = {"public_registration_enabled": False, "email_allowlist": []}
    assert client.patch(POLICY_PATH, json=valid).status_code in {401, 403}
    no_key = client.patch(POLICY_PATH, headers=build_internal_headers(), json=valid)
    assert no_key.status_code == 401
    assert no_key.json()["error_code"] == "auth.idempotency_required"
    saved = save_policy(client, emails=[" Tester@Example.com ", "tester@example.com"])
    assert saved["config"] == {
        "public_registration_enabled": False,
        "email_allowlist": ["tester@example.com"],
    }
    for invalid in (
        {"public_registration_enabled": False, "email_allowlist": ["*@example.com"]},
        {"public_registration_enabled": False, "email_allowlist": ["example.com"]},
        {"public_registration_enabled": "false", "email_allowlist": []},
        {"public_registration_enabled": False, "email_allowlist": ["a@example.com"] * 201},
    ):
        assert client.patch(
            POLICY_PATH, headers=build_internal_headers(idempotency_key=uuid4().hex), json=invalid
        ).status_code in {400, 422}
    readback = client.get(
        "/internal/service/admin/service-settings", headers=build_internal_headers()
    ).json()["data"]["settings"]["portal_registration"]
    assert readback["config"] == saved["config"]


def test_closed_registration_sends_no_mail_or_account_and_reopens(tmp_path: Path) -> None:
    sender = FakePortalEmailSender()
    database_url, client = _build_client(tmp_path, portal_email_sender=sender)
    save_policy(client)
    denied = client.post("/portal/v1/register/code/request", json={"email": "new@example.com"})
    assert denied.status_code == 403
    assert denied.json()["error_code"] == "service.portal_registration_closed"
    assert sender.messages == []
    with get_session(database_url) as session:
        for model in (Principal, Account, AccountSubscription, PortalLoginCode):
            assert session.scalar(select(func.count()).select_from(model)) == 0
    save_policy(client, public=True)
    allowed = client.post("/portal/v1/register/code/request", json={"email": "new@example.com"})
    assert allowed.status_code == 200
    assert len(sender.messages) == 1


def test_allowlist_still_requires_mailbox_proof_and_preserves_existing_login(
    tmp_path: Path,
) -> None:
    sender = FakePortalEmailSender()
    database_url, client = _build_client(tmp_path, portal_email_sender=sender)
    save_policy(client, emails=["Tester@Example.com"])
    denied = client.post(
        "/portal/v1/register/code/request", json={"email": "tester+other@example.com"}
    )
    assert denied.status_code == 403
    assert client.post(
        "/portal/v1/register/code/request", json={"email": " TESTER@example.com "}
    ).status_code == 200
    code = str(sender.messages[-1]["code"])
    wrong = "000000" if code != "000000" else "111111"
    assert client.post(
        "/portal/v1/register/verify", json={"email": "tester@example.com", "code": wrong}
    ).status_code == 401
    with get_session(database_url) as session:
        assert session.scalar(select(func.count()).select_from(Account)) == 0
    assert client.post(
        "/portal/v1/register/verify", json={"email": "tester@example.com", "code": code}
    ).status_code == 200
    save_policy(client)  # Removing a member does not revoke their account.
    service = CommercialService(database_url)
    login = service.issue_portal_login_code(email="tester@example.com", ttl_seconds=300)
    assert service.verify_portal_login_code(
        email="tester@example.com", code=str(login["code"]), max_attempts=5
    )["principal_id"]
    existing = service.issue_portal_registration_code(email="tester@example.com", ttl_seconds=300)
    assert service.verify_portal_registration_code(
        email="tester@example.com", code=str(existing["code"]), max_attempts=5
    )["status"] == "existing_user"
    with get_session(database_url) as session:
        assert session.scalar(select(func.count()).select_from(Account)) == 1
        assert session.scalar(select(func.count()).select_from(AccountSubscription)) == 1


@pytest.mark.parametrize("change", ["close", "remove", "malformed"])
def test_outstanding_code_cannot_bypass_current_policy(tmp_path: Path, change: str) -> None:
    database_url, client = _build_client(tmp_path)
    service = CommercialService(database_url)
    if change == "remove":
        save_policy(client, emails=["pending@example.com"])
    issued = service.issue_portal_registration_code(email="pending@example.com", ttl_seconds=300)
    save_policy(client)
    if change == "malformed":
        with get_session(database_url) as session:
            row = session.get(ServiceSetting, SERVICE_SETTING_PORTAL_REGISTRATION)
            assert row is not None
            row.config_json = {"public_registration_enabled": "false", "email_allowlist": []}
            session.commit()
        projected = client.get(
            "/internal/service/admin/service-settings", headers=build_internal_headers()
        ).json()["data"]["settings"]["portal_registration"]
        assert projected["status"] == "error"
        assert projected["config"]["public_registration_enabled"] is False
    with pytest.raises(CommercialPermissionError) as caught:
        service.verify_portal_registration_code(
            email="pending@example.com", code=str(issued["code"]), max_attempts=5
        )
    assert caught.value.error_code == "service.portal_registration_closed"
    with get_session(database_url) as session:
        assert session.scalar(select(func.count()).select_from(Account)) == 0
        assert session.scalar(select(func.count()).select_from(Principal)) == 0
    save_policy(client, emails=["pending@example.com"])
    assert service.verify_portal_registration_code(
        email="pending@example.com", code=str(issued["code"]), max_attempts=5
    )["status"] == "registered"


@pytest.mark.parametrize("html", [False, True])
def test_qq_first_account_blocked_but_existing_binding_can_login(
    tmp_path: Path, monkeypatch: Any, html: bool
) -> None:
    database_url, client = _build_client(tmp_path)
    _configure_portal_qq_settings(client, idempotency_prefix="registration-policy-qq")
    monkeypatch.setattr(
        portal_routes, "_exchange_qq_code", lambda *args, **kw: {"access_token": "x"}
    )
    monkeypatch.setattr(
        portal_routes, "_fetch_qq_openid",
        lambda *args, **kw: {"openid": "qq-policy-test", "unionid": ""},
    )
    monkeypatch.setattr(
        portal_routes, "_fetch_qq_profile",
        lambda *args, **kw: {"display_name": "Tester", "email": "allowed@example.com"},
    )
    save_policy(client, emails=["allowed@example.com"])
    state = client.get("/portal/v1/auth/qq/start").json()["data"]["state"]
    denied = client.get(
        f"/open/auth/qq/callback?code=test&state={state}",
        headers={"accept": "text/html" if html else "application/json"},
        follow_redirects=False,
    )
    if html:
        assert denied.status_code == 303
        assert denied.headers["location"] == "/portal/register?reason=registration_closed"
    else:
        assert denied.status_code == 403
        assert denied.json()["error_code"] == "service.portal_registration_closed"
    with get_session(database_url) as session:
        assert session.scalar(select(func.count()).select_from(Account)) == 0
    service = CommercialService(database_url)
    with pytest.raises(CommercialPermissionError):
        service.register_portal_identity_provider_login(provider="qq", external_subject="direct")
    save_policy(client, public=True)
    registered = service.register_portal_identity_provider_login(
        provider="qq", external_subject="qq-policy-test"
    )
    save_policy(client)
    state = client.get("/portal/v1/auth/qq/start").json()["data"]["state"]
    login = client.get(f"/open/auth/qq/callback?code=test&state={state}")
    assert login.status_code == 200, login.text
    assert login.json()["data"]["session"]["state"] == "active"
    assert registered["status"] == "registered"
