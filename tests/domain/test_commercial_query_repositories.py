from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.adapters.repositories.commercial_account_queries import CommercialAccountQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_site_queries import CommercialSiteQueries
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Site


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-query-repositories.sqlite3'}"


def test_account_queries_preserve_filters_order_limit_and_count(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime.now(UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Account(
                    account_id="acct_alpha",
                    name="Alpha",
                    status="active",
                    created_at=now - timedelta(days=2),
                ),
                Account(
                    account_id="acct_beta",
                    name="Beta",
                    status="suspended",
                    created_at=now - timedelta(days=1),
                ),
                Account(
                    account_id="acct_gamma",
                    name="Gamma",
                    status="active",
                    created_at=now,
                ),
            ]
        )
        session.commit()

        queries = CommercialAccountQueries(session)

        assert queries.get_account("acct_beta") is not None
        assert queries.get_account("acct_missing") is None
        assert [account.account_id for account in queries.list_accounts()] == [
            "acct_gamma",
            "acct_beta",
            "acct_alpha",
        ]
        assert [
            account.account_id
            for account in queries.list_accounts(
                status="active",
                account_ids=["acct_alpha", "acct_gamma"],
                limit=1,
            )
        ] == ["acct_gamma"]
        assert queries.list_accounts(account_ids=[]) == []
        assert queries.count_accounts() == 3
        assert queries.count_accounts(status="active") == 2

        facade = CommercialRepository(session)
        assert facade.get_account("acct_alpha") is not None
        assert facade.count_accounts(status="suspended") == 1

    dispose_engine(database_url)


def test_site_queries_preserve_filters_order_limit_and_grouped_counts(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime.now(UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Site(
                    site_id="site_alpha",
                    account_id="acct_alpha",
                    name="Alpha",
                    status="active",
                    created_at=now - timedelta(days=2),
                ),
                Site(
                    site_id="site_beta",
                    account_id="acct_alpha",
                    name="Beta",
                    status="suspended",
                    created_at=now - timedelta(days=1),
                ),
                Site(
                    site_id="site_gamma",
                    account_id="acct_beta",
                    name="Gamma",
                    status="active",
                    created_at=now,
                ),
            ]
        )
        session.commit()

        queries = CommercialSiteQueries(session)

        assert queries.get_site("site_beta") is not None
        assert queries.get_site("site_missing") is None
        assert [site.site_id for site in queries.list_sites()] == [
            "site_gamma",
            "site_beta",
            "site_alpha",
        ]
        assert [
            site.site_id
            for site in queries.list_sites(
                status="active",
                account_ids=["acct_alpha", "acct_beta"],
                site_ids=["site_alpha", "site_gamma"],
                limit=1,
            )
        ] == ["site_gamma"]
        assert [site.site_id for site in queries.list_sites(account_id="acct_alpha")] == [
            "site_beta",
            "site_alpha",
        ]
        assert queries.list_sites(account_ids=[]) == []
        assert queries.list_sites(site_ids=[]) == []
        assert queries.count_sites() == 3
        assert queries.count_sites(status="active") == 2
        assert queries.count_sites_by_account() == {
            "acct_alpha": 2,
            "acct_beta": 1,
        }
        assert queries.count_sites_by_account(
            account_ids=["acct_alpha"],
            status="active",
        ) == {"acct_alpha": 1}
        assert queries.count_sites_by_account(statuses=[" active ", "suspended"]) == {
            "acct_alpha": 2,
            "acct_beta": 1,
        }
        assert queries.count_sites_by_account(account_ids=[]) == {}
        assert queries.count_sites_by_account(statuses=["", " "]) == {}

        facade = CommercialRepository(session)
        assert facade.get_site("site_alpha") is not None
        assert facade.count_sites(status="suspended") == 1

    dispose_engine(database_url)
