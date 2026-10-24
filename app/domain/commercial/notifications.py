"""Bounded customer notifications for existing commercial lifecycle events."""

from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_access_repository import CommercialAccessRepository
from app.adapters.repositories.commercial_identity_repository import CommercialIdentityRepository
from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PRINCIPAL_STATUS_ACTIVE,
)
from app.domain.commercial.errors import CommercialPermissionError
from app.domain.commercial.identity import USER_ROLE_OWNER, _normalize_principal_email


def build_commercial_notification_id(prefix: str, *parts: object) -> str:
    """Build a bounded, deterministic id for one commercial event scope."""

    digest = hashlib.sha256(
        "\x1f".join(str(part) for part in parts).encode("utf-8")
    ).hexdigest()[:32]
    return f"{prefix}_{digest}"


def notify_unique_account_owner(
    *,
    session: Session,
    account_id: str,
    notification_id: str,
    event_type: str,
    title: str,
    body: str,
    link_href: str,
) -> bool:
    """Write one inbox notification when the account owner is unambiguous.

    The existing product model permits one active owner membership per principal,
    but an account can still have multiple active owners while it is being repaired.
    Avoid addressing any recipient in that state. Email is checked as a reliable
    identity attribute even though this path intentionally sends only to the Portal
    inbox and does not introduce SMTP delivery.
    """

    access_repository = CommercialAccessRepository(session)
    owner_memberships = [
        membership
        for membership in access_repository.list_account_user_memberships(
            account_ids=[account_id],
            statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
        )
        if str(membership.role or "").strip().lower() == USER_ROLE_OWNER
    ]
    if len(owner_memberships) != 1:
        return False

    principal_id = str(owner_memberships[0].principal_id or "").strip()
    if not principal_id:
        return False
    principal = CommercialIdentityRepository(session).get_principal_identity_by_ref(
        principal_id=principal_id
    )
    if principal is None or principal.status != PRINCIPAL_STATUS_ACTIVE:
        return False
    try:
        _normalize_principal_email(str(principal.email or ""))
    except CommercialPermissionError:
        return False

    try:
        CommercialNotificationRepository(session).create_notification(
            notification_id=notification_id,
            account_id=account_id,
            principal_id=principal_id,
            event_type=event_type,
            title=title,
            body=body,
            link_href=link_href,
        )
    except ValueError:
        # A deterministic event id may already belong to a former owner after
        # an account repair. Keep the lifecycle operation idempotent and do not
        # redirect that historical notification to a new recipient.
        return False
    return True
