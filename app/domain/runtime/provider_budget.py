from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.adapters.providers.compatibility import NormalizedProviderUsage, estimate_token_cost
from app.core.models import (
    ProviderBudgetClaim,
    ProviderBudgetCounter,
    ProviderConnection,
    RunRecord,
    ServiceSetting,
)

SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET = "provider_account_spend_budget"
DEFAULT_CONSERVATIVE_UNPRICED_COST_USD = 0.05
DEFAULT_WARNING_RATIO = 0.8


@dataclass(frozen=True, slots=True)
class ProviderBudgetClaimReceipt:
    claim_ids: tuple[str, ...]
    estimated_cost_usd: float
    warning: bool


class ProviderBudgetService:
    """Single pre-dispatch spend fuse for every hosted provider attempt."""

    def __init__(self, now_factory: Callable[[], datetime] | None = None) -> None:
        self.now_factory = now_factory or (lambda: datetime.now(UTC))

    def claim_before_dispatch(
        self,
        *,
        session: Session,
        run: RunRecord,
        provider_id: str,
        model_id: str,
        request: ProviderExecutionRequest,
    ) -> ProviderBudgetClaimReceipt | None:
        row = session.get(ServiceSetting, SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET)
        if row is None or not row.enabled:
            return None
        config = row.config_json if isinstance(row.config_json, dict) else {}
        policy = self._resolve_policy(session, config, provider_id)
        if policy is None:
            if bool(config.get("require_provider_configuration", True)):
                raise ProviderExecutionError(
                    "provider.budget_configuration_missing",
                    f"provider spend budget is not configured for {provider_id}",
                    retryable=False,
                )
            return None
        account_class = str(policy.get("account_class") or "").strip() or "paid"
        daily_limit = self._positive_float(policy.get("daily_usd"))
        monthly_limit = self._positive_float(policy.get("monthly_usd"))
        if account_class == "paid" and (daily_limit <= 0 or monthly_limit <= 0):
            raise ProviderExecutionError(
                "provider.budget_configuration_missing",
                f"paid provider account {provider_id} has no daily/monthly spend budget",
                retryable=False,
            )
        if daily_limit <= 0 and monthly_limit <= 0:
            return None

        estimated_cost = self._estimate_dispatch_cost(request, config)
        dispatch_key = self._dispatch_key(run, provider_id, model_id, request.retry_count)
        existing_claims = list(
            session.scalars(
                select(ProviderBudgetClaim)
                .where(
                    ProviderBudgetClaim.dispatch_key.in_(
                        (f"{dispatch_key}:day", f"{dispatch_key}:month")
                    )
                )
                .order_by(ProviderBudgetClaim.claim_id.asc())
            )
        )
        if existing_claims:
            return ProviderBudgetClaimReceipt(
                claim_ids=tuple(item.claim_id for item in existing_claims),
                estimated_cost_usd=max(
                    float(item.reserved_cost_usd or 0.0) for item in existing_claims
                ),
                warning=False,
            )
        now = self.now_factory().astimezone(UTC)
        periods: list[tuple[str, datetime, datetime, float]] = []
        day_start = datetime(now.year, now.month, now.day, tzinfo=UTC)
        periods.append(("day", day_start, day_start + timedelta(days=1), daily_limit))
        month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
        if now.month == 12:
            next_month = datetime(now.year + 1, 1, 1, tzinfo=UTC)
        else:
            next_month = datetime(now.year, now.month + 1, 1, tzinfo=UTC)
        periods.append(("month", month_start, next_month, monthly_limit))

        counters: list[ProviderBudgetCounter] = []
        for period_kind, period_start, period_end, limit in periods:
            if limit <= 0:
                continue
            scope_key = self._scope_key(
                provider_id=provider_id,
                account_class=account_class,
                period_kind=period_kind,
                period_start=period_start,
            )
            self._ensure_counter(
                session,
                scope_key=scope_key,
                provider_id=provider_id,
                account_class=account_class,
                period_kind=period_kind,
                period_start=period_start,
                period_end=period_end,
                limit=limit,
            )
            counter = session.scalar(
                select(ProviderBudgetCounter)
                .where(ProviderBudgetCounter.scope_key == scope_key)
                .with_for_update()
            )
            if counter is None:
                raise ProviderExecutionError(
                    "provider.budget_configuration_missing",
                    "provider spend budget counter could not be initialized",
                    retryable=False,
                )
            counters.append(counter)

        if any(
            float(counter.reserved_cost_usd or 0.0) + estimated_cost
            > float(counter.limit_cost_usd or 0.0)
            for counter in counters
        ):
            raise ProviderExecutionError(
                "provider.budget_exceeded",
                f"provider spend budget exhausted for {provider_id}",
                retryable=False,
            )

        warning = False
        claim_ids: list[str] = []
        for counter in counters:
            counter.reserved_cost_usd = round(
                float(counter.reserved_cost_usd or 0.0) + estimated_cost,
                6,
            )
            ratio = float(counter.reserved_cost_usd) / max(float(counter.limit_cost_usd), 1e-9)
            warning = warning or ratio >= self._warning_ratio(config)
            if warning and not counter.warning_emitted:
                counter.warning_emitted = True
            claim_id = f"pclaim_{self._stable_id(dispatch_key + ':' + counter.period_kind)}"
            session.add(
                ProviderBudgetClaim(
                    claim_id=claim_id,
                    dispatch_key=f"{dispatch_key}:{counter.period_kind}",
                    scope_key=counter.scope_key,
                    run_id=run.run_id,
                    account_id=run.account_id,
                    provider_id=provider_id,
                    account_class=account_class,
                    period_kind=counter.period_kind,
                    reserved_cost_usd=estimated_cost,
                    actual_cost_usd=None,
                    status="claimed",
                )
            )
            claim_ids.append(claim_id)
        if warning:
            # The existing logging/alert pipeline can consume this structured
            # state without introducing a second notification channel.
            import logging

            logging.getLogger(__name__).warning(
                "provider spend budget reached warning threshold provider=%s account_class=%s",
                provider_id,
                account_class,
            )
        session.flush()
        return ProviderBudgetClaimReceipt(
            claim_ids=tuple(claim_ids),
            estimated_cost_usd=estimated_cost,
            warning=warning,
        )

    def reconcile(
        self,
        *,
        session: Session,
        claim_ids: tuple[str, ...],
        actual_cost_usd: float | None,
    ) -> None:
        now = self.now_factory().astimezone(UTC)
        for claim_id in claim_ids:
            claim = session.scalar(
                select(ProviderBudgetClaim)
                .where(ProviderBudgetClaim.claim_id == claim_id)
                .with_for_update()
            )
            if claim is None or claim.status == "reconciled":
                continue
            counter = session.scalar(
                select(ProviderBudgetCounter)
                .where(ProviderBudgetCounter.scope_key == claim.scope_key)
                .with_for_update()
            )
            actual = (
                float(claim.reserved_cost_usd or 0.0)
                if actual_cost_usd is None
                else max(0.0, float(actual_cost_usd))
            )
            if counter is not None:
                reserved = max(0.0, float(claim.reserved_cost_usd or 0.0))
                counter.reserved_cost_usd = round(
                    max(0.0, float(counter.reserved_cost_usd or 0.0) - reserved + actual),
                    6,
                )
            claim.actual_cost_usd = round(actual, 6)
            claim.status = "reconciled"
            claim.reconciled_at = now
        session.flush()

    @staticmethod
    def _resolve_policy(
        session: Session,
        config: dict[str, Any],
        provider_id: str,
    ) -> dict[str, Any] | None:
        providers = config.get("providers")
        provider_policy = providers.get(provider_id) if isinstance(providers, dict) else None
        if not isinstance(provider_policy, dict):
            provider_row = session.get(ProviderConnection, provider_id)
            if provider_row is not None:
                metadata = (
                    provider_row.metadata_json
                    if isinstance(provider_row.metadata_json, dict)
                    else {}
                )
                provider_policy = metadata.get("spend_budget")
                if not isinstance(provider_policy, dict):
                    connection_config = (
                        provider_row.config_json
                        if isinstance(provider_row.config_json, dict)
                        else {}
                    )
                    provider_policy = connection_config.get("spend_budget")
        return provider_policy if isinstance(provider_policy, dict) else None

    @staticmethod
    def _ensure_counter(
        session: Session,
        *,
        scope_key: str,
        provider_id: str,
        account_class: str,
        period_kind: str,
        period_start: datetime,
        period_end: datetime,
        limit: float,
    ) -> None:
        values = {
            "scope_key": scope_key,
            "provider_id": provider_id,
            "account_class": account_class,
            "period_kind": period_kind,
            "period_start_at": period_start,
            "period_end_at": period_end,
            "limit_cost_usd": limit,
            "reserved_cost_usd": 0.0,
            "warning_emitted": False,
        }
        dialect = session.bind.dialect.name if session.bind is not None else ""
        statement = (
            postgres_insert(ProviderBudgetCounter).values(**values)
            if dialect == "postgresql"
            else sqlite_insert(ProviderBudgetCounter).values(**values)
        ).on_conflict_do_nothing(index_elements=[ProviderBudgetCounter.scope_key])
        session.execute(statement)

    @staticmethod
    def _estimate_dispatch_cost(
        request: ProviderExecutionRequest,
        config: dict[str, Any],
    ) -> float:
        try:
            input_tokens = max(
                1,
                int(len(json.dumps(request.input_payload, ensure_ascii=False)) / 4),
            )
        except (TypeError, ValueError):
            input_tokens = 1024
        output_tokens = max(1, int(request.policy.get("max_output_tokens") or 1024))
        estimate = estimate_token_cost(
            NormalizedProviderUsage(
                total_input_tokens=input_tokens,
                output_tokens=output_tokens,
                uncached_input_tokens=input_tokens,
                cache_read_tokens=0,
                cache_write_tokens=0,
            ),
            price_input=request.price_input,
            price_output=request.price_output,
            price_cache_read=request.price_cache_read,
            price_cache_write=request.price_cache_write,
        )
        if estimate.total_cost > 0:
            return round(estimate.total_cost, 6)
        return max(
            0.000001,
            float(
                config.get("conservative_unpriced_cost_usd")
                or DEFAULT_CONSERVATIVE_UNPRICED_COST_USD
            ),
        )

    @staticmethod
    def _scope_key(
        *,
        provider_id: str,
        account_class: str,
        period_kind: str,
        period_start: datetime,
    ) -> str:
        return f"{provider_id}:{account_class}:{period_kind}:{period_start.isoformat()}"

    @staticmethod
    def _dispatch_key(
        run: RunRecord,
        provider_id: str,
        model_id: str,
        retry_count: int,
    ) -> str:
        return f"{run.run_id}:{provider_id}:{model_id}:{retry_count}"

    @staticmethod
    def _stable_id(value: str) -> str:
        import hashlib

        return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]

    @staticmethod
    def _positive_float(value: object) -> float:
        try:
            return max(0.0, float(str(value or 0.0)))
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _warning_ratio(config: dict[str, Any]) -> float:
        try:
            return min(1.0, max(0.01, float(config.get("warning_ratio") or DEFAULT_WARNING_RATIO)))
        except (TypeError, ValueError):
            return DEFAULT_WARNING_RATIO
