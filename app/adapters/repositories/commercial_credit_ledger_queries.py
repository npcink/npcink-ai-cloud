from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from sqlalchemy import Integer, and_, case, func, or_, select
from sqlalchemy.orm import Session, load_only
from sqlalchemy.sql.elements import ColumnElement

from app.core.models import CREDIT_LEDGER_EVENT_CONSUME, CreditLedgerEntry, RunRecord


class CommercialCreditLedgerQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_runtime_credit_facts(
        self,
        *,
        account_id: str,
        subscription_id: str,
        event_types: list[str],
        since: datetime,
        until: datetime,
    ) -> list[CreditLedgerEntry]:
        if not event_types:
            return []
        # Retain identity-map values and accumulation order, including local
        # pending changes; a raw scalar SUM cannot provide that contract.
        statement = (
            select(CreditLedgerEntry)
            .options(
                load_only(
                    CreditLedgerEntry.source_type,
                    CreditLedgerEntry.ai_credit_delta,
                    raiseload=True,
                )
            )
            .where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.subscription_id == subscription_id,
                CreditLedgerEntry.event_type.in_(event_types),
                CreditLedgerEntry.created_at >= since,
                CreditLedgerEntry.created_at <= until,
            )
            .order_by(CreditLedgerEntry.created_at.desc(), CreditLedgerEntry.ledger_entry_id.desc())
        )
        return list(self.session.scalars(statement))

    def _credit_ledger_site_scope(
        self,
        site_ids: list[str] | None,
        *,
        include_unscoped: bool = False,
    ) -> ColumnElement[bool] | None:
        """Build site filter; optionally keep account-level rows (site_id IS NULL).

        Portal Sources needs account-level grants such as subscription_topup, which
        are written with site_id=NULL while the portal always scopes by selected site.
        """
        if site_ids is None:
            return None
        if not site_ids:
            return None
        site_scope: ColumnElement[bool] = CreditLedgerEntry.site_id.in_(site_ids)
        if include_unscoped:
            site_scope = or_(site_scope, CreditLedgerEntry.site_id.is_(None))
        return site_scope

    def list_credit_ledger_entries(
        self,
        *,
        account_ids: list[str] | None = None,
        site_ids: list[str] | None = None,
        include_unscoped: bool = False,
        subscription_id: str | None = None,
        event_types: list[str] | None = None,
        source_types: list[str] | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[CreditLedgerEntry]:
        statement = select(CreditLedgerEntry)
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(CreditLedgerEntry.account_id.in_(account_ids))
        if site_ids is not None:
            if not site_ids:
                return []
            site_scope = self._credit_ledger_site_scope(
                site_ids, include_unscoped=include_unscoped
            )
            if site_scope is None:
                return []
            statement = statement.where(site_scope)
        if subscription_id is not None:
            statement = statement.where(CreditLedgerEntry.subscription_id == subscription_id)
        if event_types is not None:
            if not event_types:
                return []
            statement = statement.where(CreditLedgerEntry.event_type.in_(event_types))
        if source_types is not None:
            if not source_types:
                return []
            statement = statement.where(CreditLedgerEntry.source_type.in_(source_types))
        if since is not None:
            statement = statement.where(CreditLedgerEntry.created_at >= since)
        if until is not None:
            statement = statement.where(CreditLedgerEntry.created_at <= until)
        statement = statement.order_by(
            CreditLedgerEntry.created_at.desc(),
            CreditLedgerEntry.ledger_entry_id.desc(),
        )
        if offset is not None and offset > 0:
            statement = statement.offset(offset)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def summarize_credit_consumption_buckets(
        self,
        *,
        account_id: str,
        buckets: list[tuple[datetime, datetime]],
        site_ids: list[str] | None = None,
    ) -> dict[int, dict[str, float | int]]:
        if not buckets:
            return {}
        bucket_expression = case(
            *[
                (
                    and_(
                        CreditLedgerEntry.created_at >= start_at,
                        CreditLedgerEntry.created_at < end_at,
                    ),
                    index,
                )
                for index, (start_at, end_at) in enumerate(buckets)
            ],
            else_=None,
        ).label("bucket_index")
        statement = (
            select(
                bucket_expression,
                func.sum(-CreditLedgerEntry.ai_credit_delta).label("consumed_ai_credits"),
                func.count(CreditLedgerEntry.ledger_entry_id).label("entry_count"),
            )
            .where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.event_type == CREDIT_LEDGER_EVENT_CONSUME,
                CreditLedgerEntry.ai_credit_delta < 0,
                CreditLedgerEntry.created_at >= buckets[0][0],
                CreditLedgerEntry.created_at < buckets[-1][1],
            )
            .group_by(bucket_expression)
        )
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(CreditLedgerEntry.site_id.in_(site_ids))
        summaries: dict[int, dict[str, float | int]] = {}
        for row in self.session.execute(statement):
            if row[0] is None:
                continue
            summaries[int(row[0])] = {
                "ai_credits": round(float(row[1] or 0.0), 6),
                "entry_count": int(row[2] or 0),
            }
        return summaries

    def list_portal_credit_event_groups(
        self,
        *,
        account_id: str,
        subscription_id: str | None,
        event_types: list[str],
        since: datetime,
        until: datetime,
        site_id: str = "",
        feature: str = "",
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int, float]:
        source = func.lower(CreditLedgerEntry.source_type)
        ability_name = func.lower(func.coalesce(RunRecord.ability_name, ""))
        ability_family = func.lower(func.coalesce(RunRecord.ability_family, ""))
        execution_kind = func.lower(func.coalesce(RunRecord.execution_kind, ""))
        feature_expression = case(
            (or_(source.like("zhihu%"), ability_name.like("%zhihu%")), "topic_research"),
            (or_(source == "web_search", ability_name.like("%web-search%")), "web_search"),
            (
                or_(
                    source.in_(["vector_documents", "vector_chunks"]),
                    ability_name.like("%site-knowledge%"),
                    ability_name.like("%site_knowledge%"),
                    ability_family == "knowledge",
                    execution_kind.in_(["embedding", "site_knowledge", "knowledge"]),
                ),
                "site_knowledge",
            ),
            (
                or_(
                    source.like("%image%"), ability_name.like("%image%"), ability_family == "vision"
                ),
                "image_assistance",
            ),
            (or_(source.like("%audio%"), ability_name.like("%audio%")), "audio_generation"),
            else_="content_generation",
        ).label("feature_key")
        group_id = func.coalesce(
            func.nullif(CreditLedgerEntry.run_id, ""), CreditLedgerEntry.ledger_entry_id
        ).label("group_id")
        grouped = (
            select(
                group_id,
                CreditLedgerEntry.run_id.label("run_id"),
                CreditLedgerEntry.site_id.label("site_id"),
                feature_expression,
                func.max(CreditLedgerEntry.created_at).label("created_at"),
                func.sum(CreditLedgerEntry.ai_credit_delta).label("net_ai_credit_delta"),
                func.count(CreditLedgerEntry.ledger_entry_id).label("component_count"),
            )
            .select_from(CreditLedgerEntry)
            .outerjoin(RunRecord, RunRecord.run_id == CreditLedgerEntry.run_id)
            .where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.event_type.in_(event_types),
                CreditLedgerEntry.created_at >= since,
                CreditLedgerEntry.created_at <= until,
            )
        )
        if subscription_id is not None:
            grouped = grouped.where(CreditLedgerEntry.subscription_id == subscription_id)
        if site_id:
            grouped = grouped.where(CreditLedgerEntry.site_id == site_id)
        if feature:
            grouped = grouped.where(feature_expression == feature)
        grouped_subquery = grouped.group_by(
            group_id,
            CreditLedgerEntry.run_id,
            CreditLedgerEntry.site_id,
            feature_expression,
        ).subquery()
        summary = self.session.execute(
            select(
                func.count(),
                func.sum(
                    case(
                        (
                            grouped_subquery.c.net_ai_credit_delta < 0,
                            -grouped_subquery.c.net_ai_credit_delta,
                        ),
                        else_=0,
                    )
                ),
            ).select_from(grouped_subquery)
        ).one()
        rows = self.session.execute(
            select(grouped_subquery)
            .order_by(grouped_subquery.c.created_at.desc(), grouped_subquery.c.group_id.desc())
            .limit(limit)
            .offset(offset)
        ).mappings()
        return [dict(row) for row in rows], int(summary[0] or 0), round(float(summary[1] or 0.0), 6)

    def list_credit_ledger_entries_for_event_groups(
        self,
        *,
        account_id: str,
        run_ids: list[str],
        ledger_entry_ids: list[str],
    ) -> list[CreditLedgerEntry]:
        predicates: list[ColumnElement[bool]] = []
        if run_ids:
            predicates.append(CreditLedgerEntry.run_id.in_(run_ids))
        if ledger_entry_ids:
            predicates.append(CreditLedgerEntry.ledger_entry_id.in_(ledger_entry_ids))
        if not predicates:
            return []
        return list(
            self.session.scalars(
                select(CreditLedgerEntry).where(
                    CreditLedgerEntry.account_id == account_id,
                    or_(*predicates),
                )
            )
        )

    def summarize_portal_credit_event_buckets(
        self,
        *,
        account_id: str,
        subscription_id: str | None,
        event_types: list[str],
        since: datetime,
        until: datetime,
        bucket_seconds: int,
        site_id: str = "",
        feature: str = "",
    ) -> list[dict[str, Any]]:
        source = func.lower(CreditLedgerEntry.source_type)
        ability_name = func.lower(func.coalesce(RunRecord.ability_name, ""))
        ability_family = func.lower(func.coalesce(RunRecord.ability_family, ""))
        execution_kind = func.lower(func.coalesce(RunRecord.execution_kind, ""))
        feature_expression = case(
            (or_(source.like("zhihu%"), ability_name.like("%zhihu%")), "topic_research"),
            (or_(source == "web_search", ability_name.like("%web-search%")), "web_search"),
            (
                or_(
                    source.in_(["vector_documents", "vector_chunks"]),
                    ability_name.like("%site-knowledge%"),
                    ability_name.like("%site_knowledge%"),
                    ability_family == "knowledge",
                    execution_kind.in_(["embedding", "site_knowledge", "knowledge"]),
                ),
                "site_knowledge",
            ),
            (
                or_(
                    source.like("%image%"),
                    ability_name.like("%image%"),
                    ability_family == "vision",
                ),
                "image_assistance",
            ),
            (or_(source.like("%audio%"), ability_name.like("%audio%")), "audio_generation"),
            else_="content_generation",
        ).label("feature_key")
        group_id = func.coalesce(
            func.nullif(CreditLedgerEntry.run_id, ""),
            CreditLedgerEntry.ledger_entry_id,
        )
        dialect_name = self.session.bind.dialect.name if self.session.bind is not None else ""
        epoch_seconds = (
            func.cast(func.strftime("%s", CreditLedgerEntry.created_at), Integer)
            if dialect_name == "sqlite"
            else func.extract("epoch", CreditLedgerEntry.created_at)
        )
        # PostgreSQL rounds numeric-to-integer casts, which can move entries in the
        # second half of an interval into the next bucket. Floor explicitly so the
        # bucket always starts at or before the event timestamp on every dialect.
        bucket_index = func.cast(
            func.floor(epoch_seconds / bucket_seconds),
            Integer,
        ).label("bucket_index")
        statement = (
            select(
                bucket_index,
                feature_expression,
                func.sum(CreditLedgerEntry.ai_credit_delta).label("net_ai_credit_delta"),
                func.count(func.distinct(group_id)).label("event_count"),
                func.count(func.distinct(CreditLedgerEntry.site_id)).label("site_count"),
            )
            .select_from(CreditLedgerEntry)
            .outerjoin(RunRecord, RunRecord.run_id == CreditLedgerEntry.run_id)
            .where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.event_type.in_(event_types),
                CreditLedgerEntry.created_at >= since,
                CreditLedgerEntry.created_at <= until,
            )
        )
        if subscription_id is not None:
            statement = statement.where(CreditLedgerEntry.subscription_id == subscription_id)
        if site_id:
            statement = statement.where(CreditLedgerEntry.site_id == site_id)
        if feature:
            statement = statement.where(feature_expression == feature)
        feature_rows = self.session.execute(
            statement.group_by(bucket_index, feature_expression).order_by(bucket_index.desc())
        ).mappings()
        total_statement = (
            select(
                bucket_index,
                func.sum(CreditLedgerEntry.ai_credit_delta).label("net_ai_credit_delta"),
                func.count(func.distinct(group_id)).label("event_count"),
                func.count(func.distinct(CreditLedgerEntry.site_id)).label("site_count"),
            )
            .select_from(CreditLedgerEntry)
            .outerjoin(RunRecord, RunRecord.run_id == CreditLedgerEntry.run_id)
            .where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.event_type.in_(event_types),
                CreditLedgerEntry.created_at >= since,
                CreditLedgerEntry.created_at <= until,
            )
        )
        if subscription_id is not None:
            total_statement = total_statement.where(
                CreditLedgerEntry.subscription_id == subscription_id
            )
        if site_id:
            total_statement = total_statement.where(CreditLedgerEntry.site_id == site_id)
        if feature:
            total_statement = total_statement.where(feature_expression == feature)
        totals = {
            int(row["bucket_index"]): dict(row)
            for row in self.session.execute(
                total_statement.group_by(bucket_index).order_by(bucket_index.desc())
            ).mappings()
        }
        for row in feature_rows:
            bucket = totals.get(int(row["bucket_index"]))
            if bucket is None:
                continue
            features = bucket.setdefault("features", [])
            cast(list[dict[str, Any]], features).append(
                {
                    "feature_key": str(row["feature_key"] or "content_generation"),
                    "net_ai_credit_delta": float(row["net_ai_credit_delta"] or 0.0),
                    "event_count": int(row["event_count"] or 0),
                }
            )
        return list(totals.values())

    def summarize_portal_credit_event_days(
        self,
        *,
        account_id: str,
        event_types: list[str],
        day_ranges: list[tuple[datetime, datetime]],
        site_id: str = "",
        feature: str = "",
    ) -> dict[int, dict[str, Any]]:
        """Totals per caller-supplied [start, end) range (local days), split by feature.

        Ranges come from the service (timezone-aware day boundaries, DST-safe); the
        query maps each entry to its range with a CASE so it stays portable across
        SQLite and PostgreSQL. Event counts use the same run grouping as credit-events.
        """
        if not day_ranges:
            return {}
        source = func.lower(CreditLedgerEntry.source_type)
        ability_name = func.lower(func.coalesce(RunRecord.ability_name, ""))
        ability_family = func.lower(func.coalesce(RunRecord.ability_family, ""))
        execution_kind = func.lower(func.coalesce(RunRecord.execution_kind, ""))
        feature_expression = case(
            (or_(source.like("zhihu%"), ability_name.like("%zhihu%")), "topic_research"),
            (or_(source == "web_search", ability_name.like("%web-search%")), "web_search"),
            (
                or_(
                    source.in_(["vector_documents", "vector_chunks"]),
                    ability_name.like("%site-knowledge%"),
                    ability_name.like("%site_knowledge%"),
                    ability_family == "knowledge",
                    execution_kind.in_(["embedding", "site_knowledge", "knowledge"]),
                ),
                "site_knowledge",
            ),
            (
                or_(
                    source.like("%image%"),
                    ability_name.like("%image%"),
                    ability_family == "vision",
                ),
                "image_assistance",
            ),
            (or_(source.like("%audio%"), ability_name.like("%audio%")), "audio_generation"),
            else_="content_generation",
        ).label("feature_key")
        group_id = func.coalesce(
            func.nullif(CreditLedgerEntry.run_id, ""),
            CreditLedgerEntry.ledger_entry_id,
        )
        day_index = case(
            *[
                (
                    and_(
                        CreditLedgerEntry.created_at >= start_at,
                        CreditLedgerEntry.created_at < end_at,
                    ),
                    index,
                )
                for index, (start_at, end_at) in enumerate(day_ranges)
            ],
            else_=-1,
        ).label("day_index")
        overall_start = min(start_at for start_at, _ in day_ranges)
        overall_end = max(end_at for _, end_at in day_ranges)

        def scoped(statement: Any) -> Any:
            statement = (
                statement.select_from(CreditLedgerEntry)
                .outerjoin(RunRecord, RunRecord.run_id == CreditLedgerEntry.run_id)
            )
            statement = statement.where(
                CreditLedgerEntry.account_id == account_id,
                CreditLedgerEntry.event_type.in_(event_types),
                CreditLedgerEntry.created_at >= overall_start,
                CreditLedgerEntry.created_at < overall_end,
            )
            if site_id:
                statement = statement.where(CreditLedgerEntry.site_id == site_id)
            if feature:
                statement = statement.where(feature_expression == feature)
            return statement

        totals: dict[int, dict[str, Any]] = {}
        for row in self.session.execute(
            scoped(
                select(
                    day_index,
                    func.sum(CreditLedgerEntry.ai_credit_delta).label("net_ai_credit_delta"),
                    func.count(func.distinct(group_id)).label("event_count"),
                )
            ).group_by(day_index)
        ).mappings():
            index = int(row["day_index"])
            if index < 0:
                continue
            totals[index] = {
                "net_ai_credit_delta": float(row["net_ai_credit_delta"] or 0.0),
                "event_count": int(row["event_count"] or 0),
                "features": [],
            }
        for row in self.session.execute(
            scoped(
                select(
                    day_index,
                    feature_expression,
                    func.sum(CreditLedgerEntry.ai_credit_delta).label("net_ai_credit_delta"),
                    func.count(func.distinct(group_id)).label("event_count"),
                )
            ).group_by(day_index, feature_expression)
        ).mappings():
            day = totals.get(int(row["day_index"]))
            if day is None:
                continue
            cast(list[dict[str, Any]], day["features"]).append(
                {
                    "feature_key": str(row["feature_key"] or "content_generation"),
                    "net_ai_credit_delta": float(row["net_ai_credit_delta"] or 0.0),
                    "event_count": int(row["event_count"] or 0),
                }
            )
        return totals

    def count_credit_ledger_entries(
        self,
        *,
        account_ids: list[str] | None = None,
        site_ids: list[str] | None = None,
        include_unscoped: bool = False,
        subscription_id: str | None = None,
        event_types: list[str] | None = None,
        source_types: list[str] | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> int:
        statement = select(func.count(CreditLedgerEntry.ledger_entry_id))
        if account_ids is not None:
            if not account_ids:
                return 0
            statement = statement.where(CreditLedgerEntry.account_id.in_(account_ids))
        if site_ids is not None:
            if not site_ids:
                return 0
            site_scope = self._credit_ledger_site_scope(
                site_ids, include_unscoped=include_unscoped
            )
            if site_scope is None:
                return 0
            statement = statement.where(site_scope)
        if subscription_id is not None:
            statement = statement.where(CreditLedgerEntry.subscription_id == subscription_id)
        if event_types is not None:
            if not event_types:
                return 0
            statement = statement.where(CreditLedgerEntry.event_type.in_(event_types))
        if source_types is not None:
            if not source_types:
                return 0
            statement = statement.where(CreditLedgerEntry.source_type.in_(source_types))
        if since is not None:
            statement = statement.where(CreditLedgerEntry.created_at >= since)
        if until is not None:
            statement = statement.where(CreditLedgerEntry.created_at <= until)
        return int(self.session.scalar(statement) or 0)
