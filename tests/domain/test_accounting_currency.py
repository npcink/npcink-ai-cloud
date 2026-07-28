from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.domain.commercial.currency import (
    AccountingFxValidationError,
    build_accounting_fx_config,
    convert_usd_to_cny,
    default_accounting_fx_rate,
    resolve_accounting_fx_rate,
)


def test_default_accounting_rate_is_explicit_fallback() -> None:
    rate = default_accounting_fx_rate()

    assert rate.usd_cny_rate == Decimal("7.200000")
    assert rate.is_fallback is True
    assert rate.rate_version == "usd-cny-20260701T000000Z-7_200000"


def test_accounting_rate_config_is_normalized_and_versioned() -> None:
    config = build_accounting_fx_config(
        usd_cny_rate="7.1234567",
        effective_at="2026-07-28T08:00:00+08:00",
        source="operator-approved monthly rate",
        note="July accounting close",
    )
    rate = resolve_accounting_fx_rate(config)

    assert config["usd_cny_rate"] == "7.123457"
    assert config["effective_at"] == "2026-07-28T00:00:00+00:00"
    assert config["rate_version"] == "usd-cny-20260728T000000Z-7_123457"
    assert rate.is_fallback is False
    assert convert_usd_to_cny("0.107310", rate) == Decimal("0.764418")


@pytest.mark.parametrize(
    ("rate", "effective_at", "source"),
    [
        ("0", datetime(2026, 7, 28, tzinfo=UTC), "operator"),
        ("21", datetime(2026, 7, 28, tzinfo=UTC), "operator"),
        ("7.2", datetime(2026, 7, 28), "operator"),
        ("7.2", datetime(2026, 7, 28, tzinfo=UTC), ""),
    ],
)
def test_accounting_rate_rejects_invalid_contract(
    rate: str,
    effective_at: datetime,
    source: str,
) -> None:
    with pytest.raises(AccountingFxValidationError):
        build_accounting_fx_config(
            usd_cny_rate=rate,
            effective_at=effective_at,
            source=source,
        )
