"""Complete cutover contracts on disposable local identities, no external delivery."""

from datetime import UTC, datetime

import jwt
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalLoginCode,
    PortalSession,
    Principal,
)
from app.domain.commercial.service import CommercialService
from tests.api import test_portal_routes as portal


@pytest.fixture
def setup(tmp_path):
    url, client = portal._build_client(tmp_path)
    with get_session(url) as s:
        s.add_all(
            [
                Account(account_id="registry_a", name="Registry", status="active"),
                Principal(principal_id="registry_p", email="registry@example.test"),
            ]
        )
        s.flush()
        s.add(
            AccountUserMembership(
                membership_id="registry_m",
                account_id="registry_a",
                principal_id="registry_p",
                status="active",
                role="owner",
            )
        )
        s.commit()
    yield url, client, CommercialService(url)
    client.close()


def login(setup, remember=False):
    url, client, service = setup
    proof = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
    response = client.post(
        "/portal/v1/auth/code/verify",
        json={
            "email": "registry@example.test",
            "code": proof["code"],
            "remember_me": remember,
        },
    )
    assert response.status_code == 200, response.text
    token = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    return token, jwt.decode(token, options={"verify_signature": False}), response


def test_each_login_registers_one_row_and_reads_never_extend(setup):
    url, client, _ = setup
    a, claims, response = login(setup, remember=True)
    with get_session(url) as s:
        rows = list(s.scalars(select(PortalSession)))
        assert len(rows) == 1
        row = rows[0]
        assert row.session_id == claims["sid"] and row.session_version == claims["session_version"]
        assert int(row.created_at.replace(tzinfo=UTC).timestamp()) == claims["iat"]
        assert int(row.absolute_expires_at.replace(tzinfo=UTC).timestamp()) == claims["exp"]
        assert row.client_hint is None
    assert response.json()["data"]["session"]["expires_at"] == datetime.fromtimestamp(
        claims["exp"], UTC
    ).isoformat().replace("+00:00", "Z")
    for _ in range(2):
        assert client.get("/portal/v1/session").status_code == 200
        assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) == a
    b, b_claims, _ = login(setup)
    assert a != b and claims["sid"] != b_claims["sid"]
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalSession)) == 2


def test_logout_revokes_same_cookie_and_bearer_but_leaves_other_login(setup):
    _, client, _ = setup
    a, _, _ = login(setup)
    b, _, _ = login(setup)
    response = client.post("/portal/v1/logout", headers={"Authorization": f"Bearer {a}"})
    assert response.status_code == 200
    assert (
        client.get("/portal/v1/session", headers={"Authorization": f"Bearer {a}"}).status_code
        == 401
    )
    client.cookies.set(COOKIE_PORTAL_SESSION_TOKEN, a)
    assert client.get("/portal/v1/session").status_code == 401
    assert (
        client.get("/portal/v1/session", headers={"Authorization": f"Bearer {b}"}).status_code
        == 200
    )
    assert client.post("/portal/v1/logout").status_code == 200


@pytest.mark.parametrize("failure", ["sign", "commit"])
def test_issue_failure_rolls_back_consumed_code_and_registry(setup, monkeypatch, failure):
    url, client, service = setup
    proof = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
    if failure == "sign":

        def fail(*args, **kwargs):
            raise RuntimeError("synthetic signing failure")

        monkeypatch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
    else:
        original = Session.commit

        def fail(self):
            if self.scalar(select(func.count()).select_from(PortalSession)):
                raise RuntimeError("synthetic commit failure")
            return original(self)

        monkeypatch.setattr(Session, "commit", fail)
    with pytest.raises(RuntimeError):
        client.post(
            "/portal/v1/auth/code/verify",
            json={"email": "registry@example.test", "code": proof["code"]},
        )
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalSession)) == 0
        assert s.scalar(select(PortalLoginCode)).status == "pending"


