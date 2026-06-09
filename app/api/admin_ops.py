from __future__ import annotations

import hmac
from collections.abc import Mapping
from dataclasses import dataclass

from fastapi import Request

from app.api.auth import PortalBearerTokenError, get_cloud_services
from app.api.portal_session import (
    get_commercial_service,
)
from app.core.models import PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN


@dataclass(frozen=True)
class ResolvedAdminSession:
    platform_admin_ref: str
    role: str
    auth_mode: str
    revocable: bool

    @classmethod
    def from_identity(
        cls,
        identity: Mapping[str, object],
        *,
        auth_mode: str,
        fallback_admin_ref: str = "",
        fallback_role: str = PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
    ) -> ResolvedAdminSession:
        identity_metadata = identity.get("metadata")
        revocable = (
            not bool(identity_metadata.get("bootstrap"))
            if isinstance(identity_metadata, dict)
            else True
        )
        return cls(
            platform_admin_ref=str(identity.get("admin_ref") or fallback_admin_ref),
            role=str(identity.get("role") or fallback_role),
            auth_mode=auth_mode,
            revocable=revocable,
        )

    def as_payload(self) -> dict[str, object]:
        return {
            "platform_admin_ref": self.platform_admin_ref,
            "role": self.role,
            "auth_mode": self.auth_mode,
            "transport": "cookie",
            "revocable": self.revocable,
            "issued_at": "",
            "expires_at": "",
        }


def resolve_admin_login_identity(
    request: Request,
    *,
    token: str,
    admin_ref: str,
) -> dict[str, object]:
    settings = get_cloud_services(request).settings
    expected_token = str(settings.admin_bootstrap_token or "").strip()
    environment = str(settings.environment or "").strip().lower()
    if not expected_token and environment in {"development", "test"}:
        expected_token = str(settings.internal_auth_token or "").strip()
    if not expected_token:
        raise PortalBearerTokenError(
            503,
            "auth.admin_bootstrap_not_configured",
            "admin bootstrap auth is not configured",
        )
    if not hmac.compare_digest(token, expected_token):
        raise PortalBearerTokenError(
            401,
            "auth.admin_bootstrap_token_invalid",
            "invalid admin bootstrap token",
        )
    bootstrap_admin_ref = str(
        settings.admin_bootstrap_admin_ref or "platform:internal_root"
    ).strip()
    requested_admin_ref = str(admin_ref or "").strip()
    platform_admin_ref = requested_admin_ref or bootstrap_admin_ref or "platform:internal_root"
    return get_commercial_service(request).resolve_platform_admin_identity(
        admin_ref=platform_admin_ref,
        bootstrap_role=PLATFORM_ADMIN_ROLE_PLATFORM_ADMIN,
        allow_bootstrap=(platform_admin_ref == bootstrap_admin_ref),
    )
