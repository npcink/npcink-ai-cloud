from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_portal_auth_repository import (
    CommercialPortalAuthRepository,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import PortalLoginCode, PortalOAuthState, Principal


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialPortalAuthRepository],
)
def test_portal_auth_repository_preserves_login_code_and_identity_semantics(
    tmp_path: Path,
    repository_type: type[CommercialPortalAuthRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}-login.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 14, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        principal = Principal(
            principal_id="prn_portal_auth",
            email="Portal-Auth@Example.Test",
            status="active",
            session_version=1,
            metadata_json=None,
        )
        session.add(principal)
        session.flush()
        repository = repository_type(session)
        assert isinstance(repository, CommercialPortalAuthRepository)

        expiring = repository.create_portal_login_code(
            code_id="code_expiring",
            email="Portal-Auth@Example.Test",
            principal_id=principal.principal_id,
            code_hash="hash-expiring",
            expires_at=now + timedelta(minutes=5),
            metadata_json={"source": "test"},
        )
        active = repository.create_portal_login_code(
            code_id="code_active",
            email="other@example.test",
            principal_id=principal.principal_id,
            code_hash="hash-active",
            purpose="email_change",
            expires_at=now + timedelta(minutes=10),
        )
        expired = repository.create_portal_login_code(
            code_id="code_expired",
            email="expired@example.test",
            principal_id=principal.principal_id,
            code_hash="hash-expired",
            expires_at=now - timedelta(minutes=1),
        )
        expiring.created_at = now - timedelta(minutes=2)
        active.created_at = now
        expired.created_at = now - timedelta(minutes=1)
        session.flush()

        assert expiring.purpose == "portal_login"
        assert expiring.status == "pending"
        assert expiring.consumed_at is None
        assert expiring.attempt_count == 0
        assert (
            repository.get_principal_identity_by_email(email="PORTAL-AUTH@EXAMPLE.TEST")
            is principal
        )
        assert repository.get_principal_identity_by_email(email="   ") is None
        assert repository.list_portal_login_codes(principal_id=principal.principal_id) == [
            active,
            expired,
            expiring,
        ]
        assert repository.list_portal_login_codes(
            email="portal-auth@example.test", purpose="portal_login"
        ) == [expiring]
        assert repository.list_portal_login_codes(active_only=True, now=now) == [
            active,
            expiring,
        ]
        assert repository.list_portal_login_codes(limit=1) == [active]
        assert repository.list_portal_login_codes(limit=0) == [active, expired, expiring]

        assert (
            repository.expire_pending_portal_login_codes(
                email="PORTAL-AUTH@EXAMPLE.TEST",
                purpose="portal_login",
                now=now,
            )
            == 1
        )
        assert expiring.status == "expired"
        assert expiring.consumed_at == now

    dispose_engine(database_url)


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialPortalAuthRepository],
)
def test_portal_auth_repository_preserves_oauth_and_bounded_purge_semantics(
    tmp_path: Path,
    repository_type: type[CommercialPortalAuthRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}-oauth.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 14, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        repository = repository_type(session)
        assert isinstance(repository, CommercialPortalAuthRepository)
        older_code = repository.create_portal_login_code(
            code_id="code_purge_older",
            email="purge-older@example.test",
            principal_id="prn_purge_older",
            code_hash="hash-older",
            expires_at=now - timedelta(days=2),
        )
        newer_code = repository.create_portal_login_code(
            code_id="code_purge_newer",
            email="purge-newer@example.test",
            principal_id="prn_purge_newer",
            code_hash="hash-newer",
            expires_at=now - timedelta(days=1),
        )
        older_state = repository.create_portal_oauth_state(
            state_id="state_purge_older",
            provider="qq",
            state_hash="hash-state-older",
            return_to="",
            client_scope_id="",
            expires_at=now - timedelta(days=2),
            metadata_json={"source": "test"},
        )
        newer_state = repository.create_portal_oauth_state(
            state_id="state_purge_newer",
            provider="qq",
            state_hash="hash-state-newer",
            return_to="/portal",
            client_scope_id="site:one",
            expires_at=now - timedelta(days=1),
        )

        assert older_state.status == "pending"
        assert older_state.return_to is None
        assert older_state.client_scope_id is None
        assert older_state.consumed_at is None
        assert (
            repository.get_portal_oauth_state(provider="qq", state_hash="hash-state-older")
            is older_state
        )
        assert (
            repository.get_portal_oauth_state(provider="wechat", state_hash="hash-state-older")
            is None
        )

        assert repository.purge_expired_portal_auth_evidence(before=now, limit=0) == {
            "portal_login_codes": 1,
            "portal_oauth_states": 1,
        }
        assert session.get(PortalLoginCode, older_code.code_id) is None
        assert session.get(PortalLoginCode, newer_code.code_id) is newer_code
        assert session.get(PortalOAuthState, older_state.state_id) is None
        assert session.get(PortalOAuthState, newer_state.state_id) is newer_state

    dispose_engine(database_url)
