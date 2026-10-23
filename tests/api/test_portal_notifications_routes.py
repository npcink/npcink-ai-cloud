from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PRINCIPAL_STATUS_ACTIVE,
    SITE_STATUS_ACTIVE,
    Account,
    AccountUserMembership,
    PortalNotification,
    Principal,
    PrincipalSiteBinding,
    Site,
)
from app.core.services import CloudServices
from app.domain.commercial.identity import resolve_principal_allowed_actions
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_portal_bearer_headers,
)

ALPHA_PRINCIPAL = "prn_portal_notifications_alpha"
BETA_PRINCIPAL = "prn_portal_notifications_beta"
ALPHA_ACCOUNT = "acct_portal_notifications_alpha"
BETA_ACCOUNT = "acct_portal_notifications_beta"
ALPHA_SITE = "site_portal_notifications_alpha"
BETA_SITE = "site_portal_notifications_beta"


@pytest.fixture
def portal_client(tmp_path: Path) -> Iterator[tuple[str, TestClient]]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'portal-notifications.sqlite3'}"
    init_schema(database_url)
    settings = Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Portal Notifications Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        debug_local_origin_allowlist="http://testserver",
    )
    with get_session(database_url) as session:
        for suffix in ("alpha", "beta"):
            session.add(
                Account(
                    account_id=f"acct_portal_notifications_{suffix}",
                    name=f"Portal Notifications Account {suffix}",
                    status=ACCOUNT_STATUS_ACTIVE,
                    metadata_json={},
                )
            )
            session.add(
                Site(
                    site_id=f"site_portal_notifications_{suffix}",
                    account_id=f"acct_portal_notifications_{suffix}",
                    name=f"Portal Notifications Site {suffix}",
                    status=SITE_STATUS_ACTIVE,
                    site_url=f"https://{suffix}.notifications.example.com",
                    metadata_json={},
                )
            )
            session.add(
                Principal(
                    principal_id=f"prn_portal_notifications_{suffix}",
                    email=f"portal-notifications-{suffix}@example.com",
                    status=PRINCIPAL_STATUS_ACTIVE,
                    session_version=1,
                    metadata_json={},
                )
            )
            session.add(
                AccountUserMembership(
                    membership_id=f"mem_portal_notifications_{suffix}",
                    principal_id=f"prn_portal_notifications_{suffix}",
                    account_id=f"acct_portal_notifications_{suffix}",
                    role="owner",
                    status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                    allowed_actions_json=list(resolve_principal_allowed_actions()),
                    metadata_json={},
                )
            )
            session.add(
                PrincipalSiteBinding(
                    binding_id=f"psb_portal_notifications_{suffix}",
                    principal_id=f"prn_portal_notifications_{suffix}",
                    site_id=f"site_portal_notifications_{suffix}",
                    account_id=f"acct_portal_notifications_{suffix}",
                    status="active",
                    bound_at=datetime.now(UTC),
                    metadata_json={"source": "test"},
                )
            )
        session.add(
            PortalNotification(
                notification_id="pnotif_alpha_unread",
                account_id=ALPHA_ACCOUNT,
                principal_id=ALPHA_PRINCIPAL,
                event_type="support_request_replied",
                title="Your ticket was replied to",
                body="An operator replied to your support request.",
                link_href="https://cloud.example.com/portal/support/req_alpha",
                is_read=False,
            )
        )
        session.add(
            PortalNotification(
                notification_id="pnotif_alpha_read",
                account_id=ALPHA_ACCOUNT,
                principal_id=ALPHA_PRINCIPAL,
                event_type="subscription_changed",
                title="Subscription updated",
                body=None,
                link_href=None,
                is_read=True,
                read_at=datetime.now(UTC),
            )
        )
        session.add(
            PortalNotification(
                notification_id="pnotif_beta_unread",
                account_id=BETA_ACCOUNT,
                principal_id=BETA_PRINCIPAL,
                event_type="quota_exceeded",
                title="Quota exceeded",
                body=None,
                link_href=None,
                is_read=False,
            )
        )
        session.commit()

    try:
        with TestClient(create_app(CloudServices(settings=settings))) as client:
            client.headers.update(
                {
                    "origin": "http://testserver",
                    "referer": "http://testserver/portal",
                }
            )
            yield database_url, client
    finally:
        dispose_engine(database_url)


def _headers(principal_id: str, *, site_id: str, idempotency_key: str = "") -> dict[str, str]:
    return build_portal_bearer_headers(
        principal_id=principal_id,
        session_version=1,
        site_id=site_id,
        idempotency_key=idempotency_key,
    )


