from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from app.adapters.repositories.commercial_account_queries import CommercialAccountQueries
from app.adapters.repositories.commercial_site_queries import CommercialSiteQueries
from app.core.models import (
    PLATFORM_KIND_WORDPRESS,
    PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
    Account,
    PrincipalSiteBinding,
    Site,
    SiteAccountBinding,
)


class CommercialAccountSiteRepository(
    CommercialAccountQueries,
    CommercialSiteQueries,
):
    def get_account_for_update(self, account_id: str) -> Account | None:
        return self.session.scalar(
            select(Account).where(Account.account_id == account_id).with_for_update()
        )

    def upsert_account(
        self,
        *,
        account_id: str,
        name: str,
        status: str,
        metadata_json: dict[str, object] | None,
    ) -> Account:
        account = self.get_account(account_id)
        if account is None:
            account = Account(
                account_id=account_id,
                name=name or account_id,
                status=status,
                metadata_json=metadata_json,
            )
            self.session.add(account)
        else:
            account.name = name or account.name or account_id
            account.status = status
            account.metadata_json = metadata_json
        self.session.flush()
        return account

    def get_site_for_update(self, site_id: str) -> Site | None:
        return self.session.scalar(select(Site).where(Site.site_id == site_id).with_for_update())

    def get_current_principal_site_binding(
        self,
        site_id: str,
        *,
        for_update: bool = False,
    ) -> PrincipalSiteBinding | None:
        statement = (
            select(PrincipalSiteBinding)
            .where(
                PrincipalSiteBinding.site_id == site_id,
                PrincipalSiteBinding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
                PrincipalSiteBinding.released_at.is_(None),
            )
            .order_by(
                PrincipalSiteBinding.bound_at.desc(),
                PrincipalSiteBinding.binding_id.desc(),
            )
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalar(statement)

    def create_principal_site_binding(
        self,
        *,
        binding_id: str,
        principal_id: str,
        site_id: str,
        account_id: str,
        status: str,
        bound_at: datetime,
        released_at: datetime | None = None,
        release_reason: str | None = None,
        metadata_json: dict[str, object] | None = None,
    ) -> PrincipalSiteBinding:
        binding = PrincipalSiteBinding(
            binding_id=binding_id,
            principal_id=principal_id,
            site_id=site_id,
            account_id=account_id,
            status=status,
            bound_at=bound_at,
            released_at=released_at,
            release_reason=release_reason,
            metadata_json=metadata_json,
        )
        self.session.add(binding)
        self.session.flush()
        return binding

    def get_current_site_account_binding(
        self,
        site_id: str,
        *,
        for_update: bool = False,
    ) -> SiteAccountBinding | None:
        statement = (
            select(SiteAccountBinding)
            .where(
                SiteAccountBinding.site_id == site_id,
                SiteAccountBinding.released_at.is_(None),
            )
            .order_by(
                SiteAccountBinding.bound_at.desc(),
                SiteAccountBinding.binding_id.desc(),
            )
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalar(statement)

    def create_site_account_binding(
        self,
        *,
        binding_id: str,
        site_id: str,
        account_id: str,
        status: str,
        bound_at: datetime,
        released_at: datetime | None = None,
        cooldown_until: datetime | None = None,
        release_reason: str | None = None,
        metadata_json: dict[str, object] | None = None,
    ) -> SiteAccountBinding:
        binding = SiteAccountBinding(
            binding_id=binding_id,
            site_id=site_id,
            account_id=account_id,
            status=status,
            bound_at=bound_at,
            released_at=released_at,
            cooldown_until=cooldown_until,
            release_reason=release_reason,
            metadata_json=metadata_json,
        )
        self.session.add(binding)
        self.session.flush()
        return binding

    def upsert_site(
        self,
        *,
        site_id: str,
        account_id: str | None,
        name: str,
        status: str,
        site_url: str | None = None,
        platform_kind: str = PLATFORM_KIND_WORDPRESS,
        metadata_json: dict[str, object] | None,
        provisioned_at: datetime | None,
    ) -> Site:
        normalized_platform_kind = str(platform_kind or "").strip().lower()
        if normalized_platform_kind != PLATFORM_KIND_WORDPRESS:
            raise ValueError("unsupported platform_kind")
        normalized_metadata = dict(metadata_json) if metadata_json is not None else None
        if normalized_metadata is not None:
            normalized_metadata.pop("site_url", None)
            normalized_metadata.pop("url", None)
        site = self.get_site(site_id)
        if site is None:
            site = Site(
                site_id=site_id,
                account_id=account_id,
                name=name or site_id,
                status=status,
                site_url=str(site_url or "").strip() if site_url is not None else "",
                platform_kind=normalized_platform_kind,
                metadata_json=normalized_metadata,
                provisioned_at=provisioned_at,
            )
            self.session.add(site)
        else:
            site.account_id = account_id
            site.name = name or site.name or site_id
            site.status = status
            if site_url is not None:
                site.site_url = str(site_url or "").strip()
            site.platform_kind = normalized_platform_kind
            site.metadata_json = normalized_metadata
            if provisioned_at is not None and site.provisioned_at is None:
                site.provisioned_at = provisioned_at
        self.session.flush()
        return site
