from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.repositories.commercial_access_repository import CommercialAccessRepository
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Principal


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialAccessRepository],
)
def test_access_repository_preserves_membership_and_platform_admin_mutations(
    tmp_path: Path,
    repository_type: type[CommercialAccessRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)

    with get_session(database_url) as session:
        account = Account(
            account_id="acct_access",
            name="Access Account",
            status="active",
            metadata_json=None,
        )
        principal = Principal(
            principal_id="prn_access",
            email="access@example.test",
            status="active",
            session_version=1,
            metadata_json=None,
        )
        session.add_all([account, principal])
        session.flush()
        repository = repository_type(session)
        assert isinstance(repository, CommercialAccessRepository)

        membership = repository.upsert_account_user_membership(
            membership_id="membership_access",
            principal_id=principal.principal_id,
            account_id=account.account_id,
            role="owner",
            metadata_json={"version": 1},
        )
        assert membership.status == "active"
        assert membership.allowed_actions_json == []
        assert (
            repository.upsert_account_user_membership(
                membership_id="ignored-on-update",
                principal_id=principal.principal_id,
                account_id=account.account_id,
                role="owner",
                status="revoked",
                allowed_actions_json=["site.read"],
                metadata_json={"version": 2},
            )
            is membership
        )
        assert membership.membership_id == "membership_access"
        assert membership.role == "owner"
        assert membership.status == "revoked"
        assert membership.allowed_actions_json == ["site.read"]
        assert membership.metadata_json == {"version": 2}

        membership.status = "active"
        session.flush()
        assert repository.revoke_account_user_memberships(principal_id=principal.principal_id) == 1
        assert membership.status == "revoked"
        assert repository.revoke_account_user_memberships(principal_id=principal.principal_id) == 0

        grant = repository.upsert_platform_admin_grant(
            grant_id="grant_access",
            principal_id=principal.principal_id,
            provider="manual",
            external_subject=None,
            email=principal.email,
            role="platform_admin",
            status="active",
            metadata_json={"version": 1},
        )
        assert (
            repository.upsert_platform_admin_grant(
                grant_id="ignored-on-update",
                principal_id=principal.principal_id,
                provider="oidc",
                external_subject="subject-access",
                email="updated@example.test",
                role="platform_admin",
                status="revoked",
                metadata_json={"version": 2},
            )
            is grant
        )
        assert grant.grant_id == "grant_access"
        assert grant.provider == "oidc"
        assert grant.external_subject == "subject-access"
        assert grant.email == "updated@example.test"
        assert grant.status == "revoked"
        assert grant.metadata_json == {"version": 2}
        assert repository.delete_platform_admin_grant(principal_id=principal.principal_id) is True
        assert repository.delete_platform_admin_grant(principal_id=principal.principal_id) is False

    dispose_engine(database_url)
