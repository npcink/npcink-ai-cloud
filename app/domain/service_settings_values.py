"""Shared service-setting identifiers, defaults and pure value normalization."""

from __future__ import annotations

from typing import Any

SERVICE_SETTING_PORTAL_PUBLIC = "portal_public"
SERVICE_SETTING_QQ_LOGIN = "portal_qq_login"
SERVICE_SETTING_PORTAL_EMAIL = "portal_email"
SERVICE_SETTING_PAYMENT_ALIPAY = "payment_alipay"
SERVICE_SETTING_SITE_RELINK_POLICY = "site_relink_policy"
SERVICE_SETTING_PLATFORM_PREFERENCES = "platform_preferences"
SERVICE_SETTING_MEDIA_RECOGNITION_POLICY = "media_recognition_policy"
SERVICE_SETTING_KIND_PORTAL = "portal"
SERVICE_SETTING_KIND_COMMERCIAL = "commercial"
SERVICE_SETTING_KIND_RUNTIME = "runtime"
SERVICE_SETTING_QQ_OPEN_CALLBACK_PATH = "/open/auth/qq/callback"
SERVICE_SETTING_ALIPAY_NOTIFY_PATH = "/open/payments/alipay/notify"
SERVICE_SETTING_ALIPAY_RETURN_PATH = "/open/payments/alipay/return"
ALIPAY_PAGE_PAY_GATEWAY_URL = "https://openapi.alipay.com/gateway.do"
DEFAULT_SITE_RELINK_COOLDOWN_DAYS = 90
MIN_SITE_RELINK_COOLDOWN_DAYS = 90
MAX_SITE_RELINK_COOLDOWN_DAYS = 365
DEFAULT_PLATFORM_TIMEZONE = "Asia/Shanghai"
DEFAULT_MEDIA_RECOGNITION_WINDOW_START = "01:00"
DEFAULT_MEDIA_RECOGNITION_WINDOW_END = "06:00"
DEFAULT_MEDIA_RECOGNITION_DAILY_LIMIT = 100
STATUS_READY = "ready"
STATUS_DISABLED = "disabled"
STATUS_MISSING_CONFIG = "missing_config"
STATUS_ERROR = "error"


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_clock(value: object) -> str:
    text = _string(value)
    parts = text.split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return ""
    hour, minute = (int(part) for part in parts)
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        return ""
    return f"{hour:02d}:{minute:02d}"


def _string(value: object) -> str:
    return str(value or "").strip()


def _positive_int(value: object, *, default: int) -> int:
    try:
        parsed = int(_string(value))
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default
