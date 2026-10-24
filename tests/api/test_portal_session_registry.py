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


def _registration_state(url):
    """Read persisted identity/scope/session/proof state without token or OTP material."""
    with get_session(url) as session:
        return {
            "principals": list(
                session.execute(
                    select(
                        Principal.principal_id,
                        Principal.email,
                        Principal.status,
                        Principal.session_version,
                    ).order_by(Principal.principal_id)
                )
            ),
            "accounts": list(
                session.execute(
                    select(Account.account_id, Account.status).order_by(Account.account_id)
                )
            ),
            "memberships": list(
                session.execute(
                    select(
                        AccountUserMembership.membership_id,
                        AccountUserMembership.account_id,
                        AccountUserMembership.principal_id,
                        AccountUserMembership.status,
                    ).order_by(AccountUserMembership.membership_id)
                )
            ),
            "sessions": list(
                session.execute(
                    select(
                        PortalSession.session_id,
                        PortalSession.principal_id,
                        PortalSession.session_version,
                        PortalSession.absolute_expires_at,
                    ).order_by(PortalSession.session_id)
                )
            ),
            "proofs": list(
                session.execute(
                    select(
                        PortalLoginCode.code_id, PortalLoginCode.status, PortalLoginCode.consumed_at
                    ).order_by(PortalLoginCode.code_id)
                )
            ),
        }


@pytest.mark.parametrize("after_change", ["active", "disabled", "closed"])
def test_registration_old_proof_cannot_restore_changed_or_disabled_identity(setup, after_change):
    url, client, service = setup
    if after_change == "closed":
        from app.domain.commercial.identity import USER_ALLOWED_ACTION_MANAGE_BILLING

        with get_session(url) as session:
            session.get(AccountUserMembership, "registry_m").allowed_actions_json = [
                USER_ALLOWED_ACTION_MANAGE_BILLING
            ]
            session.commit()
    login(setup)
    old = service.issue_portal_registration_code(email="registry@example.test", ttl_seconds=600)
    change = service.issue_portal_email_change_code(
        principal_id="registry_p", new_email="new@example.test", ttl_seconds=600
    )
    changed = client.post(
        "/portal/v1/account/email-change/verify",
        headers={"Idempotency-Key": "old-registration-change"},
        json={"new_email": "new@example.test", "code": change["code"]},
    )
    assert changed.status_code == 200, changed.text
    if after_change == "disabled":
        service.disable_admin_portal_user(principal_id="registry_p", reason="local regression")
    elif after_change == "closed":
        closure = service.issue_portal_account_deletion_code(
            principal_id="registry_p", ttl_seconds=600
        )
        closed = client.post(
            "/portal/v1/account/deletion/confirm",
            headers={"Idempotency-Key": "old-registration-close"},
            json={"code": closure["code"]},
        )
        assert closed.status_code == 200, closed.text
    before = _registration_state(url)
    client.cookies.clear()
    response = client.post(
        "/portal/v1/register/verify", json={"email": "registry@example.test", "code": old["code"]}
    )
    assert response.status_code == 401, response.text
    assert response.json()["error_code"] == "auth.portal_registration_code_invalid"
    assert "set-cookie" not in response.headers
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    assert _registration_state(url) == before


def test_registration_proof_must_match_locked_current_email_owner(setup):
    url, client, service = setup
    proof = service.issue_portal_registration_code(email="registry@example.test", ttl_seconds=600)
    with get_session(url) as session:
        session.get(Principal, "registry_p").email = "moved@example.test"
        session.add(
            Principal(principal_id="current_owner", email="registry@example.test", status="active")
        )
        session.commit()
    before = _registration_state(url)
    response = client.post(
        "/portal/v1/register/verify", json={"email": "registry@example.test", "code": proof["code"]}
    )
    assert response.status_code == 401, response.text
    assert "set-cookie" not in response.headers
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    assert _registration_state(url) == before


def test_registration_rejects_reserved_identity_materialized_while_waiting(setup, monkeypatch):
    from app.adapters.repositories.commercial_repository import CommercialRepository

    url, client, service = setup
    proof = service.issue_portal_registration_code(email="reserved@example.test", ttl_seconds=600)
    original = CommercialRepository.list_portal_login_codes
    observed = {}

    def materialize(self, **kwargs):
        if (
            kwargs.get("for_update")
            and kwargs.get("purpose") == "portal_registration"
            and not observed
        ):
            with get_session(url) as session:
                code = session.scalar(
                    select(PortalLoginCode).where(PortalLoginCode.email == "reserved@example.test")
                )
                session.add(
                    Principal(
                        principal_id=code.principal_id,
                        email="already-realized@example.test",
                        status="disabled",
                        session_version=7,
                    )
                )
                session.commit()
            observed["state"] = _registration_state(url)
        return original(self, **kwargs)

    monkeypatch.setattr(CommercialRepository, "list_portal_login_codes", materialize)
    response = client.post(
        "/portal/v1/register/verify", json={"email": "reserved@example.test", "code": proof["code"]}
    )
    assert response.status_code == 401, response.text
    assert "set-cookie" not in response.headers
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    assert observed and _registration_state(url) == observed["state"]


@pytest.mark.parametrize("target", ["unknown_site", "peer_site"])
def test_site_selection_rejects_inaccessible_target_with_envelope_without_rotation(setup, target):
    from app.core.models import Site

    url, client, _ = setup
    with get_session(url) as session:
        session.add(Account(account_id="peer_account", name="Peer", status="active"))
        session.flush()
        session.add(
            Site(site_id="peer_site", account_id="peer_account", name="Peer", status="active")
        )
        session.commit()
    token, claims, _ = login(setup)
    before = _registration_state(url)
    response = client.post("/portal/v1/session/site", json={"site_id": target})
    assert response.status_code == 403, response.text
    assert response.json()["status"] == "error"
    assert response.json()["error_code"] == "portal.site_access_required"
    assert "set-cookie" not in response.headers
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) == token
    current = jwt.decode(
        client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN), options={"verify_signature": False}
    )
    assert (current["sid"], current["exp"]) == (claims["sid"], claims["exp"])
    assert _registration_state(url) == before


def test_registration_insert_conflict_retries_without_overwriting_concurrent_identity(
    setup, monkeypatch
):
    url, client, service = setup
    proof = service.issue_portal_registration_code(
        email="insert-race@example.test", ttl_seconds=600
    )
    original = Session.flush
    observed = {}

    def materialize_before_insert(self, *args, **kwargs):
        pending = next(
            (
                row
                for row in self.new
                if isinstance(row, Principal) and row.email == "insert-race@example.test"
            ),
            None,
        )
        if pending is not None and not observed:
            observed["triggered"] = True
            with get_session(url) as other:
                other.add(
                    Principal(
                        principal_id=pending.principal_id,
                        email="concurrent-owner@example.test",
                        status="disabled",
                        session_version=9,
                    )
                )
                other.commit()
            observed["state"] = _registration_state(url)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Session, "flush", materialize_before_insert)
    response = client.post(
        "/portal/v1/register/verify",
        json={"email": "insert-race@example.test", "code": proof["code"]},
    )
    assert response.status_code == 409, response.text
    assert response.json()["error_code"] == "service.portal_login_scope_changed"
    assert "set-cookie" not in response.headers
    assert client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN) is None
    assert observed and _registration_state(url) == observed["state"]
