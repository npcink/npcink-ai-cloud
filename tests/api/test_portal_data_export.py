from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_engine, get_session, init_schema
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalLoginCode,
    PortalNotification,
    Principal,
    ReplayReceipt,
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestMessage,
)
from app.core.services import CloudServices
from app.domain import portal_data_export as domain
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_portal_bearer_headers,
)

PREFIX = "/portal/v1/account/data-export"


@pytest.fixture
def setup(tmp_path):
    url = f"sqlite+pysqlite:///{tmp_path / 'export.db'}"
    init_schema(url)
    with get_session(url) as session:
        session.add_all(
            [
                Account(account_id="a", name="A", status="active"),
                Account(account_id="b", name="B", status="active"),
                Principal(
                    principal_id="p",
                    email="p@example.test",
                    status="active",
                    session_version=1,
                    metadata_json={"oauth_subject": "PRIVATE-SENTINEL"},
                ),
                Principal(principal_id="other", email="other@example.test", status="active"),
                AccountUserMembership(
                    membership_id="m", principal_id="p", account_id="a", status="active"
                ),
            ]
        )
        session.commit()
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=url,
        redis_url="redis://localhost:6379/0",
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        debug_local_origin_allowlist="http://testserver",
    )
    sent = []
    sender = SimpleNamespace(
        supports_data_export=True, send_data_export_code=lambda **kw: sent.append(kw)
    )
    services = CloudServices(settings=settings, portal_email_sender=sender)
    with TestClient(create_app(services)) as client:
        client.headers.update(build_portal_bearer_headers(principal_id="p"))
        client.headers.update(
            {"Origin": "http://testserver", "Idempotency-Key": "export-test-key-0001"}
        )
        yield url, client, sent, services
    dispose_engine(url)


def issue(setup):
    url, client, sent, _ = setup
    response = client.post(f"{PREFIX}/code", json={"locale": "en"})
    assert response.status_code == 200, response.text
    assert "code" not in response.json()["data"]
    return {"challenge_id": response.json()["data"]["challenge_id"], "code": sent[-1]["code"]}


def challenge(url, challenge_id):
    with get_session(url) as session:
        row = session.get(PortalLoginCode, challenge_id)
        return row.status, row.attempt_count, row.metadata_json


