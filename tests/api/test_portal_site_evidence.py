"""Endpoint permissions and a real SQLite soft-remove/reconnect evidence chain."""
from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.auth import decode_portal_bearer_claims
from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.core.db import dispose_engine, get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PluginObservabilityEvent,
    PortalSession,
    Principal,
    PrincipalSiteBinding,
    Site,
    SiteApiKey,
)
from tests.api.test_portal_routes import (
    _build_client,
    _connect_wordpress_addon,
    _request_portal_registration_code,
    _verify_portal_registration_code,
)
from tests.conftest import build_portal_bearer_headers


@pytest.fixture
def evidence_client(tmp_path: Path) -> Iterator[tuple[str, TestClient]]:
    database_url, client = _build_client(tmp_path)
    try:
        yield database_url, client
    finally:
        client.close()
        dispose_engine(database_url)


def _register(client: TestClient, email: str) -> dict[str, Any]:
    request = _request_portal_registration_code(
        client, email=email, headers={"x-npcink-debug-portal-link": "1"}
    )
    data = _verify_portal_registration_code(client, email=email, code=str(request["code"]))
    assert data["sites"] == []
    assert data["selected_context"] is None
    with get_session(client.app.state.services.settings.database_url) as session:
        principal = session.scalar(select(Principal).where(Principal.email == email))
        assert principal is not None
        membership = session.scalar(
            select(AccountUserMembership).where(
                AccountUserMembership.principal_id == principal.principal_id
            )
        )
        assert membership is not None
        assert membership.status == "active"
        return {
            "principal_id": principal.principal_id,
            "session_version": principal.session_version,
            "account_id": membership.account_id,
            "membership_id": membership.membership_id,
        }


def _auth(
    client: TestClient,
    grant: dict[str, Any],
    transport: str,
    *,
    site_id: str = "",
    expires_at: datetime | None = None,
) -> tuple[dict[str, str], str]:
    settings = client.app.state.services.settings
    headers = build_portal_bearer_headers(
        database_url=settings.database_url,
        principal_id=grant["principal_id"],
        session_version=grant["session_version"],
        site_id=site_id,
        expires_at=expires_at,
    )
    token = headers["Authorization"][7:]
    # Exactly one transport: a cookie must never rescue an invalid bearer.
    client.cookies.clear()
    if transport == "cookie":
        client.cookies.set(COOKIE_PORTAL_SESSION_TOKEN, token)
        return {}, token
    assert transport == "bearer"
    return headers, token


def _assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["error_code"] == code


def _revoke(client: TestClient, token: str) -> None:
    settings = client.app.state.services.settings
    sid = decode_portal_bearer_claims(settings, token)["sid"]
    with get_session(settings.database_url) as session:
        row = session.get(PortalSession, sid)
        assert row is not None
        row.revoked_at = datetime.now(UTC)
        row.revoke_reason = "test_evidence"
        session.commit()


def _seed_events(
    database_url: str, site_id: str, key_id: str, statuses: tuple[str, ...]
) -> None:
    captured = datetime.now(UTC) - timedelta(minutes=5)
    with get_session(database_url) as session:
        for index, status in enumerate(statuses):
            marker = f"{site_id}:evidence:{index}"
            session.add(
                PluginObservabilityEvent(
                    dedupe_key=marker,
                    site_id=site_id,
                    key_id=key_id,
                    schema_version="1",
                    plugin_slug="npcink-cloud-addon",
                    plugin_version="1.0.0",
                    source="local",
                    event_kind="addon.monitoring.state_projected",
                    event_id=marker,
                    status=status,
                    error_code="test.monitoring_error" if status == "error" else None,
                    payload_json={"test_marker": marker},
                    captured_at=captured,
                    received_at=captured,
                )
            )
        session.commit()


def _history(database_url: str, site_id: str) -> list[dict[str, Any]]:
    with get_session(database_url) as session:
        rows = session.scalars(
            select(PluginObservabilityEvent)
            .where(PluginObservabilityEvent.site_id == site_id)
            .order_by(PluginObservabilityEvent.id)
        )
        # Compare every persisted column, including IDs, old key IDs and timestamps.
        return [
            {
                column.name: getattr(row, column.name)
                for column in PluginObservabilityEvent.__table__.columns
            }
            for row in rows
        ]


