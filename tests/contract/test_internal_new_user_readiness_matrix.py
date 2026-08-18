from __future__ import annotations

import json
import re
from pathlib import Path


MATRIX_PATH = (
    Path(__file__).parents[1]
    / "fixtures"
    / "portal"
    / "internal_new_user_readiness_matrix.json"
)

REQUIRED_SCENARIOS = {
    "new_account_no_site",
    "single_site_ready",
    "multi_site_context_switch",
    "inactive_site_recovery",
    "suspended_site_read_only",
    "quota_attention_account_scope",
    "session_expired_recovery",
    "cross_account_site_denial",
    "invalid_connector_credential",
    "service_temporarily_unavailable",
}


def _load_matrix() -> dict[str, object]:
    payload = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


def test_matrix_is_deterministic_and_covers_first_user_risks() -> None:
    payload = _load_matrix()
    assert payload["contract_version"] == "internal_new_user_readiness_matrix.v1"
    assert payload["fixture_scope"] == "deterministic_synthetic_metadata_only"

    scenarios = payload["scenarios"]
    assert isinstance(scenarios, list)
    scenario_ids = {
        scenario["id"]
        for scenario in scenarios
        if isinstance(scenario, dict) and isinstance(scenario.get("id"), str)
    }
    assert scenario_ids == REQUIRED_SCENARIOS
    assert len(scenarios) == len(scenario_ids)
    assert all(
        isinstance(scenario, dict)
        and isinstance(scenario.get("persona"), str)
        and isinstance(scenario.get("account_state"), str)
        and isinstance(scenario.get("site_states"), list)
        and isinstance(scenario.get("primary_goal"), str)
        for scenario in scenarios
    )


def test_matrix_keeps_account_and_site_ownership_explicit() -> None:
    payload = _load_matrix()
    ownership = payload["ownership"]
    assert ownership == {
        "account": [
            "identity",
            "subscription",
            "entitlements",
            "billing",
            "credit_balance",
        ],
        "site": [
            "binding",
            "lifecycle",
            "usage",
            "run_evidence",
            "connection_diagnostics",
            "support_context",
        ],
    }


def test_matrix_forbids_external_or_mutating_operations() -> None:
    payload = _load_matrix()
    forbidden = payload["forbidden_operations"]
    assert forbidden == [
        "production_data_write",
        "provider_call",
        "wordpress_object_write",
        "account_entitlement_mutation",
    ]
    serialized = json.dumps(payload, ensure_ascii=False)
    assert not re.search(r"(?:sk-|pk_live|password|secret|api[_-]?key|bearer)", serialized, re.I)
