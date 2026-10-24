from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, select, text
from starlette.concurrency import run_in_threadpool

from app.api.auth import authorize_internal_request, get_cloud_services
from app.api.envelope import build_envelope
from app.core.db import get_session
from app.core.models import (
    PAYMENT_ORDER_STATUS_PAID,
    PAYMENT_ORDER_STATUS_REFUNDED,
    PAYMENT_REFUND_STATUS_SUCCEEDED,
    SUBSCRIPTION_STATUS_ACTIVE,
    SUBSCRIPTION_STATUS_TRIALING,
    AccountSubscription,
    PaymentOrder,
    PaymentRefund,
    ProviderCallRecord,
    RunRecord,
    UsageMeterEvent,
)

router = APIRouter(prefix="/admin/economics", tags=["service"])

_MONTH_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

FAMILY_ORDER = (
    "text",
    "vision",
    "web_search",
    "zhihu",
    "image_generation",
    "audio_generation",
    "knowledge",
    "embedding",
    "workflow",
    "automation",
    "mcp",
    "openclaw",
    "unknown",
)

USAGE_BY_FAMILY_NOTE = (
    "provider_call_cost_usd sums provider_call_records.cost for the month; "
    "search/image/audio costs may be under-estimated because configured "
    "cost_per_query defaults to 0. Runs and tokens come from usage meter events; "
    "provider call counts are a separate denominator. Historical paused families "
    "are read-only evidence, not an execution entrypoint."
)
REVENUE_NOTE = (
    "subscription_revenue_cny and credit_pack_revenue_cny count payment orders "
    "paid inside the month, including orders refunded later; refunds_cny "
    "subtracts succeeded refunds processed inside the same month. "
    "active_paid_accounts and trialing_accounts are current subscription "
    "snapshots, not month-scoped history."
)
ACCOUNTING_CURRENCY = "CNY"


def _month_bounds(month: str) -> tuple[datetime, datetime] | None:
    match = _MONTH_PATTERN.fullmatch(month.strip())
    if match is None:
        return None
    year = int(match.group(1))
    month_number = int(match.group(2))
    if not 1 <= year <= 9998:
        return None
    start = datetime(year, month_number, 1, tzinfo=UTC)
    if month_number == 12:
        end = datetime(year + 1, 1, 1, tzinfo=UTC)
    else:
        end = datetime(year, month_number + 1, 1, tzinfo=UTC)
    return start, end


def _error_response(
    *,
    status_code: int,
    error_code: str,
    message: str,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=build_envelope(
            status="error",
            error_code=error_code,
            message=message,
            revision="m7",
        ),
    )


def _serialize_datetime(value: datetime) -> str:
    normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return normalized.isoformat().replace("+00:00", "Z")


def _classify_provider_call_family(
    *,
    provider_id: str,
    ability_family: str,
    execution_kind: str,
) -> str:
    provider = provider_id.strip().lower()
    family = ability_family.strip().lower()
    kind = execution_kind.strip().lower()
    if provider == "zhihu":
        return "zhihu"
    if "search" in kind:
        return "web_search"
    if "audio" in kind or family == "audio":
        return "audio_generation"
    if "image" in kind:
        return "image_generation"
    return family or "unknown"


def _new_family_entry() -> dict[str, Any]:
    return {
        "runs": 0,
        "tokens_total": 0.0,
        "provider_call_cost_usd": 0.0,
        "provider_call_count": 0,
    }


def _load_usage_by_family(
    database_url: str,
    *,
    month_start: datetime,
    month_end: datetime,
) -> dict[str, Any]:
    families: dict[str, dict[str, Any]] = {}

    def ensure_family(family_key: str) -> dict[str, Any]:
        return families.setdefault(family_key or "unknown", _new_family_entry())

    with get_session(database_url) as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        run_rows = session.execute(
            select(
                UsageMeterEvent.ability_family,
                func.sum(UsageMeterEvent.quantity),
            )
            .where(
                UsageMeterEvent.meter_key == "runs",
                UsageMeterEvent.created_at >= month_start,
                UsageMeterEvent.created_at < month_end,
            )
            .group_by(UsageMeterEvent.ability_family)
        ).all()
        token_rows = session.execute(
            select(
                UsageMeterEvent.ability_family,
                func.sum(UsageMeterEvent.quantity),
            )
            .where(
                UsageMeterEvent.meter_key == "tokens_total",
                UsageMeterEvent.created_at >= month_start,
                UsageMeterEvent.created_at < month_end,
            )
            .group_by(UsageMeterEvent.ability_family)
        ).all()
        provider_call_rows = session.execute(
            select(
                ProviderCallRecord.provider_id,
                RunRecord.ability_family,
                RunRecord.execution_kind,
                func.count(ProviderCallRecord.id),
                func.sum(ProviderCallRecord.cost),
            )
            .join(RunRecord, RunRecord.run_id == ProviderCallRecord.run_id)
            .where(
                ProviderCallRecord.created_at >= month_start,
                ProviderCallRecord.created_at < month_end,
            )
            .group_by(
                ProviderCallRecord.provider_id,
                RunRecord.ability_family,
                RunRecord.execution_kind,
            )
        ).all()

    for ability_family, quantity in run_rows:
        ensure_family(str(ability_family or ""))["runs"] += int(float(quantity or 0))
    for ability_family, quantity in token_rows:
        entry = ensure_family(str(ability_family or ""))
        entry["tokens_total"] = round(
            float(entry["tokens_total"]) + float(quantity or 0.0),
            6,
        )

    provider_call_total_usd = 0.0
    for provider_id, ability_family, execution_kind, call_count, call_cost in provider_call_rows:
        family_key = _classify_provider_call_family(
            provider_id=str(provider_id or ""),
            ability_family=str(ability_family or ""),
            execution_kind=str(execution_kind or ""),
        )
        entry = ensure_family(family_key)
        resolved_count = int(call_count or 0)
        entry["provider_call_count"] = int(entry["provider_call_count"]) + resolved_count
        resolved_cost = float(call_cost or 0.0)
        entry["provider_call_cost_usd"] = round(
            float(entry["provider_call_cost_usd"]) + resolved_cost,
            6,
        )
        provider_call_total_usd = round(provider_call_total_usd + resolved_cost, 6)

    ordered_keys = sorted(
        families,
        key=lambda key: (
            FAMILY_ORDER.index(key) if key in FAMILY_ORDER else len(FAMILY_ORDER),
            key,
        ),
    )
    return {
        "generated_at": _serialize_datetime(datetime.now(UTC)),
        "families": {key: families[key] for key in ordered_keys},
        "provider_call_total_usd": provider_call_total_usd,
        "note": USAGE_BY_FAMILY_NOTE,
    }


