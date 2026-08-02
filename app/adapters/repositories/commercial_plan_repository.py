from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.adapters.repositories.commercial_plan_queries import CommercialPlanQueries
from app.core.models import Plan, PlanOffer, PlanVersion


class CommercialPlanRepository(CommercialPlanQueries):
    def upsert_plan(
        self,
        *,
        plan_id: str,
        name: str,
        status: str,
        description: str,
        metadata_json: dict[str, object] | None,
    ) -> Plan:
        plan = self.get_plan(plan_id)
        if plan is None:
            plan = Plan(
                plan_id=plan_id,
                name=name or plan_id,
                status=status,
                description=description or None,
                metadata_json=metadata_json,
            )
            self.session.add(plan)
        else:
            plan.name = name or plan.name or plan_id
            plan.status = status
            plan.description = description or None
            plan.metadata_json = metadata_json
        self.session.flush()
        return plan

    def upsert_plan_version(
        self,
        *,
        plan_version_id: str,
        plan_id: str,
        version_label: str,
        status: str,
        currency: str,
        entitlements_json: dict[str, object],
        budgets_json: dict[str, object],
        concurrency_json: dict[str, object],
        policy_json: dict[str, object],
        metadata_json: dict[str, object] | None,
    ) -> PlanVersion:
        plan_version = self.get_plan_version(plan_version_id)
        if plan_version is None:
            plan_version = PlanVersion(
                plan_version_id=plan_version_id,
                plan_id=plan_id,
                version_label=version_label,
                status=status,
                currency=currency,
                entitlements_json=entitlements_json,
                budgets_json=budgets_json,
                concurrency_json=concurrency_json,
                policy_json=policy_json,
                metadata_json=metadata_json,
            )
            self.session.add(plan_version)
        else:
            plan_version.plan_id = plan_id
            plan_version.version_label = version_label
            plan_version.status = status
            plan_version.currency = currency
            plan_version.entitlements_json = entitlements_json
            plan_version.budgets_json = budgets_json
            plan_version.concurrency_json = concurrency_json
            plan_version.policy_json = policy_json
            plan_version.metadata_json = metadata_json
        self.session.flush()
        return plan_version

    def upsert_plan_offer(
        self,
        *,
        offer_id: str,
        plan_id: str,
        plan_version_id: str,
        account_id: str | None,
        tier_id: str,
        billing_cycle: str,
        amount: Decimal,
        currency: str,
        purchase_mode: str,
        status: str,
        trial_enabled: bool,
        trial_days: int,
        trial_ai_credit_limit: int,
        trial_requires_approval: bool,
        valid_from_at: datetime | None,
        valid_until_at: datetime | None,
        metadata_json: dict[str, object] | None,
    ) -> PlanOffer:
        offer = self.get_plan_offer(offer_id)
        values = {
            "plan_id": plan_id,
            "plan_version_id": plan_version_id,
            "account_id": account_id,
            "tier_id": tier_id,
            "billing_cycle": billing_cycle,
            "amount": amount,
            "currency": currency,
            "purchase_mode": purchase_mode,
            "status": status,
            "trial_enabled": trial_enabled,
            "trial_days": trial_days,
            "trial_ai_credit_limit": trial_ai_credit_limit,
            "trial_requires_approval": trial_requires_approval,
            "valid_from_at": valid_from_at,
            "valid_until_at": valid_until_at,
            "metadata_json": metadata_json,
        }
        if offer is None:
            offer = PlanOffer(offer_id=offer_id, **values)
            self.session.add(offer)
        else:
            for key, value in values.items():
                setattr(offer, key, value)
        self.session.flush()
        return offer
