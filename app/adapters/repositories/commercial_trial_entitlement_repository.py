from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.models import AccountEntitlementSnapshot, TrialClaim

type SQLAFilter = ColumnElement[bool]


class CommercialTrialEntitlementRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_trial_claim(self, claim_id: str) -> TrialClaim | None:
        return self.session.get(TrialClaim, claim_id)

    def find_trial_claim(
        self,
        *,
        account_id: str | None = None,
        principal_id: str | None = None,
        site_domain: str | None = None,
    ) -> TrialClaim | None:
        filters: list[SQLAFilter] = []
        if account_id:
            filters.append(TrialClaim.account_id == account_id)
        if principal_id:
            filters.append(TrialClaim.principal_id == principal_id)
        if site_domain:
            filters.append(TrialClaim.site_domain == site_domain)
        if not filters:
            return None
        return self.session.scalar(select(TrialClaim).where(or_(*filters)))

    def create_trial_claim(
        self,
        *,
        claim_id: str,
        account_id: str,
        principal_id: str | None,
        site_domain: str | None,
        plan_id: str,
        plan_version_id: str,
        tier_id: str,
        highest_tier_id: str,
        status: str,
        ai_credit_limit: int,
        started_at: datetime,
        ends_at: datetime,
        approved_by_principal_id: str | None,
        metadata_json: dict[str, object] | None,
    ) -> TrialClaim:
        claim = TrialClaim(
            claim_id=claim_id,
            account_id=account_id,
            principal_id=principal_id,
            site_domain=site_domain,
            plan_id=plan_id,
            plan_version_id=plan_version_id,
            tier_id=tier_id,
            highest_tier_id=highest_tier_id,
            status=status,
            ai_credit_limit=ai_credit_limit,
            started_at=started_at,
            ends_at=ends_at,
            approved_by_principal_id=approved_by_principal_id,
            metadata_json=metadata_json,
        )
        self.session.add(claim)
        self.session.flush()
        return claim

    def supersede_entitlement_snapshots(
        self,
        account_id: str,
        *,
        subscription_id: str | None = None,
    ) -> None:
        snapshots = list(
            self.session.scalars(
                select(AccountEntitlementSnapshot).where(
                    AccountEntitlementSnapshot.account_id == account_id,
                    AccountEntitlementSnapshot.status == "active",
                    *(
                        (AccountEntitlementSnapshot.subscription_id == subscription_id,)
                        if subscription_id
                        else ()
                    ),
                )
            )
        )
        for snapshot in snapshots:
            snapshot.status = "superseded"
        self.session.flush()

    def create_entitlement_snapshot(
        self,
        *,
        account_id: str,
        subscription_id: str,
        plan_version_id: str,
        entitlements_json: dict[str, object],
        budgets_json: dict[str, object],
        concurrency_json: dict[str, object],
        policy_json: dict[str, object],
        site_limit: int,
        metadata_json: dict[str, object] | None = None,
    ) -> AccountEntitlementSnapshot:
        snapshot = AccountEntitlementSnapshot(
            account_id=account_id,
            subscription_id=subscription_id,
            plan_version_id=plan_version_id,
            status="active",
            entitlements_json=entitlements_json,
            budgets_json=budgets_json,
            concurrency_json=concurrency_json,
            policy_json=policy_json,
            site_limit=site_limit,
            metadata_json=metadata_json,
        )
        self.session.add(snapshot)
        self.session.flush()
        return snapshot

    def get_active_entitlement_snapshot(
        self,
        account_id: str,
        *,
        subscription_id: str | None = None,
    ) -> AccountEntitlementSnapshot | None:
        statement = select(AccountEntitlementSnapshot).where(
            AccountEntitlementSnapshot.account_id == account_id,
            AccountEntitlementSnapshot.status == "active",
        )
        if subscription_id:
            statement = statement.where(
                AccountEntitlementSnapshot.subscription_id == subscription_id
            )
        statement = statement.order_by(
            AccountEntitlementSnapshot.generated_at.desc(),
            AccountEntitlementSnapshot.id.desc(),
        )
        return self.session.scalar(statement)
