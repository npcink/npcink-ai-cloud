from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

ACCOUNTING_CURRENCY = "CNY"
PROVIDER_COST_CURRENCY = "USD"
SERVICE_SETTING_ACCOUNTING_FX = "commercial_accounting_fx"

DEFAULT_USD_CNY_RATE = Decimal("7.200000")
DEFAULT_EFFECTIVE_AT = datetime(2026, 7, 1, tzinfo=UTC)
DEFAULT_RATE_SOURCE = "platform_default"
MONEY_QUANTUM = Decimal("0.000001")
RATE_QUANTUM = Decimal("0.000001")


class AccountingFxValidationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class AccountingFxRate:
    usd_cny_rate: Decimal
    effective_at: datetime
    source: str
    note: str
    rate_version: str
    is_fallback: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "base_currency": PROVIDER_COST_CURRENCY,
            "quote_currency": ACCOUNTING_CURRENCY,
            "usd_cny_rate": format(self.usd_cny_rate, "f"),
            "effective_at": self.effective_at.isoformat(),
            "source": self.source,
            "note": self.note,
            "rate_version": self.rate_version,
            "is_fallback": self.is_fallback,
        }


def default_accounting_fx_rate() -> AccountingFxRate:
    return AccountingFxRate(
        usd_cny_rate=DEFAULT_USD_CNY_RATE,
        effective_at=DEFAULT_EFFECTIVE_AT,
        source=DEFAULT_RATE_SOURCE,
        note="Fallback accounting rate. Review and replace it with an operator-approved rate.",
        rate_version=_rate_version(DEFAULT_EFFECTIVE_AT, DEFAULT_USD_CNY_RATE),
        is_fallback=True,
    )


def build_accounting_fx_config(
    *,
    usd_cny_rate: object,
    effective_at: object,
    source: object,
    note: object = "",
) -> dict[str, object]:
    rate = _decimal_rate(usd_cny_rate)
    resolved_effective_at = _effective_at(effective_at)
    resolved_source = str(source or "").strip()
    if not resolved_source:
        raise AccountingFxValidationError("accounting FX source is required")
    if len(resolved_source) > 128:
        raise AccountingFxValidationError("accounting FX source must not exceed 128 characters")
    resolved_note = str(note or "").strip()
    if len(resolved_note) > 500:
        raise AccountingFxValidationError("accounting FX note must not exceed 500 characters")
    return {
        "base_currency": PROVIDER_COST_CURRENCY,
        "quote_currency": ACCOUNTING_CURRENCY,
        "usd_cny_rate": format(rate, "f"),
        "effective_at": resolved_effective_at.isoformat(),
        "source": resolved_source,
        "note": resolved_note,
        "rate_version": _rate_version(resolved_effective_at, rate),
    }


def resolve_accounting_fx_rate(config: object) -> AccountingFxRate:
    if not isinstance(config, dict):
        return default_accounting_fx_rate()
    try:
        normalized = build_accounting_fx_config(
            usd_cny_rate=config.get("usd_cny_rate"),
            effective_at=config.get("effective_at"),
            source=config.get("source"),
            note=config.get("note"),
        )
    except AccountingFxValidationError:
        return default_accounting_fx_rate()
    rate = Decimal(str(normalized["usd_cny_rate"]))
    effective_at = datetime.fromisoformat(str(normalized["effective_at"]))
    return AccountingFxRate(
        usd_cny_rate=rate,
        effective_at=effective_at,
        source=str(normalized["source"]),
        note=str(normalized["note"]),
        rate_version=str(normalized["rate_version"]),
        is_fallback=False,
    )


def convert_usd_to_cny(amount: object, rate: AccountingFxRate) -> Decimal:
    try:
        normalized_amount = Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise AccountingFxValidationError("USD amount must be numeric") from error
    if not normalized_amount.is_finite() or normalized_amount < 0:
        raise AccountingFxValidationError("USD amount must be a finite non-negative value")
    return (normalized_amount * rate.usd_cny_rate).quantize(
        MONEY_QUANTUM,
        rounding=ROUND_HALF_UP,
    )


def cost_snapshot(*, cost_usd: object, rate: AccountingFxRate) -> dict[str, Any]:
    try:
        normalized_usd = Decimal(str(cost_usd))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise AccountingFxValidationError("USD amount must be numeric") from error
    if not normalized_usd.is_finite() or normalized_usd < 0:
        raise AccountingFxValidationError("USD amount must be a finite non-negative value")
    normalized_usd = normalized_usd.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    return {
        "cost_usd": float(normalized_usd),
        "cost_cny": float(convert_usd_to_cny(normalized_usd, rate)),
        "accounting_fx": rate.as_dict(),
    }


def _decimal_rate(value: object) -> Decimal:
    try:
        rate = Decimal(str(value)).quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as error:
        raise AccountingFxValidationError("USD/CNY accounting rate must be numeric") from error
    if not rate.is_finite() or rate <= 0 or rate > Decimal("20"):
        raise AccountingFxValidationError(
            "USD/CNY accounting rate must be greater than 0 and no greater than 20"
        )
    return rate


def _effective_at(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        except ValueError as error:
            raise AccountingFxValidationError("accounting FX effective_at is invalid") from error
    if parsed.tzinfo is None:
        raise AccountingFxValidationError("accounting FX effective_at must include a timezone")
    return parsed.astimezone(UTC)


def _rate_version(effective_at: datetime, rate: Decimal) -> str:
    rate_token = format(rate, "f").replace(".", "_")
    return f"usd-cny-{effective_at.astimezone(UTC):%Y%m%dT%H%M%SZ}-{rate_token}"
