from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    ProviderBudgetClaim,
    ProviderBudgetCounter,
    ProviderConnection,
    RunRecord,
    ServiceSetting,
)
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


def _budget_run(run_id: str) -> tuple[RunRecord, ProviderExecutionRequest]:
    run = RunRecord(
        run_id=run_id,
        site_id="site-budget-admin",
        account_id="account-budget-admin",
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
        trace_id=f"trace-{run_id}",
        input_payload={"prompt": "projection"},
        policy=run.policy_json,
        timeout_ms=1000,
    )
    return run, request


def test_provider_budget_admin_projection_aggregates_status_and_utilization(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'provider-budget-projection.sqlite3'}"
    init_schema(database_url)
    clock = [datetime(2026, 3, 15, 12, 0, tzinfo=UTC)]
    service = ProviderBudgetService(now_factory=lambda: clock[0])
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=False,
                status="ready",
                config_json={
                    "warning_ratio": 0.8,
                    "providers": {
                        "openai": {
                            "account_class": "paid",
                            "daily_usd": 10.0,
                            "monthly_usd": 100.0,
                        },
                        "spare": {
                            "account_class": "paid",
                            "daily_usd": 5.0,
                            "monthly_usd": 50.0,
                        },
                    },
                },
            )
        )
        for connection_id, enabled in (("openai", True), ("spare", False), ("mystery", True)):
            session.add(
                ProviderConnection(
                    connection_id=connection_id,
                    provider_type="openai_compatible",
                    display_name=connection_id.title(),
                    enabled=enabled,
                )
            )
        session.commit()

    day_start = datetime(2026, 3, 15, tzinfo=UTC)
    day_end = datetime(2026, 3, 16, tzinfo=UTC)
    month_start = datetime(2026, 3, 1, tzinfo=UTC)
    month_end = datetime(2026, 4, 1, tzinfo=UTC)

    def add_counter(**overrides: object) -> None:
        values: dict[str, object] = {
            "scope_key": overrides["scope_key"],
            "provider_id": overrides.get("provider_id", "openai"),
            "account_class": "paid",
            "period_kind": overrides["period_kind"],
            "period_start_at": day_start if overrides["period_kind"] == "day" else month_start,
            "period_end_at": day_end if overrides["period_kind"] == "day" else month_end,
            "limit_cost_usd": overrides["limit_cost_usd"],
            "reserved_cost_usd": overrides["reserved_cost_usd"],
            "warning_emitted": False,
        }
        with get_session(database_url) as session:
            session.add(ProviderBudgetCounter(**values))
            session.commit()

    with get_session(database_url) as session:
        disabled = service.admin_projection(session=session)
        assert disabled["status"] == "disabled"
        assert disabled["warning_ratio"] == 0.8
        assert disabled["configured_provider_count"] == 2
        assert disabled["missing_provider_ids"] == ["mystery"]
        assert {item["provider_id"] for item in disabled["items"]} == {"openai", "spare"}
        for item in disabled["items"]:
            assert item["reserved_cost_usd"] == 0.0
            assert item["remaining_cost_usd"] == item["limit_cost_usd"]
            assert item["utilization_ratio"] == 0.0
            assert item["warning"] is False
            assert item["exceeded"] is False
            assert item["period_start_at"] == ""
        assert [connection["provider_id"] for connection in disabled["connections"]] == [
            "mystery",
            "openai",
            "spare",
        ]

    add_counter(
        scope_key="openai:paid:day:warning",
        period_kind="day",
        limit_cost_usd=10.0,
        reserved_cost_usd=8.5,
    )
    add_counter(
        scope_key="openai:paid:month:warning",
        period_kind="month",
        limit_cost_usd=100.0,
        reserved_cost_usd=50.0,
    )

    with get_session(database_url) as session:
        setting = session.get(ServiceSetting, SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET)
        assert setting is not None
        setting.enabled = True
        session.flush()

        missing = service.admin_projection(session=session)
        assert missing["status"] == "missing_config"
        openai_day = next(
            item
            for item in missing["items"]
            if item["provider_id"] == "openai" and item["period_kind"] == "day"
        )
        assert openai_day["reserved_cost_usd"] == 8.5
        assert openai_day["remaining_cost_usd"] == 1.5
        assert openai_day["utilization_ratio"] == 0.85
        assert openai_day["warning"] is True
        assert openai_day["exceeded"] is False

        mystery = session.get(ProviderConnection, "mystery")
        assert mystery is not None
        mystery.enabled = False
        session.flush()

        warning = service.admin_projection(session=session)
        assert warning["status"] == "warning"
        assert warning["missing_provider_ids"] == []

        exceeded_counter = session.get(
            ProviderBudgetCounter,
            "openai:paid:month:warning",
        )
        assert exceeded_counter is not None
        exceeded_counter.reserved_cost_usd = 100.0
        session.flush()

        exceeded = service.admin_projection(session=session)
        assert exceeded["status"] == "exceeded"
        openai_month = next(
            item
            for item in exceeded["items"]
            if item["provider_id"] == "openai" and item["period_kind"] == "month"
        )
        assert openai_month["utilization_ratio"] == 1.0
        assert openai_month["exceeded"] is True
        assert openai_month["remaining_cost_usd"] == 0.0

    dispose_engine(database_url)


def test_provider_budget_policy_edit_updates_limit_without_resetting_usage(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'provider-budget-policy-edit.sqlite3'}"
    init_schema(database_url)
    clock = [datetime(2026, 3, 15, 12, 0, tzinfo=UTC)]
    service = ProviderBudgetService(now_factory=lambda: clock[0])
    config: dict[str, object] = {
        "warning_ratio": 0.8,
        "conservative_unpriced_cost_usd": 0.05,
        "providers": {
            "openai": {
                "account_class": "paid",
                "daily_usd": 0.06,
                "monthly_usd": 10.0,
            }
        },
    }
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json=config,
            )
        )
        session.commit()

    first_run, first_request = _budget_run("run-budget-policy-a")
    with get_session(database_url) as session:
        receipt = service.claim_before_dispatch(
            session=session,
            run=first_run,
            provider_id="openai",
            model_id="unpriced-model",
            request=first_request,
        )
        assert receipt is not None
        session.commit()

    second_run, second_request = _budget_run("run-budget-policy-b")
    with get_session(database_url) as session:
        with pytest.raises(ProviderExecutionError) as error:
            service.claim_before_dispatch(
                session=session,
                run=second_run,
                provider_id="openai",
                model_id="unpriced-model",
                request=second_request,
            )
        assert error.value.error_code == "provider.budget_exceeded"
        session.rollback()

    edited_config = {
        **config,
        "providers": {
            "openai": {
                "account_class": "paid",
                "daily_usd": 0.2,
                "monthly_usd": 10.0,
            }
        },
    }
    with get_session(database_url) as session:
        setting = session.get(ServiceSetting, SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET)
        assert setting is not None
        setting.config_json = edited_config
        session.commit()

    with get_session(database_url) as session:
        receipt = service.claim_before_dispatch(
            session=session,
            run=second_run,
            provider_id="openai",
            model_id="unpriced-model",
            request=second_request,
        )
        assert receipt is not None
        session.commit()

        day_counter = session.scalar(
            select(ProviderBudgetCounter).where(ProviderBudgetCounter.period_kind == "day")
        )
        assert day_counter is not None
        assert day_counter.limit_cost_usd == 0.2
        assert day_counter.reserved_cost_usd == 0.1
        claims = list(session.scalars(select(ProviderBudgetClaim)))
        assert len(claims) == 4
        assert len({claim.run_id for claim in claims}) == 2

    dispose_engine(database_url)
