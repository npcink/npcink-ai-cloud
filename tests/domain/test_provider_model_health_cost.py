from datetime import UTC, datetime

import pytest

from app.core.models import ProviderCallRecord
from app.domain.provider_resources import _provider_model_health_row


@pytest.mark.parametrize(
    "cost,mode,known",
    [
        (0, "", False),
        (0.01, "partial_rates", False),
        (0, "unpriced", False),
        (0, "standard_rates", True),
        (0.0000004, "standard_rates", True),
    ],
)
def test_health_cost_completeness_and_small_amounts(cost: float, mode: str, known: bool) -> None:
    record = ProviderCallRecord(
        id=1,
        run_id="test",
        provider_id="local",
        model_id="model",
        instance_id="instance",
        region="local",
        latency_ms=1,
        cost=cost,
        created_at=datetime.now(UTC),
    )
    row = _provider_model_health_row(
        "local", "model", [record], recent_call_limit=200, cost_modes={1: mode}
    )
    assert row["cost_known"] is known
    assert row["unpriced_call_count"] == (0 if known else 1)
    assert row["cost"] == cost
