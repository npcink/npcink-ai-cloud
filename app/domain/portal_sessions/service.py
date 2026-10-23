"""Transaction-owned Portal login lifecycle; no API imports or internal commits."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.repositories.portal_session_repository import PortalSessionRepository
from app.core.config import Settings
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalOAuthState,
    PortalSession,
    Principal,
)
from app.core.portal_session_tokens import build_portal_session_token
from app.core.security import derive_stable_secret_digest
from app.domain.commercial.errors import CommercialConflictError, CommercialPermissionError
from app.domain.portal_sessions.contracts import PortalSessionAuthMethod


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def lock_login_scopes(session: Session, principal_ids: list[str]) -> dict[str, Principal | None]:
    """All accounts first, all principals next, then memberships, each stable sorted."""
    ids = sorted(set(principal_ids))
    account_ids = list(
        session.scalars(
            select(AccountUserMembership.account_id).where(
                AccountUserMembership.principal_id.in_(ids)
            )
        )
    )
    for account_id in sorted(set(account_ids)):
        session.scalar(
            select(Account)
            .where(Account.account_id == account_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    principals = {
        pid: PortalSessionRepository(session).lock_principal(principal_id=pid) for pid in ids
    }
    # Discovery can become stale while waiting for the principal lock. Never
    # acquire a newly discovered account after locking a principal: retry the UoW.
    current_accounts = set(
        session.scalars(
            select(AccountUserMembership.account_id).where(
                AccountUserMembership.principal_id.in_(ids)
            )
        )
    )
    if current_accounts != set(account_ids):
        raise CommercialConflictError(
            "service.portal_login_scope_changed", "portal account scope changed; retry"
        )
    list(
        session.scalars(
            select(AccountUserMembership)
            .where(AccountUserMembership.principal_id.in_(ids))
            .order_by(AccountUserMembership.membership_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    return principals


def lock_login_scope(session: Session, principal_id: str) -> Principal | None:
    return lock_login_scopes(session, [principal_id])[principal_id]


@dataclass(frozen=True)
class OAuthLoginProof:
    state: str
    nonce: str

    def consume(self, session: Session) -> None:
        row = session.scalar(
            select(PortalOAuthState)
            .where(
                PortalOAuthState.provider == "qq",
                PortalOAuthState.state_hash
                == derive_stable_secret_digest(f"qq:{self.state.strip()}"),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        metadata = row.metadata_json or {} if row is not None else {}
        expected_nonce = str(metadata.get("nonce_hash") or "")
        if (
            row is None
            or row.status != "pending"
            or row.consumed_at is not None
            or utc(row.expires_at) <= datetime.now(UTC)
            or (
                expected_nonce
                and expected_nonce != derive_stable_secret_digest(f"qq:nonce:{self.nonce.strip()}")
            )
        ):
            raise CommercialPermissionError(
                "service.portal_oauth_state_invalid", "OAuth proof invalid"
            )
        row.status, row.consumed_at = "consumed", datetime.now(UTC)


@dataclass(frozen=True)
class AuthenticatedSession:
    principal_id: str
    session_id: str
    session_version: int
    expires_at: datetime


@dataclass(frozen=True)
class IssuedPortalSession:
    token: str
    principal_id: str
    session_id: str
    session_version: int
    issued_at: datetime
    expires_at: datetime

    def metadata(self) -> dict[str, object]:
        return dict(
            state="active",
            transport="cookie",
            revocable=True,
            issued_at=self.issued_at.isoformat().replace("+00:00", "Z"),
            expires_at=self.expires_at.isoformat().replace("+00:00", "Z"),
        )


def validate_registered_session(
    session: Session,
    identity: AuthenticatedSession,
    *,
    for_update: bool = False,
) -> PortalSession:
    now = datetime.now(UTC)
    statement = (
        select(PortalSession)
        .where(
            PortalSession.session_id == identity.session_id,
            PortalSession.principal_id == identity.principal_id,
        )
        .execution_options(populate_existing=True)
    )
    if for_update:
        statement = statement.with_for_update()
    row = session.scalar(statement)
    principal = session.get(Principal, identity.principal_id)
    if (
        principal is None
        or principal.status != "active"
        or principal.session_version != identity.session_version
        or row is None
        or row.session_version != identity.session_version
        or row.revoked_at is not None
        or utc(row.absolute_expires_at) <= now
        or utc(row.absolute_expires_at) != utc(identity.expires_at)
    ):
        raise CommercialPermissionError(
            "auth.portal_session_revoked", "portal session is no longer valid"
        )
    return row


@dataclass(frozen=True)
class PortalSessionIssuer:
    settings: Settings
    ttl_seconds: int
    auth_method: PortalSessionAuthMethod
    oauth_proof: OAuthLoginProof | None = None
    site_id: str = ""

    def issue(self, session: Session, principal: Principal) -> IssuedPortalSession:
        if principal.status != "active":
            raise CommercialPermissionError(
                "auth.portal_session_revoked", "principal is not active"
            )
        now = datetime.now(UTC).replace(microsecond=0)
        expiry = now + timedelta(seconds=max(60, self.ttl_seconds))
        sid = secrets.token_urlsafe(32)
        PortalSessionRepository(session).create(
            session_id=sid,
            principal_id=principal.principal_id,
            session_version=principal.session_version,
            created_at=now,
            expires_at=expiry,
            auth_method=self.auth_method,
        )
        if self.oauth_proof is not None:
            self.oauth_proof.consume(session)
        return sign_session(self.settings, principal, sid, expiry, now=now)


def sign_session(
    settings: Settings,
    principal: Principal,
    sid: str,
    expiry: datetime,
    *,
    site_id: str = "",
    now: datetime | None = None,
) -> IssuedPortalSession:
    now = now or datetime.now(UTC).replace(microsecond=0)
    token = build_portal_session_token(
        settings,
        principal_id=principal.principal_id,
        session_id=sid,
        session_version=principal.session_version,
        site_id=site_id,
        issued_at=now,
        expires_at=expiry,
    )
    return IssuedPortalSession(
        token, principal.principal_id, sid, principal.session_version, now, expiry
    )
