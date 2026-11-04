from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from app.core.db import dispose_engine
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


@pytest.mark.parametrize(
    ("params", "expected_status", "invalid_field"),
    [
        ({}, 200, None),
        ({"expires_before": "2026-10-25T12:00:00Z", "risk": "stable", "sort": "expiry"},
         200, None),
        ({"expires_before": "2026-10-25T20:00:00+08:00"}, 200, None),
        ({"expires_before": ""}, 422, "expires_before"),
        ({"expires_before": "not-a-date"}, 422, "expires_before"),
        ({"risk": "unknown"}, 422, "risk"),
        ({"sort": "newest"}, 422, "sort"),
    ],
)
def test_subscription_scalar_query_contract(
    tmp_path: Path,
    params: dict[str, str],
    expected_status: int,
    invalid_field: str | None,
) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        with client:
            response = client.get(
                "/internal/service/admin/subscriptions",
                params=params,
                headers=build_internal_headers(),
            )
        assert response.status_code == expected_status
        if invalid_field is not None:
            assert any(
                error["loc"] == ["query", invalid_field]
                for error in response.json()["detail"]
            )
        else:
            filters = response.json()["data"]["filters"]
            assert filters["risk"] == params.get("risk", "all")
            assert filters["sort"] == params.get("sort", "priority")
            value = filters["expires_before"]
            if "expires_before" in params:
                assert datetime.fromisoformat(value) == datetime.fromisoformat(
                    params["expires_before"]
                )
            else:
                assert value is None
    finally:
        dispose_engine(database_url)


def test_openapi_preserves_scalar_nullability_constraints_and_query_alias(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        schema = client.app.openapi()
        parameters = {
            item["name"]: item
            for item in schema["paths"]["/internal/service/admin/subscriptions"]["get"][
                "parameters"
            ]
        }
        assert parameters["expires_before"]["in"] == "query"
        assert parameters["expires_before"]["required"] is False
        date_schemas = parameters["expires_before"]["schema"]["anyOf"]
        assert {"type": "null"} in date_schemas
        assert {"type": "string", "format": "date-time"} in date_schemas
        assert parameters["risk"]["schema"]["default"] == "all"
        assert "stable" in parameters["risk"]["schema"]["enum"]
        assert parameters["sort"]["schema"]["enum"] == ["priority", "expiry", "customer"]
        assert parameters["limit"]["schema"]["minimum"] == 1
        assert parameters["limit"]["schema"]["maximum"] == 500
        # The paused route stays paused; its public parameter name must still be stable.
        alias_parameters = schema["paths"]["/internal/service/advisor/operations"]["get"][
            "parameters"
        ]
        aliases = {item["name"]: item for item in alias_parameters}
        assert "range_filter" not in aliases
        assert aliases["range"]["in"] == "query"
        assert aliases["range"]["required"] is False
        assert aliases["range"]["schema"]["default"] == "24h"
    finally:
        dispose_engine(database_url)
