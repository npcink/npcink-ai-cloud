from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.models import (
    SUPPORT_REQUEST_STATUS_IN_PROGRESS,
    SUPPORT_REQUEST_STATUS_OPEN,
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestFeedback,
    SupportRequestMessage,
)

type SQLAFilter = ColumnElement[bool]


class CommercialSupportQueries:
    """Read-only support queries shared by commercial repository consumers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_support_request(self, request_id: str) -> SupportRequest | None:
        return self.session.get(SupportRequest, request_id)

    def get_support_request_message(
        self,
        message_id: str,
    ) -> SupportRequestMessage | None:
        return self.session.get(SupportRequestMessage, message_id)

    def list_support_request_messages(
        self,
        *,
        request_id: str,
        include_internal: bool = False,
    ) -> list[SupportRequestMessage]:
        statement = select(SupportRequestMessage).where(
            SupportRequestMessage.request_id == request_id
        )
        if not include_internal:
            statement = statement.where(SupportRequestMessage.visibility == "public")
        statement = statement.order_by(
            SupportRequestMessage.created_at.asc(),
            SupportRequestMessage.message_id.asc(),
        )
        return list(self.session.scalars(statement))

    def get_support_request_attachment(
        self,
        attachment_id: str,
    ) -> SupportRequestAttachment | None:
        return self.session.get(SupportRequestAttachment, attachment_id)

    def list_support_request_attachments(
        self,
        *,
        request_id: str,
        include_internal: bool = False,
    ) -> list[SupportRequestAttachment]:
        statement = select(SupportRequestAttachment).where(
            SupportRequestAttachment.request_id == request_id
        )
        if not include_internal:
            statement = statement.where(SupportRequestAttachment.visibility == "public")
        statement = statement.order_by(
            SupportRequestAttachment.created_at.asc(),
            SupportRequestAttachment.attachment_id.asc(),
        )
        return list(self.session.scalars(statement))

    def count_support_request_attachments(self, *, request_id: str) -> int:
        statement = select(func.count(SupportRequestAttachment.attachment_id)).where(
            SupportRequestAttachment.request_id == request_id
        )
        return int(self.session.scalar(statement) or 0)

    def get_support_request_feedback(self, request_id: str) -> SupportRequestFeedback | None:
        statement = select(SupportRequestFeedback).where(
            SupportRequestFeedback.request_id == request_id
        )
        return self.session.scalar(statement)

    def list_support_requests(
        self,
        *,
        account_id: str | None = None,
        site_id: str | None = None,
        principal_id: str | None = None,
        status: str | None = None,
        topic: str | None = None,
        query: str | None = None,
        attention: str | None = None,
        sort: str = "updated_at",
        risk_as_of: datetime | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[SupportRequest]:
        statement = select(SupportRequest).where(
            *self._support_request_filters(
                account_id=account_id,
                site_id=site_id,
                principal_id=principal_id,
                status=status,
                topic=topic,
                query=query,
                attention=attention,
                risk_as_of=risk_as_of,
            )
        )
        if sort == "risk":
            cutoff = (risk_as_of or datetime.now(UTC)) - timedelta(hours=48)
            risk_rank = self._support_request_risk_rank(cutoff=cutoff)
            active_rank = case(
                (
                    SupportRequest.status.in_(
                        [
                            SUPPORT_REQUEST_STATUS_OPEN,
                            SUPPORT_REQUEST_STATUS_IN_PROGRESS,
                        ]
                    ),
                    0,
                ),
                else_=1,
            )
            active_waiting_since = case(
                (
                    SupportRequest.status.in_(
                        [
                            SUPPORT_REQUEST_STATUS_OPEN,
                            SUPPORT_REQUEST_STATUS_IN_PROGRESS,
                        ]
                    ),
                    SupportRequest.waiting_since,
                ),
                else_=None,
            )
            statement = statement.order_by(
                risk_rank.asc(),
                active_rank.asc(),
                active_waiting_since.asc(),
                SupportRequest.updated_at.desc(),
                SupportRequest.request_id.desc(),
            )
        else:
            statement = statement.order_by(
                SupportRequest.updated_at.desc(),
                SupportRequest.created_at.desc(),
                SupportRequest.request_id.desc(),
            )
        if offset > 0:
            statement = statement.offset(offset)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_support_requests(
        self,
        *,
        account_id: str | None = None,
        site_id: str | None = None,
        principal_id: str | None = None,
        status: str | None = None,
        topic: str | None = None,
        query: str | None = None,
        attention: str | None = None,
        risk_as_of: datetime | None = None,
    ) -> int:
        statement = select(func.count(SupportRequest.request_id)).where(
            *self._support_request_filters(
                account_id=account_id,
                site_id=site_id,
                principal_id=principal_id,
                status=status,
                topic=topic,
                query=query,
                attention=attention,
                risk_as_of=risk_as_of,
            )
        )
        return int(self.session.scalar(statement) or 0)

    def summarize_support_request_queue(
        self,
        *,
        account_id: str | None = None,
        site_id: str | None = None,
        principal_id: str | None = None,
        status: str | None = None,
        topic: str | None = None,
        query: str | None = None,
        attention: str | None = None,
        risk_as_of: datetime | None = None,
    ) -> dict[str, int]:
        cutoff = (risk_as_of or datetime.now(UTC)) - timedelta(hours=48)
        risk_rank = self._support_request_risk_rank(cutoff=cutoff)
        statement = select(
            func.sum(case((SupportRequest.status == SUPPORT_REQUEST_STATUS_OPEN, 1), else_=0)),
            func.sum(
                case(
                    (
                        SupportRequest.status == SUPPORT_REQUEST_STATUS_IN_PROGRESS,
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((risk_rank == 0, 1), else_=0)),
            func.sum(case((risk_rank == 1, 1), else_=0)),
            func.sum(case((risk_rank == 2, 1), else_=0)),
            func.sum(case((risk_rank == 3, 1), else_=0)),
            func.sum(case((SupportRequest.waiting_on == "operator", 1), else_=0)),
            func.sum(case((SupportRequest.waiting_on == "customer", 1), else_=0)),
            func.sum(
                case(
                    (
                        and_(
                            SupportRequest.waiting_on == "operator",
                            SupportRequest.waiting_since <= cutoff,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        ).where(
            *self._support_request_filters(
                account_id=account_id,
                site_id=site_id,
                principal_id=principal_id,
                status=status,
                topic=topic,
                query=query,
                attention=attention,
                risk_as_of=risk_as_of,
            )
        )
        row = self.session.execute(statement).one()
        return {
            "open": int(row[0] or 0),
            "in_progress": int(row[1] or 0),
            "critical": int(row[2] or 0),
            "warning": int(row[3] or 0),
            "monitor": int(row[4] or 0),
            "stable": int(row[5] or 0),
            "waiting_for_operator": int(row[6] or 0),
            "waiting_for_customer": int(row[7] or 0),
            "overdue": int(row[8] or 0),
        }

    def _support_request_risk_rank(
        self,
        *,
        cutoff: datetime,
    ) -> ColumnElement[int]:
        priority = func.lower(SupportRequest.priority)
        active = SupportRequest.status.in_(
            [SUPPORT_REQUEST_STATUS_OPEN, SUPPORT_REQUEST_STATUS_IN_PROGRESS]
        )
        return case(
            (
                and_(
                    active,
                    or_(
                        priority.in_(["critical", "urgent"]),
                        and_(
                            SupportRequest.waiting_on == "operator",
                            SupportRequest.waiting_since <= cutoff,
                        ),
                    ),
                ),
                0,
            ),
            (
                and_(
                    active,
                    or_(
                        SupportRequest.waiting_on == "operator",
                        priority == "high",
                    ),
                ),
                1,
            ),
            (
                active,
                2,
            ),
            else_=3,
        )

    def _support_request_filters(
        self,
        *,
        account_id: str | None,
        site_id: str | None,
        principal_id: str | None,
        status: str | None,
        topic: str | None,
        query: str | None,
        attention: str | None = None,
        risk_as_of: datetime | None = None,
    ) -> list[SQLAFilter]:
        filters: list[SQLAFilter] = []
        if account_id:
            filters.append(SupportRequest.account_id == account_id)
        if site_id:
            filters.append(SupportRequest.site_id == site_id)
        if principal_id:
            filters.append(SupportRequest.principal_id == principal_id)
        if status:
            filters.append(SupportRequest.status == status)
        if topic:
            filters.append(SupportRequest.topic == topic)
        if attention == "waiting_for_operator":
            filters.append(SupportRequest.waiting_on == "operator")
        elif attention == "overdue":
            cutoff = (risk_as_of or datetime.now(UTC)) - timedelta(hours=48)
            filters.extend(
                [
                    SupportRequest.waiting_on == "operator",
                    SupportRequest.waiting_since <= cutoff,
                ]
            )
        normalized_query = str(query or "").strip().lower()
        if normalized_query:
            pattern = f"%{normalized_query}%"
            filters.append(
                or_(
                    func.lower(SupportRequest.request_id).like(pattern),
                    func.lower(SupportRequest.email).like(pattern),
                    func.lower(SupportRequest.title).like(pattern),
                    func.lower(SupportRequest.account_id).like(pattern),
                    func.lower(SupportRequest.site_id).like(pattern),
                )
            )
        return filters