def _alpha_headers(*, idempotency_key: str = "") -> dict[str, str]:
    return _headers(ALPHA_PRINCIPAL, site_id=ALPHA_SITE, idempotency_key=idempotency_key)


def _beta_headers(*, idempotency_key: str = "") -> dict[str, str]:
    return _headers(BETA_PRINCIPAL, site_id=BETA_SITE, idempotency_key=idempotency_key)


def test_notification_inbox_only_exposes_the_principal_account(
    portal_client: tuple[str, TestClient],
) -> None:
    _database_url, client = portal_client

    response = client.get("/portal/v1/notifications", headers=_alpha_headers())

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    data = payload["data"]
    assert {item["notification_id"] for item in data["items"]} == {
        "pnotif_alpha_unread",
        "pnotif_alpha_read",
    }
    assert data["total_count"] == 2
    assert data["unread_count"] == 1
    assert data["unread_only"] is False
    unread = next(
        item for item in data["items"] if item["notification_id"] == "pnotif_alpha_unread"
    )
    assert unread["is_read"] is False
    assert unread["read_at"] is None
    assert unread["created_at"].endswith("Z")
    read = next(item for item in data["items"] if item["notification_id"] == "pnotif_alpha_read")
    assert read["is_read"] is True
    assert read["read_at"] is not None


def test_notification_inbox_supports_unread_filter_and_paging(
    portal_client: tuple[str, TestClient],
) -> None:
    _database_url, client = portal_client

    response = client.get(
        "/portal/v1/notifications?unread_only=true",
        headers=_alpha_headers(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert [item["notification_id"] for item in data["items"]] == ["pnotif_alpha_unread"]
    assert data["unread_count"] == 1
    assert data["total_count"] == 2


def test_marking_a_single_notification_read_is_account_scoped(
    portal_client: tuple[str, TestClient],
) -> None:
    database_url, client = portal_client

    response = client.post(
        "/portal/v1/notifications/pnotif_alpha_unread/read",
        headers=_alpha_headers(idempotency_key="notif-read-alpha-001"),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["notification_id"] == "pnotif_alpha_unread"
    assert data["marked_read_count"] == 1
    assert data["unread_count"] == 0

    foreign = client.post(
        "/portal/v1/notifications/pnotif_beta_unread/read",
        headers=_alpha_headers(idempotency_key="notif-read-alpha-002"),
    )
    assert foreign.status_code == 200
    assert foreign.json()["data"]["marked_read_count"] == 0

    listed = client.get("/portal/v1/notifications", headers=_alpha_headers())
    assert listed.json()["data"]["unread_count"] == 0
    with get_session(database_url) as session:
        alpha = session.get(PortalNotification, "pnotif_alpha_unread")
        beta = session.get(PortalNotification, "pnotif_beta_unread")
        assert alpha.is_read and alpha.read_at is not None
        assert not beta.is_read and beta.read_at is None


def test_marking_all_notifications_read_clears_the_unread_count(
    portal_client: tuple[str, TestClient],
) -> None:
    database_url, client = portal_client

    response = client.post(
        "/portal/v1/notifications/read-all",
        headers=_alpha_headers(idempotency_key="notif-read-all-alpha-001"),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["marked_read_count"] == 1
    assert data["unread_count"] == 0

    with get_session(database_url) as session:
        notifications = list(session.scalars(select(PortalNotification)).all())
        by_id = {item.notification_id: item for item in notifications}
        assert by_id["pnotif_alpha_unread"].is_read is True
        assert by_id["pnotif_alpha_unread"].read_at is not None
        assert by_id["pnotif_beta_unread"].is_read is False


def test_notification_inbox_requires_a_portal_session(
    portal_client: tuple[str, TestClient],
) -> None:
    _database_url, client = portal_client

    response = client.get("/portal/v1/notifications")

    assert response.status_code in {401, 403}


def test_notification_read_replay_and_csrf_and_permission(portal_client):
    from app.core.models import AccountUserMembership

    database_url, client = portal_client
    path = "/portal/v1/notifications/pnotif_alpha_unread/read"
    headers = _alpha_headers(idempotency_key="read-replay")
    initial = client.post(path, headers=headers)
    assert initial.status_code == 200
    replay = client.post(path, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["data"] == initial.json()["data"]
    foreign = client.post(
        path,
        headers={
            **_alpha_headers(idempotency_key="read-csrf"),
            "origin": "https://foreign.example",
        },
    )
    assert foreign.status_code == 403
    with get_session(database_url) as session:
        membership = session.get(AccountUserMembership, "mem_portal_notifications_alpha")
        membership.allowed_actions_json = []
        session.commit()
    assert client.get("/portal/v1/notifications", headers=_alpha_headers()).status_code == 403
