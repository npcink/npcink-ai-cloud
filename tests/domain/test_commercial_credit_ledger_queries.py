from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_credit_ledger_queries import (
    CommercialCreditLedgerQueries,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    CREDIT_LEDGER_EVENT_CONSUME,
    CREDIT_LEDGER_EVENT_GRANT,
    CreditLedgerEntry,
    RunRecord,
    Site,
)


def _run(run_id: str, site_id: str, *, ability_name: str, now: datetime) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id="account-credit",
        subscription_id="subscription-credit",
        plan_version_id="plan-credit-v1",
        ability_name=ability_name,
        ability_family="text",
        skill_id=None,
        workflow_id=None,
        contract_version="credit-query.v1",
        channel="openapi",
        execution_kind="generation",
        execution_tier="cloud",
        execution_pattern="inline",
        data_classification="internal",
        profile_id="credit-query",
        canonical_run_id=None,
        status="succeeded",
        idempotency_key=f"idem-{run_id}",
        request_fingerprint=f"fingerprint-{run_id}",
        trace_id=f"trace-{run_id}",
        input_json={},
        execution_input_ciphertext=None,
        policy_json={},
        selected_provider_id="test",
        selected_model_id="test-model",
        selected_instance_id="test-instance",
        fallback_used=False,
        started_at=now,
        processing_started_at=now,
        finished_at=now,
    )


