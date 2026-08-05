from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select

from app.api.routes import service as service_routes
from app.core.db import dispose_engine, get_session
from app.core.models import (
    ServiceAuditEvent,
    ServiceSetting,
)
from app.core.secrets import (
    decrypt_service_setting_secret,
    encrypt_service_setting_secret,
)
from tests.api.service_routes_test_support import (
    _build_client,
    _runtime_service_settings,
)
from tests.conftest import (
    build_internal_headers,
)

OLD_SERVICE_SETTINGS_ROOT = base64.urlsafe_b64encode(b"O" * 32).decode("ascii")
DEDICATED_SERVICE_SETTINGS_ROOT = base64.urlsafe_b64encode(b"D" * 32).decode("ascii")
OTHER_SERVICE_SETTINGS_ROOT = base64.urlsafe_b64encode(b"W" * 32).decode("ascii")
MALICIOUS_EXCEPTION_DETAIL = (
    "Traceback (most recent call last): /srv/private/advisor.py "
    "database_password=super-secret-token"
)


def _alipay_test_keys() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return private_pem, public_pem


def test_admin_operational_readiness_projection_is_bounded_and_fail_closed() -> None:
    ready = service_routes._build_admin_operational_readiness_projection(
        {
            "ok": True,
            "generated_at": "2026-07-29T08:00:00Z",
            "checks": {
                "dependencies.ready": True,
                "providers.fresh": True,
                "worker.runtime_queue.fresh": True,
                "cadence.provider_health_scan.fresh": True,
            },
            "summary": {"must_not_escape": True},
        }
    )
    blocked = service_routes._build_admin_operational_readiness_projection(
        {
            "ok": False,
            "generated_at": "2026-07-29T08:01:00Z",
            "checks": {
                "dependencies.ready": True,
                "providers.fresh": False,
                "worker.runtime_queue.fresh": False,
                "cadence.provider_health_scan.fresh": False,
            },
        }
    )

    assert ready == {
        "status": "ok",
        "ok": True,
        "generated_at": "2026-07-29T08:00:00Z",
        "checks_total": 4,
        "checks_failed": 0,
        "failed_checks": [],
        "failure_scopes": [],
        "href": "/admin/troubleshooting",
    }
    assert blocked["status"] == "error"
    assert blocked["checks_failed"] == 3
    assert blocked["failure_scopes"] == ["providers", "workers", "cadence"]
    assert "summary" not in blocked


