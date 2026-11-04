"""Explicit-column projection; never loads attachment bytes or private metadata."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import LargeBinary, String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.models import (
    AccountUserMembership,
    PortalNotification,
    Principal,
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestMessage,
)


class DataCopyLimitExceeded(Exception):
    pass


class ExportBudget(Protocol):
    def check(self, session: Session | None = None) -> None: ...


def build_data_copy(
    session: Session,
    principal: Principal,
    member: AccountUserMembership,
    budget: ExportBudget,
    max_bytes: int,
) -> dict[str, Any]:
    total_bytes = 0

    def rows(
        model: Any, fields: list[str], predicate: Any, cap: int, key: str
    ) -> list[dict[str, Any]]:
        nonlocal total_bytes
        budget.check(session)
        ids = list(
            session.scalars(
                select(getattr(model, key))
                .where(predicate)
                .order_by(getattr(model, key))
                .limit(cap + 1)
            )
        )
        if len(ids) > cap:
            raise DataCopyLimitExceeded
        if not ids:
            return []
        columns = [getattr(model, name) for name in fields]

        # Byte accounting happens in SQL before materializing free text. Include
        # every selected field; exact JSON escaping/keys are checked after encoding.
        def byte_length(column: Any) -> Any:
            value = cast(column, String)
            if session.get_bind().dialect.name == "postgresql":
                return func.coalesce(func.octet_length(value), 0)
            return func.coalesce(func.length(cast(value, LargeBinary)), 0)

        budget.check(session)
        size = (
            session.scalar(
                select(func.sum(sum(byte_length(c) for c in columns))).where(
                    getattr(model, key).in_(ids)
                )
            )
            or 0
        )
        total_bytes += int(size)
        if total_bytes > max_bytes:
            raise DataCopyLimitExceeded
        budget.check(session)
        return [
            dict(zip(fields, row, strict=True))
            for row in session.execute(
                select(*columns).where(getattr(model, key).in_(ids)).order_by(getattr(model, key))
            )
        ]

    tickets = rows(
        SupportRequest,
        [
            "request_id",
            "topic",
            "title",
            "description",
            "status",
            "created_at",
            "updated_at",
            "first_operator_response_at",
            "last_customer_activity_at",
            "last_operator_public_activity_at",
            "resolved_at",
            "closed_at",
        ],
        (SupportRequest.account_id == member.account_id)
        & (SupportRequest.principal_id == principal.principal_id),
        100,
        "request_id",
    )
    ticket_ids = [r["request_id"] for r in tickets]
    messages = rows(
        SupportRequestMessage,
        ["message_id", "request_id", "author_kind", "body", "created_at"],
        SupportRequestMessage.request_id.in_(ticket_ids)
        & (SupportRequestMessage.account_id == member.account_id)
        & (SupportRequestMessage.visibility == "public")
        & or_(
            SupportRequestMessage.author_kind == "operator",
            (SupportRequestMessage.author_kind == "customer")
            & (SupportRequestMessage.principal_id == principal.principal_id),
        ),
        1000,
        "message_id",
    )
    message_ids = [r["message_id"] for r in messages if r["message_id"]]
    # Composite request/account equality prevents mismatched attachment foreign keys
    # from making a draft or another request's attachment appear in the copy.
    message_scope = (
        select(SupportRequestMessage.message_id)
        .where(
            SupportRequestMessage.message_id.in_(message_ids),
            SupportRequestMessage.request_id == SupportRequestAttachment.request_id,
            SupportRequestMessage.account_id == SupportRequestAttachment.account_id,
            or_(
                SupportRequestAttachment.uploader_kind != "operator",
                SupportRequestMessage.author_kind == "operator",
            ),
        )
        .correlate(SupportRequestAttachment)
    )
    attachments = rows(
        SupportRequestAttachment,
        ["attachment_id", "message_id", "filename", "content_type", "byte_size", "created_at"],
        SupportRequestAttachment.message_id.in_(message_scope)
        & (SupportRequestAttachment.account_id == member.account_id)
        & (SupportRequestAttachment.visibility == "public")
        & or_(
            SupportRequestAttachment.uploader_kind == "operator",
            (SupportRequestAttachment.uploader_kind == "customer")
            & (SupportRequestAttachment.principal_id == principal.principal_id),
        ),
        500,
        "attachment_id",
    )
    notifications = rows(
        PortalNotification,
        ["notification_id", "event_type", "title", "body", "is_read", "created_at", "read_at"],
        (PortalNotification.account_id == member.account_id)
        & (PortalNotification.principal_id == principal.principal_id),
        500,
        "notification_id",
    )

    def own_fields(obj: Any, fields: list[str]) -> dict[str, Any]:
        return {name: getattr(obj, name) for name in fields}

    data = {
        "profile": own_fields(
            principal,
            ["principal_id", "email", "status", "created_at", "updated_at", "last_login_at"],
        ),
        "membership": own_fields(
            member, ["membership_id", "account_id", "role", "status", "created_at", "updated_at"]
        ),
        "support_requests": tickets,
        "support_messages": messages,
        "attachment_metadata": attachments,
        "notifications": notifications,
    }

    def normalized(value: Any) -> Any:
        if isinstance(value, datetime):
            return (
                value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
            ).isoformat()
        if isinstance(value, list):
            return [normalized(item) for item in value]
        if isinstance(value, dict):
            return {key: normalized(item) for key, item in value.items()}
        return value

    return normalized(data)
