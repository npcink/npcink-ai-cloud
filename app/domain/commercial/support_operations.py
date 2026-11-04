"""Bounded Admin support write receipts; no writes occur in confirmation reads."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.models import ServiceAuditEvent, SupportRequest
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import CommercialConflictError

EVENTS = {
    "message": ("POST", "/messages", "support_request.message_created"),
    "attachment": ("POST", "/attachments", "support_request.attachment_created"),
    "status": ("PATCH", "", "support_request.updated"),
}


def operation_digest(action: str, values: dict[str, object]) -> str:
    encoded = json.dumps(
        {"action": action, "values": values},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def lock_support_write(
    session: Session, request_id: str, context: ServiceAuditContext | None
) -> SupportRequest | None:
    # One connection/transaction, always actor-key first, then the ticket row.
    # Fixed namespace plus a signed 64-bit hash; collisions only serialize more.
    if context and context.idempotency_key and session.get_bind().dialect.name == "postgresql":
        scope = json.dumps(
            [
                "npcink.admin.support.v1",
                context.actor_kind,
                context.actor_ref,
                context.idempotency_key,
            ],
            separators=(",", ":"),
        )
        key = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], "big", signed=True)
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    return session.scalar(
        select(SupportRequest).where(SupportRequest.request_id == request_id).with_for_update()
    )


def find_support_events(session: Session, context: ServiceAuditContext) -> list[ServiceAuditEvent]:
    # Do not filter by target/action here: reusing a key for another ticket or
    # action by this actor must conflict, never match another target's success.
    return list(
        session.scalars(
            select(ServiceAuditEvent)
            .where(
                ServiceAuditEvent.actor_kind == context.actor_kind,
                ServiceAuditEvent.actor_ref == context.actor_ref,
                ServiceAuditEvent.idempotency_key == context.idempotency_key,
                ServiceAuditEvent.scope_kind == "support_request",
                ServiceAuditEvent.outcome == "succeeded",
            )
            .limit(2)
        )
    )


def matching_support_event(
    event: ServiceAuditEvent,
    *,
    request_id: str,
    action: str,
    digest: str,
    context: ServiceAuditContext,
) -> bool:
    method, suffix, kind = EVENTS[action]
    payload = event.payload_json or {}
    return (
        event.method == method
        and event.path == f"/internal/service/admin/support-requests/{request_id}{suffix}"
        and event.scope_id == request_id
        and event.event_kind == kind
        and payload.get("request_id") == request_id
        and payload.get("operation_digest") == digest
        and context.actor_kind == event.actor_kind
        and context.actor_ref == event.actor_ref
    )


def replay_event(
    session: Session,
    *,
    request_id: str,
    action: str,
    digest: str,
    context: ServiceAuditContext | None,
) -> ServiceAuditEvent | None:
    if not context or not context.idempotency_key:
        return None
    method, suffix, _ = EVENTS[action]
    if (
        context.method.upper() != method
        or context.path != f"/internal/service/admin/support-requests/{request_id}{suffix}"
    ):
        raise support_operation_conflict()
    events = find_support_events(session, context)
    if not events:
        return None
    if len(events) != 1 or not matching_support_event(
        events[0], request_id=request_id, action=action, digest=digest, context=context
    ):
        raise support_operation_conflict()
    return events[0]


def support_operation_conflict() -> CommercialConflictError:
    return CommercialConflictError(
        "service.support_operation_conflict",
        "The support operation cannot be replayed with this intent.",
    )


def support_receipt(event: ServiceAuditEvent, action: str) -> dict[str, Any]:
    payload = event.payload_json or {}
    return {
        "operation_id": event.idempotency_key,
        "request_id": event.scope_id,
        "action": action,
        "digest": payload.get("operation_digest"),
        "actor_kind": event.actor_kind,
        "actor_ref": event.actor_ref,
        "method": event.method,
        "path": event.path,
        "event_kind": event.event_kind,
        "event_id": event.id,
        "created_at": event.created_at.isoformat(),
        "message_id": payload.get("message_id"),
        "attachment_id": payload.get("attachment_id"),
    }
