from __future__ import annotations

import json
from pathlib import Path


MATRIX_PATH = (
    Path(__file__).parents[1]
    / "fixtures"
    / "portal"
    / "internal_new_user_readiness_matrix.json"
)

EXPECTED_FAULTS = {
    "inactive_site_recovery": {
        "error_code": "auth.site_inactive",
        "http_status": 403,
        "recovery_action": "activate_site",
        "disclosure": "site_state_only",
    },
    "suspended_site_read_only": {
        "error_code": "auth.site_suspended",
        "http_status": 403,
        "recovery_action": "contact_support",
        "disclosure": "site_state_only",
    },
    "quota_attention_account_scope": {
        "error_code": "commercial.quota_exceeded",
        "http_status": 409,
        "recovery_action": "review_account_quota",
        "disclosure": "account_scope_only",
    },
    "cross_account_site_denial": {
        "error_code": "auth.site_not_found",
        "http_status": 404,
        "recovery_action": "choose_owned_site",
        "disclosure": "no_foreign_record",
    },
    "invalid_connector_credential": {
        "error_code": "provider_connection.auth_failed",
        "http_status": 502,
        "recovery_action": "update_connector_credential",
        "disclosure": "credential_presence_only",
    },
    "service_temporarily_unavailable": {
        "error_code": "service.entitlements_temporarily_unavailable",
        "http_status": 503,
        "recovery_action": "retry_or_contact_support",
        "disclosure": "trace_reference_only",
    },
}


def _load_matrix() -> dict[str, object]:
    payload = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


def test_fault_injection_matrix_has_stable_recovery_contracts() -> None:
    scenarios = _load_matrix()["scenarios"]
    assert isinstance(scenarios, list)
    by_id = {
        scenario["id"]: scenario
        for scenario in scenarios
        if isinstance(scenario, dict) and isinstance(scenario.get("id"), str)
    }

    assert set(EXPECTED_FAULTS).issubset(by_id)
    for scenario_id, expected in EXPECTED_FAULTS.items():
        assert by_id[scenario_id]["fault_injection"] == expected


def test_fault_injection_contract_forbids_secret_and_foreign_record_disclosure() -> None:
    serialized = MATRIX_PATH.read_text(encoding="utf-8")
    assert "credential_presence_only" in serialized
    assert "no_foreign_record" in serialized
    assert "credential_value" not in serialized
    assert "api_key" not in serialized
    assert "foreign_site_name" not in serialized
