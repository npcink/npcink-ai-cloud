from pathlib import Path

from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers
from tests.domain.test_subscription_commerce import _account, _service


def test_admin_sales_route_withdraws_and_restores_without_changing_price(tmp_path: Path):
    database_url, client = _build_client(tmp_path)
    service = _service(database_url)
    _account(service, "acct_sales_api")
    service.list_account_plan_offers(account_id="acct_sales_api")
    path = "/internal/service/admin/plans/plus/sales"
    assert client.patch(path, json={"status": "retired"}).status_code == 401
    for status in ("retired", "active"):
        response = client.patch(
            path, json={"status": status},
            headers=build_internal_headers(idempotency_key=f"sales-api-{status}"),
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["status"] == status
        assert data["amount"] == 15
        assert data["receipt"]["audit_state"] == "persisted"
        assert data["receipt"]["scope_id"] == "plus_monthly_v1"
        assert data["receipt"]["audit_filters"]["idempotency_key"] == f"sales-api-{status}"
        detail = client.get(
            "/internal/service/admin/plans/plus", headers=build_internal_headers()
        ).json()["data"]
        assert detail["sales_offer"]["status"] == status


def test_admin_sales_route_rejects_unknown_states_extra_fields_and_missing_offers(tmp_path: Path):
    _, client = _build_client(tmp_path)
    path = "/internal/service/admin/plans/plus/sales"
    for index, payload in enumerate((
        {"status": "active", "amount": 1}, {"status": "deleted"}, {},
    )):
        assert client.patch(
            path, json=payload,
            headers=build_internal_headers(idempotency_key=f"sales-invalid-{index}"),
        ).status_code == 422
    assert client.patch(
        path, json={"status": "active"},
        headers=build_internal_headers(idempotency_key="sales-missing"),
    ).status_code == 404
