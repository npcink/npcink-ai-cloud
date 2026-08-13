from __future__ import annotations

from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.plan_catalog import (
    CANONICAL_TIER_PLAN_IDS,
    DEFAULT_FREE_PLAN_ID,
    DEFAULT_FREE_PLAN_KIND,
    DEFAULT_FREE_PLAN_SOURCE,
    DEFAULT_FREE_PLAN_VERSION_ID,
    DEFAULT_FREE_SUBSCRIPTION_SOURCE,
    DEFAULT_PLAN_TIER_ID,
    PLAN_TIER_REGISTRY,
)

__all__ = [
    "CANONICAL_TIER_PLAN_IDS",
    "CommercialService",
    "DEFAULT_FREE_PLAN_ID",
    "DEFAULT_FREE_PLAN_KIND",
    "DEFAULT_FREE_PLAN_SOURCE",
    "DEFAULT_FREE_PLAN_VERSION_ID",
    "DEFAULT_FREE_SUBSCRIPTION_SOURCE",
    "DEFAULT_PLAN_TIER_ID",
    "PLAN_TIER_REGISTRY",
    "ServiceAuditContext",
]

ALLOWED_ABILITY_FAMILIES = {
    "text",
    "vision",
    "workflow",
    "automation",
    "mcp",
    "openclaw",
    "knowledge",
}
DEFAULT_RUNTIME_ENTITLEMENTS = {
    "ability_families": ["*"],
    "channels": ["*"],
    "execution_kinds": ["*"],
    "execution_tiers": ["cloud"],
    "data_classifications": ["*"],
}
DEFAULT_RUNTIME_BUDGETS: dict[str, object] = {
    "max_ai_credits_per_period": 0.0,
    "max_runs_per_period": 0,
    "max_tokens_per_period": 0,
    "max_cost_cny_per_period": 0.0,
}
DEFAULT_RUNTIME_CONCURRENCY: dict[str, object] = {
    "max_active_runs": 0,
}
DEFAULT_RUNTIME_COMMERCIAL_POLICY = {
    "subscription": {
        "grace_period_days": 0,
        "downgrade_policy": {},
    },
    "budgets": {
        "runs": {
            "grace_requests": 0,
            "downgrade_policy": {},
        },
        "tokens": {
            "grace_requests": 0,
            "downgrade_policy": {},
        },
        "cost": {
            "grace_requests": 0,
            "downgrade_policy": {},
        },
    },
    "reconciliation": {
        "tolerance": {
            "runs": 0.0,
            "provider_calls": 0.0,
            "tokens_total": 0.0,
            "cost": 0.0,
        }
    },
}
SHADOW_PRICING_TARIFF_VERSION = "shadow-pricing-v1"
SHADOW_PRICING_TARIFF_REGISTRY: dict[str, dict[str, dict[str, float | str]]] = {
    "ability": {
        "npcink-abilities-toolkit/build-article-block-plan": {
            "tariff_class": "medium",
            "base_run_price": 0.08,
            "per_1k_tokens_price": 0.018,
        },
        "workflow/media_nightly_image_optimize": {
            "tariff_class": "high",
            "base_run_price": 0.16,
            "per_1k_tokens_price": 0.024,
        },
    },
    "ability_family": {
        "text": {
            "tariff_class": "medium",
            "base_run_price": 0.05,
            "per_1k_tokens_price": 0.014,
        },
        "vision": {
            "tariff_class": "high",
            "base_run_price": 0.18,
            "per_1k_tokens_price": 0.028,
        },
        "workflow": {
            "tariff_class": "medium",
            "base_run_price": 0.07,
            "per_1k_tokens_price": 0.016,
        },
        "automation": {
            "tariff_class": "low",
            "base_run_price": 0.03,
            "per_1k_tokens_price": 0.01,
        },
        "mcp": {
            "tariff_class": "medium",
            "base_run_price": 0.04,
            "per_1k_tokens_price": 0.012,
        },
        "openclaw": {
            "tariff_class": "high",
            "base_run_price": 0.12,
            "per_1k_tokens_price": 0.02,
        },
        "knowledge": {
            "tariff_class": "low",
            "base_run_price": 0.02,
            "per_1k_tokens_price": 0.0,
        },
    },
}
OPERATOR_MANAGED_POINTS_PACK_REGISTRY: dict[str, dict[str, object]] = {
    "pack_small": {
        "pack_id": "pack_small",
        "label": "Small pack",
        "points_label": "10,000 points equivalent",
        "points_equivalent": 10_000,
        "ai_credits_increment": 10_000,
        "display_order": 1,
        "recommended_for_tiers": ["free", "plus"],
        "active": True,
        "runs_increment": 10_000,
        "tokens_increment": 2_000_000,
        "cost_cny_increment": 99.0,
        "operator_note": "Use when the current billing period needs basic-tier-sized budget headroom without rebinding the subscription.",
    },
    "pack_medium": {
        "pack_id": "pack_medium",
        "label": "Medium pack",
        "points_label": "35,000 points equivalent",
        "points_equivalent": 35_000,
        "ai_credits_increment": 35_000,
        "display_order": 2,
        "recommended_for_tiers": ["pro", "agency"],
        "active": True,
        "runs_increment": 35_000,
        "tokens_increment": 7_000_000,
        "cost_cny_increment": 349.0,
        "operator_note": "Use when sustained workflow pressure needs materially higher current-period headroom before a package review.",
    },
    "pack_large": {
        "pack_id": "pack_large",
        "label": "Large pack",
        "points_label": "150,000 points equivalent",
        "points_equivalent": 150_000,
        "ai_credits_increment": 150_000,
        "display_order": 3,
        "recommended_for_tiers": ["agency"],
        "active": True,
        "runs_increment": 150_000,
        "tokens_increment": 30_000_000,
        "cost_cny_increment": 1_499.0,
        "operator_note": "Use when an operator needs a high-headroom current-period top-up without introducing a wallet or self-serve flow.",
    },
}


from app.domain.commercial.mixins import (
    CommercialServiceAccountMixin,
    CommercialServiceAdminMixin,
    CommercialServiceAuditMixin,
    CommercialServiceBillingMixin,
    CommercialServicePaymentMixin,
    CommercialServicePortalMixin,
    CommercialServiceRuntimeMixin,
    CommercialServiceSiteMixin,
    CommercialServiceSubscriptionCommerceMixin,
    CommercialServiceSupportMixin,
)


class CommercialService(
    CommercialServiceSubscriptionCommerceMixin,
    CommercialServiceAccountMixin,
    CommercialServiceSiteMixin,
    CommercialServiceBillingMixin,
    CommercialServicePaymentMixin,
    CommercialServicePortalMixin,
    CommercialServiceSupportMixin,
    CommercialServiceAdminMixin,
    CommercialServiceRuntimeMixin,
    CommercialServiceAuditMixin,
):
    """Commercial service facade composed from domain-specific mixins."""

    pass


__all__ = [
    "CommercialService",
    "ServiceAuditContext",
]
