from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderBudgetClaim, ProviderBudgetCounter, RunRecord, ServiceSetting
from app.domain.runtime.provider_budget import (
    SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
    ProviderBudgetService,
)


def test_provider_budget_claim_is_idempotent_and_fails_closed(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'provider-budget.sqlite3'}"
    init_schema(database_url)
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json={
                    "warning_ratio": 0.8,
                    "conservative_unpriced_cost_usd": 0.05,
                    "providers": {
                        "openai": {
                            "account_class": "paid",
                            "daily_usd": 0.075,
                            "monthly_usd": 0.075,
                        }
                    },
                },
            )
        )
        session.commit()

    run = RunRecord(
        run_id="run-budget-001",
        site_id="site-budget-001",
        account_id="account-budget-001",
        ability_name="wordpress.title.generate",
        profile_id="profile-budget",
        execution_kind="text_generation",
        policy_json={"max_output_tokens": 1024},
    )
    request = ProviderExecutionRequest(
        run_id=run.run_id,
        site_id=run.site_id,
        ability_name=run.ability_name,
        profile_id=run.profile_id,
        execution_kind=run.execution_kind,
        model_id="unpriced-model",
        instance_id="openai-default",
        endpoint_variant="chat",
        trace_id="trace-budget-001",
        input_payload={"prompt": "bounded"},
        policy=run.policy_json,
        timeout_ms=1000,
    )
    service = ProviderBudgetService()
    with get_session(database_url) as session:
        first = service.claim_before_dispatch(
            session=session,
            run=run,
            provider_id="openai",
            model_id="unpriced-model",
            request=request,
        )
        assert first is not None
        assert len(first.claim_ids) == 2
        session.commit()

    with get_session(database_url) as session:
        replay = service.claim_before_dispatch(
            session=session,
            run=run,
            provider_id="openai",
            model_id="unpriced-model",
            request=request,
        )
        assert replay is not None
        assert replay.claim_ids == first.claim_ids
        session.commit()

    exhausted_run = RunRecord(
        run_id="run-budget-002",
        site_id=run.site_id,
        account_id=run.account_id,
        ability_name=run.ability_name,
        profile_id=run.profile_id,
        execution_kind=run.execution_kind,
        policy_json=run.policy_json,
    )
    exhausted_request = replace(request, run_id=exhausted_run.run_id)
    with get_session(database_url) as session:
        with pytest.raises(ProviderExecutionError) as error:
            service.claim_before_dispatch(
                session=session,
                run=exhausted_run,
                provider_id="openai",
                model_id="unpriced-model",
                request=exhausted_request,
            )
        assert error.value.error_code == "provider.budget_exceeded"
        session.rollback()
        assert session.scalar(select(ProviderBudgetClaim)) is not None

    dispose_engine(database_url)


def test_provider_budget_rolls_day_and_month_counters_forward(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'provider-budget-boundaries.sqlite3'}"
    init_schema(database_url)
    clock = [datetime(2026, 1, 31, 23, 59, tzinfo=UTC)]
    service = ProviderBudgetService(now_factory=lambda: clock[0])
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json={
                    "providers": {
                        "openai": {
                            "account_class": "paid",
                            "daily_usd": 1.0,
                            "monthly_usd": 1.0,
                        }
                    }
                },
            )
        )
        session.flush()

        def build_request(run_id: str) -> tuple[RunRecord, ProviderExecutionRequest]:
            run = RunRecord(
                run_id=run_id,
                site_id="site-budget-boundary",
                account_id="account-budget-boundary",
                ability_name="wordpress.title.generate",
                profile_id="profile-budget",
                execution_kind="text_generation",
                policy_json={"max_output_tokens": 1024},
            )
            request = ProviderExecutionRequest(
                run_id=run_id,
                site_id=run.site_id,
                ability_name=run.ability_name,
                profile_id=run.profile_id,
                execution_kind=run.execution_kind,
                model_id="gpt-test",
                instance_id="openai-default",
                endpoint_variant="chat",
                trace_id=f"trace-{run_id}",
                input_payload={"prompt": "bounded"},
                policy=run.policy_json,
                timeout_ms=1000,
            )
            return run, request

        first_run, first_request = build_request("run-budget-jan")
        first_receipt = service.claim_before_dispatch(
            session=session,
            run=first_run,
            provider_id="openai",
            model_id="gpt-test",
            request=first_request,
        )
        assert first_receipt is not None and first_receipt.warning is False

        clock[0] = datetime(2026, 2, 1, 0, 1, tzinfo=UTC)
        second_run, second_request = build_request("run-budget-feb")
        second_receipt = service.claim_before_dispatch(
            session=session,
            run=second_run,
            provider_id="openai",
            model_id="gpt-test",
            request=second_request,
        )
        assert second_receipt is not None
        claims = list(session.scalars(select(ProviderBudgetClaim)))
        assert len(claims) == 4
        assert {claim.period_kind for claim in claims} == {"day", "month"}
        assert len({claim.scope_key for claim in claims}) == 4
    dispose_engine(database_url)


def test_provider_budget_emits_warning_at_configured_threshold(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'provider-budget-warning.sqlite3'}"
    init_schema(database_url)
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json={
                    "warning_ratio": 0.8,
                    "conservative_unpriced_cost_usd": 0.05,
                    "providers": {
                        "openai": {
                            "account_class": "paid",
                            "daily_usd": 0.05,
                            "monthly_usd": 0.05,
                        }
                    },
                },
            )
        )
        session.commit()

    run = RunRecord(
        run_id="run-budget-warning",
        site_id="site-budget-warning",
        account_id="account-budget-warning",
        ability_name="wordpress.title.generate",
        profile_id="profile-budget",
        execution_kind="text_generation",
        policy_json={"max_output_tokens": 1024},
    )
    request = ProviderExecutionRequest(
        run_id=run.run_id,
        site_id=run.site_id,
        ability_name=run.ability_name,
        profile_id=run.profile_id,
        execution_kind=run.execution_kind,
        model_id="unpriced-model",
        instance_id="openai-default",
        endpoint_variant="chat",
        trace_id="trace-budget-warning",
        input_payload={"prompt": "warn"},
        policy=run.policy_json,
        timeout_ms=1000,
    )

    with get_session(database_url) as session:
        receipt = ProviderBudgetService().claim_before_dispatch(
            session=session,
            run=run,
            provider_id="openai",
            model_id="unpriced-model",
            request=request,
        )
        assert receipt is not None
        assert receipt.warning is True
        counters = list(session.scalars(select(ProviderBudgetCounter)))
        assert len(counters) == 2
        assert all(counter.warning_emitted is True for counter in counters)

    dispose_engine(database_url)
