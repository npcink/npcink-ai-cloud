"""Read-only configuration evidence for the fixed WordPress AI connector models."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.domain.routing.errors import RoutingError
from app.domain.routing.service import RoutingService
from app.domain.wordpress_ai_connector.routing_profiles import (
    WP_AI_CONNECTOR_PROFILE_SPECS,
)

CONTRACT_VERSION = "wordpress-ai-capabilities-v1"
CAPABILITY_KINDS = {
    "text_generation": "text",
    "image_generation": "image_generation",
    "vision": "vision",
}


def _mapping(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _entitlement_state(
    policy: dict[str, object],
    execution_kind: str,
    now: datetime,
) -> tuple[str, str]:
    site = _mapping(policy.get("site"))
    subscription = _mapping(policy.get("subscription"))
    snapshot = _mapping(policy.get("entitlement_snapshot"))
    plan = _mapping(policy.get("plan_version"))
    if site.get("status") != "active":
        return "unavailable", "site_inactive"
    if not subscription:
        return "unavailable", "subscription_missing"
    if subscription.get("status") not in {"active", "trialing"}:
        # Grace and renewal are runtime decisions; a read must not execute them.
        return "unknown", "subscription_requires_runtime_check"
    try:
        end = datetime.fromisoformat(str(policy.get("period_end_at") or ""))
        if end.tzinfo is None or (end <= now and subscription.get("status") == "trialing"):
            return "unknown", "subscription_requires_runtime_check"
    except ValueError:
        return "unknown", "subscription_requires_runtime_check"
    if not snapshot or snapshot.get("status") != "active":
        return "unavailable", "entitlement_missing"
    # Active subscriptions renew their billing period on execution. Hiding their
    # models at rollover would prevent the request that performs that renewal.
    entitlements = _mapping((plan or snapshot).get("entitlements"))
    if not entitlements:
        return "unknown", "entitlement_unknown"
    # This is the normalized entitlement projection, not a second admission check.
    dimensions = {
        "ability_families": "text" if execution_kind == "text" else "vision",
        "channels": "wordpress_ai_connector" if execution_kind == "image_generation" else "editor",
        "execution_kinds": execution_kind,
        "execution_tiers": "cloud",
        "data_classifications": "internal",
    }
    for key, actual in dimensions.items():
        allowed = entitlements.get(key)
        if not isinstance(allowed, list):
            return "unknown", "entitlement_unknown"
        if allowed and "*" not in allowed and actual not in allowed:
            return "unavailable", "entitlement_denied"
    return "configured", "configured"


def build_wordpress_ai_capabilities(
    *,
    policy: dict[str, object],
    routing: RoutingService,
    provider_ids: set[str],
    now: datetime | None = None,
) -> dict[str, object]:
    checked_at = now or datetime.now(UTC)
    capabilities: dict[str, object] = {}
    for capability, execution_kind in CAPABILITY_KINDS.items():
        entitlement, entitlement_reason = _entitlement_state(policy, execution_kind, checked_at)
        routing_state, routing_reason = "configured", "configured"
        profiles = [
            spec for spec in WP_AI_CONNECTOR_PROFILE_SPECS if spec.execution_kind == execution_kind
        ]
        if not provider_ids:
            routing_state, routing_reason = "unavailable", "provider_unavailable"
        else:
            for spec in profiles:
                try:
                    routing.resolve(profile_id=spec.profile_id, execution_kind=execution_kind)
                except RoutingError as error:
                    routing_state = "unavailable"
                    routing_reason = {
                        "routing.profile_not_found": "profile_not_configured",
                        "routing.no_candidates": "no_eligible_model",
                        "routing.execution_kind_mismatch": "profile_capability_mismatch",
                    }.get(error.error_code, "routing_unavailable")
                    break
        state, reason = (
            (entitlement, entitlement_reason)
            if entitlement != "configured"
            else (routing_state, routing_reason)
        )
        capabilities[capability] = {
            "state": state,
            "reason_code": reason,
            "configuration_state": routing_state,
            "entitlement_state": entitlement,
        }
    return {
        "contract_version": CONTRACT_VERSION,
        "checked_at": checked_at.isoformat().replace("+00:00", "Z"),
        "max_age_seconds": 300,
        "evidence_kind": "configuration_snapshot",
        "runtime_admission_required": True,
        "provider_call_performed": False,
        "capabilities": capabilities,
    }
