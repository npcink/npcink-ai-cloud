from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionRequest, ProviderExecutionResult
from app.core.db import get_engine, get_session
from app.core.models import (
    CreditLedgerEntry,
    ProviderBudgetClaim,
    ProviderBudgetCounter,
    ProviderCallRecord,
    RunRecord,
    ServiceSetting,
    UsageMeterEvent,
)
from app.domain.runtime.errors import (
    RuntimeConcurrencyExceededError,
    RuntimeQuotaExceededError,
)
from app.domain.runtime.provider_budget import SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET
from tests.conftest import seed_site_auth
from tests.domain.test_runtime_provider_execution_characterization import (
    SITE_ID,
    RecordingProviderAdapter,
    runtime_harness,
    runtime_request,
)


class InspectingProvider(RecordingProviderAdapter):
    before_execute: Callable[[ProviderExecutionRequest], None]

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.before_execute(request)
        return super().execute(request)


def provider(*, outcomes: list[dict[str, object]] | None = None) -> InspectingProvider:
    return InspectingProvider(
        provider_id="provider_primary",
        model_id="model_primary",
        instance_id="instance_primary_balanced",
        tier="balanced",
        outcomes=outcomes
        or [
            {
                "output": {"output_text": "bounded suggestion"},
                "tokens_in": 100,
                "tokens_out": 50,
                "cost": 0.0001,
            }
        ],
    )


def enable_spend_budget(database_url: str) -> None:
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json={
                    "providers": {
                        "provider_primary": {
                            "account_class": "paid",
                            "daily_usd": 100,
                            "monthly_usd": 100,
                        }
                    }
                },
            )
        )
        session.commit()


def test_dispatch_returns_connection_with_durable_admission_and_spend_claims(
    tmp_path: Path,
) -> None:
    adapter = provider()
    observed: list[str] = []
    with runtime_harness(tmp_path, [adapter]) as harness:
        enable_spend_budget(harness.database_url)

        def inspect(request: ProviderExecutionRequest) -> None:
            assert get_engine(harness.database_url).pool.checkedout() == 0
            # A separate reader must see the checkpoint while the Provider is waiting.
            with get_session(harness.database_url) as session:
                run = session.get(RunRecord, request.run_id)
                assert run is not None and run.status == "running"
                meters = list(session.scalars(select(UsageMeterEvent)))
                assert [(m.meter_key, m.quantity) for m in meters] == [("runs", 1)]
                claims = list(session.scalars(select(ProviderBudgetClaim)))
                counters = list(session.scalars(select(ProviderBudgetCounter)))
                assert len(claims) == len(counters) == 2
                assert all(c.status == "claimed" for c in claims)
                assert all(c.reserved_cost_usd > 0 for c in counters)
                assert session.scalar(select(ProviderCallRecord)) is None
            observed.append(request.run_id)

        adapter.before_execute = inspect
        response = harness.service.execute(
            runtime_request(
                idempotency_key="checkpoint",
                allow_fallback=False,
                retry_max=0,
            )
        )
        assert response.status == "succeeded" and observed == [response.run_id]
        with get_session(harness.database_url) as session:
            assert len(list(session.scalars(select(ProviderCallRecord)))) == 1
            assert len(list(session.scalars(select(UsageMeterEvent)))) == 7
            assert sum(c.ai_credit_delta for c in session.scalars(select(CreditLedgerEntry))) == -2
            assert all(
                c.status == "reconciled" for c in session.scalars(select(ProviderBudgetClaim))
            )
            assert all(
                c.reserved_cost_usd == pytest.approx(0.0001)
                for c in session.scalars(select(ProviderBudgetCounter))
            )


def test_inflight_replay_reuses_durable_run_without_another_provider_call(tmp_path: Path) -> None:
    adapter = provider()
    with runtime_harness(tmp_path, [adapter]) as harness:
        request = runtime_request(idempotency_key="inflight", allow_fallback=False, retry_max=0)

        def replay(provider_request: ProviderExecutionRequest) -> None:
            assert get_engine(harness.database_url).pool.checkedout() == 0
            response = harness.service.execute(request)
            assert response.run_id == provider_request.run_id
            assert response.status == "running" and response.idempotent_replay is True

        adapter.before_execute = replay
        response = harness.service.execute(request)
        assert response.status == "succeeded" and len(adapter.attempts) == 1
        replayed = harness.service.execute(request)
        assert replayed.run_id == response.run_id and replayed.idempotent_replay is True
        with get_session(harness.database_url) as session:
            assert len(list(session.scalars(select(RunRecord)))) == 1
            assert len(list(session.scalars(select(UsageMeterEvent)))) == 7
            assert sum(c.ai_credit_delta for c in session.scalars(select(CreditLedgerEntry))) == -2