def test_admin_service_settings_store_masked_cloud_runtime_config(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    alipay_private_key, alipay_public_key = _alipay_test_keys()

    initial_response = client.get(
        "/internal/service/admin/service-settings",
        headers=build_internal_headers(),
    )
    assert initial_response.status_code == 200
    assert initial_response.json()["data"]["env_fallback"] == "disabled"
    assert initial_response.json()["data"]["settings"]["portal_email"]["status"] == "missing_config"
    accounting_fx = initial_response.json()["data"]["settings"]["accounting_fx"]
    assert accounting_fx["status"] == "missing_config"
    assert accounting_fx["configured"] is False
    assert accounting_fx["config"]["usd_cny_rate"] == "7.200000"
    assert accounting_fx["config"]["is_fallback"] is True
    assert (
        initial_response.json()["data"]["settings"]["alipay_payment"]["status"] == "missing_config"
    )
    assert initial_response.json()["data"]["settings"]["site_relink_policy"] == {
        "setting_id": "site_relink_policy",
        "setting_kind": "commercial",
        "enabled": True,
        "configured": True,
        "status": "ready",
        "config": {"cooldown_days": 90},
        "secrets": {},
        "last_tested_at": "",
        "last_error_code": "",
        "last_error_message": "",
        "credential_value_exposure": "none",
    }

    relink_response = client.patch(
        "/internal/service/admin/service-settings/site-relink-policy",
        json={"enabled": True, "cooldown_days": 180},
        headers=build_internal_headers(idempotency_key="service-settings-relink-001"),
    )
    assert relink_response.status_code == 200, relink_response.text
    assert relink_response.json()["data"]["setting_kind"] == "commercial"
    assert relink_response.json()["data"]["config"] == {"cooldown_days": 180}
    invalid_relink_response = client.patch(
        "/internal/service/admin/service-settings/site-relink-policy",
        json={"enabled": True, "cooldown_days": 89},
        headers=build_internal_headers(idempotency_key="service-settings-relink-invalid"),
    )
    assert invalid_relink_response.status_code == 422

    accounting_response = client.patch(
        "/internal/service/admin/service-settings/accounting-fx",
        json={
            "usd_cny_rate": 7.1234567,
            "effective_at": "2026-07-28T08:00:00+08:00",
            "source": "operator-approved monthly rate",
            "note": "July accounting close",
        },
        headers=build_internal_headers(idempotency_key="service-settings-accounting-fx-001"),
    )
    assert accounting_response.status_code == 200, accounting_response.text
    assert accounting_response.json()["data"]["setting_kind"] == "commercial"
    assert accounting_response.json()["data"]["config"]["usd_cny_rate"] == "7.123457"
    assert accounting_response.json()["data"]["config"]["effective_at"] == (
        "2026-07-28T00:00:00+00:00"
    )
    assert accounting_response.json()["data"]["config"]["rate_version"] == (
        "usd-cny-20260728T000000Z-7_123457"
    )
    assert accounting_response.json()["data"]["config"]["is_fallback"] is False

    invalid_accounting_response = client.patch(
        "/internal/service/admin/service-settings/accounting-fx",
        json={
            "usd_cny_rate": 0,
            "effective_at": "2026-07-28T00:00:00Z",
            "source": "operator",
        },
        headers=build_internal_headers(
            idempotency_key="service-settings-accounting-fx-invalid"
        ),
    )
    assert invalid_accounting_response.status_code == 422

    public_response = client.patch(
        "/internal/service/admin/service-settings/portal-public",
        json={"public_base_url": "https://cloud.example.com"},
        headers=build_internal_headers(idempotency_key="service-settings-public-001"),
    )
    assert public_response.status_code == 200, public_response.text
    assert public_response.json()["data"]["config"]["public_base_url"] == (
        "https://cloud.example.com"
    )

    qq_response = client.patch(
        "/internal/service/admin/service-settings/qq-login",
        json={
            "client_id": "qq-client-id",
            "client_secret": "qq-client-secret",
            "redirect_uri": "https://cloud.example.com/open/auth/qq/callback",
            "scope": "get_user_info",
            "timeout_seconds": 10,
        },
        headers=build_internal_headers(idempotency_key="service-settings-qq-001"),
    )
    assert qq_response.status_code == 200, qq_response.text
    assert qq_response.json()["data"]["status"] == "ready"
    assert qq_response.json()["data"]["secrets"]["client_secret"]["configured"] is True
    assert "qq-client-secret" not in json.dumps(qq_response.json())

    email_response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": "smtp-password",
            "smtp_use_ssl": True,
            "smtp_use_starttls": False,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-001"),
    )
    assert email_response.status_code == 200, email_response.text
    assert email_response.json()["data"]["secrets"]["smtp_password"]["display"] == ("configured")
    assert "smtp-password" not in json.dumps(email_response.json())

    alipay_response = client.patch(
        "/internal/service/admin/service-settings/alipay-payment",
        json={
            "enabled": True,
            "app_id": "2026000000000099",
            # Legacy callers may still send this field, but operators may not
            # redirect the real Page Pay flow away from the fixed gateway.
            "gateway_url": "https://untrusted.example.invalid/gateway.do",
            "notify_url": "https://cloud.example.com/open/payments/alipay/notify",
            "return_url": "https://cloud.example.com/open/payments/alipay/return",
            "private_key": alipay_private_key,
            "public_key": alipay_public_key,
        },
        headers=build_internal_headers(idempotency_key="service-settings-alipay-001"),
    )
    assert alipay_response.status_code == 200, alipay_response.text
    assert alipay_response.json()["data"]["status"] == "ready"
    assert alipay_response.json()["data"]["config"]["gateway_url"] == (
        "https://openapi.alipay.com/gateway.do"
    )
    assert alipay_response.json()["data"]["secrets"]["private_key"]["display"] == "configured"
    assert alipay_response.json()["data"]["secrets"]["public_key"]["display"] == "configured"
    assert alipay_private_key not in json.dumps(alipay_response.json())
    assert alipay_public_key not in json.dumps(alipay_response.json())

    alipay_test_response = client.post(
        "/internal/service/admin/service-settings/alipay-payment/test",
        headers=build_internal_headers(idempotency_key="service-settings-alipay-test-001"),
    )
    assert alipay_test_response.status_code == 200, alipay_test_response.text
    assert alipay_test_response.json()["data"]["status"] == "ready"

    with get_session(database_url) as session:
        qq_row = session.get(ServiceSetting, "portal_qq_login")
        email_row = session.get(ServiceSetting, "portal_email")
        alipay_row = session.get(ServiceSetting, "payment_alipay")
        relink_row = session.get(ServiceSetting, "site_relink_policy")
        accounting_row = session.get(ServiceSetting, "commercial_accounting_fx")
        assert qq_row is not None
        assert email_row is not None
        assert alipay_row is not None
        assert relink_row is not None
        assert accounting_row is not None
        assert accounting_row.setting_kind == "commercial"
        assert accounting_row.config_json["usd_cny_rate"] == "7.123457"
        assert relink_row.setting_kind == "commercial"
        assert relink_row.config_json == {"cooldown_days": 180}
        assert (
            decrypt_service_setting_secret(
                str((qq_row.secret_ciphertext_json or {})["client_secret"]),
                settings=_runtime_service_settings(database_url),
            )
            == "qq-client-secret"
        )
        assert (
            decrypt_service_setting_secret(
                str((email_row.secret_ciphertext_json or {})["smtp_password"]),
                settings=_runtime_service_settings(database_url),
            )
            == "smtp-password"
        )
        assert (
            decrypt_service_setting_secret(
                str((alipay_row.secret_ciphertext_json or {})["private_key"]),
                settings=_runtime_service_settings(database_url),
            )
            == alipay_private_key.strip()
        )
        assert (
            decrypt_service_setting_secret(
                str((alipay_row.secret_ciphertext_json or {})["public_key"]),
                settings=_runtime_service_settings(database_url),
            )
            == alipay_public_key.strip()
        )

    list_response = client.get(
        "/internal/service/admin/service-settings",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200
    data = list_response.json()["data"]
    assert data["settings"]["qq_login"]["configured"] is True
    assert data["settings"]["portal_email"]["configured"] is True
    assert data["settings"]["alipay_payment"]["configured"] is True
    assert data["settings"]["site_relink_policy"]["config"]["cooldown_days"] == 180
    assert data["boundary"]["wordpress_control_plane"] is False
    assert "smtp-password" not in json.dumps(data)
    assert alipay_private_key not in json.dumps(data)
    assert alipay_public_key not in json.dumps(data)

    dispose_engine(database_url)


def test_admin_site_compliance_draft_publish_and_public_projection(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    initial = client.get(
        "/internal/service/admin/site-compliance",
        headers=build_internal_headers(),
    )
    assert initial.status_code == 200, initial.text
    payload = initial.json()["data"]["draft"]["payload"]
    assert initial.json()["data"]["published"] is None
    assert client.get("/open/compliance").json()["data"]["published"] is False

    payload["operator"]["entity_name"] = "示例运营主体"
    payload["operator"]["entity_type"] = "企业"
    payload["refund"]["processing_business_days"] = 7
    payload["review"]["operator_confirmed"] = True
    for item in payload["retention"]:
        item["confirmed"] = True

    saved = client.put(
        "/internal/service/admin/site-compliance/draft",
        json={"payload": payload},
        headers=build_internal_headers(idempotency_key="site-compliance-save-001"),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["draft"]["validation"]["ready_to_publish"] is True

    published = client.post(
        "/internal/service/admin/site-compliance/publish",
        json={},
        headers=build_internal_headers(idempotency_key="site-compliance-publish-001"),
    )
    assert published.status_code == 200, published.text
    assert published.json()["data"]["published"]["version_number"] == 1

    public = client.get("/open/compliance")
    assert public.status_code == 200, public.text
    public_data = public.json()["data"]
    assert public_data["published"] is True
    assert public_data["payload"]["operator"]["entity_name"] == "示例运营主体"
    assert "draft" not in public_data
    assert "review" not in public_data["payload"]

    with get_session(database_url) as session:
        events = list(
            session.scalars(
                select(ServiceAuditEvent).where(
                    ServiceAuditEvent.scope_id == "site_compliance"
                )
            )
        )
    assert {event.event_kind for event in events} == {
        "site_compliance.draft.save",
        "site_compliance.publish",
    }
    assert "示例运营主体" not in json.dumps(
        [event.payload_json for event in events],
        ensure_ascii=False,
    )

    dispose_engine(database_url)


def test_admin_site_compliance_publish_is_blocked_until_required_fields_are_confirmed(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    initial = client.get(
        "/internal/service/admin/site-compliance",
        headers=build_internal_headers(),
    )
    payload = initial.json()["data"]["draft"]["payload"]

    saved = client.put(
        "/internal/service/admin/site-compliance/draft",
        json={"payload": payload},
        headers=build_internal_headers(idempotency_key="site-compliance-save-blocked"),
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["draft"]["validation"]["blockers"]

    published = client.post(
        "/internal/service/admin/site-compliance/publish",
        json={},
        headers=build_internal_headers(idempotency_key="site-compliance-publish-blocked"),
    )
    assert published.status_code == 409
    assert published.json()["error_code"] == "site_compliance.publish_blocked"

    dispose_engine(database_url)


def test_admin_service_settings_email_replaces_unreadable_existing_password(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    old_settings = _runtime_service_settings(database_url)
    old_settings.service_settings_secret = OLD_SERVICE_SETTINGS_ROOT
    bad_ciphertext = encrypt_service_setting_secret("old-password", settings=old_settings)

    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id="portal_email",
                setting_kind="portal",
                enabled=False,
                config_json={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 465,
                    "smtp_username": "smtp-user",
                    "smtp_use_ssl": True,
                    "smtp_use_starttls": False,
                    "smtp_timeout_seconds": 20,
                    "from_email": "noreply@example.com",
                    "from_name": "Npcink AI Cloud",
                    "reply_to": "support@example.com",
                },
                secret_ciphertext_json={"smtp_password": bad_ciphertext},
                status="disabled",
                metadata_json={},
            )
        )
        session.commit()

    response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": "new-password",
            "smtp_use_ssl": True,
            "smtp_use_starttls": False,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-rotate-001"),
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "ready"
    with get_session(database_url) as session:
        row = session.get(ServiceSetting, "portal_email")
        assert row is not None
        assert (
            decrypt_service_setting_secret(
                str((row.secret_ciphertext_json or {})["smtp_password"]),
                settings=_runtime_service_settings(database_url),
            )
            == "new-password"
        )

    dispose_engine(database_url)


def test_service_setting_secret_only_uses_dedicated_key() -> None:
    dedicated_settings = _runtime_service_settings("sqlite+pysqlite:///:memory:")
    dedicated_settings.service_settings_secret = DEDICATED_SERVICE_SETTINGS_ROOT
    dedicated_ciphertext = encrypt_service_setting_secret(
        "dedicated-service-secret",
        settings=dedicated_settings,
    )
    assert (
        decrypt_service_setting_secret(
            dedicated_ciphertext,
            settings=dedicated_settings,
        )
        == "dedicated-service-secret"
    )

    missing_key_settings = _runtime_service_settings("sqlite+pysqlite:///:memory:")
    missing_key_settings.service_settings_secret = None
    with pytest.raises(RuntimeError, match="service setting secret is not configured"):
        decrypt_service_setting_secret(dedicated_ciphertext, settings=missing_key_settings)

    wrong_key_settings = _runtime_service_settings("sqlite+pysqlite:///:memory:")
    wrong_key_settings.service_settings_secret = OTHER_SERVICE_SETTINGS_ROOT
    with pytest.raises(RuntimeError, match="service setting secret could not be decrypted"):
        decrypt_service_setting_secret(dedicated_ciphertext, settings=wrong_key_settings)


def test_admin_service_settings_email_requires_reentry_for_unreadable_saved_password(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    old_settings = _runtime_service_settings(database_url)
    old_settings.service_settings_secret = OLD_SERVICE_SETTINGS_ROOT
    bad_ciphertext = encrypt_service_setting_secret("old-password", settings=old_settings)

    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id="portal_email",
                setting_kind="portal",
                enabled=False,
                config_json={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 465,
                    "smtp_username": "smtp-user",
                    "smtp_use_ssl": True,
                    "smtp_use_starttls": False,
                    "smtp_timeout_seconds": 20,
                    "from_email": "noreply@example.com",
                    "from_name": "Npcink AI Cloud",
                    "reply_to": "support@example.com",
                },
                secret_ciphertext_json={"smtp_password": bad_ciphertext},
                status="disabled",
                metadata_json={},
            )
        )
        session.commit()

    response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": None,
            "smtp_use_ssl": True,
            "smtp_use_starttls": False,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-rotate-002"),
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "service_settings.email_password_required"
    assert "Re-enter the SMTP password" in response.json()["message"]

    dispose_engine(database_url)


def test_admin_service_settings_reject_qq_redirect_outside_public_base(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    public_response = client.patch(
        "/internal/service/admin/service-settings/portal-public",
        json={"public_base_url": "https://cloud.example.com"},
        headers=build_internal_headers(idempotency_key="service-settings-bad-public-001"),
    )
    assert public_response.status_code == 200

    response = client.patch(
        "/internal/service/admin/service-settings/qq-login",
        json={
            "client_id": "qq-client-id",
            "client_secret": "qq-client-secret",
            "redirect_uri": "https://evil.example.com/open/auth/qq/callback",
            "scope": "get_user_info",
            "timeout_seconds": 10,
        },
        headers=build_internal_headers(idempotency_key="service-settings-bad-qq-001"),
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "service_settings.qq_redirect_uri_invalid"

    dispose_engine(database_url)


def test_admin_service_settings_reject_legacy_qq_redirect_path(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    public_response = client.patch(
        "/internal/service/admin/service-settings/portal-public",
        json={"public_base_url": "https://cloud.example.com"},
        headers=build_internal_headers(idempotency_key="service-settings-legacy-public-001"),
    )
    assert public_response.status_code == 200

    response = client.patch(
        "/internal/service/admin/service-settings/qq-login",
        json={
            "client_id": "qq-client-id",
            "client_secret": "qq-client-secret",
            "redirect_uri": "https://cloud.example.com/portal/v1/auth/qq/callback",
            "scope": "get_user_info",
            "timeout_seconds": 10,
        },
        headers=build_internal_headers(idempotency_key="service-settings-legacy-qq-001"),
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "service_settings.qq_redirect_uri_invalid"

    dispose_engine(database_url)


def test_admin_service_settings_reject_email_ssl_and_starttls(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)

    response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": "smtp-password",
            "smtp_use_ssl": True,
            "smtp_use_starttls": True,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-bad-email-tls-001"),
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "service_settings.email_tls_mode_invalid"

    dispose_engine(database_url)


def test_admin_service_settings_email_preview_uses_template_without_secret_exposure(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    email_response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": "smtp-password",
            "smtp_use_ssl": True,
            "smtp_use_starttls": False,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-preview-save"),
    )
    assert email_response.status_code == 200, email_response.text

    preview_response = client.post(
        "/internal/service/admin/service-settings/email/preview",
        json={
            "preview_type": "registration",
            "locale": "zh-CN",
            "from_name": "Npcink AI Cloud",
            "from_email": "auth@npc.ink",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-preview"),
    )

    assert preview_response.status_code == 200, preview_response.text
    data = preview_response.json()["data"]
    assert data["surface"] == "admin_service_settings_email_preview"
    assert data["preview_type"] == "registration"
    assert data["from_name"] == "Npcink AI Cloud"
    assert data["from_email"] == "auth@npc.ink"
    assert data["recommended_from_name"] == "Npcink AI Cloud"
    assert data["subject"].startswith("完成 Npcink AI Cloud")
    assert data["subject"].endswith("注册")
    assert "完成服务中心注册" in data["html"]
    assert "smtp-password" not in json.dumps(preview_response.json())
    assert data["credential_value_exposure"] == "none"

    dispose_engine(database_url)


def test_admin_service_settings_email_test_can_send_repeatedly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    email_response = client.patch(
        "/internal/service/admin/service-settings/email",
        json={
            "enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_username": "smtp-user",
            "smtp_password": "smtp-password",
            "smtp_use_ssl": True,
            "smtp_use_starttls": False,
            "smtp_timeout_seconds": 20,
            "from_email": "noreply@example.com",
            "from_name": "Npcink AI Cloud",
            "reply_to": "support@example.com",
        },
        headers=build_internal_headers(idempotency_key="service-settings-email-repeat-save"),
    )
    assert email_response.status_code == 200, email_response.text

    deliveries: list[dict[str, str]] = []

    class _FakeSender:
        def send_test_email(
            self,
            *,
            recipient_email: str,
            project_name: str,
            portal_url: str,
        ) -> None:
            deliveries.append(
                {
                    "recipient_email": recipient_email,
                    "project_name": project_name,
                    "portal_url": portal_url,
                }
            )

    monkeypatch.setattr(
        "app.adapters.notifications.smtp.build_portal_email_sender_from_config",
        lambda _config: _FakeSender(),
    )

    for attempt in range(1, 4):
        response = client.post(
            "/internal/service/admin/service-settings/email/test",
            json={"recipient_email": "operator@example.com"},
            headers=build_internal_headers(
                idempotency_key=f"service-settings-email-repeat-{attempt}"
            ),
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == "ready"

    assert [item["recipient_email"] for item in deliveries] == [
        "operator@example.com",
        "operator@example.com",
        "operator@example.com",
    ]

    dispose_engine(database_url)