def test_sidless_unknown_owner_expiry_mismatch_and_db_failure_fail_closed(setup, monkeypatch):
    url, client, _ = setup
    token, claims, _ = login(setup)
    secret = client.app.state.services.settings.portal_jwt_secret
    for update in [{"sid": None}, {"sid": "unknown"}, {"exp": claims["exp"] + 1}, {"sub": "other"}]:
        payload = {**claims, **update}
        if update["sid"] is None if "sid" in update else False:
            payload.pop("sid")
        bad = jwt.encode(payload, secret, algorithm="HS256")
        assert (
            client.get("/portal/v1/session", headers={"Authorization": f"Bearer {bad}"}).status_code
            == 401
        )

    def unavailable(*args, **kwargs):
        raise OperationalError("synthetic", {}, Exception())

    monkeypatch.setattr("app.api.auth.get_session", unavailable)
    response = client.get("/portal/v1/session", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503


@pytest.mark.parametrize("existing", [True, False])
@pytest.mark.parametrize("html", [True, False])
def test_qq_json_html_existing_new_each_commit_one_registry_row(setup, monkeypatch, existing, html):
    from app.api.routes import portal as routes
    from app.core.models import PortalOAuthState

    url, client, service = setup
    portal._configure_portal_qq_settings(client, idempotency_prefix="registry-qq")
    monkeypatch.setattr(routes, "_exchange_qq_code", lambda *a, **kw: {"access_token": "mock"})
    monkeypatch.setattr(
        routes, "_fetch_qq_openid", lambda *a, **kw: {"openid": "registry-qq-subject"}
    )
    monkeypatch.setattr(routes, "_fetch_qq_profile", lambda *a, **kw: {"display_name": "Fixture"})
    if existing:
        service.bind_portal_identity_provider(
            principal_id="registry_p", provider="qq", external_subject="registry-qq-subject"
        )
    start = client.get("/portal/v1/auth/qq/start").json()["data"]
    response = client.get(
        f"/open/auth/qq/callback?code=mock&state={start['state']}",
        headers={"accept": "text/html" if html else "application/json"},
        follow_redirects=False,
    )
    assert response.status_code == (303 if html else 200), response.text
    token = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    claims = jwt.decode(token, options={"verify_signature": False})
    with get_session(url) as session:
        rows = list(session.scalars(select(PortalSession)))
        assert len(rows) == 1 and rows[0].session_id == claims["sid"]
        assert rows[0].auth_method == "qq"
        assert session.scalar(select(PortalOAuthState)).status == "consumed"
    assert client.get("/portal/v1/session").status_code == 200


@pytest.mark.parametrize("failure", ["sign", "commit"])
def test_qq_failure_preserves_state_and_new_identity_transaction(setup, monkeypatch, failure):
    from app.api.routes import portal as routes
    from app.core.models import IdentityProviderBinding, PortalOAuthState

    url, client, _ = setup
    portal._configure_portal_qq_settings(client, idempotency_prefix="registry-qq-failure")
    monkeypatch.setattr(routes, "_exchange_qq_code", lambda *a, **kw: {"access_token": "mock"})
    monkeypatch.setattr(routes, "_fetch_qq_openid", lambda *a, **kw: {"openid": "new-qq-subject"})
    monkeypatch.setattr(routes, "_fetch_qq_profile", lambda *a, **kw: {"display_name": "Fixture"})
    start = client.get("/portal/v1/auth/qq/start").json()["data"]

    def fail(*a, **kw):
        raise RuntimeError("synthetic issuance failure")

    if failure == "sign":
        monkeypatch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
    else:
        original = Session.commit

        def fail_commit(self):
            if self.scalar(select(func.count()).select_from(PortalSession)):
                raise RuntimeError("synthetic commit failure")
            return original(self)

        monkeypatch.setattr(Session, "commit", fail_commit)
    with pytest.raises(RuntimeError):
        client.get(f"/open/auth/qq/callback?code=mock&state={start['state']}")
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    with get_session(url) as session:
        assert session.scalar(select(func.count()).select_from(Principal)) == 1
        assert session.scalar(select(func.count()).select_from(IdentityProviderBinding)) == 0
        assert session.scalar(select(func.count()).select_from(PortalSession)) == 0
        assert session.scalar(select(PortalOAuthState)).status == "pending"


def test_email_change_promotes_current_sid_without_expiry_extension(setup):
    url, client, service = setup
    a, claims_a, _ = login(setup)
    b, claims_b, _ = login(setup)
    proof = service.issue_portal_email_change_code(
        principal_id="registry_p", new_email="registry-new@example.test", ttl_seconds=600
    )
    response = client.post(
        "/portal/v1/account/email-change/verify",
        headers={"Idempotency-Key": "registry-email-change-verify"},
        json={
            "new_email": "registry-new@example.test",
            "code": proof["code"],
        },
    )
    assert response.status_code == 200, response.text
    renewed = client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN)
    claims = jwt.decode(renewed, options={"verify_signature": False})
    assert claims["sid"] == claims_b["sid"] and claims["exp"] == claims_b["exp"]
    assert claims["session_version"] == 2
    with get_session(url) as session:
        assert session.get(PortalSession, claims_b["sid"]).session_version == 2
        assert session.get(PortalSession, claims_a["sid"]).session_version == 1
        assert session.scalar(select(func.count()).select_from(PortalSession)) == 2
    for old in [a, b]:
        assert (
            client.get("/portal/v1/session", headers={"Authorization": f"Bearer {old}"}).status_code
            == 401
        )
    assert (
        client.get("/portal/v1/session", headers={"Authorization": f"Bearer {renewed}"}).status_code
        == 200
    )