@pytest.mark.parametrize("limit", ["concurrency", "credits"])
def test_durable_admission_still_enforces_limits_during_provider_wait(
    tmp_path: Path,
    limit: str,
) -> None:
    adapter = provider()
    with runtime_harness(tmp_path, [adapter]) as harness:
        seed_site_auth(
            harness.database_url,
            site_id=SITE_ID,
            concurrency={"max_active_runs": 1 if limit == "concurrency" else 8},
            budgets={"max_ai_credits_per_period": 1 if limit == "credits" else 1000},
        )

        def reject_another_request(_request: ProviderExecutionRequest) -> None:
            expected = (
                RuntimeConcurrencyExceededError
                if limit == "concurrency"
                else RuntimeQuotaExceededError
            )
            with pytest.raises(expected):
                harness.service.execute(
                    runtime_request(
                        idempotency_key="another",
                        allow_fallback=False,
                        retry_max=0,
                    )
                )

        adapter.before_execute = reject_another_request
        response = harness.service.execute(
            runtime_request(
                idempotency_key="admitted",
                allow_fallback=False,
                retry_max=0,
            )
        )
        assert response.status == "succeeded" and len(adapter.attempts) == 1


def test_retry_checkpoints_previous_call_evidence_before_next_provider_wait(tmp_path: Path) -> None:
    adapter = provider(
        outcomes=[
            {"error_code": "provider.rate_limited", "tokens_in": 7, "cost": 0.00001},
            {
                "output": {"output_text": "recovered"},
                "tokens_in": 100,
                "tokens_out": 50,
                "cost": 0.0001,
            },
        ]
    )
    with runtime_harness(tmp_path, [adapter]) as harness:

        def inspect(_request: ProviderExecutionRequest) -> None:
            assert get_engine(harness.database_url).pool.checkedout() == 0
            with get_session(harness.database_url) as session:
                calls = list(session.scalars(select(ProviderCallRecord)))
                assert len(calls) == len(adapter.attempts)
                if calls:
                    assert calls[0].error_code == "provider.rate_limited"

        adapter.before_execute = inspect
        response = harness.service.execute(
            runtime_request(
                idempotency_key="retry",
                allow_fallback=False,
                retry_max=1,
            )
        )
        assert response.status == "succeeded" and len(adapter.attempts) == 2
        with get_session(harness.database_url) as session:
            assert len(list(session.scalars(select(ProviderCallRecord)))) == 2
            meters = list(session.scalars(select(UsageMeterEvent)))
            # The zero output-token meter on the failed attempt remains omitted.
            assert len(meters) == 12
            assert sum(m.quantity for m in meters if m.meter_key == "tokens_total") == 157
            assert sum(m.quantity for m in meters if m.meter_key == "provider_calls") == 2


def test_unknown_dispatch_failure_preserves_evidence_and_never_automatically_replays(
    tmp_path: Path,
) -> None:
    adapter = provider()
    with runtime_harness(tmp_path, [adapter]) as harness:
        enable_spend_budget(harness.database_url)
        request = runtime_request(idempotency_key="unknown", allow_fallback=False, retry_max=0)

        def crash(_request: ProviderExecutionRequest) -> None:
            raise RuntimeError("simulated process failure after dispatch checkpoint")

        adapter.before_execute = crash
        with pytest.raises(RuntimeError, match="simulated process failure"):
            harness.service.execute(request)
        replay = harness.service.execute(request)
        assert replay.status == "running" and replay.idempotent_replay is True
        with get_session(harness.database_url) as session:
            run = session.get(RunRecord, replay.run_id)
            assert run is not None and run.finished_at is None
            assert run.callback_status == "not_requested"
            assert session.scalar(select(ProviderCallRecord)) is None
            assert len(list(session.scalars(select(UsageMeterEvent)))) == 1
            claims = list(session.scalars(select(ProviderBudgetClaim)))
            assert len(claims) == 2 and all(c.status == "claimed" for c in claims)
