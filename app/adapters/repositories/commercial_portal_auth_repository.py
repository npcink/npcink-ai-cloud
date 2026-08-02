from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.db import build_postgres_advisory_lock_material
from app.core.models import (
    PORTAL_LOGIN_CODE_STATUS_EXPIRED,
    PORTAL_LOGIN_CODE_STATUS_PENDING,
    PORTAL_OAUTH_STATE_STATUS_PENDING,
    PortalLoginCode,
    PortalOAuthState,
    Principal,
)


class CommercialPortalAuthRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_portal_login_code(
        self,
        *,
        code_id: str,
        email: str,
        principal_id: str,
        code_hash: str,
        purpose: str = "portal_login",
        expires_at: datetime,
        metadata_json: dict[str, object] | None = None,
    ) -> PortalLoginCode:
        code = PortalLoginCode(
            code_id=code_id,
            email=email,
            principal_id=principal_id,
            code_hash=code_hash,
            purpose=purpose,
            status=PORTAL_LOGIN_CODE_STATUS_PENDING,
            expires_at=expires_at,
            consumed_at=None,
            attempt_count=0,
            metadata_json=metadata_json,
        )
        self.session.add(code)
        self.session.flush()
        return code

    def expire_pending_portal_login_codes(
        self,
        *,
        email: str,
        purpose: str,
        now: datetime,
    ) -> int:
        bind = self.session.get_bind()
        if bind.dialect.name == "postgresql":
            normalized_email = email.strip().lower()
            self.session.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_material, 0))"),
                {
                    "lock_material": build_postgres_advisory_lock_material(
                        normalized_email,
                        purpose,
                    )
                },
            )
        pending_codes = self.list_portal_login_codes(
            email=email,
            status=PORTAL_LOGIN_CODE_STATUS_PENDING,
            purpose=purpose,
            limit=None,
            for_update=True,
        )
        for pending_code in pending_codes:
            pending_code.status = PORTAL_LOGIN_CODE_STATUS_EXPIRED
            pending_code.consumed_at = now
        self.session.flush()
        return len(pending_codes)

    def list_portal_login_codes(
        self,
        *,
        email: str | None = None,
        principal_id: str | None = None,
        status: str | None = None,
        purpose: str | None = None,
        active_only: bool = False,
        now: datetime | None = None,
        limit: int | None = None,
        for_update: bool = False,
    ) -> list[PortalLoginCode]:
        statement = select(PortalLoginCode)
        if email:
            statement = statement.where(func.lower(PortalLoginCode.email) == email.lower())
        if principal_id:
            statement = statement.where(PortalLoginCode.principal_id == principal_id)
        if status:
            statement = statement.where(PortalLoginCode.status == status)
        if purpose:
            statement = statement.where(PortalLoginCode.purpose == purpose)
        if active_only:
            current = now or datetime.now(UTC)
            statement = statement.where(
                PortalLoginCode.status == PORTAL_LOGIN_CODE_STATUS_PENDING,
                PortalLoginCode.consumed_at.is_(None),
                PortalLoginCode.expires_at > current,
            )
        statement = statement.order_by(
            PortalLoginCode.created_at.desc(), PortalLoginCode.code_id.desc()
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        if for_update:
            statement = statement.with_for_update()
        return list(self.session.scalars(statement))

    def get_principal_identity_by_email(
        self,
        *,
        email: str,
        for_update: bool = False,
    ) -> Principal | None:
        if not str(email or "").strip():
            return None
        statement = select(Principal).where(func.lower(Principal.email) == email.lower())
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalar(statement)

    def purge_expired_portal_auth_evidence(
        self,
        *,
        before: datetime,
        limit: int = 500,
    ) -> dict[str, int]:
        bounded_limit = max(1, min(int(limit or 0), 1000))
        codes = list(
            self.session.scalars(
                select(PortalLoginCode)
                .where(PortalLoginCode.expires_at < before)
                .order_by(PortalLoginCode.expires_at.asc(), PortalLoginCode.code_id.asc())
                .limit(bounded_limit)
            )
        )
        states = list(
            self.session.scalars(
                select(PortalOAuthState)
                .where(PortalOAuthState.expires_at < before)
                .order_by(PortalOAuthState.expires_at.asc(), PortalOAuthState.state_id.asc())
                .limit(bounded_limit)
            )
        )
        for row in [*codes, *states]:
            self.session.delete(row)
        self.session.flush()
        return {"portal_login_codes": len(codes), "portal_oauth_states": len(states)}

    def get_portal_oauth_state(
        self,
        *,
        provider: str,
        state_hash: str,
        for_update: bool = False,
    ) -> PortalOAuthState | None:
        statement = select(PortalOAuthState).where(
            PortalOAuthState.provider == provider,
            PortalOAuthState.state_hash == state_hash,
        )
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalar(statement)

    def create_portal_oauth_state(
        self,
        *,
        state_id: str,
        provider: str,
        state_hash: str,
        return_to: str | None,
        client_scope_id: str | None,
        expires_at: datetime,
        metadata_json: dict[str, object] | None = None,
    ) -> PortalOAuthState:
        state = PortalOAuthState(
            state_id=state_id,
            provider=provider,
            state_hash=state_hash,
            status=PORTAL_OAUTH_STATE_STATUS_PENDING,
            return_to=return_to or None,
            client_scope_id=client_scope_id or None,
            expires_at=expires_at,
            consumed_at=None,
            metadata_json=metadata_json,
        )
        self.session.add(state)
        self.session.flush()
        return state
