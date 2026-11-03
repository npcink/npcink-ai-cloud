"""Only sent customer attachments cross the Admin consumption boundary."""

from pathlib import Path

import pytest

from app.core.db import get_session
from app.core.models import SupportRequestAttachment
from tests.api.test_portal_routes import (
    FakePortalEmailSender,
    _build_client,
    _grant_account_member_access,
    _portal_cookie_headers,
    _set_portal_cookie_session,
)
from tests.conftest import build_internal_headers


@pytest.mark.parametrize("unlinked_message_id", [None, "", "   "])
def test_admin_attachment_boundary_preserves_customer_recovery_and_operator_legacy(
    tmp_path: Path, unlinked_message_id: str | None,
) -> None:
    database_url, client = _build_client(tmp_path, portal_email_sender=FakePortalEmailSender())
    admin_headers = build_internal_headers()
    client.post(
        "/internal/service/accounts", json={"account_id": "acct_drafts", "name": "Drafts"},
        headers=build_internal_headers(idempotency_key="draft-account"),
    ).raise_for_status()
    client.post(
        "/internal/service/sites",
        json={"site_id": "site_drafts", "account_id": "acct_drafts", "name": "Drafts"},
        headers=build_internal_headers(idempotency_key="draft-site"),
    ).raise_for_status()
    grant = _grant_account_member_access(
        client, site_id="site_drafts", email="drafts@example.test", idempotency_key="draft-member",
    )
    _set_portal_cookie_session(
        client, principal_id=str(grant["principal_id"]), site_id="site_drafts",
        session_version=int(grant.get("session_version") or 1),
    )
    created = client.post(
        "/portal/v1/support-requests",
        json={"title": "Attachment boundary", "description": "Synthetic attachment fixture"},
        headers=_portal_cookie_headers(idempotency_key="draft-request"),
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["data"]["request"]["request_id"]
    portal = f"/portal/v1/support-requests/{request_id}"
    admin = f"/internal/service/admin/support-requests/{request_id}"
    payload = {"filename": "draft.txt", "content_type": "text/plain", "content_base64": "ZHJhZnQ="}
    uploaded = client.post(
        f"{portal}/attachments", json=payload,
        headers=_portal_cookie_headers(idempotency_key="draft-upload"),
    )
    assert uploaded.status_code == 200, uploaded.text
    draft_id = uploaded.json()["data"]["attachment"]["attachment_id"]
    with get_session(database_url) as session:
        attachment = session.get(SupportRequestAttachment, draft_id)
        assert attachment is not None
        attachment.message_id = unlinked_message_id
        session.commit()

    assert client.get(admin, headers=admin_headers).json()["data"]["attachments"] == []
    hidden = client.get(f"{admin}/attachments/{draft_id}", headers=admin_headers)
    assert hidden.status_code == 404
    assert hidden.json()["error_code"] == "service.support_request_attachment_not_found"
    own = client.get(f"{portal}/attachments/{draft_id}")
    assert own.status_code == 200
    assert own.json()["data"]["attachment"]["content_base64"] == payload["content_base64"]
    assert draft_id in {
        item["attachment_id"] for item in client.get(portal).json()["data"]["attachments"]
    }

    operator_ids = set()
    for visibility in ("public", "internal"):
        uploaded = client.post(
            f"{admin}/attachments", json={**payload, "visibility": visibility},
            headers=build_internal_headers(idempotency_key=f"operator-{visibility}"),
        )
        assert uploaded.status_code == 200, uploaded.text
        item = uploaded.json()["data"]["attachment"]
        assert not item.get("message_id")
        operator_ids.add(item["attachment_id"])
        download = client.get(f"{admin}/attachments/{item['attachment_id']}", headers=admin_headers)
        assert download.status_code == 200
        assert download.json()["data"]["attachment"]["content_base64"] == payload["content_base64"]
        assert client.get(f"{portal}/attachments/{item['attachment_id']}").status_code == (
            200 if visibility == "public" else 404
        )
    assert {
        item["attachment_id"]
        for item in client.get(admin, headers=admin_headers).json()["data"]["attachments"]
    } == operator_ids

    # A rejected message leaves the same uploaded ID available for retry.
    failed = client.post(
        f"{portal}/messages", json={"body": "", "attachment_ids": [draft_id]},
        headers=_portal_cookie_headers(idempotency_key="draft-invalid-message"),
    )
    assert failed.status_code == 400
    linked = client.post(
        f"{portal}/messages", json={"body": "Sent now", "attachment_ids": [draft_id]},
        headers=_portal_cookie_headers(idempotency_key="draft-retry-message"),
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["data"]["attachments"][0]["attachment_id"] == draft_id
    assert client.get(f"{admin}/attachments/{draft_id}", headers=admin_headers).status_code == 200
    assert {
        item["attachment_id"]
        for item in client.get(admin, headers=admin_headers).json()["data"]["attachments"]
    } == operator_ids | {draft_id}

    disposable = client.post(
        f"{portal}/attachments", json=payload,
        headers=_portal_cookie_headers(idempotency_key="draft-disposable"),
    ).json()["data"]["attachment"]["attachment_id"]
    deleted = client.delete(
        f"{portal}/attachments/{disposable}",
        headers=_portal_cookie_headers(idempotency_key="draft-delete"),
    )
    assert deleted.status_code == 200
    assert client.get(f"{portal}/attachments/{disposable}").status_code == 404
