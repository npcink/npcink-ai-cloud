"""Bounded current-principal copy. Only data_export challenge rows are writable."""

from __future__ import annotations

import json
import re
import secrets
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from email.errors import HeaderParseError
from email.headerregistry import Address
from typing import Any
from uuid import uuid4

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, load_only
from sqlalchemy.pool import NullPool

from app.adapters.repositories.portal_data_export_queries import (
    DataCopyLimitExceeded,
    build_data_copy,
)
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    PortalLoginCode,
    Principal,
    SiteAccountBinding,
)
from app.core.security import build_secret_hash, verify_secret_hash

PURPOSE = "data_export"
SCHEMA = "cloud-principal-copy.v1"
SCOPE = "own-profile-membership-public-support-notifications.v1"
TTL = 300
MAX_BYTES = 2 * 1024 * 1024
BUDGET_SECONDS = 5


class DataExportError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


@contextmanager
def export_session(database_url: str) -> Iterator[Session]:
    if make_url(database_url).get_backend_name() != "postgresql":
        with get_session(database_url) as session:
            yield session
        return
    # Rare download operations use one short-lived connection: no shared pool
    # checkout/pre-ping can spend the entire operation budget before SQL timeouts.
    engine = create_engine(
        database_url, poolclass=NullPool, hide_parameters=True, connect_args={"connect_timeout": 1}
    )
    try:
        with Session(engine, autoflush=False, expire_on_commit=False) as session:
            yield session
    finally:
        engine.dispose()


def valid_export_email(email: str) -> bool:
    if len(email) > 191 or re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) is None:
        return False
    if any(ord(char) < 33 or ord(char) == 127 for char in email):
        return False
    try:
        return Address(addr_spec=email).addr_spec == email
    except (ValueError, HeaderParseError):
        return False


class ExportBudget:
    def __init__(self) -> None:
        self.deadline = time.monotonic() + BUDGET_SECONDS

    def check(self, session: Session | None = None) -> None:
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise DataExportError(504, "portal.data_export_timeout")
        if session is not None and session.get_bind().dialect.name == "postgresql":
            millis = str(max(1, int(remaining * 1000)))
            session.execute(
                text(
                    "SELECT set_config('statement_timeout', :ms, true), "
                    "set_config('lock_timeout', :ms, true)"
                ),
                {"ms": millis},
            )


def _scope(
    session: Session, principal_id: str, version: int, site_id: str, budget: ExportBudget
) -> tuple[Principal, AccountUserMembership, Account]:
    budget.check(session)
    ids = list(
        session.scalars(
            select(AccountUserMembership.account_id)
            .where(
                AccountUserMembership.principal_id == principal_id,
                AccountUserMembership.status == "active",
            )
            .limit(2)
        )
    )
    if len(ids) != 1:
        raise DataExportError(403, "portal.data_export_scope_unavailable")
    budget.check(session)
    account = session.scalar(
        select(Account)
        .options(load_only(Account.account_id, Account.status, Account.updated_at))
        .where(Account.account_id == ids[0])
        .with_for_update()
    )
    budget.check(session)
    principal = session.scalar(
        select(Principal)
        .options(
            load_only(
                Principal.principal_id,
                Principal.email,
                Principal.status,
                Principal.session_version,
                Principal.created_at,
                Principal.updated_at,
                Principal.last_login_at,
            )
        )
        .where(Principal.principal_id == principal_id)
        .with_for_update()
    )
    if principal is None or principal.status != "active" or principal.session_version != version:
        raise DataExportError(401, "portal.data_export_session_invalid")
    budget.check(session)
    memberships = list(
        session.scalars(
            select(AccountUserMembership)
            .options(
                load_only(
                    AccountUserMembership.membership_id,
                    AccountUserMembership.account_id,
                    AccountUserMembership.role,
                    AccountUserMembership.status,
                    AccountUserMembership.created_at,
                    AccountUserMembership.updated_at,
                )
            )
            .where(
                AccountUserMembership.principal_id == principal_id,
                AccountUserMembership.status == "active",
            )
            .with_for_update()
        )
    )
    if (
        account is None
        or account.status != "active"
        or len(memberships) != 1
        or memberships[0].account_id != account.account_id
    ):
        raise DataExportError(403, "portal.data_export_scope_unavailable")
    budget.check(session)
    if (
        site_id
        and session.scalar(
            select(SiteAccountBinding.binding_id).where(
                SiteAccountBinding.site_id == site_id,
                SiteAccountBinding.account_id == account.account_id,
                SiteAccountBinding.released_at.is_(None),
            )
        )
        is None
    ):
        raise DataExportError(403, "portal.data_export_scope_unavailable")
    return principal, memberships[0], account


