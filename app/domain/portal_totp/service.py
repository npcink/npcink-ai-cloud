"""Portal second-factor transactions. No email-only recovery or secret receipts.

Order: account/principal/membership -> factor -> SID -> recovery -> challenge.
Primary issuers acquire factor before their primary proof. Principal locks also
serialize absent-factor creation, aggregate attempts and lifecycle invalidation.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.adapters.repositories.portal_totp_repository import PortalTotpRepository
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalAuthChallenge,
    PortalRecoveryCode,
    PortalTotpFactor,
    Principal,
)
from app.core.secrets import decrypt_portal_totp_seed, encrypt_portal_totp_seed
from app.core.security import build_secret_hash, verify_secret_hash
from app.domain.commercial.errors import CommercialServiceError
from app.domain.portal_sessions.contracts import PortalSessionAuthMethod
from app.domain.portal_totp.codec import matched_counter, provisioning
from app.domain.portal_totp.contracts import RestrictedChallenge

CHALLENGE_SECONDS = 300
ATTEMPT_LIMIT = 5
WINDOW_SECONDS = 900
PRINCIPAL_ATTEMPT_LIMIT = 15


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def invalid() -> CommercialServiceError:
    return CommercialServiceError(401, "auth.portal_factor_invalid", "Authentication proof invalid")


def lock_primary_factor(session: Session, principal_id: str) -> PortalTotpFactor | None:
    return PortalTotpRepository(session).lock_factor(principal_id=principal_id)


def _budget(session: Session, principal_id: str, now: datetime) -> None:
    count = (
        session.scalar(
            select(func.sum(PortalAuthChallenge.attempt_count)).where(
                PortalAuthChallenge.principal_id == principal_id,
                PortalAuthChallenge.created_at >= now - timedelta(seconds=WINDOW_SECONDS),
            )
        )
        or 0
    )
    if count >= PRINCIPAL_ATTEMPT_LIMIT:
        raise CommercialServiceError(429, "auth.portal_factor_rate_limited", "Try again later")


def create_challenge(
    session: Session,
    principal: Principal,
    factor: PortalTotpFactor | None,
    *,
    purpose: str,
    primary_method: str,
    primary_at: datetime,
    ttl_seconds: int,
    now: datetime,
    bound_sid: str | None = None,
    bound_expiry: datetime | None = None,
) -> RestrictedChallenge:
    _budget(session, principal.principal_id, now)
    challenge_id = (
        factor.pending_setup_id if purpose == "setup" and factor else None
    ) or secrets.token_urlsafe(24)
    # Entire credential is hashed; TTL cannot be changed by the client. It is
    # selected by the original issuer, not a completion request or JWT claim.
    ttl = max(60, min(int(ttl_seconds), 90 * 86400))
    credential = f"{challenge_id}.{secrets.token_urlsafe(32)}.{ttl}"
    expires = min(
        now + timedelta(seconds=CHALLENGE_SECONDS),
        utc(primary_at) + timedelta(seconds=CHALLENGE_SECONDS),
    )
    if expires <= now:
        raise invalid()
    session.add(
        PortalAuthChallenge(
            challenge_id=challenge_id,
            principal_id=principal.principal_id,
            credential_hash=build_secret_hash(credential),
            purpose=purpose,
            primary_method=primary_method,
            primary_authenticated_at=primary_at,
            bound_session_version=principal.session_version,
            bound_factor_version=factor.factor_version if factor else 0,
            bound_recovery_generation=factor.recovery_generation if factor else 0,
            bound_session_id=bound_sid,
            bound_session_expires_at=bound_expiry,
            created_at=now,
            expires_at=expires,
            attempt_count=0,
            attempt_limit=ATTEMPT_LIMIT,
        )
    )
    session.flush()
    return RestrictedChallenge(credential, expires)


def _parts(credential: str) -> tuple[str, int]:
    if len(credential) > 256:
        raise invalid()
    parts = credential.split(".")
    if len(parts) != 3 or not parts[0] or not parts[1] or not parts[2].isascii():
        raise invalid()
    try:
        ttl = int(parts[2])
    except ValueError as error:
        raise invalid() from error
    if not 60 <= ttl <= 90 * 86400:
        raise invalid()
    return parts[0], ttl


def _recovery_parts(code: str) -> tuple[str, str]:
    parts = code.split(".")
    return (parts[0], parts[1]) if len(parts) == 2 and len(code) <= 160 else ("", "")


def _recovery_batch(session: Session, factor: PortalTotpFactor, now: datetime) -> list[str]:
    codes = []
    for _ in range(8):
        code_id, secret = secrets.token_urlsafe(16), secrets.token_urlsafe(24)
        session.add(
            PortalRecoveryCode(
                code_id=code_id,
                principal_id=factor.principal_id,
                factor_version=factor.factor_version,
                generation=factor.recovery_generation,
                code_hash=build_secret_hash(secret),
                created_at=now,
            )
        )
        codes.append(f"{code_id}.{secret}")
    return codes


def start_management(settings: Settings, identity: object, purpose: str) -> dict[str, object]:
    from app.domain.portal_sessions.service import (
        AuthenticatedSession,
        lock_login_scope,
        validate_registered_session,
    )

    if not isinstance(identity, AuthenticatedSession) or purpose not in (
        "setup",
        "disable",
        "recovery_reset",
    ):
        raise invalid()
    now = datetime.now(UTC).replace(microsecond=0)
    with get_session(settings.database_url) as session:
        principal = lock_login_scope(session, identity.principal_id)
        factor = lock_primary_factor(session, identity.principal_id)
        if factor is None and purpose == "setup":
            factor = PortalTotpRepository(session).create_disabled_factor(
                principal_id=identity.principal_id,
                factor_version=1,
                now=now,
            )
        row = validate_registered_session(session, identity, for_update=True)
        now = datetime.now(UTC).replace(microsecond=0)
        primary_at = row.primary_authenticated_at
        if (
            principal is None
            or primary_at is None
            or not (now - timedelta(seconds=CHALLENGE_SECONDS) <= utc(primary_at) <= now)
        ):
            raise CommercialServiceError(
                401, "auth.portal_primary_reauthentication_required", "Please log in again"
            )
        _budget(session, principal.principal_id, now)
        data: dict[str, object] = {}
        if purpose == "setup":
            if factor is not None and factor.state == "enabled":
                raise invalid()
            assert factor is not None
            seed = secrets.token_bytes(20)
            factor.pending_setup_id = secrets.token_urlsafe(24)
            factor.pending_seed_ciphertext = encrypt_portal_totp_seed(seed, settings=settings)
            factor.pending_created_at = now
            factor.pending_expires_at = now + timedelta(seconds=CHALLENGE_SECONDS)
            factor.updated_at = now
            key, uri = provisioning(seed, principal.email or principal.principal_id)
            data.update(setup_id=factor.pending_setup_id, secret=key, otpauth_uri=uri)
        elif factor is None or factor.state != "enabled":
            raise invalid()
        challenge = create_challenge(
            session,
            principal,
            factor,
            purpose=purpose,
            primary_method=row.auth_method,
            primary_at=utc(primary_at),
            ttl_seconds=int((identity.expires_at - now).total_seconds()),
            now=now,
            bound_sid=identity.session_id,
            bound_expiry=identity.expires_at,
        )
        session.commit()
        data.update(challenge.projection())
        data["_challenge"] = challenge
        return data


def complete(
    settings: Settings,
    credential: str,
    code: str,
    *,
    purpose: str,
    method: str = "totp",
    identity: object = None,
    setup_id: str = "",
) -> dict[str, object]:
    from app.domain.portal_sessions.service import (
        AuthenticatedSession,
        issue_verified_session,
        lock_login_scope,
        validate_registered_session,
    )

    challenge_id, ttl = _parts(credential)
    now = datetime.now(UTC).replace(microsecond=0)
    with get_session(settings.database_url) as session:
        discovered = session.get(PortalAuthChallenge, challenge_id)
        if discovered is None:
            raise invalid()
        principal = lock_login_scope(session, discovered.principal_id)
        if principal is None or principal.status != "active":
            raise invalid()
        if not session.scalar(
            select(AccountUserMembership.membership_id)
            .join(
                Account,
                Account.account_id == AccountUserMembership.account_id,
            )
            .where(
                AccountUserMembership.principal_id == principal.principal_id,
                AccountUserMembership.status == "active",
                Account.status == "active",
            )
            .limit(1)
        ):
            raise invalid()
        factor = lock_primary_factor(session, principal.principal_id)
        if factor is None:
            raise invalid()
        if purpose != "login":
            if (
                not isinstance(identity, AuthenticatedSession)
                or identity.principal_id != principal.principal_id
            ):
                raise invalid()
            validate_registered_session(session, identity, for_update=True)
        repository = PortalTotpRepository(session)
        recovery = None
        if method == "recovery_code":
            recovery_id, recovery_secret = _recovery_parts(code)
            recovery = repository.lock_recovery_owned(
                principal_id=principal.principal_id,
                code_id=recovery_id,
            )
        challenge = repository.lock_challenge_owned(
            principal_id=principal.principal_id,
            challenge_id=challenge_id,
        )
        now = datetime.now(UTC).replace(microsecond=0)
        if (
            challenge is None
            or challenge.purpose != purpose
            or challenge.consumed_at is not None
            or utc(challenge.expires_at) <= now
            or challenge.attempt_count >= challenge.attempt_limit
            or challenge.bound_session_version != principal.session_version
            or challenge.bound_factor_version != factor.factor_version
            or challenge.bound_recovery_generation != factor.recovery_generation
            or not now - timedelta(seconds=CHALLENGE_SECONDS)
            <= utc(challenge.primary_authenticated_at)
            <= now
            or not verify_secret_hash(credential, challenge.credential_hash)
        ):
            raise invalid()
        if purpose != "login" and (
            not isinstance(identity, AuthenticatedSession)
            or challenge.bound_session_id != identity.session_id
            or challenge.bound_session_expires_at is None
            or utc(challenge.bound_session_expires_at) <= now
            or utc(challenge.bound_session_expires_at) != utc(identity.expires_at)
        ):
            raise invalid()
        if purpose == "setup":
            if (
                factor.state != "disabled"
                or method != "totp"
                or not setup_id
                or setup_id != factor.pending_setup_id
                or challenge.challenge_id != setup_id
                or factor.pending_expires_at is None
                or utc(factor.pending_expires_at) <= now
            ):
                raise invalid()
            ciphertext = factor.pending_seed_ciphertext
        elif purpose in ("login", "disable", "recovery_reset") and factor.state == "enabled":
            ciphertext = factor.active_seed_ciphertext
        else:
            raise invalid()
        _budget(session, principal.principal_id, now)
        counter = None
        valid = False
        if method == "totp":
            seed = decrypt_portal_totp_seed(ciphertext, settings=settings)
            counter = matched_counter(seed, code, now.timestamp())
            valid = counter is not None and (
                factor.last_accepted_counter is None or counter > factor.last_accepted_counter
            )
        elif method == "recovery_code" and purpose != "setup":
            valid = (
                recovery is not None
                and recovery.consumed_at is None
                and recovery.factor_version == factor.factor_version
                and recovery.generation == factor.recovery_generation
                and verify_secret_hash(recovery_secret, recovery.code_hash)
            )
        if not valid:
            challenge.attempt_count += 1
            # Only failure accounting changed. Identity/scope/proof validation
            # above cannot accidentally commit pending business mutations.
            session.commit()
            raise invalid()
        if counter is not None:
            factor.last_accepted_counter = counter
        if recovery is not None:
            recovery.consumed_at = now
        challenge.consumed_at = now
        codes: list[str] = []
        if purpose == "setup":
            factor.active_seed_ciphertext = factor.pending_seed_ciphertext
            factor.enabled_at = now
            factor.state = "enabled"
            factor.factor_version += 1
            factor.recovery_generation += 1
            codes = _recovery_batch(session, factor, now)
        elif purpose == "disable":
            factor.state = "disabled"
            factor.active_seed_ciphertext = None
            factor.enabled_at = None
            factor.last_accepted_counter = None
            factor.factor_version += 1
        elif purpose == "recovery_reset":
            factor.recovery_generation += 1
            codes = _recovery_batch(session, factor, now)
        if purpose != "login":
            principal.session_version += 1
            factor.pending_setup_id = factor.pending_seed_ciphertext = None
            factor.pending_created_at = factor.pending_expires_at = None
        factor.updated_at = now
        issued = issue_verified_session(
            session,
            settings,
            principal,
            ttl_seconds=ttl,
            auth_method=cast(PortalSessionAuthMethod, challenge.primary_method),
            expires_at=challenge.bound_session_expires_at if purpose != "login" else None,
            primary_at=utc(challenge.primary_authenticated_at),
            factor=factor if factor.state == "enabled" else None,
            second_at=now,
            second_method=method,
        )
        session.commit()
        return {"_portal_session": issued, "recovery_codes": codes, "status": "authenticated"}
