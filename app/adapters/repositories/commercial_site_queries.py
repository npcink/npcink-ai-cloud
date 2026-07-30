from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import Site


class CommercialSiteQueries:
    """Read-only site queries shared by commercial repository consumers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_site(self, site_id: str) -> Site | None:
        return self.session.get(Site, site_id)

    def list_sites(
        self,
        *,
        status: str | None = None,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        site_ids: list[str] | None = None,
        limit: int | None = None,
    ) -> list[Site]:
        statement = select(Site)
        if status:
            statement = statement.where(Site.status == status)
        if account_id:
            statement = statement.where(Site.account_id == account_id)
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(Site.account_id.in_(account_ids))
        if site_ids is not None:
            if not site_ids:
                return []
            statement = statement.where(Site.site_id.in_(site_ids))
        statement = statement.order_by(Site.created_at.desc(), Site.site_id.asc())
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_sites(self, *, status: str | None = None) -> int:
        statement = select(func.count(Site.site_id))
        if status:
            statement = statement.where(Site.status == status)
        return int(self.session.scalar(statement) or 0)

    def count_sites_by_account(
        self,
        *,
        account_ids: list[str] | None = None,
        status: str | None = None,
        statuses: list[str] | None = None,
    ) -> dict[str, int]:
        statement = select(Site.account_id, func.count(Site.site_id)).group_by(Site.account_id)
        if account_ids is not None:
            if not account_ids:
                return {}
            statement = statement.where(Site.account_id.in_(account_ids))
        if status:
            statement = statement.where(Site.status == status)
        if statuses is not None:
            normalized_statuses = [str(item).strip() for item in statuses if str(item).strip()]
            if not normalized_statuses:
                return {}
            statement = statement.where(Site.status.in_(normalized_statuses))
        return {
            str(account_id or ""): int(count or 0)
            for account_id, count in self.session.execute(statement)
            if account_id
        }
