"""Immediate service notices: immutable audience preview and atomic inbox delivery."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_notification_repository import (
    CommercialNotificationRepository,
)
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountUserMembership,
    CustomerNotificationDispatch,
    PortalNotification,
    Principal,
    ServiceAuditEvent,
)
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import (
    CommercialConflictError,
    CommercialNotFoundError,
    CommercialPermissionError,
    CommercialValidationError,
)
from app.domain.commercial.identity import _normalize_principal_email
from app.domain.commercial.notifications import build_commercial_notification_id

MAX_ACCOUNTS = 1000
LINKS = {"", "/portal", "/portal/account", "/portal/billing", "/portal/usage", "/portal/support"}


def _conflict(message: str) -> CommercialConflictError:
    return CommercialConflictError("service.notification_conflict", message)


def _lock(session: Session, dispatch_id: str) -> None:
    if session.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(
            hashlib.sha256(f"customer-notification:{dispatch_id}".encode()).digest()[:8],
            "big",
            signed=True,
        )
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def _recipient(session: Session, account_id: str, *, lock: bool = False) -> dict[str, Any]:
    query = select(Account).where(Account.account_id == account_id)
    account = session.scalar(query.with_for_update() if lock else query)
    row: dict[str, Any] = {
        "account_id": account_id,
        "account_name": account.name if account else account_id,
        "principal_id": "",
        "email": "",
        "status": "skipped",
        "reason": "account_inactive",
    }
    if account is None or account.status != "active":
        return row
    query_members = (
        select(AccountUserMembership)
        .where(
            AccountUserMembership.account_id == account_id,
            AccountUserMembership.status == "active",
            AccountUserMembership.role == "owner",
        )
        .order_by(AccountUserMembership.membership_id)
    )
    owners = list(session.scalars(query_members.with_for_update() if lock else query_members))
    if len(owners) != 1:
        return {**row, "reason": "owner_ambiguous"}
    principal_query = select(Principal).where(Principal.principal_id == owners[0].principal_id)
    principal = session.scalar(principal_query.with_for_update() if lock else principal_query)
    if principal is None or principal.status != "active":
        return {**row, "reason": "recipient_inactive"}
    try:
        email = _normalize_principal_email(str(principal.email or ""))
    except CommercialPermissionError:
        return {**row, "reason": "recipient_email_invalid"}
    return {
        **row,
        "principal_id": principal.principal_id,
        "email": email,
        "status": "ready",
        "reason": "",
    }


def _audit(
    session: Session,
    row: CustomerNotificationDispatch,
    context: ServiceAuditContext,
    event_kind: str,
) -> None:
    session.add(
        ServiceAuditEvent(
            event_kind=event_kind,
            outcome="succeeded",
            scope_kind="customer_notification",
            scope_id=row.dispatch_id,
            actor_kind=context.actor_kind,
            actor_ref=context.actor_ref,
            method=context.method,
            path=context.path,
            trace_id=context.trace_id,
            idempotency_key=context.idempotency_key,
            payload_json={
                "dispatch_id": row.dispatch_id,
                "audience": row.audience,
                "target_count": len(row.recipients_json),
                "status": row.status,
            },
        )
    )


def _iso(value: datetime) -> str:
    return (value.replace(tzinfo=UTC) if value.tzinfo is None else value).isoformat()


def _serialize(
    session: Session, row: CustomerNotificationDispatch, *, detail: bool = True
) -> dict[str, Any]:
    recipients = [dict(item) for item in row.recipients_json]
    sent_ids = [item["notification_id"] for item in recipients if item["status"] == "sent"]
    read_ids = (
        set(
            session.scalars(
                select(PortalNotification.notification_id).where(
                    PortalNotification.notification_id.in_(sent_ids),
                    PortalNotification.is_read.is_(True),
                )
            )
        )
        if sent_ids
        else set()
    )
    for item in recipients:
        item["is_read"] = item.get("notification_id") in read_ids
    result = {
        "dispatch_id": row.dispatch_id,
        "status": row.status,
        "audience": row.audience,
        "title": row.title,
        "body": row.body,
        "link_href": row.link_href,
        "actor_kind": row.actor_kind,
        "actor_ref": row.actor_ref,
        "created_at": _iso(row.created_at),
        "sent_at": _iso(row.sent_at) if row.sent_at else None,
        "target_count": len(recipients),
        "ready_count": sum(item["status"] == "ready" for item in recipients),
        "sent_count": len(sent_ids),
        "read_count": len(read_ids),
        "skipped_count": sum(item["status"] == "skipped" for item in recipients),
        # Delivery is all-or-nothing; transaction errors are never reported as sent.
        "failed_count": 0,
    }
    if detail:
        result["recipients"] = recipients
    return result


def preview_notice(
    database_url: str,
    *,
    dispatch_id: str,
    title: str,
    body: str,
    link_href: str,
    audience: str,
    account_ids: list[str],
    context: ServiceAuditContext,
) -> dict[str, Any]:
    title, body, link_href = title.strip(), body.strip(), link_href.strip()
    ids = sorted(set(account_ids))
    if (
        not 1 <= len(title) <= 255
        or not 1 <= len(body) <= 4000
        or link_href not in LINKS
        or audience not in {"selected", "all"}
        or (audience == "selected" and not 1 <= len(ids) <= MAX_ACCOUNTS)
        or (audience == "all" and ids)
    ):
        raise CommercialValidationError("service.notification_invalid", "Invalid service notice.")
    digest = hashlib.sha256(
        json.dumps(
            [title, body, link_href, audience, ids],
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    with get_session(database_url) as session:
        _lock(session, dispatch_id)
        existing = session.get(CustomerNotificationDispatch, dispatch_id)
        if existing:
            if (
                existing.digest != digest
                or existing.actor_kind != context.actor_kind
                or existing.actor_ref != context.actor_ref
            ):
                raise _conflict("This notice identifier belongs to another intent or operator.")
            return _serialize(session, existing)
        if audience == "all":
            ids = list(
                session.scalars(
                    select(Account.account_id)
                    .where(
                        Account.status == "active",
                    )
                    .order_by(Account.account_id)
                    .limit(MAX_ACCOUNTS + 1)
                )
            )
            if len(ids) > MAX_ACCOUNTS:
                raise CommercialValidationError(
                    "service.notification_audience_limit",
                    "Audience exceeds 1000 accounts; narrow it.",
                )
        recipients = [_recipient(session, account_id) for account_id in ids]
        row = CustomerNotificationDispatch(
            dispatch_id=dispatch_id,
            digest=digest,
            title=title,
            body=body,
            link_href=link_href,
            audience=audience,
            actor_kind=context.actor_kind,
            actor_ref=context.actor_ref,
            status="preview",
            recipients_json=recipients,
            created_at=datetime.now(UTC),
        )
        session.add(row)
        session.flush()
        _audit(session, row, context, "customer_notification.previewed")
        session.commit()
        return _serialize(session, row)


def send_notice(
    database_url: str, *, dispatch_id: str, context: ServiceAuditContext
) -> dict[str, Any]:
    with get_session(database_url) as session:
        _lock(session, dispatch_id)
        row = session.get(CustomerNotificationDispatch, dispatch_id)
        if row is None:
            raise CommercialNotFoundError("service.notification_not_found", "Notice not found.")
        if row.actor_kind != context.actor_kind or row.actor_ref != context.actor_ref:
            raise CommercialPermissionError(
                "service.notification_operator_mismatch",
                "Only the previewing operator can send.",
            )
        if row.status == "sent":
            return _serialize(session, row)
        created = (
            row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at
        )
        if datetime.now(UTC) - created > timedelta(minutes=30):
            raise CommercialConflictError(
                "service.notification_preview_expired",
                "Preview expired. Create a new preview before sending.",
            )
        ids = sorted(
            item["account_id"] for item in row.recipients_json if item["status"] == "ready"
        )
        if ids:
            list(
                session.scalars(
                    select(Account)
                    .where(Account.account_id.in_(ids))
                    .order_by(Account.account_id)
                    .with_for_update()
                )
            )
            memberships = list(
                session.scalars(
                    select(AccountUserMembership)
                    .where(AccountUserMembership.account_id.in_(ids))
                    .order_by(AccountUserMembership.account_id, AccountUserMembership.membership_id)
                    .with_for_update()
                )
            )
            principal_ids = sorted({membership.principal_id for membership in memberships})
            list(
                session.scalars(
                    select(Principal)
                    .where(Principal.principal_id.in_(principal_ids))
                    .order_by(Principal.principal_id)
                    .with_for_update()
                )
            )
        recipients = []
        for original in row.recipients_json:
            item = dict(original)
            if item["status"] == "ready":
                current = _recipient(session, item["account_id"])
                if (
                    current["status"] != "ready"
                    or current["principal_id"] != item["principal_id"]
                    or current["email"] != item["email"]
                ):
                    item.update(status="skipped", reason="recipient_changed")
                else:
                    notification_id = build_commercial_notification_id(
                        "pnotif_manual",
                        dispatch_id,
                        item["account_id"],
                        item["principal_id"],
                    )
                    CommercialNotificationRepository(session).create_notification(
                        notification_id=notification_id,
                        account_id=item["account_id"],
                        principal_id=item["principal_id"],
                        event_type="service.manual_notice",
                        title=row.title,
                        body=row.body,
                        link_href=row.link_href or None,
                    )
                    item.update(status="sent", notification_id=notification_id)
            recipients.append(item)
        row.recipients_json = recipients
        row.status, row.sent_at = "sent", datetime.now(UTC)
        _audit(session, row, context, "customer_notification.sent")
        session.commit()
        return _serialize(session, row)


def get_notice(database_url: str, dispatch_id: str) -> dict[str, Any]:
    with get_session(database_url) as session:
        row = session.get(CustomerNotificationDispatch, dispatch_id)
        if row is None:
            raise CommercialNotFoundError("service.notification_not_found", "Notice not found.")
        return _serialize(session, row)


def list_notices(database_url: str, *, limit: int, offset: int) -> dict[str, Any]:
    with get_session(database_url) as session:
        rows = session.scalars(
            select(CustomerNotificationDispatch)
            .order_by(
                CustomerNotificationDispatch.created_at.desc(),
                CustomerNotificationDispatch.dispatch_id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        return {
            "items": [_serialize(session, row, detail=False) for row in rows],
            "total_count": session.scalar(
                select(func.count()).select_from(
                    CustomerNotificationDispatch,
                )
            )
            or 0,
            "limit": limit,
            "offset": offset,
        }
