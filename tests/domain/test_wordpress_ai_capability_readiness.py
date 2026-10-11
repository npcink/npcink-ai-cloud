from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from unittest.mock import Mock

import pytest

from app.domain.routing.errors import RoutingNoCandidatesError
from app.domain.routing.service import RoutingService
from app.domain.wordpress_ai_connector.readiness import build_wordpress_ai_capabilities

NOW = datetime(2026, 9, 8, tzinfo=UTC)


def _policy() -> dict[str, Any]:
    return {
        "site": {"status": "active"},
        "subscription": {"status": "active"},
        "period_end_at": "2026-10-01T00:00:00Z",
        "entitlement_snapshot": {"status": "active"},
        "plan_version": {
            "entitlements": {
                "ability_families": ["*"],
                "channels": ["*"],
                "execution_kinds": ["*"],
                "execution_tiers": ["cloud"],
                "data_classifications": ["*"],
            },
        },
    }


def test_snapshot_resolves_every_profile_without_executing_or_mutating_policy() -> None:
    routing = Mock(spec=RoutingService)
    policy = _policy()
    before = deepcopy(policy)
    snapshot = build_wordpress_ai_capabilities(
        policy=policy,
        routing=routing,
        provider_ids={"provider"},
        now=NOW,
    )
    assert policy == before
    assert snapshot["provider_call_performed"] is False
    assert snapshot["runtime_admission_required"] is True
    assert snapshot["checked_at"] == "2026-09-08T00:00:00Z"
    assert snapshot["max_age_seconds"] == 300
    assert all(item["state"] == "configured" for item in snapshot["capabilities"].values())
    assert routing.resolve.call_count == 5
    assert {call.kwargs["profile_id"] for call in routing.resolve.call_args_list} >= {
        "wp-ai.short-text",
        "wp-ai.editorial",
        "wp-ai.classification",
    }


def test_one_missing_editorial_route_prevents_advertising_whole_text_model() -> None:
    routing = Mock(spec=RoutingService)

    def resolve(*, profile_id: str, execution_kind: str) -> None:
        if profile_id == "wp-ai.editorial":
            raise RoutingNoCandidatesError(profile_id)

    routing.resolve.side_effect = resolve
    snapshot = build_wordpress_ai_capabilities(
        policy=_policy(),
        routing=routing,
        provider_ids={"provider"},
        now=NOW,
    )
    capabilities = snapshot["capabilities"]
    assert capabilities["text_generation"]["state"] == "unavailable"
    assert capabilities["text_generation"]["reason_code"] == "no_eligible_model"
    assert capabilities["image_generation"]["state"] == "configured"
    assert capabilities["vision"]["state"] == "configured"


def test_empty_provider_registry_never_uses_routing_services_unrestricted_default() -> None:
    routing = Mock(spec=RoutingService)
    snapshot = build_wordpress_ai_capabilities(
        policy=_policy(),
        routing=routing,
        provider_ids=set(),
        now=NOW,
    )
    routing.resolve.assert_not_called()
    assert all(
        item["reason_code"] == "provider_unavailable" for item in snapshot["capabilities"].values()
    )


@pytest.mark.parametrize(
    "dimension,allowed,blocked",
    [
        ("execution_kinds", ["text"], {"vision", "image_generation"}),
        ("channels", ["editor"], {"image_generation"}),
        ("ability_families", ["vision"], {"text_generation"}),
        ("execution_tiers", ["local"], {"text_generation", "vision", "image_generation"}),
        ("data_classifications", ["public"], {"text_generation", "vision", "image_generation"}),
    ],
)
def test_entitlement_dimensions_are_projected_per_capability(
    dimension: str,
    allowed: list[str],
    blocked: set[str],
) -> None:
    policy = _policy()
    policy["plan_version"]["entitlements"][dimension] = allowed
    snapshot = build_wordpress_ai_capabilities(
        policy=policy,
        routing=Mock(spec=RoutingService),
        provider_ids={"provider"},
        now=NOW,
    )
    assert {
        key for key, item in snapshot["capabilities"].items() if item["state"] == "unavailable"
    } == blocked


@pytest.mark.parametrize("end", ["2026-09-01T00:00:00Z", "invalid", "2026-10-01T00:00:00"])
def test_subscription_requiring_renewal_is_unknown_without_renewal_side_effects(end: str) -> None:
    policy = _policy()
    policy["subscription"]["status"] = "trialing"
    policy["period_end_at"] = end
    snapshot = build_wordpress_ai_capabilities(
        policy=policy,
        routing=Mock(spec=RoutingService),
        provider_ids={"provider"},
        now=NOW,
    )
    assert all(item["state"] == "unknown" for item in snapshot["capabilities"].values())


def test_active_billing_period_rollover_does_not_block_the_request_that_renews_it() -> None:
    policy = _policy()
    policy["period_end_at"] = "2026-09-01T00:00:00Z"
    before = deepcopy(policy)
    snapshot = build_wordpress_ai_capabilities(
        policy=policy,
        routing=Mock(spec=RoutingService),
        provider_ids={"provider"},
        now=NOW,
    )
    assert policy == before
    assert all(item["state"] == "configured" for item in snapshot["capabilities"].values())


def test_unexpected_routing_failure_is_not_misrepresented_as_unconfigured() -> None:
    routing = Mock(spec=RoutingService)
    routing.resolve.side_effect = RuntimeError("database unreachable")
    with pytest.raises(RuntimeError, match="database unreachable"):
        build_wordpress_ai_capabilities(
            policy=_policy(), routing=routing, provider_ids={"provider"}, now=NOW
        )
