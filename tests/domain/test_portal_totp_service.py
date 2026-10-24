"""State and UoW readback. SQLite does not prove PostgreSQL serialization."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import func, select

from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.api.routes.portal_totp import CHALLENGE_COOKIE
from app.core.db import get_session
from app.core.models import (
    PortalAuthChallenge,
    PortalRecoveryCode,
    PortalSession,
    PortalTotpFactor,
    Principal,
)
from app.domain.commercial.errors import CommercialServiceError
from app.domain.portal_sessions.service import AuthenticatedSession, revoke_principal_sessions
from app.domain.portal_totp import service as totp
from tests.api import test_portal_totp as api
from tests.api.test_portal_session_registry import setup as setup


def identity(client):
    claims = jwt.decode(
        client.cookies.get(COOKIE_PORTAL_SESSION_TOKEN), options={"verify_signature": False}
    )
    return AuthenticatedSession(
        claims["sub"],
        claims["sid"],
        claims["session_version"],
        datetime.fromtimestamp(claims["exp"], UTC),
    )


@pytest.mark.parametrize(
    "damage",
    [
        "expired",
        "attempts",
        "primary_stale",
        "principal_version",
        "factor_version",
        "generation",
        "principal_disabled",
        "credential_tamper",
    ],
)
def test_login_bindings_reject_without_partial_consumption(setup, damage):
    url, client, _ = setup
    _, codes, _ = api.enable(setup)
    api.primary(setup)
    credential = client.cookies.get(CHALLENGE_COOKIE)
    challenge_id = credential.split(".")[0]
    with get_session(url) as s:
        row = s.get(PortalAuthChallenge, challenge_id)
        if damage == "expired":
            row.created_at = datetime.now(UTC) - timedelta(minutes=10)
            row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        elif damage == "attempts":
            row.attempt_count = row.attempt_limit
        elif damage == "primary_stale":
            row.primary_authenticated_at = datetime.now(UTC) - timedelta(minutes=6)
        elif damage == "principal_version":
            s.get(Principal, "registry_p").session_version += 1
        elif damage == "factor_version":
            s.get(PortalTotpFactor, "registry_p").factor_version += 1
        elif damage == "generation":
            s.get(PortalTotpFactor, "registry_p").recovery_generation += 1
        elif damage == "principal_disabled":
            s.get(Principal, "registry_p").status = "disabled"
        s.commit()
        count = s.scalar(select(func.count()).select_from(PortalSession))
    if damage == "credential_tamper":
        credential = credential[:-1] + ("1" if credential[-1] != "1" else "2")
    with pytest.raises(CommercialServiceError):
        totp.complete(
            api.settings_of(client), credential, codes[0], purpose="login", method="recovery_code"
        )
    with get_session(url) as s:
        assert s.get(PortalAuthChallenge, challenge_id).consumed_at is None
        assert s.get(PortalRecoveryCode, codes[0].split(".")[0]).consumed_at is None
        assert s.scalar(select(func.count()).select_from(PortalSession)) == count


def test_principal_attempt_budget_survives_replacement_challenges(setup):
    url, client, _ = setup
    api.enable(setup)
    for _batch in range(3):
        api.primary(setup)
        credential = client.cookies.get(CHALLENGE_COOKIE)
        for _ in range(5):
            with pytest.raises(CommercialServiceError) as error:
                totp.complete(
                    api.settings_of(client),
                    credential,
                    "nonexistent.secret",
                    purpose="login",
                    method="recovery_code",
                )
            assert error.value.status_code == 401
    with get_session(url) as s:
        assert s.scalar(select(func.sum(PortalAuthChallenge.attempt_count))) == 15
        count = s.scalar(select(func.count()).select_from(PortalAuthChallenge))
    with pytest.raises(CommercialServiceError) as error:
        # Call domain primary issuer path; its budget error rolls back email proof.
        service = setup[2]
        proof = service.issue_portal_login_code(email="registry@example.test", ttl_seconds=600)
        from app.domain.portal_sessions.service import PortalSessionIssuer

        service.verify_portal_login_code(
            email="registry@example.test",
            code=proof["code"],
            max_attempts=5,
            session_issuer=PortalSessionIssuer(api.settings_of(client), 3600, "email_code"),
        )
    assert error.value.status_code == 429
    with get_session(url) as s:
        assert s.scalar(select(func.count()).select_from(PortalAuthChallenge)) == count


def test_new_pending_invalidates_old_setup_without_disclosing_old_seed(setup):
    url, client, _ = setup
    api.login(setup)
    caller = identity(client)
    first = totp.start_management(api.settings_of(client), caller, "setup")
    second = totp.start_management(api.settings_of(client), caller, "setup")
    assert first["setup_id"] != second["setup_id"]
    with pytest.raises(CommercialServiceError):
        totp.complete(
            api.settings_of(client),
            first["_challenge"].credential,
            api.proof(url, client),
            purpose="setup",
            identity=caller,
            setup_id=second["setup_id"],
        )
    result = totp.complete(
        api.settings_of(client),
        second["_challenge"].credential,
        api.proof(url, client),
        purpose="setup",
        identity=caller,
        setup_id=second["setup_id"],
    )
    assert len(result["recovery_codes"]) == 8


@pytest.mark.parametrize("mode", ["single", "others"])
def test_sid_revoke_invalidates_only_bound_management_not_fresh_login(setup, mode):
    url, client, _ = setup
    _, codes, _ = api.enable(setup)
    original = identity(client)
    management = totp.start_management(api.settings_of(client), original, "disable")
    api.primary(setup)
    issued = totp.complete(
        api.settings_of(client),
        client.cookies.get(CHALLENGE_COOKIE),
        codes[0],
        purpose="login",
        method="recovery_code",
    )["_portal_session"]
    other = AuthenticatedSession(
        issued.principal_id, issued.session_id, issued.session_version, issued.expires_at
    )
    # A brand new pending login has no SID. It survives individual/others revoke.
    api.primary(setup)
    login_credential = client.cookies.get(CHALLENGE_COOKIE)
    revoke_principal_sessions(
        url, other, target_session_id=original.session_id if mode == "single" else None
    )
    with pytest.raises(CommercialServiceError):
        totp.complete(
            api.settings_of(client),
            management["_challenge"].credential,
            codes[1],
            purpose="disable",
            method="recovery_code",
            identity=original,
        )
    result = totp.complete(
        api.settings_of(client), login_credential, codes[1], purpose="login", method="recovery_code"
    )
    assert result["_portal_session"].session_version == other.session_version
    with get_session(url) as s:
        assert (
            s.get(
                PortalAuthChallenge, management["_challenge"].credential.split(".")[0]
            ).consumed_at
            is None
        )
        assert s.get(PortalRecoveryCode, codes[1].split(".")[0]).consumed_at is not None


def test_commit_then_response_loss_does_not_reissue_or_restore_code(setup):
    url, client, _ = setup
    _, codes, _ = api.enable(setup)
    api.primary(setup)
    credential = client.cookies.get(CHALLENGE_COOKIE)
    result = totp.complete(
        api.settings_of(client), credential, codes[0], purpose="login", method="recovery_code"
    )
    sid = result["_portal_session"].session_id
    with get_session(url) as s:
        count = s.scalar(select(func.count()).select_from(PortalSession))
    # Simulated lost response: the client never adopts result or receives a secret receipt.
    with pytest.raises(CommercialServiceError):
        totp.complete(
            api.settings_of(client), credential, codes[0], purpose="login", method="recovery_code"
        )
    with get_session(url) as s:
        assert s.get(PortalSession, sid) is not None
        assert s.scalar(select(func.count()).select_from(PortalSession)) == count
        assert s.get(PortalRecoveryCode, codes[0].split(".")[0]).consumed_at is not None


def test_clock_is_refreshed_after_waiting_challenge_lock(setup, monkeypatch):
    from app.adapters.repositories.portal_totp_repository import PortalTotpRepository

    url, client, _ = setup
    _, codes, _ = api.enable(setup)
    api.primary(setup)
    credential = client.cookies.get(CHALLENGE_COOKIE)
    real_time = datetime.now(UTC)
    elapsed = [0]
    original = PortalTotpRepository.lock_challenge_owned

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return real_time + timedelta(seconds=elapsed[0])

    def waited(repository, **kwargs):
        result = original(repository, **kwargs)
        elapsed[0] = 301
        return result

    monkeypatch.setattr(totp, "datetime", Clock)
    monkeypatch.setattr(PortalTotpRepository, "lock_challenge_owned", waited)
    with pytest.raises(CommercialServiceError):
        totp.complete(
            api.settings_of(client), credential, codes[0], purpose="login", method="recovery_code"
        )
    with get_session(url) as s:
        assert s.get(PortalRecoveryCode, codes[0].split(".")[0]).consumed_at is None
        assert s.get(PortalAuthChallenge, credential.split(".")[0]).consumed_at is None


def test_missing_factor_cannot_be_reinitialized_by_management_uow(setup):
    url, client, _ = setup
    api.enable(setup)
    caller = identity(client)
    with get_session(url) as s:
        s.delete(s.get(PortalTotpFactor, "registry_p"))
        s.commit()
    with pytest.raises(CommercialServiceError) as error:
        totp.start_management(api.settings_of(client), caller, "setup")
    assert error.value.status_code == 503
    with get_session(url) as s:
        assert s.get(PortalTotpFactor, "registry_p") is None