def _binding(
    principal: Principal, member: AccountUserMembership, account: Account
) -> dict[str, Any]:
    return {
        "principal_id": principal.principal_id,
        "email": (principal.email or "").strip().lower(),
        "account_id": member.account_id,
        "account_updated_at": utc(account.updated_at).isoformat(),
        "principal_updated_at": utc(principal.updated_at).isoformat(),
        "membership_id": member.membership_id,
        "membership_updated_at": utc(member.updated_at).isoformat(),
        "role": member.role,
        "session_version": principal.session_version,
        "schema": SCHEMA,
        "scope": SCOPE,
    }


def _throttle(session: Session, principal: Principal, now: datetime) -> PortalLoginCode:
    latest = session.scalar(
        select(PortalLoginCode)
        .where(
            PortalLoginCode.principal_id == principal.principal_id,
            PortalLoginCode.purpose == PURPOSE,
        )
        .order_by(PortalLoginCode.created_at.desc(), PortalLoginCode.code_id.desc())
        .limit(1)
        .with_for_update()
    )
    if latest is None:
        latest = PortalLoginCode(
            code_id=uuid4().hex,
            principal_id=principal.principal_id,
            email=(principal.email or "").lower(),
            purpose=PURPOSE,
            code_hash="",
            status="expired",
            expires_at=now,
            attempt_count=0,
            created_at=now - timedelta(microseconds=1),
            metadata_json={},
        )
        session.add(latest)
    metadata = dict(latest.metadata_json or {})
    start = metadata.get("rate_start", 0)
    count = metadata.get("rate_count", 0) if now.timestamp() - float(start) < 60 else 0
    if count >= 10:
        raise DataExportError(429, "portal.data_export_rate_limited")
    metadata.update(rate_start=start if count else now.timestamp(), rate_count=count + 1)
    latest.metadata_json = metadata
    return latest


