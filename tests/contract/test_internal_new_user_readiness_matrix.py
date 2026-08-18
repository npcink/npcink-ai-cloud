from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]

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
    evidence_payload = []
    for scenario in payload["scenarios"]:
        for evidence in scenario["current_evidence"]:
            evidence_copy = dict(evidence)
            if evidence_copy.get("node") == (
                "test_portal_jwt_bearer_request_for_unknown_site_returns_not_found"
            ):
                evidence_copy.pop("node")
            evidence_payload.append(evidence_copy)
    serialized = json.dumps(evidence_payload, ensure_ascii=False)
    assert not re.search(r"(?:sk-|pk_live|password|secret|api[_-]?key|bearer)", serialized, re.I)


def test_matrix_assigns_every_scenario_to_complete_evidence_layers() -> None:
    payload = _load_matrix()
    allowed_layers = payload["evidence_layers"]
    assert allowed_layers == [
        "contract",
        "api",
        "security",
        "frontend_unit",
        "browser",
    ]
    scenarios = payload["scenarios"]
    assert isinstance(scenarios, list)

    for scenario in scenarios:
        assert isinstance(scenario, dict)
        assert scenario["priority"] in {"P0", "P1"}
        required = scenario["required_evidence"]
        current = scenario["current_evidence"]
        gaps = scenario["remaining_gaps"]
        assert isinstance(required, list) and required
        assert isinstance(current, list) and current
        assert isinstance(gaps, list)

        current_layers: set[str] = set()
        for evidence in current:
            assert isinstance(evidence, dict)
            layer = evidence["layer"]
            path = evidence["path"]
            node = evidence["node"]
            assert isinstance(layer, str) and layer in allowed_layers
            assert isinstance(path, str) and path
            assert isinstance(node, str) and node
            evidence_path = ROOT / path
            assert evidence_path.is_file(), f"missing evidence path for {scenario['id']}: {path}"
            assert node in evidence_path.read_text(encoding="utf-8"), (
                f"missing evidence node for {scenario['id']}: {path}::{node}"
            )
            if layer == "browser":
                assert node == f"[readiness:{scenario['id']}]"
            current_layers.add(layer)

        assert len(current_layers) == len(current)
        assert set(required) == current_layers | set(gaps)
        assert current_layers.isdisjoint(gaps)
        assert set(required).issubset(allowed_layers)


def test_ready_matrix_has_no_unresolved_required_evidence() -> None:
    scenarios = _load_matrix()["scenarios"]
    assert isinstance(scenarios, list)
    unresolved = {
        scenario["id"]: scenario["remaining_gaps"]
        for scenario in scenarios
        if isinstance(scenario, dict) and scenario["remaining_gaps"]
    }
    assert unresolved == {}
