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
from app.adapters.repositories.commercial_support_queries import (
    CommercialSupportQueries,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountSubscription,
    Principal,
    Site,
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestFeedback,
    SupportRequestMessage,
)


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


def _seed_support_query_data(
    session: Session,
    *,
    now: datetime,
) -> None:
    session.add_all(
        [
            Account(account_id="acct_support_alpha", name="Alpha", status="active"),
            Account(account_id="acct_support_beta", name="Beta", status="active"),
            Site(
                site_id="site_support_alpha",
                account_id="acct_support_alpha",
                name="Alpha Site",
            ),
            Site(
                site_id="site_support_beta",
                account_id="acct_support_beta",
                name="Beta Site",
            ),
            Principal(
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                status="active",
            ),
            Principal(
                principal_id="prn_support_beta",
                email="beta@example.com",
                status="active",
            ),
            SupportRequest(
                request_id="sr_alpha_new",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                topic="billing",
                title="Payment follow-up",
                description="Newest alpha request",
                status="open",
                priority="normal",
                source_path="/portal/support",
                waiting_on="operator",
                waiting_since=now - timedelta(hours=2),
                created_at=now - timedelta(days=2),
                updated_at=now,
            ),
            SupportRequest(
                request_id="sr_alpha_old",
                account_id="acct_support_alpha",
                site_id=None,
                principal_id="prn_support_alpha",
                email="alpha-old@example.com",
                topic="technical",
                title="Runtime question",
                description="Older alpha request",
                status="in_progress",
                priority="normal",
                source_path="/portal/support",
                waiting_on="customer",
                waiting_since=now - timedelta(hours=8),
                created_at=now - timedelta(days=3),
                updated_at=now - timedelta(days=1),
            ),
            SupportRequest(
                request_id="sr_beta_overdue",
                account_id="acct_support_beta",
                site_id="site_support_beta",
                principal_id="prn_support_beta",
                email="beta@example.com",
                topic="billing",
                title="Invoice overdue",
                description="Overdue beta request",
                status="in_progress",
                priority="normal",
                source_path="/portal/support",
                waiting_on="operator",
                waiting_since=now - timedelta(hours=72),
                created_at=now - timedelta(days=4),
                updated_at=now - timedelta(days=2),
            ),
            SupportRequest(
                request_id="sr_beta_resolved",
                account_id="acct_support_beta",
                site_id="site_support_beta",
                principal_id="prn_support_beta",
                email="resolved@example.com",
                topic="general",
                title="Resolved request",
                description="Resolved beta request",
                status="resolved",
                priority="urgent",
                source_path="/portal/support",
                waiting_on="none",
                waiting_since=None,
                created_at=now - timedelta(days=5),
                updated_at=now - timedelta(days=3),
            ),
            SupportRequestMessage(
                message_id="srm_public_b",
                request_id="sr_alpha_new",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                author_kind="customer",
                visibility="public",
                body="Public B",
                created_at=now - timedelta(minutes=3),
            ),
            SupportRequestMessage(
                message_id="srm_public_a",
                request_id="sr_alpha_new",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                author_kind="operator",
                visibility="public",
                body="Public A",
                created_at=now - timedelta(minutes=3),
            ),
            SupportRequestMessage(
                message_id="srm_internal",
                request_id="sr_alpha_new",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id=None,
                email="",
                author_kind="operator",
                visibility="internal",
                body="Internal",
                created_at=now - timedelta(minutes=2),
            ),
            SupportRequestAttachment(
                attachment_id="sra_public_b",
                request_id="sr_alpha_new",
                message_id="srm_public_b",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                uploader_kind="customer",
                visibility="public",
                filename="public-b.txt",
                content_type="text/plain",
                byte_size=1,
                content_bytes=b"b",
                created_at=now - timedelta(minutes=3),
            ),
            SupportRequestAttachment(
                attachment_id="sra_public_a",
                request_id="sr_alpha_new",
                message_id="srm_public_a",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                uploader_kind="operator",
                visibility="public",
                filename="public-a.txt",
                content_type="text/plain",
                byte_size=1,
                content_bytes=b"a",
                created_at=now - timedelta(minutes=3),
            ),
            SupportRequestAttachment(
                attachment_id="sra_internal",
                request_id="sr_alpha_new",
                message_id="srm_internal",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id=None,
                email="",
                uploader_kind="operator",
                visibility="internal",
                filename="internal.txt",
                content_type="text/plain",
                byte_size=1,
                content_bytes=b"i",
                created_at=now - timedelta(minutes=2),
            ),
            SupportRequestFeedback(
                feedback_id="srf_alpha",
                request_id="sr_alpha_new",
                account_id="acct_support_alpha",
                site_id="site_support_alpha",
                principal_id="prn_support_alpha",
                email="alpha@example.com",
                resolved=True,
                rating=5,
                comment="Helpful",
            ),
        ]
    )
    session.commit()


