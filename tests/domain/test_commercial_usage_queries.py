from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_usage_queries import CommercialUsageQueries
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderCallRecord, RunRecord, Site, UsageMeterEvent


def _run(
    run_id: str,
    *,
    site_id: str,
    ability_family: str,
    started_at: datetime,
) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id=f"account-{site_id}",
        subscription_id=f"subscription-{site_id}",
        plan_version_id="usage-v1",
        ability_name=f"ability-{run_id}",
        ability_family=ability_family,
        skill_id=None,
        workflow_id=None,
        contract_version="usage-query.v1",
        channel="openapi",
        execution_kind="generation",
        execution_tier="cloud",
        execution_pattern="inline",
        data_classification="internal",
        profile_id="usage-query",
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
        started_at=started_at,
        processing_started_at=started_at,
        finished_at=started_at,
    )


def _usage(
    dedupe_key: str,
    *,
    site_id: str,
    account_id: str,
    run_id: str,
    meter_key: str,
    quantity: float,
    ability_family: str,
    created_at: datetime,
) -> UsageMeterEvent:
    return UsageMeterEvent(
        account_id=account_id,
        site_id=site_id,
        subscription_id=f"subscription-{site_id}",
        plan_version_id="usage-v1",
        run_id=run_id,
        provider_call_id=None,
        event_kind="provider_usage",
        meter_key=meter_key,
        quantity=quantity,
        ability_family=ability_family,
        channel="openapi",
        execution_kind="generation",
        execution_tier="cloud",
        data_classification="internal",
        currency=None,
        dedupe_key=dedupe_key,
        payload_json=None,
        created_at=created_at,
    )


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialUsageQueries],
)
def test_usage_queries_preserve_filters_order_limits_joins_and_summaries(
    tmp_path: Path,
    repository_type: type[CommercialUsageQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / repository_type.__name__}.sqlite3"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Site(
                    site_id="site-usage-a",
                    account_id=None,
                    name="Usage A",
                    status="active",
                    site_url="https://usage-a.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
                Site(
                    site_id="site-usage-b",
                    account_id=None,
                    name="Usage B",
                    status="active",
                    site_url="https://usage-b.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                _run(
                    "run-usage-a",
                    site_id="site-usage-a",
                    ability_family="text",
                    started_at=now - timedelta(hours=2),
                ),
                _run(
                    "run-usage-b",
                    site_id="site-usage-b",
                    ability_family="knowledge",
                    started_at=now - timedelta(hours=1),
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                ProviderCallRecord(
                    run_id="run-usage-a",
                    provider_id="provider-a",
                    model_id="model-a",
                    instance_id="instance-a",
                    region="local",
                    latency_ms=10,
                    tokens_in=100,
                    tokens_out=50,
                    cost=0.1,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=now - timedelta(hours=2),
                ),
                ProviderCallRecord(
                    run_id="run-usage-b",
                    provider_id="provider-b",
                    model_id="model-b",
                    instance_id="instance-b",
                    region="local",
                    latency_ms=20,
                    tokens_in=200,
                    tokens_out=100,
                    cost=0.2,
                    retry_count=0,
                    fallback_used=False,
                    error_code=None,
                    created_at=now - timedelta(hours=1),
                ),
                _usage(
                    "usage-a-old",
                    site_id="site-usage-a",
                    account_id="account-a",
                    run_id="run-usage-a",
                    meter_key="tokens_in",
                    quantity=1.25,
                    ability_family="text",
                    created_at=now - timedelta(hours=3),
                ),
                _usage(
                    "usage-a-new",
                    site_id="site-usage-a",
                    account_id="account-a",
                    run_id="run-usage-a",
                    meter_key="tokens_in",
                    quantity=2.75,
                    ability_family="text",
                    created_at=now - timedelta(hours=1),
                ),
                _usage(
                    "usage-b",
                    site_id="site-usage-b",
                    account_id="account-b",
                    run_id="run-usage-b",
                    meter_key="images",
                    quantity=3.0,
                    ability_family="knowledge",
                    created_at=now,
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)

        assert [
            event.dedupe_key
            for event in repository.list_usage_meter_events(
                "site-usage-a",
                subscription_id="subscription-site-usage-a",
                period_start_at=now - timedelta(hours=2),
                period_end_at=now,
                limit=1,
            )
        ] == ["usage-a-new"]
        assert len(repository.list_usage_meter_events("site-usage-a", limit=0)) == 2

        assert repository.list_usage_meter_events_for_admin(site_ids=[]) == []
        assert repository.list_usage_meter_events_for_admin(account_ids=[]) == []
        assert repository.list_usage_meter_events_for_admin(meter_keys=[]) == []
        assert [
            event.dedupe_key
            for event in repository.list_usage_meter_events_for_admin(
                site_ids=["site-usage-a", "site-usage-b"],
                account_ids=["account-a"],
                ability_family="text",
                meter_keys=["tokens_in"],
                since=now - timedelta(hours=2),
                limit=1,
            )
        ] == ["usage-a-new"]
        assert repository.summarize_usage_meter_events_for_admin(
            since=now - timedelta(hours=2)
        ) == {"event_count": 2, "totals": {"images": 3.0, "tokens_in": 2.75}}

        assert [
            run.run_id
            for run in repository.list_run_records_for_admin(
                site_id="site-usage-a",
                ability_family="text",
                since=now - timedelta(hours=3),
                limit=1,
            )
        ] == ["run-usage-a"]
        assert repository.list_run_records_by_ids(["", "  "]) == []
        assert {
            run.run_id
            for run in repository.list_run_records_by_ids(
                [" run-usage-a ", "run-usage-b", "run-usage-a"]
            )
        } == {"run-usage-a", "run-usage-b"}

        assert repository.list_provider_call_records_for_admin(run_ids=[]) == []
        provider_rows = repository.list_provider_call_records_for_admin(
            site_id="site-usage-b",
            ability_family="knowledge",
            since=now - timedelta(hours=2),
            run_ids=["run-usage-b"],
            limit=1,
        )
        assert [row.provider_id for row in provider_rows] == ["provider-b"]

        assert repository.summarize_usage_meter_by_site(site_ids=[]) == {}
        assert repository.summarize_usage_meter_by_site(
            site_ids=["site-usage-a", "site-usage-b"],
            since=now - timedelta(hours=2),
        ) == {
            "site-usage-a": {
                "event_count": 1,
                "quantity_total": 2.75,
                "last_seen_at": "2026-08-03T11:00:00Z",
            },
            "site-usage-b": {
                "event_count": 1,
                "quantity_total": 3.0,
                "last_seen_at": "2026-08-03T12:00:00Z",
            },
        }

    dispose_engine(database_url)