def test_whitelist_and_no_business_writes_or_receipts(setup):
    url, client, _, _ = setup
    with get_session(url) as s:
        for rid, account, principal in [
            ("own", "a", "p"),
            ("peer", "a", "other"),
            ("cross", "b", "p"),
        ]:
            s.add(
                SupportRequest(
                    request_id=rid,
                    account_id=account,
                    principal_id=principal,
                    title=rid,
                    description="PUBLIC",
                    admin_note="PRIVATE-SENTINEL",
                    context_json={"token": "PRIVATE-SENTINEL"},
                    source_path="PRIVATE-SENTINEL",
                )
            )
        s.flush()
        for mid, rid, account, who, kind, visibility in [
            ("mine", "own", "a", "p", "customer", "public"),
            ("reply", "own", "a", "other", "operator", "public"),
            ("internal", "own", "a", "other", "operator", "internal"),
            ("peer", "own", "a", "other", "customer", "public"),
            ("system", "own", "a", "p", "system", "public"),
            ("cross", "own", "b", "p", "customer", "public"),
            ("other-ticket", "peer", "a", "p", "customer", "public"),
        ]:
            s.add(
                SupportRequestMessage(
                    message_id=mid,
                    request_id=rid,
                    account_id=account,
                    principal_id=who,
                    author_kind=kind,
                    visibility=visibility,
                    email="PRIVATE-SENTINEL",
                    body="PUBLIC" if mid in ("mine", "reply") else "PRIVATE-SENTINEL",
                    metadata_json={"token": "PRIVATE-SENTINEL"},
                )
            )
        s.flush()
        for aid, mid, rid, account, who, kind, vis in [
            ("sent", "mine", "own", "a", "p", "customer", "public"),
            ("operator", "reply", "own", "a", "other", "operator", "public"),
            ("wrong-operator-message", "mine", "own", "a", "other", "operator", "public"),
            ("draft", None, "own", "a", "p", "customer", "public"),
            ("empty", "", "own", "a", "p", "customer", "public"),
            ("private", "internal", "own", "a", "p", "customer", "public"),
            ("wrong-request", "mine", "peer", "a", "p", "customer", "public"),
            ("wrong-principal", "mine", "own", "a", "other", "customer", "public"),
            ("wrong-account", "mine", "own", "b", "p", "customer", "public"),
            ("hidden", "mine", "own", "a", "p", "customer", "internal"),
        ]:
            s.add(
                SupportRequestAttachment(
                    attachment_id=aid,
                    request_id=rid,
                    account_id=account,
                    message_id=mid,
                    principal_id=who,
                    uploader_kind=kind,
                    visibility=vis,
                    filename=aid,
                    content_bytes=b"PRIVATE-SENTINEL",
                    content_type="text/plain",
                    byte_size=16,
                )
            )
        for nid, account, who in [
            ("own", "a", "p"),
            ("null", "a", None),
            ("other", "a", "other"),
            ("cross", "b", "p"),
        ]:
            s.add(
                PortalNotification(
                    notification_id=nid,
                    account_id=account,
                    principal_id=who,
                    event_type="support_reply",
                    title=nid,
                    body="PUBLIC",
                    link_href="PRIVATE-SENTINEL",
                )
            )
        s.commit()
    payload = issue(setup)
    statements = []

    def capture(conn, cursor, statement, parameters, context, many):
        statements.append(statement.lower())

    event.listen(get_engine(url), "before_cursor_execute", capture)
    try:
        response = client.post(f"{PREFIX}/confirm", json=payload)
    finally:
        event.remove(get_engine(url), "before_cursor_execute", capture)
    assert response.status_code == 200, response.text
    assert "PRIVATE-SENTINEL" not in response.text
    data = response.json()["data"]
    assert [r["request_id"] for r in data["support_requests"]] == ["own"]
    assert [r["message_id"] for r in data["support_messages"]] == ["mine", "reply"]
    assert [r["attachment_id"] for r in data["attachment_metadata"]] == ["operator", "sent"]
    assert [r["notification_id"] for r in data["notifications"]] == ["own"]
    assert all("principal_id" not in r and "email" not in r for r in data["support_messages"])
    assert not any("content_bytes" in q for q in statements)
    writes = [q for q in statements if q.startswith(("update", "insert", "delete"))]
    assert writes and all("portal_login_codes" in q for q in writes)
    assert challenge(url, payload["challenge_id"])[0] == "consumed"
    with get_session(url) as s:
        assert list(s.scalars(select(ReplayReceipt))) == []
        assert s.get(PortalNotification, "own").is_read is False
        assert s.get(Principal, "p").session_version == 1
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 400


def test_attempts_format_rate_and_binding_persist(setup):
    url, client, _, _ = setup
    payload = issue(setup)
    assert challenge(url, payload["challenge_id"])[2]["binding"]["session_version"] == 1
    assert client.post(f"{PREFIX}/code", json={}).status_code == 429
    for i in range(5):
        result = client.post(
            f"{PREFIX}/confirm", json={"challenge_id": "wrong", "code": "PRIVATE-SENTINEL"}
        )
        assert result.status_code == 400
        assert "PRIVATE-SENTINEL" not in result.text
        assert challenge(url, payload["challenge_id"])[1] == i + 1
    assert challenge(url, payload["challenge_id"])[0] == "expired"
    for _ in range(3):
        assert client.post(f"{PREFIX}/confirm", content="malformed").status_code == 400
    assert client.post(f"{PREFIX}/confirm", content="malformed").status_code == 429


@pytest.mark.parametrize(
    "change", ["email", "version", "member", "account", "purpose", "expired", "schema", "scope"]
)
def test_scope_and_challenge_invalidation(setup, change):
    url, client, _, _ = setup
    payload = issue(setup)
    with get_session(url) as s:
        if change == "email":
            s.get(Principal, "p").email = "new@example.test"
        if change == "version":
            s.get(Principal, "p").session_version = 2
        if change == "member":
            s.get(AccountUserMembership, "m").status = "revoked"
        if change == "account":
            s.get(Account, "a").status = "closed"
        row = s.get(PortalLoginCode, payload["challenge_id"])
        if change == "purpose":
            row.purpose = "portal_login"
        if change == "expired":
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        if change == "schema":
            row.metadata_json = {
                **row.metadata_json,
                "binding": {**row.metadata_json["binding"], "schema": "other"},
            }
        if change == "scope":
            row.metadata_json = {
                **row.metadata_json,
                "binding": {**row.metadata_json["binding"], "scope": "other"},
            }
        s.commit()
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code in (400, 401, 403)
    assert challenge(url, payload["challenge_id"])[0] != "consumed"


