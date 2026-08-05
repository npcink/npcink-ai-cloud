"""Validation-stage policy for Principal-to-Account memberships."""

from __future__ import annotations

from typing import Protocol

from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    AccountUserMembership,
)
from app.domain.commercial.errors import CommercialConflictError


class MembershipPolicyReader(Protocol):
    def list_account_user_memberships(
        self,
        *,
        principal_ids: list[str] | None = None,
        account_ids: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> list[AccountUserMembership]: ...


def assert_single_account_membership_available(
    repository: MembershipPolicyReader,
    *,
    principal_id: str,
    account_id: str,
) -> None:
    """Reject a second active Principal or Account relationship.

    The validation-stage limit intentionally lives at the service boundary.
    The relationship table remains many-to-many shaped for a later
    organization-account phase.
    """

    principal_memberships = repository.list_account_user_memberships(
        principal_ids=[principal_id],
        statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
    )
    conflicting_accounts = sorted(
        {
            str(membership.account_id or "")
            for membership in principal_memberships
            if str(membership.account_id or "") != account_id
        }
    )
    if conflicting_accounts:
        raise CommercialConflictError(
            "service.single_account_membership_limit",
            "the current product stage supports one active account per login identity",
            data={
                "principal_id": principal_id,
                "account_id": account_id,
                "conflicting_account_ids": conflicting_accounts,
            },
        )

    account_memberships = repository.list_account_user_memberships(
        account_ids=[account_id],
        statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
    )
    conflicting_principals = sorted(
        {
            str(membership.principal_id or "")
            for membership in account_memberships
            if str(membership.principal_id or "") != principal_id
        }
    )
    if conflicting_principals:
        raise CommercialConflictError(
            "service.single_identity_account_limit",
            "the current product stage supports one active login identity per account",
            data={
                "principal_id": principal_id,
                "account_id": account_id,
                "conflicting_principal_ids": conflicting_principals,
            },
        )
