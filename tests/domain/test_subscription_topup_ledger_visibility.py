from __future__ import annotations

from types import SimpleNamespace

from app.domain.commercial.credits import (
    PACKAGE_CREDIT_EXCLUDED_SOURCE_TYPES,
    SUBSCRIPTION_TOPUP_SOURCE_TYPE,
    package_credit_net_delta,
    package_credit_remaining_from_net_delta,
)


def test_subscription_topup_source_excluded_from_package_net() -> None:
    assert SUBSCRIPTION_TOPUP_SOURCE_TYPE in PACKAGE_CREDIT_EXCLUDED_SOURCE_TYPES
    entries = [
        SimpleNamespace(source_type="runs", ai_credit_delta=-100.0),
        SimpleNamespace(
            source_type=SUBSCRIPTION_TOPUP_SOURCE_TYPE,
            ai_credit_delta=5000.0,
        ),
        SimpleNamespace(source_type="operator_credit_adjustment", ai_credit_delta=10.0),
    ]
    net = package_credit_net_delta(entries)
    assert net == -90.0
    # package_limit already includes the top-up; remaining must not double-count it
    assert package_credit_remaining_from_net_delta(10000.0, net) == 9910.0