@pytest.mark.parametrize("status", [413, 504])
def test_build_failures_rollback_consumption(setup, monkeypatch, status):
    url, client, _, _ = setup
    payload = issue(setup)
    original = domain.build_data_copy

    def fail(*args):
        raise domain.DataExportError(status, "portal.data_export_too_large")

    monkeypatch.setattr(domain, "build_data_copy", fail)
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == status
    assert challenge(url, payload["challenge_id"])[0:2] == ("pending", 0)
    monkeypatch.setattr(domain, "build_data_copy", original)
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 200


@pytest.mark.parametrize("count", [100, 101])
def test_ticket_limit_is_complete_or_failure(setup, count):
    url, client, _, _ = setup
    with get_session(url) as s:
        s.add_all(
            [
                SupportRequest(
                    request_id=f"t{i}", account_id="a", principal_id="p", title="T", description="D"
                )
                for i in range(count)
            ]
        )
        s.commit()
    payload = issue(setup)
    response = client.post(f"{PREFIX}/confirm", json=payload)
    assert response.status_code == (200 if count == 100 else 413)
    if count == 100:
        assert len(response.json()["data"]["support_requests"]) == 100
    else:
        assert challenge(url, payload["challenge_id"])[0] == "pending"


def test_huge_text_preflight_does_not_materialize(setup):
    url, client, _, _ = setup
    with get_session(url) as s:
        s.add(
            SupportRequest(
                request_id="huge",
                account_id="a",
                principal_id="p",
                title="T",
                description="界" * 800000,
            )
        )
        s.commit()
    payload = issue(setup)
    response = client.post(f"{PREFIX}/confirm", json=payload)
    assert response.status_code == 413
    assert challenge(url, payload["challenge_id"])[0:2] == ("pending", 0)


@pytest.mark.parametrize(
    "mode",
    ["auth", "origin", "validation", "unavailable", "success", "exception", "method", "forwarded"],
)
def test_private_cache_all_exits(setup, monkeypatch, mode):
    _, client, _, services = setup
    if mode == "auth":
        client.headers.pop("authorization", None)
    if mode == "forwarded":
        client.headers["x-forwarded-proto"] = "ftp"
    if mode == "origin":
        client.headers["Origin"] = "https://evil.example"
    if mode == "unavailable":
        services.portal_email_sender.supports_data_export = False
    if mode == "exception":

        def fail(**kwargs):
            raise RuntimeError("PRIVATE-SENTINEL")

        monkeypatch.setattr("app.api.routes.portal_data_export.execute_data_export", fail)
    response = (
        client.get(f"{PREFIX}/code")
        if mode == "method"
        else client.post(
            f"{PREFIX}/code", json={"extra": "PRIVATE-SENTINEL"} if mode == "validation" else {}
        )
    )
    assert (
        response.status_code
        == {
            "auth": 401,
            "origin": 403,
            "validation": 400,
            "unavailable": 503,
            "success": 200,
            "exception": 503,
            "method": 405,
            "forwarded": 400,
        }[mode]
    )
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["pragma"] == "no-cache"
    assert {"cookie", "authorization"} <= {
        x.strip().lower() for x in response.headers["vary"].split(",")
    }
    assert "PRIVATE-SENTINEL" not in response.text


@pytest.mark.parametrize(
    "kind,cap", [("messages", 1000), ("attachments", 500), ("notifications", 500)]
)
@pytest.mark.parametrize("extra", [0, 1])
def test_each_collection_limit(setup, kind, cap, extra):
    url, client, _, _ = setup
    with get_session(url) as s:
        s.add(
            SupportRequest(
                request_id="ticket", account_id="a", principal_id="p", title="T", description="D"
            )
        )
        s.flush()
        if kind == "attachments":
            s.add(
                SupportRequestMessage(
                    message_id="msg",
                    request_id="ticket",
                    account_id="a",
                    principal_id="p",
                    author_kind="customer",
                    visibility="public",
                    body="B",
                )
            )
            s.flush()
        for i in range(cap + extra):
            if kind == "messages":
                s.add(
                    SupportRequestMessage(
                        message_id=f"msg{i}",
                        request_id="ticket",
                        account_id="a",
                        principal_id="p",
                        author_kind="customer",
                        visibility="public",
                        body="B",
                    )
                )
            elif kind == "attachments":
                s.add(
                    SupportRequestAttachment(
                        attachment_id=f"att{i}",
                        message_id="msg",
                        request_id="ticket",
                        account_id="a",
                        principal_id="p",
                        uploader_kind="customer",
                        visibility="public",
                        filename="F",
                        content_bytes=b"not-exported",
                        byte_size=12,
                    )
                )
            else:
                s.add(
                    PortalNotification(
                        notification_id=f"note{i}",
                        account_id="a",
                        principal_id="p",
                        event_type="support_reply",
                        title="N",
                    )
                )
        s.commit()
    payload = issue(setup)
    response = client.post(f"{PREFIX}/confirm", json=payload)
    assert response.status_code == (413 if extra else 200)
    if extra:
        assert challenge(url, payload["challenge_id"])[0] == "pending"
    else:
        field = {
            "messages": "support_messages",
            "attachments": "attachment_metadata",
            "notifications": "notifications",
        }[kind]
        assert len(response.json()["data"][field]) == cap


