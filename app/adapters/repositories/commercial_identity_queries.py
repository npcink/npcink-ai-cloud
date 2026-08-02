from __future__ import annotations

from typing import Any, TypedDict

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
    PRINCIPAL_STATUS_ACTIVE,
    PRINCIPAL_STATUS_DISABLED,
    Account,
    AccountSubscription,
    AccountUserMembership,
    IdentityProviderBinding,
    Principal,
    Site,
)


class PortalUserDirectorySummary(TypedDict):
    active: int
    disabled: int
    qq_bound: int
    self_registered: int


class PortalUserDirectoryPage(TypedDict):
    principal_ids: list[str]
    total: int
    summary: PortalUserDirectorySummary


class CommercialIdentityQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_principal_identity(self, principal_id: str) -> Principal | None:
        return self.session.get(Principal, principal_id)

    def get_principal_identity_by_ref(
        self,
        *,
        principal_id: str,
    ) -> Principal | None:
        return self.session.scalar(select(Principal).where(Principal.principal_id == principal_id))

    def get_identity_provider_binding(
        self,
        *,
        provider: str,
        external_subject_hash: str,
    ) -> IdentityProviderBinding | None:
        return self.session.scalar(
            select(IdentityProviderBinding).where(
                IdentityProviderBinding.provider == provider,
                IdentityProviderBinding.external_subject_hash == external_subject_hash,
            )
        )

    def get_identity_provider_binding_by_unionid(
        self,
        *,
        provider: str,
        unionid_hash: str,
    ) -> IdentityProviderBinding | None:
        if not unionid_hash:
            return None
        return self.session.scalar(
            select(IdentityProviderBinding)
            .where(
                IdentityProviderBinding.provider == provider,
                IdentityProviderBinding.unionid_hash == unionid_hash,
            )
            .order_by(IdentityProviderBinding.binding_id.asc())
        )

    def list_identity_provider_bindings_for_principal(
        self,
        *,
        principal_id: str,
        provider: str | None = None,
        status: str | None = None,
    ) -> list[IdentityProviderBinding]:
        statement = select(IdentityProviderBinding).where(
            IdentityProviderBinding.principal_id == principal_id,
        )
        if provider:
            statement = statement.where(IdentityProviderBinding.provider == provider)
        if status:
            statement = statement.where(IdentityProviderBinding.status == status)
        statement = statement.order_by(
            IdentityProviderBinding.created_at.desc(),
            IdentityProviderBinding.binding_id.desc(),
        )
        return list(self.session.scalars(statement))

    def list_identity_provider_bindings(
        self,
        *,
        principal_ids: list[str] | None = None,
        provider: str | None = None,
        statuses: list[str] | None = None,
    ) -> list[IdentityProviderBinding]:
        statement = select(IdentityProviderBinding)
        if principal_ids is not None:
            if not principal_ids:
                return []
            statement = statement.where(IdentityProviderBinding.principal_id.in_(principal_ids))
        if provider:
            statement = statement.where(IdentityProviderBinding.provider == provider)
        if statuses is not None:
            if not statuses:
                return []
            statement = statement.where(IdentityProviderBinding.status.in_(statuses))
        statement = statement.order_by(
            IdentityProviderBinding.created_at.desc(),
            IdentityProviderBinding.binding_id.desc(),
        )
        return list(self.session.scalars(statement))

    def count_principals(self, *, status: str | None = None) -> int:
        statement = select(func.count(Principal.principal_id))
        if status:
            statement = statement.where(Principal.status == status)
        return int(self.session.scalar(statement) or 0)

    def list_principals(
        self,
        *,
        status: str | None = None,
        principal_ids: list[str] | None = None,
        limit: int | None = None,
    ) -> list[Principal]:
        statement = select(Principal)
        if status:
            statement = statement.where(Principal.status == status)
        if principal_ids is not None:
            if not principal_ids:
                return []
            statement = statement.where(Principal.principal_id.in_(principal_ids))
        statement = statement.order_by(Principal.created_at.desc(), Principal.principal_id.asc())
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def query_admin_portal_user_directory_page(
        self,
        *,
        q: str,
        source: str,
        status: str,
        package_alias: str,
        qq_bound: bool | None,
        offset: int,
        limit: int,
        covered_subscription_statuses: set[str],
        free_plan_id: str,
        free_plan_kind: str,
        tier_package_aliases: list[tuple[str, str]],
        default_tier_package_alias: str,
    ) -> PortalUserDirectoryPage:
        membership_priority = case(
            (AccountUserMembership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE, 0),
            else_=1,
        )
        ranked_memberships = select(
            AccountUserMembership.principal_id.label("principal_id"),
            AccountUserMembership.account_id.label("account_id"),
            AccountUserMembership.status.label("membership_status"),
            AccountUserMembership.metadata_json.label("membership_metadata"),
            func.row_number()
            .over(
                partition_by=AccountUserMembership.principal_id,
                order_by=(
                    membership_priority.asc(),
                    AccountUserMembership.created_at.desc(),
                    AccountUserMembership.membership_id.desc(),
                ),
            )
            .label("row_number"),
        ).subquery()
        ranked_sites = (
            select(
                Site.account_id.label("account_id"),
                Site.site_id.label("site_id"),
                Site.name.label("site_name"),
                Site.site_url.label("site_url"),
                Site.metadata_json.label("site_metadata"),
                func.row_number()
                .over(
                    partition_by=Site.account_id,
                    order_by=(Site.created_at.desc(), Site.site_id.asc()),
                )
                .label("row_number"),
            )
            .where(Site.account_id.is_not(None))
            .subquery()
        )
        site_counts = (
            select(
                Site.account_id.label("account_id"),
                func.count(Site.site_id).label("site_count"),
            )
            .where(Site.account_id.is_not(None))
            .group_by(Site.account_id)
            .subquery()
        )
        covered_subscription = and_(
            AccountSubscription.status.in_(sorted(covered_subscription_statuses)),
            AccountSubscription.plan_id != "",
            AccountSubscription.plan_version_id != "",
        )
        ranked_subscriptions = select(
            AccountSubscription.account_id.label("account_id"),
            AccountSubscription.subscription_id.label("subscription_id"),
            AccountSubscription.plan_id.label("plan_id"),
            AccountSubscription.plan_version_id.label("plan_version_id"),
            AccountSubscription.metadata_json.label("subscription_metadata"),
            func.row_number()
            .over(
                partition_by=AccountSubscription.account_id,
                order_by=(
                    case((covered_subscription, 0), else_=1).asc(),
                    AccountSubscription.created_at.desc(),
                    AccountSubscription.subscription_id.desc(),
                ),
            )
            .label("row_number"),
        ).subquery()
        qq_bindings = (
            select(
                IdentityProviderBinding.principal_id.label("principal_id"),
                func.count(IdentityProviderBinding.binding_id).label("qq_binding_count"),
            )
            .where(
                IdentityProviderBinding.provider == "qq",
                IdentityProviderBinding.status == IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
            )
            .group_by(IdentityProviderBinding.principal_id)
            .subquery()
        )

        def json_text(column: Any, key: str) -> Any:
            return func.nullif(
                func.trim(func.coalesce(column[key].as_string(), "")),
                "",
            )

        source_expression = func.coalesce(
            json_text(Principal.metadata_json, "source"),
            json_text(ranked_memberships.c.membership_metadata, "source"),
            json_text(Account.metadata_json, "source"),
            json_text(ranked_sites.c.site_metadata, "source"),
            "",
        )
        subscription_package_alias = func.coalesce(
            json_text(ranked_subscriptions.c.subscription_metadata, "package_alias"),
            "",
        )
        subscription_plan_kind = func.coalesce(
            json_text(ranked_subscriptions.c.subscription_metadata, "plan_kind"),
            "",
        )
        subscription_tier_id = func.lower(
            func.coalesce(
                json_text(ranked_subscriptions.c.subscription_metadata, "tier_id"),
                "",
            )
        )
        normalized_plan_id = func.lower(func.coalesce(ranked_subscriptions.c.plan_id, ""))
        tier_alias_cases: list[tuple[Any, str]] = [
            (subscription_tier_id == tier_id, alias) for tier_id, alias in tier_package_aliases
        ]
        tier_alias_cases.extend(
            (normalized_plan_id.contains(tier_id), alias) for tier_id, alias in tier_package_aliases
        )
        inferred_tier_alias = case(
            *tier_alias_cases,
            else_=default_tier_package_alias,
        )
        display_package_label = case(
            (subscription_package_alias != "", subscription_package_alias),
            (
                or_(
                    ranked_subscriptions.c.plan_id == free_plan_id,
                    subscription_plan_kind == free_plan_kind,
                ),
                "Free",
            ),
            (
                ranked_subscriptions.c.subscription_id.is_(None),
                case(
                    (func.coalesce(site_counts.c.site_count, 0) > 0, "Uncovered"),
                    else_="Unknown",
                ),
            ),
            else_=inferred_tier_alias,
        )
        qq_binding_count = func.coalesce(qq_bindings.c.qq_binding_count, 0)
        package_blob = func.lower(
            subscription_package_alias
            + " "
            + display_package_label
            + " "
            + func.coalesce(ranked_subscriptions.c.plan_id, "")
        )
        search_blob = func.lower(
            Principal.principal_id
            + " "
            + func.coalesce(Principal.email, "")
            + " "
            + ranked_memberships.c.account_id
            + " "
            + func.coalesce(Account.name, "")
            + " "
            + func.coalesce(ranked_sites.c.site_id, "")
            + " "
            + func.coalesce(ranked_sites.c.site_name, "")
            + " "
            + func.coalesce(ranked_sites.c.site_url, "")
            + " "
            + subscription_package_alias
        )

        statement = (
            select(
                Principal.principal_id.label("principal_id"),
                Principal.status.label("principal_status"),
                Principal.created_at.label("principal_created_at"),
                source_expression.label("source"),
                qq_binding_count.label("qq_binding_count"),
            )
            .join(
                ranked_memberships,
                and_(
                    ranked_memberships.c.principal_id == Principal.principal_id,
                    ranked_memberships.c.row_number == 1,
                ),
            )
            .join(Account, Account.account_id == ranked_memberships.c.account_id)
            .outerjoin(
                ranked_sites,
                and_(
                    ranked_sites.c.account_id == Account.account_id,
                    ranked_sites.c.row_number == 1,
                ),
            )
            .outerjoin(site_counts, site_counts.c.account_id == Account.account_id)
            .outerjoin(
                ranked_subscriptions,
                and_(
                    ranked_subscriptions.c.account_id == Account.account_id,
                    ranked_subscriptions.c.row_number == 1,
                ),
            )
            .outerjoin(qq_bindings, qq_bindings.c.principal_id == Principal.principal_id)
        )
        if status:
            statement = statement.where(Principal.status == status)
        if source != "all":
            statement = statement.where(source_expression == source)
        if qq_bound is not None:
            statement = statement.where(qq_binding_count > 0 if qq_bound else qq_binding_count == 0)

        def contains(expression: Any, value: str) -> Any:
            escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            return expression.like(f"%{escaped}%", escape="\\")

        if package_alias:
            statement = statement.where(contains(package_blob, package_alias))
        if q:
            statement = statement.where(contains(search_blob, q))

        filtered = statement.subquery()
        summary = self.session.execute(
            select(
                func.count().label("total"),
                func.coalesce(
                    func.sum(
                        case((filtered.c.principal_status == PRINCIPAL_STATUS_ACTIVE, 1), else_=0)
                    ),
                    0,
                ).label("active"),
                func.coalesce(
                    func.sum(
                        case(
                            (filtered.c.principal_status == PRINCIPAL_STATUS_DISABLED, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("disabled"),
                func.coalesce(
                    func.sum(case((filtered.c.qq_binding_count > 0, 1), else_=0)),
                    0,
                ).label("qq_bound"),
                func.coalesce(
                    func.sum(
                        case(
                            (filtered.c.source == "portal_self_registration", 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("self_registered"),
            ).select_from(filtered)
        ).one()
        principal_ids = list(
            self.session.scalars(
                select(filtered.c.principal_id)
                .order_by(
                    filtered.c.principal_created_at.desc(),
                    filtered.c.principal_id.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
        )
        return {
            "principal_ids": principal_ids,
            "total": int(summary.total or 0),
            "summary": {
                "active": int(summary.active or 0),
                "disabled": int(summary.disabled or 0),
                "qq_bound": int(summary.qq_bound or 0),
                "self_registered": int(summary.self_registered or 0),
            },
        }
