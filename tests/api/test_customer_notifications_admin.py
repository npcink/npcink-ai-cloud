from __future__ import annotations

from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers
from tests.domain.test_customer_notifications import NOTICE, seed

BASE = "/internal/service/admin/customer-notifications"


def test_admin_notice_auth_validation_delivery_and_history(tmp_path):
    url, client = _build_client(tmp_path)
    seed(url, "acct_notice", "owner_notice")
    payload = dict(
        dispatch_id=NOTICE,
        title="Notice",
        body="Temporary service information",
        audience="selected",
        account_ids=["acct_notice"],
        link_href="/portal/billing",
    )
    assert client.get(BASE).status_code == 401
    assert client.post(BASE, json=payload).status_code == 401
    assert client.post(BASE, json=payload, headers=build_internal_headers()).status_code == 401
    preview = client.post(
        BASE, json=payload, headers=build_internal_headers(idempotency_key="notice-preview")
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["data"]["ready_count"] == 1
    assert (
        client.get(f"{BASE}/{NOTICE}", headers=build_internal_headers()).json()["data"]["status"]
        == "preview"
    )
    send_url = f"{BASE}/{NOTICE}/send"
    assert client.post(send_url).status_code == 401
    for key in ("send-one", "send-after-timeout"):
        sent = client.post(send_url, headers=build_internal_headers(idempotency_key=key))
        assert sent.status_code == 200, sent.text
        assert sent.json()["data"]["sent_count"] == 1
    history = client.get(BASE, headers=build_internal_headers()).json()["data"]
    assert history["total_count"] == 1
    assert history["items"][0]["status"] == "sent"
    assert client.get(f"{BASE}/bad-id", headers=build_internal_headers()).status_code == 422
    assert (
        client.post(
            BASE,
            json={**payload, "link_href": "https://outside.test"},
            headers=build_internal_headers(idempotency_key="bad-link"),
        ).status_code
        == 422
    )