def execute_data_export(
    *,
    database_url: str,
    principal_id: str,
    session_version: int,
    session_id: str,
    session_expires_at: datetime,
    site_id: str,
    operation: str,
    payload: object,
    sender_available: bool = False,
) -> dict[str, Any] | bytes:
    budget = ExportBudget()
    try:
        with export_session(database_url) as session:
            # A repeatable snapshot covers every whitelist projection. Concurrent scope
            # mutations cause serialization rejection rather than stale authorization.
            if session.get_bind().dialect.name == "postgresql":
                session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
            principal, member, account = _scope(
                session, principal_id, session_version, site_id, budget
            )
            from app.domain.commercial.errors import CommercialPermissionError
            from app.domain.portal_sessions.service import (
                AuthenticatedSession,
                validate_registered_session,
            )

            try:
                validate_registered_session(
                    session,
                    AuthenticatedSession(
                        principal_id,
                        session_id,
                        session_version,
                        session_expires_at,
                    ),
                    for_update=True,
                )
            except CommercialPermissionError as error:
                raise DataExportError(401, "portal.data_export_session_invalid") from error
            now = datetime.now(UTC)
            budget.check(session)
            latest = _throttle(session, principal, now)

            # Persist rate accounting, including malformed requests, without receipts.
            def reject(status: int, code: str) -> None:
                budget.check(session)
                session.commit()
                raise DataExportError(status, code)

            if operation == "code":
                if (
                    not isinstance(payload, dict)
                    or set(payload) - {"locale"}
                    or ("locale" in payload and payload["locale"] not in ("en", "zh-CN", "zh-TW"))
                ):
                    reject(400, "portal.data_export_invalid_request")
                email = (principal.email or "").strip().lower()
                if not sender_available or not valid_export_email(email):
                    reject(503, "portal.data_export_unavailable")
                last_issue = float((latest.metadata_json or {}).get("last_issue", 0))
                if now.timestamp() - last_issue < 60:
                    reject(429, "portal.data_export_rate_limited")
                # Expire the previous pending row before inserting its replacement.
                budget.check(session)
                for old in session.scalars(
                    select(PortalLoginCode)
                    .where(
                        PortalLoginCode.email == email,
                        PortalLoginCode.purpose == PURPOSE,
                        PortalLoginCode.status == "pending",
                    )
                    .with_for_update()
                ):
                    old.status = "expired"
                budget.check(session)
                session.flush()
                issued_code = f"{secrets.randbelow(1_000_000):06d}"
                challenge_id = uuid4().hex
                metadata = dict(latest.metadata_json or {})
                metadata.update(
                    binding={**_binding(principal, member, account), "session_id": session_id},
                    last_issue=now.timestamp(),
                )
                challenge = PortalLoginCode(
                    code_id=challenge_id,
                    email=email,
                    principal_id=principal_id,
                    code_hash=build_secret_hash(issued_code),
                    purpose=PURPOSE,
                    status="pending",
                    expires_at=now + timedelta(seconds=TTL),
                    attempt_count=0,
                    metadata_json=metadata,
                    created_at=now,
                )
                session.add(challenge)
                budget.check(session)
                session.commit()
                return {
                    "challenge_id": challenge_id,
                    "code": issued_code,
                    "email": email,
                    "expires_in_seconds": TTL,
                }

            email = (principal.email or "").strip().lower()
            if not sender_available or not valid_export_email(email):
                reject(503, "portal.data_export_unavailable")
            # Invalid/unknown challenge ids still debit the current purpose's attempt budget.
            latest.attempt_count += 1
            valid_payload = isinstance(payload, dict) and set(payload) == {"challenge_id", "code"}
            if not valid_payload:
                if latest.attempt_count >= 5:
                    latest.status = "expired"
                reject(400, "portal.data_export_invalid_code")
            assert isinstance(payload, dict)
            submitted_challenge_id, code = payload.get("challenge_id"), payload.get("code")
            if (
                latest.status != "pending"
                or latest.attempt_count > 5
                or utc(latest.expires_at) <= now
                or (latest.metadata_json or {}).get("binding")
                != {**_binding(principal, member, account), "session_id": session_id}
            ):
                latest.status = "expired"
                reject(400, "portal.data_export_invalid_code")
            if (
                submitted_challenge_id != latest.code_id
                or not isinstance(code, str)
                or re.fullmatch(r"[0-9]{6}", code) is None
                or not verify_secret_hash(code, latest.code_hash)
            ):
                if latest.attempt_count >= 5:
                    latest.status = "expired"
                reject(400, "portal.data_export_invalid_code")
            budget.check(session)
            try:
                data = build_data_copy(session, principal, member, budget, MAX_BYTES)
            except DataCopyLimitExceeded:
                raise DataExportError(413, "portal.data_export_too_large") from None
            result = json.dumps(
                {"schema": SCHEMA, "exported_at": now.isoformat(), "data": data},
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            budget.check(session)
            if len(result) > MAX_BYTES:
                raise DataExportError(413, "portal.data_export_too_large")
            latest.status = "consumed"
            latest.consumed_at = now
            session.commit()
            return result
    except DBAPIError as error:
        # No SQL/parameters or input is exposed. Serialization races are retryable
        # with a fresh request; the transaction, including OTP consumption, rolls back.
        if time.monotonic() >= budget.deadline or getattr(error.orig, "sqlstate", "") in {
            "57014",
            "55P03",
        }:
            raise DataExportError(504, "portal.data_export_timeout") from None
        raise DataExportError(409, "portal.data_export_retry") from None
