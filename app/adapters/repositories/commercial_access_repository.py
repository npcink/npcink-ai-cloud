from __future__ import annotations

from sqlalchemy import select

from app.adapters.repositories.commercial_membership_queries import CommercialMembershipQueries
from app.adapters.repositories.commercial_platform_admin_queries import (
    CommercialPlatformAdminQueries,
)
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    AccountUserMembership,
    PlatformAdminGrant,
)


class CommercialAccessRepository(
    CommercialMembershipQueries,
    CommercialPlatformAdminQueries,
):
    def upsert_account_user_membership(
        self,
        *,
        membership_id: str,
        principal_id: str,
        account_id: str,
        role: str,
        status: str = ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
        allowed_actions_json: list[str] | None = None,
        metadata_json: dict[str, object] | None = None,
    ) -> AccountUserMembership:
        membership = self.session.scalar(
            select(AccountUserMembership).where(
                AccountUserMembership.principal_id == principal_id,
                AccountUserMembership.account_id == account_id,
            )
        )
        if membership is None:
            membership = AccountUserMembership(
                membership_id=membership_id,
                principal_id=principal_id,
                account_id=account_id,
                role=role,
                status=status,
                allowed_actions_json=allowed_actions_json or [],
                metadata_json=metadata_json,
            )
            self.session.add(membership)
        else:
            membership.role = role
            membership.status = status
            membership.allowed_actions_json = allowed_actions_json or []
            membership.metadata_json = metadata_json
        self.session.flush()
        return membership

    def revoke_account_user_memberships(self, *, principal_id: str) -> int:
        memberships = self.list_account_user_memberships(
            principal_ids=[principal_id],
            statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
        )
        for membership in memberships:
            membership.status = ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED
        self.session.flush()
        return len(memberships)

    def upsert_platform_admin_grant(
        self,
        *,
        grant_id: str,
        principal_id: str,
        provider: str,
        external_subject: str | None,
        email: str | None,
        role: str,
        status: str,
        metadata_json: dict[str, object] | None = None,
    ) -> PlatformAdminGrant:
        identity = self.get_platform_admin_grant(principal_id=principal_id)
        if identity is None:
            identity = PlatformAdminGrant(
                grant_id=grant_id,
                principal_id=principal_id,
                provider=provider,
                external_subject=external_subject,
                email=email,
                role=role,
                status=status,
                metadata_json=metadata_json,
            )
            self.session.add(identity)
        else:
            identity.provider = provider
            identity.external_subject = external_subject
            identity.email = email
            identity.role = role
            identity.status = status
            identity.metadata_json = metadata_json
        self.session.flush()
        return identity

    def delete_platform_admin_grant(
        self,
        *,
        principal_id: str,
    ) -> bool:
        identity = self.get_platform_admin_grant(principal_id=principal_id)
        if identity is None:
            return False
        self.session.delete(identity)
        self.session.flush()
        return True
