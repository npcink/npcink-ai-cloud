from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_account_queries import CommercialAccountQueries
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_site_queries import CommercialSiteQueries
from app.adapters.repositories.commercial_subscription_queries import (
    CommercialSubscriptionQueries,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, AccountSubscription, Site


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


def _seed_subscription_query_data(
    session: Session,
    *,
    now: datetime,
) -> None:
    session.add_all(
        [
            Account(account_id="acct_alpha", name="Alpha", status="active"),
            Account(account_id="acct_beta", name="Beta", status="active"),
            Account(account_id="acct_empty", name="Empty", status="active"),
            Site(site_id="site_alpha_one", account_id="acct_alpha", name="Alpha One"),
            Site(site_id="site_alpha_two", account_id="acct_alpha", name="Alpha Two"),
            Site(site_id="site_beta", account_id="acct_beta", name="Beta"),
            AccountSubscription(
                subscription_id="sub_alpha_latest_canceled",
                account_id="acct_alpha",
                plan_id="plan_plus",
                plan_version_id="plan_plus_v1",
                status="canceled",
                current_period_end_at=now + timedelta(days=30),
                created_at=now,
            ),
            AccountSubscription(
                subscription_id="sub_alpha_trialing",
                account_id="acct_alpha",
                plan_id="plan_plus",
                plan_version_id="plan_plus_v1",
                status="trialing",
                current_period_end_at=now + timedelta(days=7),
                created_at=now - timedelta(days=1),
            ),
            AccountSubscription(
                subscription_id="sub_alpha_active",
                account_id="acct_alpha",
                plan_id="plan_basic",
                plan_version_id="plan_basic_v1",
                status="active",
                current_period_end_at=now + timedelta(days=1),
                created_at=now - timedelta(days=2),
            ),
            AccountSubscription(
                subscription_id="sub_beta_suspended",
                account_id="acct_beta",
                plan_id="plan_basic",
                plan_version_id="plan_basic_v1",
                status="suspended",
                current_period_end_at=now + timedelta(days=7, seconds=1),
                created_at=now - timedelta(days=3),
            ),
            AccountSubscription(
                subscription_id="sub_beta_no_period_end",
                account_id="acct_beta",
                plan_id="plan_basic",
                plan_version_id="plan_basic_v1",
                status="active",
                current_period_end_at=None,
                created_at=now - timedelta(days=4),
            ),
        ]
    )
    session.commit()


def test_subscription_queries_preserve_account_order_latest_and_runtime_selection(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime.now(UTC)

    with get_session(database_url) as session:
        _seed_subscription_query_data(session, now=now)
        facade = CommercialRepository(session)
        queries = CommercialSubscriptionQueries(session)

        assert facade.get_subscription("sub_alpha_active") is not None
        assert facade.get_subscription("sub_missing") is None
        assert [
            item.subscription_id
            for item in facade.list_account_subscriptions("acct_alpha")
        ] == [
            "sub_alpha_latest_canceled",
            "sub_alpha_trialing",
            "sub_alpha_active",
        ]
        assert (
            facade.get_latest_account_subscription("acct_alpha").subscription_id
            == "sub_alpha_latest_canceled"
        )
        assert (
            facade.get_runtime_subscription("acct_alpha").subscription_id
            == "sub_alpha_trialing"
        )
        assert (
            facade.get_runtime_subscription("acct_beta").subscription_id
            == "sub_beta_no_period_end"
        )
        assert facade.get_latest_account_subscription("acct_empty") is None
        assert facade.get_runtime_subscription("acct_empty") is None
        assert queries.get_subscription("sub_alpha_active") is facade.get_subscription(
            "sub_alpha_active"
        )
        assert [
            item.subscription_id for item in queries.list_account_subscriptions("acct_alpha")
        ] == [
            item.subscription_id for item in facade.list_account_subscriptions("acct_alpha")
        ]
        assert queries.get_latest_account_subscription(
            "acct_alpha"
        ) is facade.get_latest_account_subscription("acct_alpha")
        assert queries.get_runtime_subscription("acct_alpha") is facade.get_runtime_subscription(
            "acct_alpha"
        )

    dispose_engine(database_url)


def test_subscription_queries_preserve_filters_distinct_and_pagination(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime.now(UTC)

    with get_session(database_url) as session:
        _seed_subscription_query_data(session, now=now)
        facade = CommercialRepository(session)
        queries = CommercialSubscriptionQueries(session)

        assert [
            item.subscription_id
            for item in facade.list_subscriptions(
                statuses=["trialing", "active"],
                account_id="acct_alpha",
                plan_id="plan_plus",
                current_period_end_before=now + timedelta(days=7),
                limit=None,
            )
        ] == ["sub_alpha_trialing"]
        assert [
            item.subscription_id
            for item in facade.list_subscriptions(
                status="active",
                account_ids=["acct_alpha", "acct_beta"],
                offset=1,
                limit=1,
            )
        ] == ["sub_beta_no_period_end"]
        assert [
            item.subscription_id
            for item in facade.list_subscriptions(
                site_ids=["site_alpha_one", "site_alpha_two"],
                limit=None,
            )
        ] == [
            "sub_alpha_latest_canceled",
            "sub_alpha_trialing",
            "sub_alpha_active",
        ]
        assert [
            item.subscription_id
            for item in facade.list_subscriptions(site_id="site_beta", limit=0)
        ] == ["sub_beta_suspended", "sub_beta_no_period_end"]
        assert len(facade.list_subscriptions(limit=-1)) == 5
        assert facade.list_subscriptions(account_ids=[]) == []
        assert facade.list_subscriptions(site_ids=[]) == []
        query_items = queries.list_subscriptions(
            site_ids=["site_alpha_one", "site_alpha_two"],
            limit=None,
        )
        facade_items = facade.list_subscriptions(
            site_ids=["site_alpha_one", "site_alpha_two"],
            limit=None,
        )
        assert [item.subscription_id for item in query_items] == [
            item.subscription_id for item in facade_items
        ]

    dispose_engine(database_url)


def test_subscription_queries_preserve_counts_summaries_and_expiring_boundary(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime.now(UTC)

    with get_session(database_url) as session:
        _seed_subscription_query_data(session, now=now)
        facade = CommercialRepository(session)
        queries = CommercialSubscriptionQueries(session)

        assert facade.count_subscriptions() == 5
        assert facade.count_subscriptions(status="active") == 2
        assert facade.count_subscriptions(statuses=["trialing", "active"]) == 3
        assert (
            facade.count_subscriptions(
                account_id="acct_alpha",
                plan_id="plan_plus",
                current_period_end_before=now + timedelta(days=7),
            )
            == 1
        )
        assert facade.summarize_subscription_status_counts() == {
            "active": 2,
            "canceled": 1,
            "suspended": 1,
            "trialing": 1,
        }
        assert facade.summarize_subscription_plan_counts() == {
            "plan_basic": 3,
            "plan_plus": 2,
        }
        assert facade.count_subscriptions_by_account() == {
            "acct_alpha": 3,
            "acct_beta": 2,
        }
        assert facade.count_subscriptions_by_account(
            account_ids=["acct_alpha"],
            statuses=["active", "trialing"],
        ) == {"acct_alpha": 2}
        assert facade.count_subscriptions_by_account(account_ids=[]) == {}
        assert facade.count_subscriptions_by_site() == {
            "site_alpha_one": 3,
            "site_alpha_two": 3,
            "site_beta": 2,
        }
        assert facade.count_subscriptions_by_site(
            site_ids=["site_beta"],
            statuses=["active"],
        ) == {"site_beta": 1}
        assert facade.count_subscriptions_by_site(site_ids=[]) == {}
        assert (
            facade.count_subscriptions_expiring_by(
                before=now + timedelta(days=7),
                statuses=["active", "trialing"],
            )
            == 2
        )
        assert facade.count_subscriptions_expiring_by(before=now) == 0
        assert queries.count_subscriptions(status="active") == facade.count_subscriptions(
            status="active"
        )
        assert (
            queries.summarize_subscription_status_counts()
            == facade.summarize_subscription_status_counts()
        )
        assert (
            queries.summarize_subscription_plan_counts()
            == facade.summarize_subscription_plan_counts()
        )
        assert queries.count_subscriptions_by_account() == facade.count_subscriptions_by_account()
        assert queries.count_subscriptions_by_site() == facade.count_subscriptions_by_site()
        assert queries.count_subscriptions_expiring_by(
            before=now + timedelta(days=7),
            statuses=["active", "trialing"],
        ) == facade.count_subscriptions_expiring_by(
            before=now + timedelta(days=7),
            statuses=["active", "trialing"],
        )

    dispose_engine(database_url)
