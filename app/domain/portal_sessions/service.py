"""Portal login UoW primitives and transaction-owning session management commands."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.repositories.portal_session_repository import PortalSessionRepository
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalOAuthState,
    PortalSession,
    PortalTotpFactor,
    Principal,
)
from app.core.portal_session_tokens import build_portal_session_token
from app.core.security import derive_stable_secret_digest
from app.domain.commercial.errors import (
    CommercialConflictError,
    CommercialNotFoundError,
    CommercialPermissionError,
)
from app.domain.portal_sessions.contracts import (
    PortalSessionAuthMethod,
    PortalSessionPage,
    PortalSessionProjection,
    PortalSessionRevocation,
)
from app.domain.portal_totp.contracts import RestrictedChallenge


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
    now = datetime.now(UTC)
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
    factor = session.get(PortalTotpFactor, identity.principal_id)
    if factor is None and row.factor_version is not None:
        raise CommercialPermissionError("auth.portal_session_revoked", "factor state unavailable")
    if (
        factor is not None
        and factor.state == "enabled"
        and (
            row.factor_version != factor.factor_version
            or row.primary_authenticated_at is None
            or row.second_factor_verified_at is None
            or row.second_factor_method not in ("totp", "recovery_code")
        )
    ):
        raise CommercialPermissionError("auth.portal_session_revoked", "second factor required")
    return row


@dataclass(frozen=True)
class PortalSessionIssuer:
    settings: Settings
    ttl_seconds: int
    auth_method: PortalSessionAuthMethod
    oauth_proof: OAuthLoginProof | None = None
    site_id: str = ""

    def issue(
        self, session: Session, principal: Principal
    ) -> IssuedPortalSession | RestrictedChallenge:
        if principal.status != "active":
            raise CommercialPermissionError(
                "auth.portal_session_revoked", "principal is not active"
            )
        now = datetime.now(UTC).replace(microsecond=0)
        # Existing-primary callers already hold principal and factor before
        # their email/OAuth proof. Read only here: never acquire a late factor lock.
        factor = session.get(PortalTotpFactor, principal.principal_id)
        if factor is None and session.scalar(
            select(PortalSession.session_id)
            .where(
                PortalSession.principal_id == principal.principal_id,
                PortalSession.factor_version.is_not(None),
            )
            .limit(1)
        ):
            # A previously configured principal retains a factor tombstone even
            # after disable. Missing storage must not become an email-only login.
            from app.domain.commercial.errors import CommercialServiceError

            raise CommercialServiceError(
                503, "auth.portal_factor_unavailable", "Factor state unavailable"
            )
        if self.oauth_proof is not None:
            self.oauth_proof.consume(session)
        if factor is not None and factor.state == "enabled":
            from app.domain.portal_totp.service import create_challenge

            return create_challenge(
                session,
                principal,
                factor,
                purpose="login",
                primary_method=self.auth_method,
                primary_at=now,
                ttl_seconds=self.ttl_seconds,
                now=now,
            )
        return issue_verified_session(
            session,
            self.settings,
            principal,
            ttl_seconds=self.ttl_seconds,
            auth_method=self.auth_method,
            primary_at=now,
        )


def issue_verified_session(
    session: Session,
    settings: Settings,
    principal: Principal,
    *,
    ttl_seconds: int,
    auth_method: PortalSessionAuthMethod,
    primary_at: datetime,
    expires_at: datetime | None = None,
    factor: PortalTotpFactor | None = None,
    second_at: datetime | None = None,
    second_method: str | None = None,
) -> IssuedPortalSession:
    """Internal completion UoW only; public issuers cannot pass an mfa_ok flag."""
    now = datetime.now(UTC).replace(microsecond=0)
    expiry = (
        utc(expires_at) if expires_at is not None else now + timedelta(seconds=max(60, ttl_seconds))
    )
    sid = secrets.token_urlsafe(32)
    row = PortalSessionRepository(session).create(
        session_id=sid,
        principal_id=principal.principal_id,
        session_version=principal.session_version,
        created_at=now,
        expires_at=expiry,
        auth_method=auth_method,
    )
    row.primary_authenticated_at = primary_at
    if factor is not None:
        if (
            factor.state != "enabled"
            or second_at is None
            or second_method not in ("totp", "recovery_code")
        ):
            raise CommercialPermissionError("auth.portal_session_revoked", "invalid factor proof")
        row.factor_version = factor.factor_version
        row.second_factor_verified_at = second_at
        row.second_factor_method = second_method
    session.flush()
    return sign_session(settings, principal, sid, expiry, now=now)


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


def list_principal_sessions(
    database_url: str, identity: AuthenticatedSession, *, limit: int = 20, offset: int = 0
) -> PortalSessionPage:
    """A current-principal read, independent of account role and selected site."""
    with get_session(database_url) as session:
        # One principal-serialized snapshot for caller validity, count and page.
        lock_login_scope(session, identity.principal_id)
        validate_registered_session(session, identity, for_update=True)
        repository = PortalSessionRepository(session)
        now = datetime.now(UTC)
        rows = repository.list_active(
            principal_id=identity.principal_id, now=now, limit=limit, offset=offset
        )
        return PortalSessionPage(
            items=[
                PortalSessionProjection(
                    session_id=row.session_id,
                    is_current=row.session_id == identity.session_id,
                    created_at=utc(row.created_at),
                    expires_at=utc(row.absolute_expires_at),
                    auth_method=cast(PortalSessionAuthMethod, row.auth_method),
                    client_hint=row.client_hint,
                )
                for row in rows
            ],
            total=repository.count_active(principal_id=identity.principal_id, now=now),
            limit=limit,
            offset=offset,
        )


def revalidate_session_caller(database_url: str, identity: AuthenticatedSession) -> None:
    """Receipt replay is authorized again under the same lock as new commands."""
    with get_session(database_url) as session:
        lock_login_scope(session, identity.principal_id)
        validate_registered_session(session, identity, for_update=True)


def revoke_principal_sessions(
    database_url: str, identity: AuthenticatedSession, *, target_session_id: str | None = None
) -> PortalSessionRevocation:
    """None means other sessions; a target means owned, idempotent single revoke."""
    with get_session(database_url) as session:
        lock_login_scope(session, identity.principal_id)
        repository = PortalSessionRepository(session)
        rows = repository.lock_owned_rows(
            principal_id=identity.principal_id,
            session_ids=None
            if target_session_id is None
            else sorted({identity.session_id, target_session_id}),
        )
        validate_registered_session(session, identity, for_update=True)
        if target_session_id is not None and not any(
            row.session_id == target_session_id for row in rows
        ):
            raise CommercialNotFoundError("portal.session_not_found", "session not found")
        now = datetime.now(UTC)
        count = 0
        for row in rows:
            target = (
                row.session_id == target_session_id
                if target_session_id is not None
                else (
                    row.session_id != identity.session_id
                    and row.session_version == identity.session_version
                    and utc(row.absolute_expires_at) > now
                )
            )
            if target and row.revoked_at is None:
                row.revoked_at, row.revoke_reason = (
                    now,
                    "self_revoke" if target_session_id else "revoke_others",
                )
                count += 1
        session.commit()
        return PortalSessionRevocation(count, target_session_id == identity.session_id)