@pytest.mark.parametrize("existing", [True, False])
@pytest.mark.parametrize("sign_failure", [True, False])
def test_registration_registry_and_business_commit_together(
    setup, monkeypatch, existing, sign_failure
):
    url, client, service = setup
    email = "registry@example.test" if existing else "registered@example.test"
    proof = service.issue_portal_registration_code(email=email, ttl_seconds=600)
    if sign_failure:

        def fail(*args, **kwargs):
            raise RuntimeError("synthetic registration signing failure")

        monkeypatch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
        with pytest.raises(RuntimeError):
            client.post("/portal/v1/register/verify", json={"email": email, "code": proof["code"]})
        assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    else:
        response = client.post(
            "/portal/v1/register/verify", json={"email": email, "code": proof["code"]}
        )
        assert response.status_code == 200, response.text
        claims = jwt.decode(
            client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN), options={"verify_signature": False}
        )
    with get_session(url) as session:
        rows = list(session.scalars(select(PortalSession)))
        assert len(rows) == (0 if sign_failure else 1)
        if not sign_failure:
            assert rows[0].session_id == claims["sid"]
            assert rows[0].auth_method == "registration"
        assert session.scalar(select(func.count()).select_from(Principal)) == (
            1 if existing or sign_failure else 2
        )
        code = session.scalar(
            select(PortalLoginCode).where(PortalLoginCode.purpose == "portal_registration")
        )
        assert code.status == ("pending" if sign_failure else "consumed")


def test_login_rechecks_email_after_scope_lock_before_consuming_proof(setup, monkeypatch):
    from app.domain.commercial.mixins import _portal_mixin

    url, client, service = setup
    proof = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
    original = _portal_mixin.lock_login_scope

    def changed_email(session, principal_id):
        principal = original(session, principal_id)
        principal.email = "changed@example.test"
        return principal

    monkeypatch.setattr(_portal_mixin, "lock_login_scope", changed_email)
    response = client.post(
        "/portal/v1/auth/code/verify",
        json={"email": "registry@example.test", "code": proof["code"]},
    )
    assert response.status_code == 401
    with get_session(url) as session:
        assert session.scalar(select(PortalLoginCode)).status == "pending"
        assert session.scalar(select(func.count()).select_from(PortalSession)) == 0


def test_scope_change_retries_before_late_account_lock(setup, monkeypatch):
    from app.adapters.repositories.portal_session_repository import PortalSessionRepository
    from app.domain.commercial.errors import CommercialConflictError
    from app.domain.portal_sessions.service import lock_login_scope

    url, _, _ = setup
    original = PortalSessionRepository.lock_principal

    def changed_scope(self, *, principal_id):
        principal = original(self, principal_id=principal_id)
        self.session.add(Account(account_id="new_scope", name="New scope", status="active"))
        self.session.flush()
        self.session.add(
            AccountUserMembership(
                membership_id="new_scope_member",
                account_id="new_scope",
                principal_id=principal_id,
                role="owner",
                status="active",
            )
        )
        self.session.flush()
        return principal

    monkeypatch.setattr(PortalSessionRepository, "lock_principal", changed_scope)
    with pytest.raises(CommercialConflictError) as error, get_session(url) as session:
        lock_login_scope(session, "registry_p")
    assert error.value.status_code == 409
    with get_session(url) as session:
        assert session.get(Account, "new_scope") is None


@pytest.mark.parametrize("failure", ["sign", "commit"])
def test_email_change_failure_rolls_back_code_version_and_current_row(setup, monkeypatch, failure):
    url, client, service = setup
    token, claims, _ = login(setup)
    proof = service.issue_portal_email_change_code(
        principal_id="registry_p", new_email="registry-new@example.test", ttl_seconds=600
    )

    def fail(*args, **kwargs):
        raise RuntimeError("synthetic email-change failure")

    if failure == "sign":
        monkeypatch.setattr("app.domain.portal_sessions.service.build_portal_session_token", fail)
    else:
        original = Session.commit

        def fail_changed_commit(self):
            if (
                self.scalar(
                    select(Principal.session_version).where(Principal.principal_id == "registry_p")
                )
                == 2
            ):
                raise RuntimeError("synthetic email-change commit failure")
            return original(self)

        monkeypatch.setattr(Session, "commit", fail_changed_commit)
    with pytest.raises(RuntimeError):
        client.post(
            "/portal/v1/account/email-change/verify",
            headers={"Idempotency-Key": f"registry-email-fail-{failure}"},
            json={"new_email": "registry-new@example.test", "code": proof["code"]},
        )
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) == token
    with get_session(url) as session:
        principal = session.get(Principal, "registry_p")
        assert principal.email == "registry@example.test" and principal.session_version == 1
        assert session.get(PortalSession, claims["sid"]).session_version == 1
        code = session.scalar(
            select(PortalLoginCode).where(PortalLoginCode.purpose == "portal_email_change")
        )
        assert code.status == "pending"