def test_support_queries_preserve_getters_timeline_visibility_order_and_counts(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 8, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        _seed_support_query_data(session, now=now)
        facade = CommercialRepository(session)
        queries = CommercialSupportQueries(session)

        assert facade.get_support_request("sr_alpha_new") is not None
        assert facade.get_support_request("sr_missing") is None
        assert facade.get_support_request_message("srm_public_a") is not None
        assert facade.get_support_request_message("srm_missing") is None
        assert facade.get_support_request_attachment("sra_public_a") is not None
        assert facade.get_support_request_attachment("sra_missing") is None
        assert [
            item.message_id
            for item in facade.list_support_request_messages(request_id="sr_alpha_new")
        ] == ["srm_public_a", "srm_public_b"]
        assert [
            item.message_id
            for item in facade.list_support_request_messages(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ] == ["srm_public_a", "srm_public_b", "srm_internal"]
        assert [
            item.attachment_id
            for item in facade.list_support_request_attachments(request_id="sr_alpha_new")
        ] == ["sra_public_a", "sra_public_b"]
        assert [
            item.attachment_id
            for item in facade.list_support_request_attachments(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ] == ["sra_public_a", "sra_public_b", "sra_internal"]
        assert facade.count_support_request_attachments(request_id="sr_alpha_new") == 3
        assert facade.count_support_request_attachments(request_id="sr_missing") == 0
        assert facade.get_support_request_feedback("sr_alpha_new") is not None
        assert facade.get_support_request_feedback("sr_missing") is None
        assert queries.get_support_request("sr_alpha_new") is facade.get_support_request(
            "sr_alpha_new"
        )
        assert queries.get_support_request_message(
            "srm_public_a"
        ) is facade.get_support_request_message("srm_public_a")
        assert queries.get_support_request_attachment(
            "sra_public_a"
        ) is facade.get_support_request_attachment("sra_public_a")
        assert [
            item.message_id
            for item in queries.list_support_request_messages(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ] == [
            item.message_id
            for item in facade.list_support_request_messages(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ]
        assert [
            item.attachment_id
            for item in queries.list_support_request_attachments(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ] == [
            item.attachment_id
            for item in facade.list_support_request_attachments(
                request_id="sr_alpha_new",
                include_internal=True,
            )
        ]
        assert queries.count_support_request_attachments(
            request_id="sr_alpha_new"
        ) == facade.count_support_request_attachments(request_id="sr_alpha_new")
        assert queries.get_support_request_feedback(
            "sr_alpha_new"
        ) is facade.get_support_request_feedback("sr_alpha_new")

    dispose_engine(database_url)


def test_support_queries_preserve_filters_default_order_pagination_and_summary(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    now = datetime(2026, 8, 3, 8, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        _seed_support_query_data(session, now=now)
        facade = CommercialRepository(session)
        queries = CommercialSupportQueries(session)

        assert [item.request_id for item in facade.list_support_requests()] == [
            "sr_alpha_new",
            "sr_alpha_old",
            "sr_beta_overdue",
            "sr_beta_resolved",
        ]
        assert [
            item.request_id
            for item in facade.list_support_requests(
                account_id="acct_support_alpha",
                principal_id="prn_support_alpha",
            )
        ] == ["sr_alpha_new", "sr_alpha_old"]
        assert [
            item.request_id
            for item in facade.list_support_requests(
                site_id="site_support_beta",
                status="in_progress",
                topic="billing",
            )
        ] == ["sr_beta_overdue"]
        assert [item.request_id for item in facade.list_support_requests(query="  PAYMENT  ")] == [
            "sr_alpha_new"
        ]
        assert [item.request_id for item in facade.list_support_requests(query="BETA")] == [
            "sr_beta_overdue",
            "sr_beta_resolved",
        ]
        assert [
            item.request_id
            for item in facade.list_support_requests(
                attention="waiting_for_operator",
                risk_as_of=now,
            )
        ] == ["sr_alpha_new", "sr_beta_overdue"]
        assert [
            item.request_id
            for item in facade.list_support_requests(
                attention="overdue",
                risk_as_of=now,
            )
        ] == ["sr_beta_overdue"]
        assert [item.request_id for item in facade.list_support_requests(offset=1, limit=1)] == [
            "sr_alpha_old"
        ]
        assert len(facade.list_support_requests(limit=None)) == 4
        assert len(facade.list_support_requests(limit=0)) == 4
        assert len(facade.list_support_requests(limit=-1)) == 4
        assert facade.count_support_requests() == 4
        assert (
            facade.count_support_requests(
                attention="overdue",
                risk_as_of=now,
            )
            == 1
        )
        assert facade.summarize_support_request_queue(
            account_id="acct_missing",
            risk_as_of=now,
        ) == {
            "open": 0,
            "in_progress": 0,
            "critical": 0,
            "warning": 0,
            "monitor": 0,
            "stable": 0,
            "waiting_for_operator": 0,
            "waiting_for_customer": 0,
            "overdue": 0,
        }
        assert [item.request_id for item in queries.list_support_requests()] == [
            item.request_id for item in facade.list_support_requests()
        ]
        assert [
            item.request_id
            for item in queries.list_support_requests(
                attention="overdue",
                sort="risk",
                risk_as_of=now,
            )
        ] == [
            item.request_id
            for item in facade.list_support_requests(
                attention="overdue",
                sort="risk",
                risk_as_of=now,
            )
        ]
        assert queries.count_support_requests(topic="billing") == facade.count_support_requests(
            topic="billing"
        )
        assert queries.summarize_support_request_queue(
            risk_as_of=now
        ) == facade.summarize_support_request_queue(risk_as_of=now)

    dispose_engine(database_url)
