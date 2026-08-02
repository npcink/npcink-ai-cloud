from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import PlatformAdminGrant


class CommercialPlatformAdminQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_platform_admin_grant(
        self,
        *,
        principal_id: str,
    ) -> PlatformAdminGrant | None:
        return self.session.scalar(
            select(PlatformAdminGrant).where(
                PlatformAdminGrant.principal_id == principal_id,
            )
        )

    def get_platform_admin_grant_by_subject(
        self,
        *,
        provider: str,
        external_subject: str,
    ) -> PlatformAdminGrant | None:
        return self.session.scalar(
            select(PlatformAdminGrant).where(
                PlatformAdminGrant.provider == provider,
                PlatformAdminGrant.external_subject == external_subject,
            )
        )

    def get_platform_admin_grant_by_email(
        self,
        *,
        provider: str,
        email: str,
    ) -> PlatformAdminGrant | None:
        return self.session.scalar(
            select(PlatformAdminGrant).where(
                PlatformAdminGrant.provider == provider,
                func.lower(PlatformAdminGrant.email) == email.lower(),
            )
        )

    def list_platform_admin_grants(
        self,
        *,
        status: str | None = None,
        role: str | None = None,
        provider: str | None = None,
        limit: int | None = None,
    ) -> list[PlatformAdminGrant]:
        statement = select(PlatformAdminGrant)
        if status:
            statement = statement.where(PlatformAdminGrant.status == status)
        if role:
            statement = statement.where(PlatformAdminGrant.role == role)
        if provider:
            statement = statement.where(PlatformAdminGrant.provider == provider)
        statement = statement.order_by(
            PlatformAdminGrant.created_at.desc(),
            PlatformAdminGrant.principal_id.asc(),
        )
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))
