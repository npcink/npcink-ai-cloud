"""Internal signing inputs and safe public projections are distinct contracts.

These types do not issue tokens. Client hints are optional, unverified labels.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

PortalSessionAuthMethod = Literal["email_code", "registration", "qq"]


@dataclass(frozen=True)
class PortalSessionSigningMaterial:
    principal_id: str
    session_id: str
    session_version: int
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class PortalSessionProjection:
    session_id: str
    is_current: bool
    created_at: datetime
    expires_at: datetime
    auth_method: PortalSessionAuthMethod
    client_hint: str | None


@dataclass(frozen=True)
class PortalSessionPage:
    items: list[PortalSessionProjection]
    total: int
    limit: int
    offset: int


@dataclass(frozen=True)
class PortalSessionRevocation:
    revoked_count: int
    is_current: bool
