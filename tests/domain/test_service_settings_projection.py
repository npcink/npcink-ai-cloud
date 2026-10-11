from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

import pytest

from app.core.models import ServiceSetting
from app.domain.service_settings_projection import (
    serialize,
    serialize_accounting_fx,
    serialize_media_recognition_policy,
    serialize_platform_preferences,
    serialize_site_relink_policy,
)


def test_public_projection_masks_credentials_without_mutating_stored_values() -> None:
    config = {
        "host": "smtp.example.test",
        "password": "fixture-password",
        "client_secret": "fixture-secret",
        "access_token": "fixture-token",
    }
    ciphertexts = {"password": "fixture-ciphertext", "empty": ""}
    row = ServiceSetting(
        setting_id="portal_email",
        setting_kind="portal",
        enabled=False,
        status="error",
        config_json=deepcopy(config),
        secret_ciphertext_json=deepcopy(ciphertexts),
        last_tested_at=datetime(2026, 9, 9, tzinfo=UTC),
        last_error_code="delivery.failed",
        last_error_message="Delivery failed",
    )
    result = serialize(row)
    assert result["config"] == {"host": "smtp.example.test"}
    assert result["secrets"] == {
        "password": {"configured": True, "display": "configured"},
        "empty": {"configured": False, "display": "missing"},
    }
    assert result["status"] == "error"
    assert result["enabled"] is False
    assert result["configured"] is False
    assert result["last_tested_at"] == "2026-09-09T00:00:00+00:00"
    assert result["last_error_code"] == "delivery.failed"
    assert result["credential_value_exposure"] == "none"
    assert row.config_json == config
    assert row.secret_ciphertext_json == ciphertexts


def test_missing_settings_keep_distinct_policy_defaults() -> None:
    assert serialize(None, setting_id="portal_email")["status"] == "missing_config"
    relink = serialize_site_relink_policy(None)
    assert relink["enabled"] is True
    assert relink["config"] == {"cooldown_days": 90}
    media = serialize_media_recognition_policy(None)
    assert media["status"] == "disabled"
    assert media["enabled"] is False
    assert media["config"] == {"window_start": "01:00", "window_end": "06:00", "daily_limit": 100}
    timezone = serialize_platform_preferences(None)
    assert timezone["configured"] is False
    assert timezone["config"] == {"timezone": "Asia/Shanghai"}
    fx = serialize_accounting_fx(None)
    assert fx["configured"] is False
    assert fx["config"]["is_fallback"] is True


@pytest.mark.parametrize("daily_limit", [0, -1, None, "invalid"])
def test_media_projection_normalizes_saved_values_without_rewriting_policy(
    daily_limit: object,
) -> None:
    config = {"window_start": "2:3", "window_end": "25:00", "daily_limit": daily_limit}
    row = ServiceSetting(
        setting_id="media_recognition_policy",
        setting_kind="runtime",
        enabled=True,
        status="ready",
        config_json=deepcopy(config),
        secret_ciphertext_json={},
    )
    assert serialize_media_recognition_policy(row)["config"] == {
        "window_start": "02:03",
        "window_end": "06:00",
        "daily_limit": 100,
    }
    assert row.config_json == config


def test_disabled_fx_ignores_saved_rate_and_keeps_fallback_contract() -> None:
    row = ServiceSetting(
        enabled=False,
        config_json={
            "usd_cny_rate": "8.0",
            "effective_at": "2026-09-01T00:00:00+00:00",
            "source": "manual",
        },
    )
    result = serialize_accounting_fx(row)
    assert result["enabled"] is True
    assert result["status"] == "missing_config"
    assert result["config"]["is_fallback"] is True
    assert result["config"]["usd_cny_rate"] == "7.200000"
    row.enabled = True
    result = serialize_accounting_fx(row)
    assert result["configured"] is True
    assert result["config"]["usd_cny_rate"] == "8.000000"
