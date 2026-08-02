from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_identity_queries import CommercialIdentityQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountSubscription,
    AccountUserMembership,
    IdentityProviderBinding,
    Principal,
    Site,
)


@pytest.mark.parametrize(
    "query_type",
    [CommercialRepository, CommercialIdentityQueries],
)
def test_identity_directory_query_preserves_filters_summary_search_and_pagination(
    tmp_path: Path,
    query_type: type[CommercialIdentityQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{query_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 10, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        alpha_account = Account(
            account_id="acct_directory_alpha",
            name="Alpha account",
            status="active",
            metadata_json={"source": "portal_self_registration"},
            created_at=now,
        )
        beta_account = Account(
            account_id="acct_directory_beta",
            name="Beta account",
            status="active",
            metadata_json={"source": "account_membership"},
            created_at=now - timedelta(days=1),
        )
        alpha = Principal(
            principal_id="prn_directory_alpha",
            email="alpha@example.test",
            status="active",
            session_version=1,
            metadata_json={"source": "portal_self_registration"},
            created_at=now,
        )
        beta = Principal(
            principal_id="prn_directory_beta",
            email="beta@example.test",
            status="disabled",
            session_version=1,
            metadata_json={"source": "account_membership"},
            created_at=now - timedelta(days=1),
        )
        session.add_all([alpha_account, beta_account, alpha, beta])
        session.flush()
        session.add_all(
            [
                AccountUserMembership(
                    membership_id="membership_directory_alpha",
                    principal_id=alpha.principal_id,
                    account_id=alpha_account.account_id,
                    role="owner",
                    status="active",
                    allowed_actions_json=[],
                    metadata_json={"source": "portal_self_registration"},
                    created_at=now,
                ),
                AccountUserMembership(
                    membership_id="membership_directory_beta",
                    principal_id=beta.principal_id,
                    account_id=beta_account.account_id,
                    role="owner",
                    status="active",
                    allowed_actions_json=[],
                    metadata_json={"source": "account_membership"},
                    created_at=now - timedelta(days=1),
                ),
                Site(
                    site_id="site_directory_alpha",
                    account_id=alpha_account.account_id,
                    name="Alpha site",
                    status="active",
                    site_url="https://alpha.example.test",
                    platform_kind="wordpress",
                    metadata_json={"source": "portal_self_registration"},
                    created_at=now,
                ),
                AccountSubscription(
                    subscription_id="sub_directory_alpha",
                    account_id=alpha_account.account_id,
                    plan_id="pro",
                    plan_version_id="pro-v1",
                    status="active",
                    metadata_json={"tier_id": "pro", "package_alias": "Pro"},
                    created_at=now,
                ),
                IdentityProviderBinding(
                    binding_id="binding_directory_alpha",
                    principal_id=alpha.principal_id,
                    provider="qq",
                    external_subject_hash="subject_directory_alpha",
                    unionid_hash=None,
                    status="active",
                    metadata_json=None,
                    last_login_at=now,
                    created_at=now,
                ),
            ]
        )
        session.flush()

        queries = query_type(session)
        assert isinstance(queries, CommercialIdentityQueries)
        common = {
            "q": "",
            "source": "all",
            "status": "",
            "package_alias": "",
            "qq_bound": None,
            "offset": 0,
            "limit": 10,
            "covered_subscription_statuses": {"active", "trialing"},
            "free_plan_id": "free",
            "free_plan_kind": "free",
            "tier_package_aliases": [("pro", "Pro")],
            "default_tier_package_alias": "Unknown",
        }

        page = queries.query_admin_portal_user_directory_page(**common)
        assert page == {
            "principal_ids": [alpha.principal_id, beta.principal_id],
            "total": 2,
            "summary": {
                "active": 1,
                "disabled": 1,
                "qq_bound": 1,
                "self_registered": 1,
            },
        }
        assert queries.query_admin_portal_user_directory_page(
            **{**common, "source": "portal_self_registration"}
        )["principal_ids"] == [alpha.principal_id]
        assert queries.query_admin_portal_user_directory_page(**{**common, "status": "disabled"})[
            "principal_ids"
        ] == [beta.principal_id]
        assert queries.query_admin_portal_user_directory_page(**{**common, "package_alias": "pro"})[
            "principal_ids"
        ] == [alpha.principal_id]
        assert queries.query_admin_portal_user_directory_page(**{**common, "qq_bound": True})[
            "principal_ids"
        ] == [alpha.principal_id]
        assert queries.query_admin_portal_user_directory_page(
            **{**common, "q": "alpha.example.test"}
        )["principal_ids"] == [alpha.principal_id]
        assert (
            queries.query_admin_portal_user_directory_page(**{**common, "q": "%"})["principal_ids"]
            == []
        )
        assert queries.query_admin_portal_user_directory_page(
            **{**common, "offset": 1, "limit": 1}
        )["principal_ids"] == [beta.principal_id]

    dispose_engine(database_url)
