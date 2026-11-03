from __future__ import annotations

from tests.api.service_routes_test_support import _build_client
from tests.api.test_portal_notifications_routes import (
    BETA_ACCOUNT,
    _alpha_headers,
    _beta_headers,
)
from tests.api.test_portal_notifications_routes import (
    portal_client as portal_client,
)
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


def test_manual_notice_reaches_only_owner_inbox_and_read_updates_dispatch(portal_client):
    _url, client = portal_client
    headers = build_internal_headers(idempotency_key="manual-notice-portal-flow")
    payload = dict(
        dispatch_id=NOTICE,
        title="临时维护",
        body="今晚22点至22点30分维护。",
        audience="selected",
        account_ids=[BETA_ACCOUNT],
        link_href="/portal/usage",
    )
    assert client.post(BASE, json=payload, headers=headers).json()["data"]["ready_count"] == 1
    replay = client.post(f"{BASE}/{NOTICE}/send", headers=headers)
    assert replay.status_code == 409
    assert replay.json()["error_code"] == "auth.replay_blocked"
    result = client.post(
        f"{BASE}/{NOTICE}/send",
        headers=build_internal_headers(idempotency_key="manual-notice-portal-send"),
    )
    assert result.status_code == 200, result.text
    notification_id = result.json()["data"]["recipients"][0]["notification_id"]
    inbox = client.get("/portal/v1/notifications", headers=_beta_headers()).json()["data"]
    notice = next(item for item in inbox["items"] if item["notification_id"] == notification_id)
    assert (notice["event_type"], notice["title"], notice["body"], notice["link_href"]) == (
        "service.manual_notice",
        payload["title"],
        payload["body"],
        "/portal/usage",
    )
    foreign_inbox = client.get("/portal/v1/notifications", headers=_alpha_headers()).json()["data"]
    assert notification_id not in {item["notification_id"] for item in foreign_inbox["items"]}
    endpoint = f"/portal/v1/notifications/{notification_id}/read"
    assert (
        client.post(endpoint, headers=_alpha_headers(idempotency_key="foreign-read")).status_code
        == 404
    )
    assert (
        client.post(endpoint, headers=_beta_headers(idempotency_key="owner-read")).status_code
        == 200
    )
    detail = client.get(f"{BASE}/{NOTICE}", headers=build_internal_headers()).json()["data"]
    assert detail["read_count"] == 1
