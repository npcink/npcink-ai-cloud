"""Contract: every hosted provider dispatch passes the budget choke point.

ADR-055 requires every provider dispatch to claim the account-level spend
budget before the adapter call. This module enforces that contract with two
layers:

1. a behavioral check that the direct ``execute_provider`` path claims before
   dispatch and reconciles after it, including the error path;
2. a structural scan that fails when a new adapter ``execute`` call site
   appears outside the reviewed, claimed files, so a new dispatch path cannot
   silently bypass the choke point.
"""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.core.models import RunRecord
from app.domain.runtime.provider_budget import ProviderBudgetClaimReceipt
from app.domain.runtime.provider_execution import RuntimeProviderExecutionService

CLOUD_ROOT = Path(__file__).resolve().parents[2]

# Files allowed to contain a direct adapter execute call. Every entry is a
# dispatch path that claims the provider account budget before the adapter
# call; the reason names the claiming mechanism reviewed for that file.
CLAIMED_DISPATCH_FILES: dict[str, str] = {
    "app/domain/runtime/provider_execution.py": (
        "candidate chain and direct execute_provider choke points"
    ),
    "app/domain/advisor/service.py": "internal advisor summarizer claims before dispatch",
    "app/domain/image_context_evidence/service.py": (
        "image context evidence execution claims before dispatch"
    ),
    "app/domain/model_capabilities/probes.py": (
        "capability probes claim through _execute_probe before dispatch"
    ),
    "app/domain/provider_connections/service.py": (
        "image delivery probe and web search connection test claim before dispatch"
    ),
    "app/domain/site_knowledge/service.py": (
        "site knowledge embedding dispatch claims before provider execute"
    ),
    "app/domain/site_knowledge/vector_profile.py": (
        "vector profile probe claims before adapter execute"
    ),
}

# Adapter-internal delegation is not a dispatch entry point; the upstream
# dispatch path already claimed the budget for that attempt.
ADAPTER_INTERNAL_PREFIXES = ("app/adapters/",)

_EXECUTE_CALL_PATTERN = re.compile(r"(?:provider|adapter)\.execute\(")


class _RecordingBudgetGuard:
    def __init__(self, *, claim_ids: tuple[str, ...] = ("claim-1",)) -> None:
        self.claim_ids = claim_ids
        self.calls: list[str] = []
        self.reconcile_costs: list[float | None] = []

    def claim_before_dispatch(self, **_kwargs: object) -> ProviderBudgetClaimReceipt | None:
        self.calls.append("claim")
        return ProviderBudgetClaimReceipt(
            claim_ids=self.claim_ids,
            estimated_cost_usd=0.05,
            warning=False,
        )

    def reconcile(
        self,
        *,
        claim_ids: tuple[str, ...],
        actual_cost_usd: float | None,
        **_kwargs: object,
    ) -> None:
        self.calls.append("reconcile")
        self.reconcile_costs.append(actual_cost_usd)


class _RecordingProvider:
    provider_id = "openai"

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[str] = []

    def execute(self, _request: ProviderExecutionRequest) -> SimpleNamespace:
        self.calls.append("execute")
        if self.fail:
            raise ProviderExecutionError("provider.timeout", "boom")
        return SimpleNamespace(cost=0.02)


def _budget_request() -> ProviderExecutionRequest:
    return ProviderExecutionRequest(
        run_id="run-dispatch-contract",
        site_id="site-dispatch-contract",
        ability_name="wordpress.title.generate",
        profile_id="profile-dispatch-contract",
        execution_kind="text_generation",
        model_id="unpriced-model",
        instance_id="openai-default",
        endpoint_variant="chat",
        trace_id="trace-dispatch-contract",
        input_payload={"prompt": "contract"},
        policy={"max_output_tokens": 16},
        timeout_ms=1_000,
    )


def test_execute_provider_claims_before_dispatch_and_reconciles_after() -> None:
    guard = _RecordingBudgetGuard()
    provider = _RecordingProvider()
    service = RuntimeProviderExecutionService(usage_recorder=SimpleNamespace(), budget_guard=guard)

    result = service.execute_provider(
        provider,
        _budget_request(),
        session=SimpleNamespace(),
        run=RunRecord(
            run_id="run-dispatch-contract",
            site_id="site-dispatch-contract",
            ability_name="wordpress.title.generate",
            profile_id="profile-dispatch-contract",
            execution_kind="text_generation",
            policy_json={},
        ),
        provider_id="openai",
    )

    assert result.cost == pytest.approx(0.02)
    assert guard.calls == ["claim", "reconcile"]
    assert provider.calls == ["execute"]
    assert guard.reconcile_costs == [pytest.approx(0.02)]


def test_execute_provider_reconciles_reservation_when_dispatch_fails() -> None:
    guard = _RecordingBudgetGuard()
    provider = _RecordingProvider(fail=True)
    service = RuntimeProviderExecutionService(usage_recorder=SimpleNamespace(), budget_guard=guard)

    with pytest.raises(ProviderExecutionError):
        service.execute_provider(
            provider,
            _budget_request(),
            session=SimpleNamespace(),
            run=RunRecord(
                run_id="run-dispatch-contract",
                site_id="site-dispatch-contract",
                ability_name="wordpress.title.generate",
                profile_id="profile-dispatch-contract",
                execution_kind="text_generation",
                policy_json={},
            ),
            provider_id="openai",
        )

    assert guard.calls == ["claim", "reconcile"]
    assert guard.reconcile_costs == [None]


def test_every_adapter_execute_call_site_is_a_claimed_dispatch_path() -> None:
    unclaimed: list[str] = []
    stale: list[str] = []
    for path in sorted((CLOUD_ROOT / "app").rglob("*.py")):
        relative = path.relative_to(CLOUD_ROOT).as_posix()
        if relative.startswith(ADAPTER_INTERNAL_PREFIXES):
            continue
        text = path.read_text(encoding="utf-8")
        has_call_site = _EXECUTE_CALL_PATTERN.search(text) is not None
        if has_call_site and relative not in CLAIMED_DISPATCH_FILES:
            unclaimed.append(relative)
        if not has_call_site and relative in CLAIMED_DISPATCH_FILES:
            stale.append(relative)
    assert not unclaimed, (
        "New provider dispatch call sites must claim the provider account budget "
        f"before dispatch (ADR-055) or be reviewed into CLAIMED_DISPATCH_FILES: {unclaimed}"
    )
    assert not stale, f"Claimed dispatch files no longer contain execute call sites: {stale}"
