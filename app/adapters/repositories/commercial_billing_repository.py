from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import BillingSnapshot


class CommercialBillingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_billing_snapshots(self, site_id: str) -> list[BillingSnapshot]:
        statement = (
            select(BillingSnapshot)
            .where(BillingSnapshot.site_id == site_id)
            .order_by(BillingSnapshot.period_start_at.desc(), BillingSnapshot.snapshot_id.desc())
        )
        return list(self.session.scalars(statement))

    def get_latest_billing_snapshots_by_site(
        self,
        *,
        site_ids: list[str] | None = None,
    ) -> dict[str, BillingSnapshot]:
        statement = select(BillingSnapshot)
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(BillingSnapshot.site_id.in_(site_ids))
        statement = statement.order_by(
            BillingSnapshot.site_id.asc(),
            BillingSnapshot.period_end_at.desc(),
            BillingSnapshot.generated_at.desc(),
            BillingSnapshot.snapshot_id.desc(),
        )
        items: dict[str, BillingSnapshot] = {}
        for snapshot in self.session.scalars(statement):
            site_id = str(snapshot.site_id or "")
            if site_id and site_id not in items:
                items[site_id] = snapshot
        return items

    def upsert_billing_snapshot(
        self,
        *,
        snapshot_id: str,
        account_id: str | None,
        site_id: str | None,
        subscription_id: str | None,
        plan_version_id: str | None,
        currency: str,
        period_start_at: datetime,
        period_end_at: datetime,
        totals_json: dict[str, object],
        breakdown_json: dict[str, object],
    ) -> BillingSnapshot:
        snapshot = self.session.get(BillingSnapshot, snapshot_id)
        if snapshot is None:
            snapshot = BillingSnapshot(
                snapshot_id=snapshot_id,
                account_id=account_id,
                site_id=site_id,
                subscription_id=subscription_id,
                plan_version_id=plan_version_id,
                currency=currency,
                period_start_at=period_start_at,
                period_end_at=period_end_at,
                totals_json=totals_json,
                breakdown_json=breakdown_json,
            )
            self.session.add(snapshot)
        else:
            snapshot.account_id = account_id
            snapshot.site_id = site_id
            snapshot.subscription_id = subscription_id
            snapshot.plan_version_id = plan_version_id
            snapshot.currency = currency
            snapshot.period_start_at = period_start_at
            snapshot.period_end_at = period_end_at
            snapshot.totals_json = totals_json
            snapshot.breakdown_json = breakdown_json
        self.session.flush()
        return snapshot
