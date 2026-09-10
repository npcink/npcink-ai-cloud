"""Admin-safe service-setting projections; no database, decryption or external I/O."""

from __future__ import annotations

from typing import Any

from app.core.models import ServiceSetting
from app.domain.commercial.currency import SERVICE_SETTING_ACCOUNTING_FX, resolve_accounting_fx_rate
from app.domain.service_settings_values import (
    DEFAULT_MEDIA_RECOGNITION_DAILY_LIMIT,
    DEFAULT_MEDIA_RECOGNITION_WINDOW_END,
    DEFAULT_MEDIA_RECOGNITION_WINDOW_START,
    DEFAULT_PLATFORM_TIMEZONE,
    DEFAULT_SITE_RELINK_COOLDOWN_DAYS,
    SERVICE_SETTING_KIND_COMMERCIAL,
    SERVICE_SETTING_KIND_PORTAL,
    SERVICE_SETTING_KIND_RUNTIME,
    SERVICE_SETTING_MEDIA_RECOGNITION_POLICY,
    SERVICE_SETTING_PLATFORM_PREFERENCES,
    SERVICE_SETTING_SITE_RELINK_POLICY,
    STATUS_DISABLED,
    STATUS_MISSING_CONFIG,
    STATUS_READY,
    _dict,
    _normalize_clock,
    _positive_int,
    _string,
)


def serialize(row: ServiceSetting | None, *, setting_id: str = "") -> dict[str, Any]:
    if row is None:
        return {
            "setting_id": setting_id,
            "setting_kind": SERVICE_SETTING_KIND_PORTAL,
            "enabled": False,
            "configured": False,
            "status": STATUS_MISSING_CONFIG,
            "config": {},
            "secrets": {},
            "last_tested_at": "",
            "last_error_code": "",
            "last_error_message": "",
            "credential_value_exposure": "none",
        }
    secrets = _dict(row.secret_ciphertext_json)
    secret_status = {
        key: {
            "configured": bool(_string(value)),
            "display": "configured" if value else "missing",
        }
        for key, value in secrets.items()
    }
    return {
        "setting_id": row.setting_id,
        "setting_kind": row.setting_kind,
        "enabled": bool(row.enabled),
        "configured": row.status == STATUS_READY,
        "status": row.status,
        "config": _public_config(_dict(row.config_json)),
        "secrets": secret_status,
        "last_tested_at": row.last_tested_at.isoformat() if row.last_tested_at else "",
        "last_error_code": row.last_error_code or "",
        "last_error_message": row.last_error_message or "",
        "credential_value_exposure": "none",
    }


def serialize_site_relink_policy(
    row: ServiceSetting | None,
) -> dict[str, Any]:
    if row is None:
        return {
            "setting_id": SERVICE_SETTING_SITE_RELINK_POLICY,
            "setting_kind": SERVICE_SETTING_KIND_COMMERCIAL,
            "enabled": True,
            "configured": True,
            "status": STATUS_READY,
            "config": {
                "cooldown_days": DEFAULT_SITE_RELINK_COOLDOWN_DAYS,
            },
            "secrets": {},
            "last_tested_at": "",
            "last_error_code": "",
            "last_error_message": "",
            "credential_value_exposure": "none",
        }
    return serialize(row)


def serialize_accounting_fx(
    row: ServiceSetting | None,
) -> dict[str, Any]:
    rate = resolve_accounting_fx_rate(row.config_json if row is not None and row.enabled else None)
    return {
        "setting_id": SERVICE_SETTING_ACCOUNTING_FX,
        "setting_kind": SERVICE_SETTING_KIND_COMMERCIAL,
        "enabled": True,
        "configured": not rate.is_fallback,
        "status": STATUS_READY if not rate.is_fallback else STATUS_MISSING_CONFIG,
        "config": rate.as_dict(),
        "secrets": {},
        "last_tested_at": "",
        "last_error_code": "",
        "last_error_message": "",
        "credential_value_exposure": "none",
    }


def serialize_media_recognition_policy(
    row: ServiceSetting | None,
) -> dict[str, Any]:
    if row is not None:
        serialized = serialize(row)
        config = _dict(row.config_json)
        serialized["config"] = {
            "window_start": _normalize_clock(config.get("window_start"))
            or DEFAULT_MEDIA_RECOGNITION_WINDOW_START,
            "window_end": _normalize_clock(config.get("window_end"))
            or DEFAULT_MEDIA_RECOGNITION_WINDOW_END,
            "daily_limit": _positive_int(
                config.get("daily_limit"),
                default=DEFAULT_MEDIA_RECOGNITION_DAILY_LIMIT,
            ),
        }
        return serialized
    return {
        "setting_id": SERVICE_SETTING_MEDIA_RECOGNITION_POLICY,
        "setting_kind": SERVICE_SETTING_KIND_RUNTIME,
        "enabled": False,
        "configured": False,
        "status": STATUS_DISABLED,
        "config": {
            "window_start": DEFAULT_MEDIA_RECOGNITION_WINDOW_START,
            "window_end": DEFAULT_MEDIA_RECOGNITION_WINDOW_END,
            "daily_limit": DEFAULT_MEDIA_RECOGNITION_DAILY_LIMIT,
        },
        "secrets": {},
        "last_tested_at": "",
        "last_error_code": "",
        "last_error_message": "",
        "credential_value_exposure": "none",
    }


def serialize_platform_preferences(
    row: ServiceSetting | None,
) -> dict[str, Any]:
    timezone_name = (
        _string(_dict(row.config_json).get("timezone")) if row is not None else ""
    ) or DEFAULT_PLATFORM_TIMEZONE
    return {
        "setting_id": SERVICE_SETTING_PLATFORM_PREFERENCES,
        "setting_kind": SERVICE_SETTING_KIND_RUNTIME,
        "enabled": True,
        "configured": row is not None and row.status == STATUS_READY,
        "status": STATUS_READY if row is not None else STATUS_MISSING_CONFIG,
        "config": {"timezone": timezone_name},
        "secrets": {},
        "last_tested_at": "",
        "last_error_code": "",
        "last_error_message": "",
        "credential_value_exposure": "none",
    }


def _public_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in config.items()
        if "password" not in key and "secret" not in key and "token" not in key
    }


def _boundary() -> dict[str, Any]:
    return {
        "surface": "cloud_service_settings",
        "cloud_owns": [
            "portal_login_provider_config",
            "portal_email_delivery_config",
            "payment_gateway_config",
            "site_account_relink_policy",
            "platform_runtime_preferences",
            "media_recognition_runtime_policy",
        ],
        "wordpress_control_plane": False,
        "ability_registry_truth": "wordpress_local",
        "workflow_registry_truth": "wordpress_local",
        "credential_value_exposure": "none",
        "env_fallback": "disabled",
    }