def _entry(
    ledger_entry_id: str,
    *,
    account_id: str = "account-credit",
    site_id: str = "site-credit-a",
    run_id: str | None = None,
    event_type: str = CREDIT_LEDGER_EVENT_CONSUME,
    source_type: str = "content_generation",
    delta: float = -1.0,
    created_at: datetime,
) -> CreditLedgerEntry:
    return CreditLedgerEntry(
        ledger_entry_id=ledger_entry_id,
        account_id=account_id,
        site_id=site_id,
        subscription_id="subscription-credit",
        plan_version_id="plan-credit-v1",
        run_id=run_id,
        provider_call_id=None,
        event_type=event_type,
        source_type=source_type,
        source_id=f"source-{ledger_entry_id}",
        ai_credit_delta=delta,
        quantity=abs(delta),
        unit="ai_credits",
        rate=1.0,
        rate_unit="credit",
        rate_version="test-v1",
        idempotency_key=f"idem-{ledger_entry_id}",
        metadata_json=None,
        created_at=created_at,
    )


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialCreditLedgerQueries],
)
def test_credit_ledger_queries_preserve_filters_order_pagination_and_counts(
    tmp_path: Path,
    repository_type: type[CommercialCreditLedgerQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / repository_type.__name__}.sqlite3"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                _entry(
                    "ledger-old",
                    site_id="site-credit-a",
                    run_id="run-image",
                    source_type="image_generation",
                    delta=-3.0,
                    created_at=now - timedelta(hours=3),
                ),
                _entry(
                    "ledger-image-component",
                    site_id="site-credit-a",
                    run_id="run-image",
                    source_type="image_generation",
                    delta=-1.0,
                    created_at=now - timedelta(hours=2, minutes=45),
                ),
                _entry(
                    "ledger-web",
                    site_id="site-credit-b",
                    run_id="run-web",
                    source_type="web_search",
                    delta=-2.0,
                    created_at=now - timedelta(hours=1),
                ),
                _entry(
                    "ledger-grant",
                    site_id="site-credit-a",
                    event_type=CREDIT_LEDGER_EVENT_GRANT,
                    source_type="payment",
                    delta=10.0,
                    created_at=now - timedelta(minutes=30),
                ),
                _entry(
                    "ledger-other-account",
                    account_id="account-other",
                    site_id="site-other",
                    delta=-9.0,
                    created_at=now,
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)

        assert repository.list_credit_ledger_entries(account_ids=[]) == []
        assert repository.list_credit_ledger_entries(site_ids=[]) == []
        assert repository.list_credit_ledger_entries(event_types=[]) == []
        assert repository.list_credit_ledger_entries(source_types=[]) == []
        assert repository.count_credit_ledger_entries(account_ids=[]) == 0
        assert repository.count_credit_ledger_entries(site_ids=[]) == 0
        assert repository.count_credit_ledger_entries(event_types=[]) == 0
        assert repository.count_credit_ledger_entries(source_types=[]) == 0

        assert [
            row.ledger_entry_id
            for row in repository.list_credit_ledger_entries(
                account_ids=["account-credit"],
                subscription_id="subscription-credit",
                event_types=[CREDIT_LEDGER_EVENT_CONSUME],
                source_types=["image_generation", "web_search"],
                since=now - timedelta(hours=3),
                until=now,
                limit=2,
                offset=1,
            )
        ] == ["ledger-image-component", "ledger-old"]
        assert len(
            repository.list_credit_ledger_entries(
                account_ids=["account-credit"], limit=0, offset=0
            )
        ) == 4
        assert repository.count_credit_ledger_entries(
            account_ids=["account-credit"],
            site_ids=["site-credit-a"],
            subscription_id="subscription-credit",
            event_types=[CREDIT_LEDGER_EVENT_CONSUME],
            source_types=["image_generation"],
            since=now - timedelta(hours=3),
            until=now,
        ) == 2

        assert repository.summarize_credit_consumption_buckets(
            account_id="account-credit", buckets=[]
        ) == {}
        assert repository.summarize_credit_consumption_buckets(
            account_id="account-credit",
            buckets=[
                (now - timedelta(hours=4), now - timedelta(hours=2)),
                (now - timedelta(hours=2), now),
            ],
            site_ids=[],
        ) == {}
        assert repository.summarize_credit_consumption_buckets(
            account_id="account-credit",
            buckets=[
                (now - timedelta(hours=4), now - timedelta(hours=2)),
                (now - timedelta(hours=2), now),
            ],
        ) == {
            0: {"ai_credits": 4.0, "entry_count": 2},
            1: {"ai_credits": 2.0, "entry_count": 1},
        }

    dispose_engine(database_url)


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialCreditLedgerQueries],
)
def test_credit_ledger_queries_preserve_portal_group_and_bucket_semantics(
    tmp_path: Path,
    repository_type: type[CommercialCreditLedgerQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'portal-{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Site(
                    site_id="site-credit-a",
                    account_id=None,
                    name="Credit A",
                    status="active",
                    site_url="https://credit-a.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
                Site(
                    site_id="site-credit-b",
                    account_id=None,
                    name="Credit B",
                    status="active",
                    site_url="https://credit-b.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                _run("run-image", "site-credit-a", ability_name="generate-image", now=now),
                _run("run-web", "site-credit-b", ability_name="web-search", now=now),
            ]
        )
        session.add_all(
            [
                _entry(
                    "ledger-image-a",
                    run_id="run-image",
                    source_type="image_generation",
                    delta=-3.0,
                    created_at=now - timedelta(minutes=50),
                ),
                _entry(
                    "ledger-image-b",
                    run_id="run-image",
                    source_type="image_generation",
                    delta=-1.0,
                    created_at=now - timedelta(minutes=45),
                ),
                _entry(
                    "ledger-web",
                    site_id="site-credit-b",
                    run_id="run-web",
                    source_type="web_search",
                    delta=-2.0,
                    created_at=now - timedelta(minutes=10),
                ),
                _entry(
                    "ledger-grant",
                    event_type=CREDIT_LEDGER_EVENT_GRANT,
                    source_type="payment",
                    delta=10.0,
                    created_at=now - timedelta(minutes=5),
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)

        rows, total, consumed = repository.list_portal_credit_event_groups(
            account_id="account-credit",
            subscription_id="subscription-credit",
            event_types=[CREDIT_LEDGER_EVENT_CONSUME],
            since=now - timedelta(hours=1),
            until=now,
        )
        assert total == 2
        assert consumed == 6.0
        assert [str(row["group_id"]) for row in rows] == ["run-web", "run-image"]
        assert [str(row["feature_key"]) for row in rows] == ["web_search", "image_assistance"]
        assert [int(row["component_count"]) for row in rows] == [1, 2]

        filtered, filtered_total, filtered_consumed = (
            repository.list_portal_credit_event_groups(
                account_id="account-credit",
                subscription_id=None,
                event_types=[CREDIT_LEDGER_EVENT_CONSUME],
                since=now - timedelta(hours=1),
                until=now,
                site_id="site-credit-a",
                feature="image_assistance",
                limit=1,
                offset=0,
            )
        )
        assert [str(row["group_id"]) for row in filtered] == ["run-image"]
        assert filtered_total == 1
        assert filtered_consumed == 4.0

        assert repository.list_credit_ledger_entries_for_event_groups(
            account_id="account-credit", run_ids=[], ledger_entry_ids=[]
        ) == []
        detail_ids = {
            row.ledger_entry_id
            for row in repository.list_credit_ledger_entries_for_event_groups(
                account_id="account-credit",
                run_ids=["run-image"],
                ledger_entry_ids=["ledger-grant"],
            )
        }
        assert detail_ids == {"ledger-image-a", "ledger-image-b", "ledger-grant"}

        buckets = repository.summarize_portal_credit_event_buckets(
            account_id="account-credit",
            subscription_id="subscription-credit",
            event_types=[CREDIT_LEDGER_EVENT_CONSUME],
            since=now - timedelta(hours=1),
            until=now,
            bucket_seconds=3600,
        )
        assert len(buckets) == 1
        assert float(buckets[0]["net_ai_credit_delta"]) == -6.0
        assert int(buckets[0]["event_count"]) == 2
        assert int(buckets[0]["site_count"]) == 2
        assert {
            (str(row["feature_key"]), float(row["net_ai_credit_delta"]), int(row["event_count"]))
            for row in buckets[0]["features"]
        } == {("image_assistance", -4.0, 1), ("web_search", -2.0, 1)}

    dispose_engine(database_url)
