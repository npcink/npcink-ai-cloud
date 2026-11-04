"""Portal session storage; the caller owns locks and commit/rollback."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import PortalSession, Principal
from app.domain.portal_sessions.contracts import PortalSessionAuthMethod


class PortalSessionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def lock_principal(self, *, principal_id: str) -> Principal | None:
        return self.session.scalar(
            select(Principal)
            .where(Principal.principal_id == principal_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def create(
        self,
        *,
        session_id: str,
        principal_id: str,
        session_version: int,
        created_at: datetime,
        expires_at: datetime,
        auth_method: PortalSessionAuthMethod,
        client_hint: str | None = None,
    ) -> PortalSession:
        row = PortalSession(
            session_id=session_id,
            principal_id=principal_id,
            session_version=session_version,
            created_at=created_at,
            absolute_expires_at=expires_at,
            auth_method=auth_method,
            client_hint=client_hint,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def get_owned(self, *, principal_id: str, session_id: str) -> PortalSession | None:
        return self.session.scalar(
            select(PortalSession).where(
                PortalSession.session_id == session_id,
                PortalSession.principal_id == principal_id,
            )
        )

    def list_active(
        self,
        *,
        principal_id: str,
        now: datetime,
        limit: int = 20,
        offset: int = 0,
    ) -> list[PortalSession]:
        if not 1 <= limit <= 50 or offset < 0:
            raise ValueError("invalid session pagination")
        return list(
            self.session.scalars(
                select(PortalSession)
                .join(Principal, Principal.principal_id == PortalSession.principal_id)
                .where(
                    PortalSession.principal_id == principal_id,
                    Principal.status == "active",
                    PortalSession.session_version == Principal.session_version,
                    PortalSession.revoked_at.is_(None),
                    PortalSession.absolute_expires_at > now,
                )
                .order_by(PortalSession.created_at.desc(), PortalSession.session_id.desc())
                .limit(limit)
                .offset(offset)
            )
        )

    def lock_owned_rows(
        self, *, principal_id: str, session_ids: list[str] | None = None
    ) -> list[PortalSession]:
        """Caller holds account/principal/membership locks; stable SID order last."""
        statement = select(PortalSession).where(PortalSession.principal_id == principal_id)
        if session_ids is not None:
            statement = statement.where(PortalSession.session_id.in_(session_ids))
        return list(
            self.session.scalars(
                statement.order_by(PortalSession.session_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )

    def count_active(self, *, principal_id: str, now: datetime) -> int:
        return (
            self.session.scalar(
                select(func.count())
                .select_from(PortalSession)
                .join(Principal, Principal.principal_id == PortalSession.principal_id)
                .where(
                    PortalSession.principal_id == principal_id,
                    Principal.status == "active",
                    PortalSession.session_version == Principal.session_version,
                    PortalSession.revoked_at.is_(None),
                    PortalSession.absolute_expires_at > now,
                )
            )
            or 0
        )
