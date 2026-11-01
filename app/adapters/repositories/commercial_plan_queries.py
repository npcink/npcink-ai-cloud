from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core.models import Plan, PlanOffer, PlanVersion


class CommercialPlanQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_plan(self, plan_id: str) -> Plan | None:
        return self.session.get(Plan, plan_id)

    def get_plan_for_update(self, plan_id: str) -> Plan | None:
        """Serialize catalog writers on the parent, including a missing Offer.

        SQLite ignores FOR UPDATE; a no-op UPDATE obtains its database write
        lock before reading the revision. Preserve updated_at explicitly.
        """
        if self.session.get_bind().dialect.name == "sqlite":
            self.session.execute(
                update(Plan)
                .where(Plan.plan_id == plan_id)
                .values(plan_id=Plan.plan_id, updated_at=Plan.updated_at)
            )
        return self.session.scalar(
            select(Plan)
            .where(Plan.plan_id == plan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def list_plans(
        self,
        *,
        status: str | None = None,
        limit: int | None = None,
    ) -> list[Plan]:
        statement = select(Plan).order_by(Plan.created_at.desc(), Plan.plan_id.desc())
        if status:
            statement = statement.where(Plan.status == status)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def get_plan_version(self, plan_version_id: str) -> PlanVersion | None:
        return self.session.get(PlanVersion, plan_version_id)

    def list_plan_versions(
        self,
        *,
        plan_id: str | None = None,
        status: str | None = None,
        limit: int | None = None,
    ) -> list[PlanVersion]:
        statement = select(PlanVersion).order_by(
            PlanVersion.created_at.desc(),
            PlanVersion.plan_version_id.desc(),
        )
        if plan_id:
            statement = statement.where(PlanVersion.plan_id == plan_id)
        if status:
            statement = statement.where(PlanVersion.status == status)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def get_plan_offer(self, offer_id: str) -> PlanOffer | None:
        return self.session.get(PlanOffer, offer_id)

    def get_plan_offer_for_update(self, offer_id: str) -> PlanOffer | None:
        return self.session.scalar(
            select(PlanOffer)
            .where(PlanOffer.offer_id == offer_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def list_plan_offers(
        self,
        *,
        account_id: str | None = None,
        status: str | None = None,
        self_serve_only: bool = False,
        now: datetime | None = None,
    ) -> list[PlanOffer]:
        statement = select(PlanOffer)
        if account_id:
            statement = statement.where(
                or_(PlanOffer.account_id.is_(None), PlanOffer.account_id == account_id)
            )
        else:
            statement = statement.where(PlanOffer.account_id.is_(None))
        if status:
            statement = statement.where(PlanOffer.status == status)
        if self_serve_only:
            statement = statement.where(PlanOffer.purchase_mode == "self_serve")
        if now is not None:
            statement = statement.where(
                or_(PlanOffer.valid_from_at.is_(None), PlanOffer.valid_from_at <= now),
                or_(PlanOffer.valid_until_at.is_(None), PlanOffer.valid_until_at > now),
            )
        statement = statement.order_by(PlanOffer.amount.asc(), PlanOffer.offer_id.asc())
        return list(self.session.scalars(statement))
