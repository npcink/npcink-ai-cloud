"""Pure Portal JWT encoder. No database, HTTP or Admin-session dependencies."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings


def build_portal_session_token(
    settings: Settings,
    *,
    principal_id: str,
    session_id: str,
    session_version: int = 1,
    site_id: str = "",
    expires_at: datetime | None = None,
    issued_at: datetime | None = None,
) -> str:
    for name, value in (("principal_id", principal_id), ("session_id", session_id)):
        if not isinstance(value, str) or not value or value != value.strip():
            raise ValueError(f"{name} must be a non-empty canonical string")
    if len(session_id) > 64:
        raise ValueError("session_id is too long")
    if (
        isinstance(session_version, bool)
        or not isinstance(session_version, int)
        or session_version < 1
    ):
        raise ValueError("session_version must be a positive integer")
    if site_id != "" and (
        not isinstance(site_id, str) or re.fullmatch(r"[A-Za-z0-9_.:-]{1,191}", site_id) is None
    ):
        raise ValueError("site_id must be a canonical portal site id")
    now = issued_at or datetime.now(UTC)
    expiry = expires_at or now + timedelta(seconds=max(60, settings.portal_session_ttl_seconds))
    if (
        now.tzinfo is None
        or expiry.tzinfo is None
        or int(expiry.timestamp()) <= int(now.timestamp())
    ):
        raise ValueError("expires_at must be later than the token issue time and timezone-aware")
    if not settings.portal_jwt_secret:
        raise RuntimeError("Portal auth is not configured.")
    payload = dict(
        iss=(settings.portal_jwt_issuer or "").strip() or "npcink-ai-cloud",
        aud=(settings.portal_jwt_audience or "").strip() or "npcink-ai-cloud-portal",
        sub=principal_id,
        sid=session_id,
        purpose="portal_session",
        session_version=session_version,
        iat=int(now.timestamp()),
        exp=int(expiry.timestamp()),
    )
    if site_id:
        payload["site_id"] = site_id
    return jwt.encode(payload, settings.portal_jwt_secret, algorithm="HS256")
