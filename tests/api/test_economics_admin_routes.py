"""Route/auth tests; aggregation SQL is separately proven on real PostgreSQL."""

from datetime import UTC, datetime

import pytest

from app.api.routes import economics_admin
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


@pytest.mark.parametrize("endpoint", ["usage-by-family", "revenue"])
def test_economics_requires_internal_auth(tmp_path, endpoint):
    _, client = _build_client(tmp_path)
    response = client.get(f"/internal/service/admin/economics/{endpoint}?month=2026-10")
    assert response.status_code == 401


@pytest.mark.parametrize(
    "month", ["2026-13", "2026-00", "0000-01", "9999-12", "2026-1", "not-a-month"]
)
@pytest.mark.parametrize("endpoint", ["usage-by-family", "revenue"])
def test_economics_rejects_invalid_month_before_query(tmp_path, monkeypatch, month, endpoint):
    _, client = _build_client(tmp_path)

    def forbidden(*args, **kwargs):
        pytest.fail("invalid input must not query")

    monkeypatch.setattr(economics_admin, "_load_usage_by_family", forbidden)
    monkeypatch.setattr(economics_admin, "_load_revenue", forbidden)
    response = client.get(
        f"/internal/service/admin/economics/{endpoint}",
        params={"month": month},
        headers=build_internal_headers(),
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "economics.month_invalid"


@pytest.mark.parametrize(
    "endpoint,loader", [("usage-by-family", "_load_usage_by_family"), ("revenue", "_load_revenue")]
)
def test_economics_get_envelope_and_utc_month(tmp_path, monkeypatch, endpoint, loader):
    _, client = _build_client(tmp_path)
    seen = {}

    def query(url, **bounds):
        seen.update(bounds)
        return (
            {"families": {}}
            if endpoint == "usage-by-family"
            else {"net_revenue_cny": 0, "account_counts_scope": "current_snapshot"}
        )

    monkeypatch.setattr(economics_admin, loader, query)
    response = client.get(
        f"/internal/service/admin/economics/{endpoint}?month=2026-12",
        headers=build_internal_headers(),
    )
    assert response.status_code == 200
    assert response.json()["data"]["month"] == "2026-12"
    assert seen == {
        "month_start": datetime(2026, 12, 1, tzinfo=UTC),
        "month_end": datetime(2027, 1, 1, tzinfo=UTC),
    }
    assert (
        client.post(
            f"/internal/service/admin/economics/{endpoint}",
            headers=build_internal_headers(),
            json={"bill": "must never be accepted"},
        ).status_code
        == 405
    )
