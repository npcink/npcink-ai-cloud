from __future__ import annotations

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
    PRINCIPAL_STATUS_ACTIVE,
    SITE_STATUS_ACTIVE,
    Account,
    AccountUserMembership,
    Principal,
    PrincipalSiteBinding,
    Site,
    SiteAccountBinding,
)


class CommercialMembershipQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_account_user_memberships(
        self,
        *,
        principal_ids: list[str] | None = None,
        account_ids: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> list[AccountUserMembership]:
        statement = select(AccountUserMembership)
        if principal_ids is not None:
            if not principal_ids:
                return []
            statement = statement.where(AccountUserMembership.principal_id.in_(principal_ids))
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(AccountUserMembership.account_id.in_(account_ids))
        if statuses is not None:
            if not statuses:
                return []
            statement = statement.where(AccountUserMembership.status.in_(statuses))
        statement = statement.order_by(
            AccountUserMembership.created_at.desc(),
            AccountUserMembership.membership_id.desc(),
        )
        return list(self.session.scalars(statement))

    def count_active_account_principals(self, *, account_id: str) -> int:
        statement = (
            select(func.count(func.distinct(AccountUserMembership.principal_id)))
            .join(
                Principal,
                Principal.principal_id == AccountUserMembership.principal_id,
            )
            .where(
                AccountUserMembership.account_id == account_id,
                AccountUserMembership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                Principal.status == PRINCIPAL_STATUS_ACTIVE,
            )
        )
        return int(self.session.scalar(statement) or 0)

    def count_active_account_sites(self, *, account_id: str) -> int:
        statement = select(func.count(Site.site_id)).where(
            Site.account_id == account_id,
            Site.status == SITE_STATUS_ACTIVE,
        )
        return int(self.session.scalar(statement) or 0)

    def count_active_principal_bound_sites(
        self,
        *,
        account_id: str,
        principal_id: str,
    ) -> int:
        statement = (
            select(func.count(func.distinct(Site.site_id)))
            .join(
                PrincipalSiteBinding,
                and_(
                    PrincipalSiteBinding.site_id == Site.site_id,
                    PrincipalSiteBinding.account_id == Site.account_id,
                    PrincipalSiteBinding.principal_id == principal_id,
                    PrincipalSiteBinding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
                    PrincipalSiteBinding.released_at.is_(None),
                ),
            )
            .where(
                Site.account_id == account_id,
                Site.status == SITE_STATUS_ACTIVE,
            )
        )
        return int(self.session.scalar(statement) or 0)

    def get_account_user_membership(
        self,
        *,
        principal_id: str,
        account_id: str,
    ) -> tuple[Account, Principal, AccountUserMembership] | None:
        row = self.session.execute(
            select(Account, Principal, AccountUserMembership)
            .join(
                AccountUserMembership,
                AccountUserMembership.account_id == Account.account_id,
            )
            .join(Principal, Principal.principal_id == AccountUserMembership.principal_id)
            .where(
                AccountUserMembership.principal_id == principal_id,
                AccountUserMembership.account_id == account_id,
            )
        ).first()
        if row is None:
            return None
        return row[0], row[1], row[2]

    def list_accounts_for_principal(
        self,
        *,
        principal_id: str,
        membership_statuses: list[str] | None = None,
    ) -> list[tuple[Account, Principal, AccountUserMembership]]:
        statuses = membership_statuses or [ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE]
        statement = (
            select(Account, Principal, AccountUserMembership)
            .join(
                AccountUserMembership,
                AccountUserMembership.account_id == Account.account_id,
            )
            .join(Principal, Principal.principal_id == AccountUserMembership.principal_id)
            .where(
                Principal.principal_id == principal_id,
                Principal.status == PRINCIPAL_STATUS_ACTIVE,
                AccountUserMembership.status.in_(statuses),
                Account.status == "active",
            )
            .order_by(Account.created_at.desc(), Account.account_id.asc())
        )
        return [
            (account, identity, membership)
            for account, identity, membership in self.session.execute(statement).all()
        ]

    def list_sites_for_principal(
        self,
        *,
        principal_id: str,
        membership_statuses: list[str] | None = None,
    ) -> list[tuple[Site, Principal, AccountUserMembership]]:
        statuses = membership_statuses or [ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE]
        statement = (
            select(Site, Principal, AccountUserMembership)
            .join(
                PrincipalSiteBinding,
                and_(
                    PrincipalSiteBinding.site_id == Site.site_id,
                    PrincipalSiteBinding.principal_id == principal_id,
                    PrincipalSiteBinding.account_id == Site.account_id,
                    PrincipalSiteBinding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
                    PrincipalSiteBinding.released_at.is_(None),
                ),
            )
            .join(
                AccountUserMembership,
                and_(
                    AccountUserMembership.account_id == Site.account_id,
                    AccountUserMembership.principal_id == principal_id,
                ),
            )
            .join(Principal, Principal.principal_id == AccountUserMembership.principal_id)
            .join(Account, Account.account_id == Site.account_id)
            .where(
                Principal.principal_id == principal_id,
                Principal.status == PRINCIPAL_STATUS_ACTIVE,
                AccountUserMembership.status.in_(statuses),
                Account.status == "active",
            )
            .order_by(Site.created_at.desc(), Site.site_id.asc())
        )
        return [
            (site, identity, membership)
            for site, identity, membership in self.session.execute(statement).all()
        ]

    def get_portal_site_access(
        self,
        *,
        principal_id: str,
        site_id: str,
    ) -> (
        tuple[
            Site,
            Account,
            Principal | None,
            AccountUserMembership | None,
            PrincipalSiteBinding | None,
        ]
        | None
    ):
        row = self.session.execute(
            select(
                Site,
                Account,
                Principal,
                AccountUserMembership,
                PrincipalSiteBinding,
            )
            .join(Account, Account.account_id == Site.account_id)
            .outerjoin(
                AccountUserMembership,
                and_(
                    AccountUserMembership.account_id == Site.account_id,
                    AccountUserMembership.principal_id == principal_id,
                ),
            )
            .outerjoin(
                Principal,
                Principal.principal_id == AccountUserMembership.principal_id,
            )
            .outerjoin(
                PrincipalSiteBinding,
                and_(
                    PrincipalSiteBinding.site_id == Site.site_id,
                    PrincipalSiteBinding.principal_id == principal_id,
                    PrincipalSiteBinding.account_id == Site.account_id,
                    PrincipalSiteBinding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
                    PrincipalSiteBinding.released_at.is_(None),
                ),
            )
            .where(Site.site_id == site_id)
        ).first()
        if row is None:
            return None
        return row[0], row[1], row[2], row[3], row[4]

    def get_latest_released_site_account_binding(
        self,
        site_id: str,
    ) -> SiteAccountBinding | None:
        statement = (
            select(SiteAccountBinding)
            .where(
                SiteAccountBinding.site_id == site_id,
                SiteAccountBinding.released_at.is_not(None),
            )
            .order_by(
                SiteAccountBinding.released_at.desc(),
                SiteAccountBinding.binding_id.desc(),
            )
            .limit(1)
        )
        return self.session.scalar(statement)
