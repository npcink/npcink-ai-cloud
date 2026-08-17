"""Commercial identity constants and helpers."""

from __future__ import annotations

import re
from urllib.parse import urlsplit
from uuid import uuid4

from app.core.models import (
    PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
    Site,
)
from app.domain.commercial.errors import CommercialPermissionError

USER_ROLE_OWNER = "owner"
USER_ALLOWED_ROLES = {USER_ROLE_OWNER}
PLATFORM_ADMIN_ALLOWED_ROLES = {
    PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
}
PLATFORM_ADMIN_ACCOUNT_WRITE_ROLES = {
    PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
}
PLATFORM_ADMIN_CATALOG_WRITE_ROLES = {
    PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
}
IDENTITY_TYPE_PLATFORM_ADMIN = "platform_admin"
IDENTITY_TYPE_USER = "user"
USER_ALLOWED_ACTION_VIEW_SITES = "view_sites"
USER_ALLOWED_ACTION_VIEW_USAGE = "view_usage"
USER_ALLOWED_ACTION_VIEW_BILLING = "view_billing"
USER_ALLOWED_ACTION_MANAGE_BILLING = "manage_billing"
USER_ALLOWED_ACTION_VIEW_AUDIT = "view_audit"
USER_ALLOWED_ACTION_RUN_AI_INSIGHTS = "run_ai_insights"
USER_ALLOWED_ACTION_PROVISION_SITES = "provision_sites"
USER_ALLOWED_ACTION_REMOVE_SITES = "remove_sites"


def _normalize_platform_admin_role(role: str) -> str:
    return str(role or "").strip()


def _canonicalize_platform_admin_role_for_write(role: str) -> str:
    normalized_role = str(role or "").strip()
    if normalized_role in PLATFORM_ADMIN_ALLOWED_ROLES:
        return PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN
    raise CommercialPermissionError(
        "service.platform_admin_role_invalid",
        f"unsupported platform admin role '{normalized_role}'",
    )


def resolve_principal_allowed_actions() -> list[str]:
    return [
        USER_ALLOWED_ACTION_VIEW_SITES,
        USER_ALLOWED_ACTION_VIEW_USAGE,
        USER_ALLOWED_ACTION_VIEW_BILLING,
        USER_ALLOWED_ACTION_MANAGE_BILLING,
        USER_ALLOWED_ACTION_VIEW_AUDIT,
        USER_ALLOWED_ACTION_RUN_AI_INSIGHTS,
        USER_ALLOWED_ACTION_PROVISION_SITES,
        USER_ALLOWED_ACTION_REMOVE_SITES,
    ]


def normalize_user_role(role: str) -> str:
    normalized_role = str(role or USER_ROLE_OWNER).strip().lower()
    if normalized_role not in USER_ALLOWED_ROLES:
        raise CommercialPermissionError(
            "service.portal_user_role_invalid",
            f"unsupported user role '{normalized_role}'",
        )
    return normalized_role


def _new_principal_id() -> str:
    return f"prn_{uuid4().hex}"


_EMAIL_LOCAL_PART_PATTERN = re.compile(r"^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$", re.IGNORECASE)
_EMAIL_DOMAIN_LABEL_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def _normalize_principal_email(email: str) -> str:
    normalized_email = str(email or "").strip().lower()
    local_part, separator, domain = normalized_email.partition("@")
    domain_labels = domain.split(".")
    if (
        not normalized_email
        or len(normalized_email) > 191
        or len(local_part) > 64
        or len(domain) > 253
        or not separator
        or not local_part
        or not domain
        or "@" in domain
        or not normalized_email.isascii()
        or any(character.isspace() for character in normalized_email)
        or local_part.startswith(".")
        or local_part.endswith(".")
        or ".." in local_part
        or _EMAIL_LOCAL_PART_PATTERN.fullmatch(local_part) is None
        or len(domain_labels) < 2
        or any(_EMAIL_DOMAIN_LABEL_PATTERN.fullmatch(label) is None for label in domain_labels)
    ):
        raise CommercialPermissionError(
            "service.principal_email_invalid",
            "a valid user email is required",
        )
    return normalized_email


def _platform_capability_flags(role: str) -> dict[str, bool]:
    normalized_role = _normalize_platform_admin_role(role)
    return {
        "can_manage_accounts": normalized_role in PLATFORM_ADMIN_ACCOUNT_WRITE_ROLES,
        "can_manage_catalog": normalized_role in PLATFORM_ADMIN_CATALOG_WRITE_ROLES,
        "can_impersonate": False,
        "can_manage_billing": normalized_role in PLATFORM_ADMIN_ALLOWED_ROLES,
        "can_review_diagnostics": normalized_role in PLATFORM_ADMIN_ALLOWED_ROLES,
    }


def _slugify_portal_site_segment(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return normalized


def _normalize_portal_site_url(value: str) -> tuple[str, str]:
    raw = str(value or "").strip()
    if not raw:
        raise CommercialPermissionError(
            "service.portal_site_url_required",
            "wordpress site url is required",
        )
    candidate = raw if "://" in raw else f"https://{raw}"
    parsed = urlsplit(candidate)
    hostname = str(parsed.hostname or "").strip().lower()
    if not hostname:
        raise CommercialPermissionError(
            "service.portal_site_url_invalid",
            "wordpress site url is invalid",
        )
    path = re.sub(r"/+", "/", str(parsed.path or "/").strip())
    path = "/" if not path or path == "." else path
    canonical = f"{parsed.scheme.lower() or 'https'}://{hostname}"
    if path not in {"", "/"}:
        canonical = f"{canonical}{path.rstrip('/')}"
    return canonical, hostname + (
        f"{path.rstrip('/').replace('/', '-')}" if path not in {"", "/"} else ""
    )


def _extract_site_url(site: Site) -> str:
    return str(site.site_url or "").strip()


def assert_platform_admin_role_allowed(
    *,
    role: str,
    allowed_roles: set[str],
    error_code: str,
    message: str,
) -> str:
    normalized_role = _normalize_platform_admin_role(role)
    if normalized_role not in PLATFORM_ADMIN_ALLOWED_ROLES:
        raise CommercialPermissionError(
            "service.platform_admin_role_invalid",
            f"unsupported platform admin role '{normalized_role}'",
        )
    if normalized_role not in allowed_roles:
        raise CommercialPermissionError(error_code, message)
    return normalized_role


def assert_platform_admin_capability(
    *,
    role: str,
    capability: str,
    error_code: str,
    message: str,
) -> str:
    normalized_role = _normalize_platform_admin_role(role)
    if normalized_role not in PLATFORM_ADMIN_ALLOWED_ROLES:
        raise CommercialPermissionError(
            "service.platform_admin_role_invalid",
            f"unsupported platform admin role '{normalized_role}'",
        )
    capabilities = _platform_capability_flags(normalized_role)
    if not bool(capabilities.get(capability)):
        raise CommercialPermissionError(error_code, message)
    return normalized_role
