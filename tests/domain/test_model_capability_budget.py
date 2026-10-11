from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionRequest, ProviderExecutionResult
from app.core.db import get_session, init_schema
from app.core.models import ProviderBudgetClaim, ProviderBudgetCounter, RunRecord, ServiceSetting
from app.domain.model_capabilities.probes import probe_embedding
from app.domain.runtime.provider_budget import ProviderBudgetService


class FakeProbeProvider:
    provider_id = "fakeprobe"

    def __init__(self) -> None:
        self.calls = 0

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.calls += 1
        return ProviderExecutionResult(
            output={"embedding": [0.1, 0.2]},
            latency_ms=1,
            tokens_in=1,
            tokens_out=0,
            cost=0.001,
        )


def _run() -> RunRecord:
    return RunRecord(
        run_id="run-capability-budget",
        site_id="admin-capability-probe",
        ability_name="npcink-cloud/capability-probe",
        profile_id="embedding.probe",
        execution_kind="embedding",
        policy_json={"capability_probe": True},
    )


def _setting(limit: float) -> ServiceSetting:
    return ServiceSetting(
        setting_id="provider_account_spend_budget",
        setting_kind="runtime",
        enabled=True,
        status="ready",
        config_json={
            "providers": {
                "fakeprobe": {
                    "account_class": "paid",
                    "daily_usd": limit,
                    "monthly_usd": limit,
                }
            }
        },
    )


def _probe(database_url: str, provider: FakeProbeProvider):
    return probe_embedding(
        provider=provider,
        run_id="run-capability-budget",
        site_id="admin-capability-probe",
        model_id="embedding-test",
        instance_id="fakeprobe-default",
        endpoint_variant="embeddings",
        trace_id="trace-capability-budget",
        budget_guard=ProviderBudgetService(),
        budget_database_url=database_url,
        budget_run=_run(),
    )


def test_capability_probe_budget_blocks_provider_call(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'capability-budget-blocked.sqlite3'}"
    init_schema(database_url)
    provider = FakeProbeProvider()
    with get_session(database_url) as session:
        session.add(_setting(0.000001))
        session.commit()

    result = _probe(database_url, provider)

    assert result.state == "verification_failed"
    assert result.error_code == "provider.budget_exceeded"
    assert provider.calls == 0
    with get_session(database_url) as session:
        assert list(session.scalars(select(ProviderBudgetClaim))) == []


def test_capability_probe_budget_reconciles_provider_call(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'capability-budget-reconciled.sqlite3'}"
    init_schema(database_url)
    provider = FakeProbeProvider()
    with get_session(database_url) as session:
        session.add(_setting(1.0))
        session.commit()

    result = _probe(database_url, provider)

    assert result.state == "verified"
    assert provider.calls == 1
    with get_session(database_url) as session:
        claims = list(session.scalars(select(ProviderBudgetClaim)))
        assert len(claims) == 2
        assert {claim.status for claim in claims} == {"reconciled"}
        counters = list(session.scalars(select(ProviderBudgetCounter)))
        assert len(counters) == 2
        assert all(round(float(counter.reserved_cost_usd), 6) == 0.001 for counter in counters)
