from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import ProviderBudgetClaim, ProviderBudgetCounter, RunRecord, ServiceSetting
from app.domain.runtime.provider_budget import ProviderBudgetService
from app.domain.web_search.contracts import WEB_SEARCH_ABILITY, WEB_SEARCH_CONTRACT
from app.domain.web_search.service import (
    WebSearchExecutionResult,
    WebSearchProviderError,
    WebSearchProviderUsage,
    WebSearchService,
)


class FakeSearchProvider:
    model_id = "web-search"
    instance_id = "cloud-managed"

    def __init__(self) -> None:
        self.calls = 0

    def search(self, **_: object) -> WebSearchExecutionResult:
        self.calls += 1
        return WebSearchExecutionResult(
            result_json={
                "artifact_type": "web_search_results",
                "status": "ready",
                "results": [],
            },
            usage=WebSearchProviderUsage(
                provider_id="fake",
                model_id=self.model_id,
                instance_id=self.instance_id,
                region="test",
                latency_ms=1,
                cost=0.001,
            ),
        )


def _input() -> dict[str, object]:
    return {
        "contract_version": WEB_SEARCH_CONTRACT,
        "query": "bounded query",
        "intent": "general_research",
        "write_posture": "suggestion_only",
    }


def _run() -> RunRecord:
    return RunRecord(
        run_id="run-web-search-budget",
        site_id="site-web-search-budget",
        account_id="account-web-search-budget",
        ability_name=WEB_SEARCH_ABILITY,
        profile_id="web-search.managed",
        execution_kind="web_search",
        policy_json={},
    )


def _service_setting(*, daily_usd: float) -> ServiceSetting:
    return ServiceSetting(
        setting_id="provider_account_spend_budget",
        setting_kind="runtime",
        enabled=True,
        status="ready",
        config_json={
            "providers": {
                "tavily": {
                    "account_class": "paid",
                    "daily_usd": daily_usd,
                    "monthly_usd": daily_usd,
                }
            }
        },
    )


def test_web_search_budget_blocks_before_http_provider_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'web-search-budget-blocked.sqlite3'}"
    init_schema(database_url)
    provider = FakeSearchProvider()
    monkeypatch.setattr(
        "app.domain.web_search.service._build_provider",
        lambda settings, provider_id: provider,
    )
    with get_session(database_url) as session:
        session.add(_service_setting(daily_usd=0.000001))
        session.commit()

    with get_session(database_url) as session:
        with pytest.raises(WebSearchProviderError) as error:
            WebSearchService(
                Settings(
                    _env_file=None,
                    database_url=database_url,
                    web_search_provider="tavily",
                    web_search_tavily_api_key="test-key",
                )
            ).execute(
                site_id="site-web-search-budget",
                ability_name=WEB_SEARCH_ABILITY,
                contract_version=WEB_SEARCH_CONTRACT,
                input_payload=_input(),
                run_id="run-web-search-budget",
                budget_guard=ProviderBudgetService(),
                budget_session=session,
                budget_run=_run(),
            )
        assert error.value.error_code == "provider.budget_exceeded"
        assert provider.calls == 0
        assert list(session.scalars(select(ProviderBudgetClaim))) == []


def test_web_search_budget_reconciles_after_http_provider_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'web-search-budget-reconciled.sqlite3'}"
    init_schema(database_url)
    provider = FakeSearchProvider()
    monkeypatch.setattr(
        "app.domain.web_search.service._build_provider",
        lambda settings, provider_id: provider,
    )
    with get_session(database_url) as session:
        session.add(_service_setting(daily_usd=1.0))
        session.commit()

    with get_session(database_url) as session:
        result = WebSearchService(
            Settings(
                _env_file=None,
                database_url=database_url,
                web_search_provider="tavily",
                web_search_tavily_api_key="test-key",
            )
        ).execute(
            site_id="site-web-search-budget",
            ability_name=WEB_SEARCH_ABILITY,
            contract_version=WEB_SEARCH_CONTRACT,
            input_payload=_input(),
            run_id="run-web-search-budget",
            budget_guard=ProviderBudgetService(),
            budget_session=session,
            budget_run=_run(),
        )
        assert result.usage.budget_claim_ids
        assert provider.calls == 1
        claims = list(session.scalars(select(ProviderBudgetClaim)))
        assert len(claims) == 2
        assert {claim.status for claim in claims} == {"reconciled"}
        counters = list(session.scalars(select(ProviderBudgetCounter)))
        assert len(counters) == 2
        assert all(round(float(counter.reserved_cost_usd), 6) == 0.001 for counter in counters)
