"""Account creation admission; existing login and entitlement rules are separate."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.models import ServiceSetting
from app.domain.commercial.errors import CommercialPermissionError
from app.domain.commercial.identity import _normalize_principal_email

SERVICE_SETTING_PORTAL_REGISTRATION = "portal_registration"
MAX_REGISTRATION_ALLOWLIST_EMAILS = 200


def normalize_registration_policy(payload: dict[str, Any]) -> dict[str, Any]:
    public_enabled = payload.get("public_registration_enabled")
    emails = payload.get("email_allowlist")
    if not isinstance(public_enabled, bool) or not isinstance(emails, list):
        raise ValueError("a registration switch and email list are required")
    if len(emails) > MAX_REGISTRATION_ALLOWLIST_EMAILS:
        raise ValueError("the email allowlist supports at most 200 entries")
    normalized: list[str] = []
    for email in emails:
        if not isinstance(email, str) or "*" in email:
            raise ValueError("each allowlist entry must be an email address")
        try:
            address = _normalize_principal_email(email)
        except CommercialPermissionError as error:
            raise ValueError("each allowlist entry must be a valid email address") from error
        if address not in normalized:
            normalized.append(address)
    return {"public_registration_enabled": public_enabled, "email_allowlist": normalized}


def registration_policy(row: ServiceSetting | None) -> dict[str, Any]:
    # Absence preserves existing installations. A malformed saved policy never
    # silently reopens registration or authorizes an unverified provider email.
    if row is None:
        return {"public_registration_enabled": True, "email_allowlist": []}
    try:
        if not row.enabled:
            raise ValueError("registration policy disabled")
        return normalize_registration_policy(row.config_json)
    except (ValueError, TypeError, AttributeError):
        return {"public_registration_enabled": False, "email_allowlist": []}


def require_registration_allowed(session: Session, *, email: str = "") -> None:
    policy = registration_policy(session.get(ServiceSetting, SERVICE_SETTING_PORTAL_REGISTRATION))
    if policy["public_registration_enabled"]:
        return
    if email and _normalize_principal_email(email) in policy["email_allowlist"]:
        # Only the email-code path supplies an address. It must still verify
        # mailbox possession before creating the account.
        return
    raise CommercialPermissionError(
        "service.portal_registration_closed",
        "Registration is currently limited to internal testing. "
        "Use an approved email address to register; existing users can still sign in.",
    )