def _assert_monitoring(
    client: TestClient,
    site_id: str,
    headers: dict[str, str],
    *,
    total: int,
    errors: int,
    hours: int = 24,
    query: str = "",
) -> None:
    response = client.get(
        f"/portal/v1/sites/{site_id}/monitoring-overview{query}", headers=headers
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["site_id"] == site_id
    assert data["window"]["hours"] == hours
    assert data["activity"]["plugin_events_total"] == total
    assert data["activity"]["plugin_errors_total"] == errors


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_site_relink_policy_requires_live_session_but_no_site_or_remove_action(
    evidence_client: tuple[str, TestClient], transport: str
) -> None:
    database_url, client = evidence_client
    grant = _register(client, "policy-evidence@example.com")
    with get_session(database_url) as session:
        membership = session.get(AccountUserMembership, grant["membership_id"])
        assert membership is not None
        membership.allowed_actions_json = []
        session.commit()
    path = "/portal/v1/site-relink-policy"
    headers, _ = _auth(client, grant, transport)
    response = client.get(path, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["data"] == {
        "enabled": True,
        "cooldown_days": 90,
        "same_account_reconnect_allowed": True,
    }

    client.cookies.clear()
    _assert_error(client.get(path), 401, "auth.portal_session_required")
    headers, _ = _auth(
        client, grant, transport, expires_at=datetime.now(UTC) - timedelta(minutes=5)
    )
    expired = (
        "auth.portal_session_expired"
        if transport == "cookie"
        else "auth.portal_token_expired"
    )
    _assert_error(client.get(path, headers=headers), 401, expired)

    headers, token = _auth(client, grant, transport)
    assert client.get(path, headers=headers).status_code == 200
    _revoke(client, token)
    _assert_error(client.get(path, headers=headers), 401, "auth.portal_session_revoked")

    headers, _ = _auth(client, grant, transport)
    assert client.get(path, headers=headers).status_code == 200
    with get_session(database_url) as session:
        principal = session.get(Principal, grant["principal_id"])
        assert principal is not None
        principal.status = "disabled"
        session.commit()
    _assert_error(client.get(path, headers=headers), 401, "auth.portal_session_revoked")


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_monitoring_overview_permissions_windows_and_site_isolation(
    evidence_client: tuple[str, TestClient], transport: str
) -> None:
    database_url, client = evidence_client
    grants = []
    sites = []
    for label, statuses in (("a", ("error",)), ("b", ("ok", "ok"))):
        grant = _register(client, f"monitoring-{label}@example.com")
        issue, exchange = _connect_wordpress_addon(
            client,
            account_id=grant["account_id"],
            site_url=f"https://monitoring-{label}.example.com",
            site_name=f"Monitoring {label}",
            state=f"monitoring-{label}-initial",
            idempotency_key=f"monitoring-{label}-initial",
        )
        site_id = str(issue["site_id"])
        _seed_events(database_url, site_id, str(exchange["key_id"]), statuses)
        with get_session(database_url) as session:
            membership = session.get(AccountUserMembership, grant["membership_id"])
            assert membership is not None
            membership.allowed_actions_json = []
            session.commit()
        grants.append(grant)
        sites.append(site_id)
    assert grants[0]["account_id"] != grants[1]["account_id"]
    assert sites[0] != sites[1]

    for grant, site_id, total, errors in (
        (grants[0], sites[0], 1, 1), (grants[1], sites[1], 2, 0)
    ):
        headers, _ = _auth(client, grant, transport, site_id=site_id)
        _assert_monitoring(client, site_id, headers, total=total, errors=errors)

    grant, site_id = grants[0], sites[0]
    path = f"/portal/v1/sites/{site_id}/monitoring-overview"
    headers, _ = _auth(client, grant, transport, site_id=site_id)
    _assert_error(
        client.get(f"/portal/v1/sites/{sites[1]}/monitoring-overview", headers=headers),
        403, "service.principal_access_required",
    )
    _assert_error(
        client.get("/portal/v1/sites/site_missing_evidence/monitoring-overview", headers=headers),
        404, "service.site_not_found",
    )
    for hours in (1, 168):
        _assert_monitoring(
            client, site_id, headers, total=1, errors=1,
            hours=hours, query=f"?window_hours={hours}",
        )
    for hours in (0, 169):
        response = client.get(f"{path}?window_hours={hours}", headers=headers)
        assert response.status_code == 422, response.text

    client.cookies.clear()
    _assert_error(client.get(path), 401, "auth.portal_session_required")
    headers, _ = _auth(
        client, grant, transport, site_id=site_id,
        expires_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    expired = (
        "auth.portal_session_expired"
        if transport == "cookie"
        else "auth.portal_token_expired"
    )
    _assert_error(client.get(path, headers=headers), 401, expired)
    headers, token = _auth(client, grant, transport, site_id=site_id)
    _assert_monitoring(client, site_id, headers, total=1, errors=1)
    _revoke(client, token)
    _assert_error(client.get(path, headers=headers), 401, "auth.portal_session_revoked")

    headers, _ = _auth(client, grant, transport, site_id=site_id)
    _assert_monitoring(client, site_id, headers, total=1, errors=1)
    with get_session(database_url) as session:
        principal = session.get(Principal, grant["principal_id"])
        assert principal is not None
        principal.status = "disabled"
        session.commit()
    _assert_error(client.get(path, headers=headers), 401, "auth.portal_session_revoked")
    with get_session(database_url) as session:
        principal = session.get(Principal, grant["principal_id"])
        assert principal is not None
        principal.status = "active"
        session.commit()
    _assert_monitoring(client, site_id, headers, total=1, errors=1)

    with get_session(database_url) as session:
        membership = session.get(AccountUserMembership, grant["membership_id"])
        assert membership is not None
        membership.status = "revoked"
        session.commit()
    _assert_error(client.get(path, headers=headers), 403, "service.principal_access_required")
    with get_session(database_url) as session:
        membership = session.get(AccountUserMembership, grant["membership_id"])
        assert membership is not None
        membership.status = "active"
        session.commit()
    _assert_monitoring(client, site_id, headers, total=1, errors=1)

    with get_session(database_url) as session:
        account = session.get(Account, grant["account_id"])
        assert account is not None
        account.status = "suspended"
        session.commit()
    _assert_error(client.get(path, headers=headers), 403, "service.portal_account_inactive")
    with get_session(database_url) as session:
        account = session.get(Account, grant["account_id"])
        assert account is not None
        account.status = "active"
        session.commit()
    _assert_monitoring(client, site_id, headers, total=1, errors=1)

    with get_session(database_url) as session:
        binding = session.scalar(
            select(PrincipalSiteBinding).where(
                PrincipalSiteBinding.site_id == site_id,
                PrincipalSiteBinding.principal_id == grant["principal_id"],
                PrincipalSiteBinding.status == "active",
            )
        )
        assert binding is not None
        binding.status = "released"
        binding.released_at = datetime.now(UTC)
        binding.release_reason = "test_evidence"
        session.commit()
    _assert_error(client.get(path, headers=headers), 403, "service.principal_site_access_required")


def test_monitoring_history_survives_soft_remove_and_same_account_reconnect(
    evidence_client: tuple[str, TestClient],
) -> None:
    database_url, client = evidence_client
    grant = _register(client, "history-evidence@example.com")
    site_url = "https://history-evidence.example.com"
    issue, exchange = _connect_wordpress_addon(
        client, account_id=grant["account_id"], site_url=site_url,
        site_name="History Evidence", state="history-initial",
        idempotency_key="history-initial",
    )
    site_id, old_key_id = str(issue["site_id"]), str(exchange["key_id"])
    _seed_events(database_url, site_id, old_key_id, ("error", "ok"))
    before = _history(database_url, site_id)
    assert len(before) == 2
    # Retain the original registered login cookie for the real reconnect endpoint.
    registration_cookies = list(client.cookies.items())
    original_headers, _ = _auth(client, grant, "bearer", site_id=site_id)
    _assert_monitoring(client, site_id, original_headers, total=2, errors=1)

    removed = client.post(
        f"/portal/v1/sites/{site_id}/remove",
        headers={**original_headers, "Idempotency-Key": "history-remove"},
    )
    assert removed.status_code == 200, removed.text
    with get_session(database_url) as session:
        site = session.get(Site, site_id)
        old_key = session.get(SiteApiKey, old_key_id)
        assert site is not None and site.status == "archived"
        assert site.account_id == grant["account_id"]
        assert site.relink_cooldown_until is not None
        assert old_key is not None and old_key.status == "revoked"
        bindings = list(session.scalars(select(PrincipalSiteBinding).where(
            PrincipalSiteBinding.site_id == site_id,
            PrincipalSiteBinding.principal_id == grant["principal_id"],
        )))
        assert bindings and all(row.status == "released" for row in bindings)
        assert all(row.released_at is not None for row in bindings)
    assert _history(database_url, site_id) == before
    _assert_error(
        client.get(f"/portal/v1/sites/{site_id}/monitoring-overview", headers=original_headers),
        403, "service.principal_site_access_required",
    )
    assert client.get("/portal/v1/site-relink-policy", headers=original_headers).status_code == 200

    client.cookies.clear()
    for name, value in registration_cookies:
        client.cookies.set(name, value)
    reconnect, fresh = _connect_wordpress_addon(
        client, account_id=grant["account_id"], site_url=site_url,
        site_name="History Evidence", state="history-reconnect",
        idempotency_key="history-reconnect",
    )
    assert reconnect["site_id"] == site_id
    assert reconnect["site_created"] is False
    assert fresh["activation_state"] == "active"
    assert fresh["key_id"] != old_key_id
    with get_session(database_url) as session:
        site = session.get(Site, site_id)
        old_key = session.get(SiteApiKey, old_key_id)
        fresh_key = session.get(SiteApiKey, str(fresh["key_id"]))
        assert site is not None and site.status == "active"
        assert site.account_id == grant["account_id"]
        assert old_key is not None and old_key.status == "revoked"
        assert fresh_key is not None and fresh_key.status == "active"
    # Neither a new login nor the fresh addon key may substitute for the old reader.
    client.cookies.clear()
    _assert_monitoring(client, site_id, original_headers, total=2, errors=1)
    assert _history(database_url, site_id) == before
