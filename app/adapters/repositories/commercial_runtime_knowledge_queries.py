from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import (
    RunRecord,
    SiteKnowledgeChunk,
    SiteKnowledgeDocument,
    SiteKnowledgeIndexJobMetric,
)


class CommercialRuntimeKnowledgeQueries:
    """Read-only runtime and Site Knowledge aggregates for commercial consumers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def count_active_runs(
        self,
        site_id: str,
        *,
        execution_patterns: tuple[str, ...] | None = None,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(RunRecord)
            .where(
                RunRecord.site_id == site_id,
                RunRecord.status.in_(("queued", "running")),
            )
        )
        if execution_patterns is not None:
            statement = statement.where(RunRecord.execution_pattern.in_(execution_patterns))
        return int(self.session.scalar(statement) or 0)

    def count_active_runs_by_site(
        self,
        *,
        site_ids: list[str],
        execution_patterns: tuple[str, ...] | None = None,
    ) -> dict[str, int]:
        if not site_ids:
            return {}
        statement = (
            select(RunRecord.site_id, func.count())
            .select_from(RunRecord)
            .where(
                RunRecord.site_id.in_(site_ids),
                RunRecord.status.in_(("queued", "running")),
            )
            .group_by(RunRecord.site_id)
        )
        if execution_patterns is not None:
            statement = statement.where(RunRecord.execution_pattern.in_(execution_patterns))
        return {
            str(site_id or ""): int(count or 0)
            for site_id, count in self.session.execute(statement)
            if site_id
        }

    def summarize_site_knowledge_current_counts(
        self,
        *,
        site_ids: list[str],
    ) -> dict[str, dict[str, int]]:
        if not site_ids:
            return {}
        items: dict[str, dict[str, int]] = {
            site_id: {"documents": 0, "chunks": 0} for site_id in site_ids
        }
        document_statement = (
            select(SiteKnowledgeDocument.site_id, func.count())
            .select_from(SiteKnowledgeDocument)
            .where(SiteKnowledgeDocument.site_id.in_(site_ids))
            .group_by(SiteKnowledgeDocument.site_id)
        )
        for site_id, count in self.session.execute(document_statement):
            items.setdefault(str(site_id or ""), {"documents": 0, "chunks": 0})["documents"] = int(
                count or 0
            )
        chunk_statement = (
            select(SiteKnowledgeChunk.site_id, func.count())
            .select_from(SiteKnowledgeChunk)
            .where(SiteKnowledgeChunk.site_id.in_(site_ids))
            .group_by(SiteKnowledgeChunk.site_id)
        )
        for site_id, count in self.session.execute(chunk_statement):
            items.setdefault(str(site_id or ""), {"documents": 0, "chunks": 0})["chunks"] = int(
                count or 0
            )
        return items

    def summarize_site_knowledge_index_usage(
        self,
        *,
        account_id: str | None = None,
        subscription_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, int]:
        statement = select(
            func.sum(SiteKnowledgeIndexJobMetric.accepted_documents),
            func.sum(SiteKnowledgeIndexJobMetric.indexed_documents),
            func.sum(SiteKnowledgeIndexJobMetric.indexed_chunks),
        )
        if account_id:
            statement = statement.where(SiteKnowledgeIndexJobMetric.account_id == account_id)
        if subscription_id:
            statement = statement.where(
                SiteKnowledgeIndexJobMetric.subscription_id == subscription_id
            )
        if since is not None:
            statement = statement.where(SiteKnowledgeIndexJobMetric.created_at >= since)
        if until is not None:
            statement = statement.where(SiteKnowledgeIndexJobMetric.created_at <= until)
        accepted_documents, indexed_documents, indexed_chunks = self.session.execute(
            statement
        ).one()
        return {
            "accepted_documents": int(accepted_documents or 0),
            "indexed_documents": int(indexed_documents or 0),
            "indexed_chunks": int(indexed_chunks or 0),
        }