@router.get("/usage-by-family")
async def get_economics_usage_by_family(
    request: Request,
    month: str = Query(...),
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    bounds = _month_bounds(month)
    if bounds is None:
        return _error_response(
            status_code=400,
            error_code="economics.month_invalid",
            message="month must use YYYY-MM format",
        )
    services = get_cloud_services(request)
    payload = await run_in_threadpool(
        _load_usage_by_family,
        services.settings.database_url,
        month_start=bounds[0],
        month_end=bounds[1],
    )
    return build_envelope(
        status="ok",
        message="economics usage by family loaded",
        data={"month": month, **payload},
        revision="m7",
    )


def _load_revenue(
    database_url: str,
    *,
    month_start: datetime,
    month_end: datetime,
) -> dict[str, Any]:
    # Aggregate in PostgreSQL: never load customer rows or invoke lifecycle reconciliation.
    is_pack = (PaymentOrder.metadata_json["purchase_kind"].as_string() == "credit_pack") | (
        PaymentOrder.plan_id.startswith("pack_", autoescape=True)
    )
    with get_session(database_url) as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        subscription_revenue, pack_revenue = session.execute(
            select(
                func.coalesce(func.sum(case((is_pack, 0), else_=PaymentOrder.amount)), 0),
                func.coalesce(func.sum(case((is_pack, PaymentOrder.amount), else_=0)), 0),
            ).where(
                PaymentOrder.status.in_([PAYMENT_ORDER_STATUS_PAID, PAYMENT_ORDER_STATUS_REFUNDED]),
                PaymentOrder.currency == ACCOUNTING_CURRENCY,
                PaymentOrder.paid_at >= month_start,
                PaymentOrder.paid_at < month_end,
            )
        ).one()
        refunds = session.scalar(
            select(func.coalesce(func.sum(PaymentRefund.amount), 0)).where(
                PaymentRefund.status == PAYMENT_REFUND_STATUS_SUCCEEDED,
                PaymentRefund.currency == ACCOUNTING_CURRENCY,
                PaymentRefund.succeeded_at >= month_start,
                PaymentRefund.succeeded_at < month_end,
            )
        )
        paid_accounts, trial_accounts = session.execute(
            select(
                func.count(func.distinct(AccountSubscription.account_id)).filter(
                    AccountSubscription.status == SUBSCRIPTION_STATUS_ACTIVE
                ),
                func.count(func.distinct(AccountSubscription.account_id)).filter(
                    AccountSubscription.status == SUBSCRIPTION_STATUS_TRIALING
                ),
            ).where(AccountSubscription.plan_id != "free")
        ).one()
    return {
        "generated_at": _serialize_datetime(datetime.now(UTC)),
        "subscription_revenue_cny": round(float(subscription_revenue), 6),
        "credit_pack_revenue_cny": round(float(pack_revenue), 6),
        "refunds_cny": round(float(refunds or 0), 6),
        "net_revenue_cny": round(
            float(subscription_revenue) + float(pack_revenue) - float(refunds or 0), 6
        ),
        "active_paid_accounts": int(paid_accounts),
        "trialing_accounts": int(trial_accounts),
        "account_counts_scope": "current_snapshot",
        "currency": ACCOUNTING_CURRENCY,
        "note": REVENUE_NOTE,
    }


@router.get("/revenue")
async def get_economics_revenue(
    request: Request,
    month: str = Query(...),
) -> Any:
    auth = await authorize_internal_request(request, require_idempotency=False)
    if auth is not None:
        return auth
    bounds = _month_bounds(month)
    if bounds is None:
        return _error_response(
            status_code=400,
            error_code="economics.month_invalid",
            message="month must use YYYY-MM format",
        )
    services = get_cloud_services(request)
    payload = await run_in_threadpool(
        _load_revenue,
        services.settings.database_url,
        month_start=bounds[0],
        month_end=bounds[1],
    )
    return build_envelope(
        status="ok",
        message="economics revenue loaded",
        data={"month": month, **payload},
        revision="m7",
    )
