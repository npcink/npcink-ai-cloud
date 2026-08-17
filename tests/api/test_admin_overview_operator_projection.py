from __future__ import annotations

from copy import deepcopy

from app.api.routes import service as service_routes


def _overview() -> dict[str, object]:
    return {
        "counts": {"sites_active": 1},
        "operational_readiness": {
            "status": "ok",
            "checks_failed": 0,
            "failure_scopes": [],
            "href": "/admin/troubleshooting",
        },
        "runtime_diagnostics": {
            "callback": {"failed": 0, "pending": 0},
            "guard": {"recent_events": 0},
        },
        "runtime_telemetry": {
            "alert_summary": {
                "status": "ok",
                "alert_count": 0,
                "alerts": [],
            }
        },
        "attention_subscriptions": [],
        "expiring_subscriptions": {"within_7_days": 0},
    }


def test_admin_overview_projection_prioritizes_blocked_readiness() -> None:
    overview = _overview()
    overview["operational_readiness"] = {
        "status": "error",
        "checks_failed": 2,
        "failure_scopes": ["workers", "cadence"],
        "href": "/admin/troubleshooting",
    }
    overview["runtime_diagnostics"] = {
        "callback": {"failed": 3, "pending": 0},
        "guard": {"recent_events": 30},
    }
    overview["runtime_telemetry"] = {
        "alert_summary": {
            "status": "error",
            "alert_count": 1,
            "alerts": [{"code": "hosted_model.provider_errors"}],
        }
    }
    overview["attention_subscriptions"] = [{"reason": "payment follow-up"}]

    projection = service_routes._build_admin_overview_operator_projection(overview)

    assert projection["status"] == "error"
    assert projection["conclusion_code"] == "operational_readiness_blocked"
    assert projection["primary_action"] == {
        "kind": "readiness",
        "href": "/admin/troubleshooting",
    }
    assert [item["code"] for item in projection["watch_items"]][:4] == [
        "operational_readiness_blocked",
        "runtime_callback_failed",
        "runtime_telemetry",
        "request_guard_events",
    ]


def test_admin_overview_projection_routes_telemetry_error_to_diagnostics() -> None:
    overview = _overview()
    overview["runtime_telemetry"] = {
        "alert_summary": {
            "status": "error",
            "alert_count": 2,
            "alerts": [{"code": "hosted_model.provider_errors"}],
        }
    }

    projection = service_routes._build_admin_overview_operator_projection(overview)

    assert projection["status"] == "error"
    assert projection["conclusion_code"] == "runtime_error"
    assert projection["primary_action"] == {
        "kind": "runtime_telemetry",
        "href": "/admin/troubleshooting",
    }
    assert projection["watch_items"] == [
        {
            "code": "runtime_telemetry",
            "scope": "runtime.telemetry_coverage",
            "severity": "action_needed",
            "value": 2,
            "detail_code": "runtime_telemetry",
            "detail_args": {"alert_code": "hosted_model.provider_errors"},
        }
    ]


def test_admin_overview_projection_routes_commercial_warning_to_coverage() -> None:
    overview = _overview()
    overview["attention_subscriptions"] = [{"reason": "payment follow-up"}]
    overview["expiring_subscriptions"] = {"within_7_days": 2}

    projection = service_routes._build_admin_overview_operator_projection(overview)

    assert projection["status"] == "warning"
    assert projection["conclusion_code"] == "warning"
    assert projection["primary_action"] == {
        "kind": "coverage",
        "href": "/admin/coverage",
    }
    assert projection["follow_up_focus"] == "commercial"
    assert [item["code"] for item in projection["watch_items"]] == [
        "commercial_subscription_attention",
        "commercial_subscription_expiring",
    ]


def test_admin_overview_projection_keeps_nominal_and_inactive_fallbacks_distinct() -> None:
    nominal = service_routes._build_admin_overview_operator_projection(_overview())
    inactive_overview = deepcopy(_overview())
    inactive_overview["counts"] = {"sites_active": 0}
    inactive = service_routes._build_admin_overview_operator_projection(inactive_overview)

    assert nominal["status"] == "ok"
    assert nominal["conclusion_code"] == "ok"
    assert nominal["watch_items"] == []
    assert inactive["status"] == "inactive"
    assert inactive["conclusion_code"] == "inactive"
    assert inactive["primary_action"] == {
        "kind": "accounts",
        "href": "/admin/accounts",
    }
