from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_decision_repository import (
    CommercialDecisionRepository,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_usage_queries import CommercialUsageQueries
from app.core.db import dispose_engine, get_session, init_schema


def _record(
    repository: CommercialDecisionRepository,
    *,
    site_id: str,
    subscription_id: str,
    request_kind: str,
    decision: str,
    decision_code: str,
) -> None:
    repository.record_commercial_decision_event(
        account_id="account-a",
        site_id=site_id,
        subscription_id=subscription_id,
        plan_version_id="plan-version-a",
        run_id=f"run-{site_id}",
        request_kind=request_kind,
        decision=decision,
        decision_code=decision_code,
        ability_family="writing",
        channel="wordpress",
        execution_kind="runtime",
        execution_tier="standard",
        data_classification="internal",
        trace_id=f"trace-{site_id}",
        idempotency_key=f"decision-{site_id}",
        payload_json={"decision": decision},
    )


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialDecisionRepository],
)
def test_commercial_decision_repository_preserves_write_filters_order_and_summary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    repository_type: type[CommercialDecisionRepository],
) -> None:
    monkeypatch.setattr(
        CommercialUsageQueries,
        "_serialize_datetime",
        lambda self, value: "wrong-domain-helper",
    )
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    with get_session(database_url) as session:
        repository = repository_type(session)
        _record(
            repository,
            site_id="site-a",
            subscription_id="subscription-a",
            request_kind="generation",
            decision="allow",
            decision_code="commercial.allowed",
        )
        _record(
            repository,
            site_id="site-b",
            subscription_id="subscription-b",
            request_kind="embedding",
            decision="deny",
            decision_code="commercial.denied",
        )

        assert [event.site_id for event in repository.list_commercial_decision_events(limit=1)] == [
            "site-b"
        ]
        assert len(repository.list_commercial_decision_events(limit=None)) == 2
        assert (
            len(
                repository.list_commercial_decision_events(
                    site_id="site-a",
                    subscription_id="subscription-a",
                    decision="allow",
                    decision_code="commercial.allowed",
                    request_kind="generation",
                    since=datetime.now(UTC) - timedelta(days=1),
                )
            )
            == 1
        )
        assert (
            repository.count_commercial_decision_events(
                site_id="site-b",
                subscription_id="subscription-b",
                decision="deny",
                decision_code="commercial.denied",
                request_kind="embedding",
                since=datetime.now(UTC) - timedelta(days=1),
            )
            == 1
        )
        summary = repository.summarize_commercial_decision_events(
            site_id="site-a",
            subscription_id="subscription-a",
            request_kind="generation",
            since=datetime.now(UTC) - timedelta(days=1),
            limit=0,
        )
        assert [(item["decision"], item["decision_code"], item["count"]) for item in summary] == [
            ("allow", "commercial.allowed", 1)
        ]
        assert str(summary[0]["first_seen_at"]).endswith("Z")
        assert str(summary[0]["last_seen_at"]).endswith("Z")

    dispose_engine(database_url)