@pytest.mark.parametrize("extra", [0, 1])
def test_exact_utf8_envelope_boundary(setup, monkeypatch, extra):
    url, client, _, _ = setup
    payload = issue(setup)
    now = datetime.now(UTC)
    base = {"schema": domain.SCHEMA, "exported_at": now.isoformat(), "data": {"text": ""}}
    padding = (
        domain.MAX_BYTES
        - len(json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode())
        + extra
    )
    data = {"text": "界" * (padding // 3) + "x" * (padding % 3)}
    monkeypatch.setattr(domain, "datetime", SimpleNamespace(now=lambda _: now))
    monkeypatch.setattr(domain, "build_data_copy", lambda *args: data)
    response = client.post(f"{PREFIX}/confirm", json=payload)
    assert response.status_code == (413 if extra else 200)
    if not extra:
        assert len(response.content) == domain.MAX_BYTES
    else:
        assert challenge(url, payload["challenge_id"])[0:2] == ("pending", 0)


def test_json_escaping_can_exceed_sql_byte_budget(setup):
    url, client, _, _ = setup
    with get_session(url) as s:
        s.add(
            SupportRequest(
                request_id="escaped",
                account_id="a",
                principal_id="p",
                title="T",
                description="\x00" * 350000,
            )
        )
        s.commit()
    payload = issue(setup)
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 413
    assert challenge(url, payload["challenge_id"])[0:2] == ("pending", 0)


def test_resend_expires_only_own_purpose_and_reloads_json(setup):
    url, client, _, _ = setup
    with get_session(url) as s:
        s.add(
            PortalLoginCode(
                code_id="login-purpose",
                principal_id="p",
                email="p@example.test",
                purpose="portal_login",
                code_hash="not-export-hash",
                status="pending",
                attempt_count=0,
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
            )
        )
        s.commit()
    old = issue(setup)
    with get_session(url) as s:
        row = s.get(PortalLoginCode, old["challenge_id"])
        row.metadata_json = {**row.metadata_json, "last_issue": datetime.now(UTC).timestamp() - 61}
        s.commit()
    new = issue(setup)
    assert new["challenge_id"] != old["challenge_id"]
    assert challenge(url, old["challenge_id"])[0] == "expired"
    assert challenge(url, "login-purpose")[0] == "pending"
    assert challenge(url, new["challenge_id"])[2]["binding"]["account_id"] == "a"


def test_original_authenticated_version_survives_auth_to_domain_race(setup, monkeypatch):
    url, client, _, _ = setup
    payload = issue(setup)
    original = domain.execute_data_export

    def revoked_after_auth(**kwargs):
        with get_session(url) as s:
            s.get(Principal, "p").session_version = 2
            s.commit()
        assert kwargs["session_version"] == 1
        return original(**kwargs)

    monkeypatch.setattr("app.api.routes.portal_data_export.execute_data_export", revoked_after_auth)
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 401
    assert challenge(url, payload["challenge_id"])[0] == "pending"


@pytest.mark.parametrize("email", [None, "invalid-address"])
def test_current_email_is_required_and_not_client_selected(setup, email):
    url, client, sent, _ = setup
    with get_session(url) as s:
        s.get(Principal, "p").email = email
        s.commit()
    assert client.post(f"{PREFIX}/code", json={}).status_code == 503
    assert not sent


def test_serialization_failure_does_not_consume_or_expose_payload(setup, monkeypatch):
    url, client, _, _ = setup
    payload = issue(setup)

    class Unserializable:
        pass

    monkeypatch.setattr(domain, "build_data_copy", lambda *args: {"text": Unserializable()})
    response = client.post(f"{PREFIX}/confirm", json=payload)
    assert response.status_code == 503
    assert challenge(url, payload["challenge_id"])[0:2] == ("pending", 0)


def test_transport_withdrawal_prevents_confirm_and_preserves_code(setup):
    url, client, _, services = setup
    payload = issue(setup)
    services.portal_email_sender.supports_data_export = False
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 503
    assert challenge(url, payload["challenge_id"])[0] == "pending"


@pytest.mark.parametrize("resource", ["principal", "account", "membership"])
def test_changed_scope_timestamp_invalidates_challenge(setup, resource):
    url, client, _, _ = setup
    payload = issue(setup)
    with get_session(url) as s:
        row = s.get(
            {"principal": Principal, "account": Account, "membership": AccountUserMembership}[
                resource
            ],
            {"principal": "p", "account": "a", "membership": "m"}[resource],
        )
        row.updated_at = datetime.now(UTC) + timedelta(seconds=1)
        s.commit()
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 400
    assert challenge(url, payload["challenge_id"])[0] == "expired"


@pytest.mark.parametrize("locale,phrase", [("en", "current email"), ("zh-CN", "当前邮箱")])
def test_dedicated_smtp_template_and_redacted_delivery_error(monkeypatch, locale, phrase):
    from app.adapters.notifications.base import PortalEmailDeliveryError
    from app.adapters.notifications.smtp import SmtpPortalEmailSender

    sender = SmtpPortalEmailSender(
        host="unused.invalid",
        port=587,
        use_ssl=False,
        use_starttls=True,
        timeout_seconds=1,
        from_email="sender@example.test",
    )
    captured = []
    monkeypatch.setattr(sender, "_deliver", lambda message: captured.append(message))
    args = dict(
        recipient_email="p@example.test",
        principal_id="p",
        code="123456",
        expires_in_seconds=300,
        project_name="Cloud",
        locale=locale,
    )
    sender.send_data_export_code(**args)
    assert sender.supports_data_export
    body = captured[0].get_body(preferencelist=("plain",)).get_content()
    assert phrase in body and "123456" in body
    assert "closure" not in captured[0]["Subject"].lower()

    def fail(message):
        raise RuntimeError("PRIVATE-SENTINEL 123456 p@example.test")

    monkeypatch.setattr(sender, "_deliver", fail)
    with pytest.raises(PortalEmailDeliveryError) as caught:
        sender.send_data_export_code(**args)
    assert "PRIVATE-SENTINEL" not in str(caught.value)
    assert "123456" not in str(caught.value)
    assert "p@example.test" not in str(caught.value)


def test_cookie_authentication_uses_original_signed_version(setup):
    from app.api.auth import build_portal_session_token

    url, client, _, services = setup
    token = build_portal_session_token(services.settings, principal_id="p", session_version=1)
    client.headers.pop("authorization")
    client.cookies.set("npcink_portal_session_token", token)
    payload = issue(setup)
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 200
    assert challenge(url, payload["challenge_id"])[0] == "consumed"


@pytest.mark.parametrize("account", ["a", "b"])
def test_selected_site_is_a_server_validated_account_selector(setup, account):
    from app.core.models import Site, SiteAccountBinding

    url, client, _, _ = setup
    with get_session(url) as s:
        s.add(Site(site_id="site_export", account_id=account, name="Export", status="active"))
        s.flush()
        s.add(
            SiteAccountBinding(
                binding_id="site_binding",
                site_id="site_export",
                account_id=account,
                status="active",
                bound_at=datetime.now(UTC),
            )
        )
        s.commit()
    client.headers.update(build_portal_bearer_headers(principal_id="p", site_id="site_export"))
    response = client.post(f"{PREFIX}/code", json={})
    assert response.status_code == (200 if account == "a" else 403)


def test_ttl_boundary_is_exclusive(setup, monkeypatch):
    url, client, _, _ = setup
    payload = issue(setup)
    with get_session(url) as s:
        expires = domain.utc(s.get(PortalLoginCode, payload["challenge_id"]).expires_at)
    monkeypatch.setattr(domain, "datetime", SimpleNamespace(now=lambda _: expires))
    assert client.post(f"{PREFIX}/confirm", json=payload).status_code == 400
    assert challenge(url, payload["challenge_id"])[0] == "expired"


@pytest.mark.parametrize(
    "value", ["p\x00@example.test", ".p@example.test", "p@example..test", "p@exa\nmple.test"]
)
def test_malformed_bound_email_is_unavailable(setup, value):
    url, client, sent, _ = setup
    with get_session(url) as s:
        s.get(Principal, "p").email = value
        s.commit()
    assert client.post(f"{PREFIX}/code", json={}).status_code == 503
    assert not sent
