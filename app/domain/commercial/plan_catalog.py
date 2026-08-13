"""Canonical commercial plan tier catalog shared by all commercial layers."""

# Catalog copy intentionally preserves operator-facing copy and stable values.
# ruff: noqa: E501

from __future__ import annotations

PLAN_TIER_REGISTRY: dict[str, dict[str, object]] = {
    "free": {
        "tier_id": "free",
        "label": "Free",
        "package_alias": "Free",
        "usage_band": "300 AI credits per month.",
        "positioning": "Conservative single-site package with a small monthly AI credit grant and separate resource boundaries.",
        "monthly_included_points": 300,
        "budgets_template": {
            "max_ai_credits_per_period": 300,
            "max_runs_per_period": 0,
            "max_tokens_per_period": 0,
            "max_cost_cny_per_period": 0.0,
        },
        "concurrency_template": {"max_active_runs": 1},
        "site_limit": 1,
        "max_vector_documents": 100,
        "max_batch_items": 5,
        "nightly_inspection_runs_per_period": 0,
        "nightly_inspection_retention_days": 14,
        "nightly_inspection_payload_modes": ["metadata_only"],
        "automation_enabled": True,
        "api_enabled": True,
        "openclaw_enabled": True,
        "package_operator_note": "Free limits high-cost AI consumption through monthly AI credits while keeping ordinary Cloud service usage reviewable.",
        "policy_baseline": {
            "grace_period_days": 0,
            "downgrade_policy": "No package-limit downgrade while the unreleased product is in internal development.",
        },
        "feature_groups": [
            "Hosted runtime baseline",
            "Portal usage visibility",
            "Operator-managed subscription changes",
        ],
    },
    "plus": {
        "tier_id": "plus",
        "label": "Plus",
        "package_alias": "Plus",
        "usage_band": "3,000 AI credits per month.",
        "positioning": "Entry paid Plus package for accounts that have outgrown Free but do not yet need full Pro monthly AI credit headroom.",
        "monthly_included_points": 3_000,
        "budgets_template": {
            "max_ai_credits_per_period": 3_000,
            "max_runs_per_period": 0,
            "max_tokens_per_period": 0,
            "max_cost_cny_per_period": 0.0,
        },
        "concurrency_template": {"max_active_runs": 2},
        "site_limit": 3,
        "max_vector_documents": 800,
        "max_batch_items": 15,
        "nightly_inspection_runs_per_period": 0,
        "nightly_inspection_retention_days": 14,
        "nightly_inspection_payload_modes": ["metadata_only", "excerpt"],
        "automation_enabled": True,
        "api_enabled": True,
        "openclaw_enabled": True,
        "package_operator_note": "Plus gives early paid accounts a controlled step up from Free while keeping Pro as the normal hosted AI package.",
        "policy_baseline": {
            "grace_period_days": 3,
            "downgrade_policy": "No package-limit downgrade while the unreleased product is in internal development.",
        },
        "feature_groups": [
            "Hosted runtime + workflow coverage",
            "Starter paid usage headroom",
            "Operator-managed subscription changes",
        ],
    },
    "pro": {
        "tier_id": "pro",
        "label": "Pro",
        "package_alias": "Pro",
        "usage_band": "10,000 AI credits per month.",
        "positioning": "Commercial Pro package with normal hosted AI consumption controlled by monthly AI credits and separate resource boundaries.",
        "monthly_included_points": 10_000,
        "budgets_template": {
            "max_ai_credits_per_period": 10_000,
            "max_runs_per_period": 0,
            "max_tokens_per_period": 0,
            "max_cost_cny_per_period": 0.0,
        },
        "concurrency_template": {"max_active_runs": 3},
        "site_limit": 5,
        "max_vector_documents": 2_000,
        "max_batch_items": 25,
        "nightly_inspection_runs_per_period": 0,
        "nightly_inspection_retention_days": 14,
        "nightly_inspection_payload_modes": ["metadata_only", "excerpt"],
        "automation_enabled": True,
        "api_enabled": True,
        "openclaw_enabled": True,
        "package_operator_note": "Pro keeps ordinary usage broadly available while high-cost AI search, query, and generation paths spend AI credits.",
        "policy_baseline": {
            "grace_period_days": 3,
            "downgrade_policy": "No package-limit downgrade while the unreleased product is in internal development.",
        },
        "feature_groups": [
            "Hosted runtime + workflow coverage",
            "Automation-heavy usage",
            "Operator-led budget follow-up",
        ],
    },
    "agency": {
        "tier_id": "agency",
        "label": "Agency",
        "package_alias": "Agency",
        "usage_band": "150,000 AI credits per month.",
        "positioning": "Commercial Agency package for custom or multi-site Cloud runtime detail with higher AI credit, batch, and resource headroom.",
        "monthly_included_points": 150_000,
        "budgets_template": {
            "max_ai_credits_per_period": 150_000,
            "max_runs_per_period": 0,
            "max_tokens_per_period": 0,
            "max_cost_cny_per_period": 0.0,
        },
        "concurrency_template": {"max_active_runs": 10},
        "site_limit": 25,
        "max_vector_documents": 10_000,
        "max_batch_items": 100,
        "nightly_inspection_runs_per_period": 0,
        "nightly_inspection_retention_days": 30,
        "nightly_inspection_payload_modes": ["metadata_only", "excerpt"],
        "automation_enabled": True,
        "api_enabled": True,
        "openclaw_enabled": True,
        "package_operator_note": "Agency represents custom/high-volume coverage; AI credits remain the primary high-cost consumption control.",
        "policy_baseline": {
            "grace_period_days": 7,
            "downgrade_policy": "No package-limit downgrade while the unreleased product is in internal development.",
        },
        "feature_groups": [
            "Higher hosted concurrency",
            "Multi-site commercial headroom",
            "Sustained workflow and automation operations",
        ],
    },
}

DEFAULT_PLAN_TIER_ID = "pro"
DEFAULT_FREE_PLAN_ID = "free"
DEFAULT_FREE_PLAN_VERSION_ID = "free_v1"
DEFAULT_FREE_PLAN_KIND = "default_free"
DEFAULT_FREE_PLAN_SOURCE = "production_default_free_shell_v1"
DEFAULT_FREE_SUBSCRIPTION_SOURCE = "production_default_free_bind_v1"
CANONICAL_TIER_PLAN_IDS = {tier_id: (tier_id, f"{tier_id}_v1") for tier_id in PLAN_TIER_REGISTRY}
