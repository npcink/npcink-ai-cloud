from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_membership_queries import CommercialMembershipQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountUserMembership,
    Principal,
    PrincipalSiteBinding,
    Site,
    SiteAccountBinding,
)


@pytest.mark.parametrize(
    "query_type",
    [CommercialRepository, CommercialMembershipQueries],
)
def test_membership_queries_preserve_filters_counts_access_and_order(
    tmp_path: Path,
    query_type: type[CommercialMembershipQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{query_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 11, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        account = Account(
            account_id="acct_membership",
            name="Account",
            status="active",
            metadata_json=None,
        )
        principal = Principal(
            principal_id="prn_membership",
            email="member@example.test",
            status="active",
            session_version=1,
            metadata_json=None,
        )
        session.add_all([account, principal])
        session.flush()
        membership = AccountUserMembership(
            membership_id="membership_active",
            principal_id=principal.principal_id,
            account_id=account.account_id,
            role="owner",
            status="active",
            allowed_actions_json=[],
            metadata_json=None,
            created_at=now,
        )
        site = Site(
            site_id="site_membership",
            account_id=account.account_id,
            name="Site",
            status="active",
            site_url="https://member.example.test",
            platform_kind="wordpress",
            metadata_json=None,
            created_at=now,
        )
        session.add_all([membership, site])
        session.flush()
        principal_binding = PrincipalSiteBinding(
            binding_id="principal_binding_active",
            principal_id=principal.principal_id,
            site_id=site.site_id,
            account_id=account.account_id,
            status="active",
            bound_at=now,
            released_at=None,
            release_reason=None,
            metadata_json=None,
        )
        released_old = SiteAccountBinding(
            binding_id="site_binding_old",
            site_id=site.site_id,
            account_id=account.account_id,
            status="released",
            bound_at=now - timedelta(days=3),
            released_at=now - timedelta(days=2),
            cooldown_until=None,
            release_reason="old",
            metadata_json=None,
        )
        released_new = SiteAccountBinding(
            binding_id="site_binding_new",
            site_id=site.site_id,
            account_id=account.account_id,
            status="released",
            bound_at=now - timedelta(days=2),
            released_at=now - timedelta(days=1),
            cooldown_until=None,
            release_reason="new",
            metadata_json=None,
        )
        session.add_all([principal_binding, released_old, released_new])
        session.flush()

        queries = query_type(session)
        assert isinstance(queries, CommercialMembershipQueries)
        assert queries.list_account_user_memberships(principal_ids=[]) == []
        assert queries.list_account_user_memberships(account_ids=[]) == []
        assert queries.list_account_user_memberships(statuses=[]) == []
        assert queries.list_account_user_memberships(
            principal_ids=[principal.principal_id], statuses=["active"]
        ) == [membership]
        assert queries.count_active_account_principals(account_id=account.account_id) == 1
        assert queries.count_active_account_sites(account_id=account.account_id) == 1
        assert (
            queries.count_active_principal_bound_sites(
                account_id=account.account_id,
                principal_id=principal.principal_id,
            )
            == 1
        )
        assert queries.get_account_user_membership(
            principal_id=principal.principal_id,
            account_id=account.account_id,
        ) == (account, principal, membership)
        assert (
            queries.get_account_user_membership(
                principal_id="missing", account_id=account.account_id
            )
            is None
        )
        assert queries.list_accounts_for_principal(principal_id=principal.principal_id) == [
            (account, principal, membership)
        ]
        assert queries.list_sites_for_principal(principal_id=principal.principal_id) == [
            (site, principal, membership)
        ]
        assert queries.get_portal_site_access(
            principal_id=principal.principal_id,
            site_id=site.site_id,
        ) == (site, account, principal, membership, principal_binding)
        assert (
            queries.get_portal_site_access(
                principal_id=principal.principal_id,
                site_id="missing",
            )
            is None
        )
        assert queries.get_latest_released_site_account_binding(site.site_id) is released_new
        assert queries.get_latest_released_site_account_binding("missing") is None

    dispose_engine(database_url)
