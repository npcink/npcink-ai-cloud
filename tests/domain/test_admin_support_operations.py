"""Synthetic durable support intent checks; no SMTP, provider or live records."""

from __future__ import annotations

import base64
from dataclasses import replace

import pytest
from sqlalchemy import event, select

from app.core.db import get_engine, get_session
from app.core.models import ServiceAuditEvent, SupportRequest, SupportRequestMessage
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import CommercialConflictError
from app.domain.commercial.service import CommercialService
from tests.domain.test_portal_support_notification_transaction import (  # noqa: F401
    _counts,
)
from tests.domain.test_portal_support_notification_transaction import (
    support_db as _support_db,
)


@pytest.fixture
def support_db(tmp_path):
    yield from _support_db.__wrapped__(tmp_path)


def context(action="message", key="support-intent", target="sr_reply", actor="admin_test"):
    suffix = {"message": "/messages", "attachment": "/attachments", "status": ""}[action]
    return ServiceAuditContext(
        trace_id="synthetic",
        idempotency_key=key,
        method="PATCH" if action == "status" else "POST",
        path=f"/internal/service/admin/support-requests/{target}{suffix}",
        actor_kind="platform_admin",
        actor_ref=actor,
    )


def send(service, ctx=None, **changes):
    return service.create_admin_support_request_message(
        request_id="sr_reply",
        body=changes.get("body", "Original intended reply"),
        visibility=changes.get("visibility", "public"),
        audit_context=ctx or context(),
    )


def confirm(service, receipt, ctx=None):
    return service.confirm_admin_support_operation(
        request_id="sr_reply",
        operation_id=receipt["operation_id"],
        action=receipt["action"],
        digest=receipt["digest"],
        audit_context=ctx or context(),
    )


@pytest.mark.parametrize("visibility", ["public", "internal"])
def test_same_actor_key_replays_one_durable_message_notification_and_audit(support_db, visibility):
    service = CommercialService(support_db)
    first = send(service, visibility=visibility)
    again = send(service, visibility=visibility)
    assert again["replayed"] is True
    assert first["message"] == again["message"]
    assert _counts(support_db) == (1, 1, int(visibility == "public"))
    assert confirm(service, first["operation_receipt"])["state"] == "confirmed"


@pytest.mark.parametrize("change", [{"body": "Different text"}, {"visibility": "internal"}])
def test_same_key_different_payload_conflicts(support_db, change):
    service = CommercialService(support_db)
    send(service)
    with pytest.raises(CommercialConflictError):
        send(service, **change)
    assert _counts(support_db) == (1, 1, 1)


def test_actor_action_path_and_target_are_bound(support_db):
    service = CommercialService(support_db)
    first = send(service)
    assert (
        confirm(service, first["operation_receipt"], context(actor="other"))["state"]
        == "unconfirmed"
    )
    with pytest.raises(CommercialConflictError):
        service.update_admin_support_request(
            request_id="sr_reply", status="closed", audit_context=context("status")
        )
    with pytest.raises(CommercialConflictError):
        send(
            service,
            replace(context(), path="/internal/service/admin/support-requests/other/messages"),
        )
    second = send(service, context(actor="other"))
    assert first["message"]["message_id"] != second["message"]["message_id"]


def test_confirmation_is_select_only_and_missing_or_changed_children_never_confirm(support_db):
    service = CommercialService(support_db)
    first = send(service)
    statements = []

    def capture(conn, cursor, statement, parameters, ctx, many):
        statements.append(statement)

    engine = get_engine(support_db)
    event.listen(engine, "before_cursor_execute", capture)
    try:
        assert confirm(service, first["operation_receipt"])["state"] == "confirmed"
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert statements and all(s.lstrip().upper().startswith("SELECT") for s in statements)
    with get_session(support_db) as session:
        message = session.get(SupportRequestMessage, first["message"]["message_id"])
        message.body = "Tampered body"
        session.commit()
    assert confirm(service, first["operation_receipt"])["state"] == "unconfirmed"
    with pytest.raises(CommercialConflictError):
        send(service)


def test_ambiguous_success_audit_does_not_confirm_or_replay(support_db):
    service = CommercialService(support_db)
    first = send(service)
    with get_session(support_db) as session:
        row = session.scalar(select(ServiceAuditEvent))
        values = {
            column.name: getattr(row, column.name)
            for column in ServiceAuditEvent.__table__.columns
            if column.name != "id"
        }
        session.add(ServiceAuditEvent(**values))
        session.commit()
    assert confirm(service, first["operation_receipt"])["state"] == "unconfirmed"
    with pytest.raises(CommercialConflictError):
        send(service)


def test_status_history_is_confirmed_without_reverting_a_later_change(support_db):
    service = CommercialService(support_db)
    first = service.update_admin_support_request(
        request_id="sr_reply",
        status="resolved",
        admin_note="Recorded once",
        audit_context=context("status"),
    )
    service.update_admin_support_request(
        request_id="sr_reply",
        status="open",
        audit_context=context("status", key="later", actor="other"),
    )
    with get_session(support_db) as session:
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.id == first["operation_receipt"]["event_id"]
            )
        )
        assert "Recorded once" not in str(audit.payload_json)
    receipt = first["operation_receipt"]
    result = confirm(service, receipt)
    assert result["state"] == "confirmed"
    assert result["result"]["request"]["status"] == "open"
    replay = service.update_admin_support_request(
        request_id="sr_reply",
        status="resolved",
        admin_note="Recorded once",
        audit_context=context("status"),
    )
    assert replay["status"] == "open"
    assert _counts(support_db) == (1, 2, 0)


def test_attachment_content_and_metadata_bound_to_one_success(support_db):
    service = CommercialService(support_db)
    values = dict(
        request_id="sr_reply",
        filename="proof.txt",
        content_type="text/plain",
        content_base64=base64.b64encode(b"proof").decode(),
        visibility="internal",
        audit_context=context("attachment"),
    )
    first = service.create_admin_support_request_attachment(**values)
    again = service.create_admin_support_request_attachment(**values)
    assert again["attachment"]["attachment_id"] == first["attachment"]["attachment_id"]
    assert confirm(service, first["operation_receipt"])["state"] == "confirmed"
    for field, value in [
        ("content_base64", "b3RoZXI="),
        ("filename", "other.txt"),
        ("visibility", "public"),
        ("content_type", "text/csv"),
    ]:
        with pytest.raises(CommercialConflictError):
            service.create_admin_support_request_attachment(**{**values, field: value})


def test_cross_ticket_same_actor_key_conflicts_and_legacy_calls_remain_supported(support_db):
    service = CommercialService(support_db)
    send(service)
    with get_session(support_db) as session:
        session.add(
            SupportRequest(
                request_id="sr_other",
                account_id="acct_reply",
                title="Other",
                email="",
                description="Synthetic",
            )
        )
        session.commit()
    with pytest.raises(CommercialConflictError):
        service.create_admin_support_request_message(
            request_id="sr_other",
            body="Original intended reply",
            audit_context=context(target="sr_other"),
        )
    result = service.create_admin_support_request_message(
        request_id="sr_other", body="Legacy internal call", visibility="internal"
    )
    assert result["message"]["request_id"] == "sr_other"
    assert "operation_receipt" not in result


def test_attachment_five_mb_boundary_and_linked_message_visibility(support_db):
    service = CommercialService(support_db)
    message = send(service)["message"]
    values = dict(
        request_id="sr_reply",
        filename="five-mb.txt",
        content_type="text/plain",
        visibility="public",
        content_base64=base64.b64encode(b"x" * (5 * 1024 * 1024)).decode(),
        message_id=message["message_id"],
        audit_context=context("attachment", key="large-proof"),
    )
    first = service.create_admin_support_request_attachment(**values)
    assert first["attachment"]["byte_size"] == 5 * 1024 * 1024
    assert confirm(service, first["operation_receipt"])["state"] == "confirmed"
    from app.domain.commercial.errors import CommercialNotFoundError, CommercialValidationError

    with pytest.raises(CommercialNotFoundError):
        service.create_admin_support_request_attachment(
            **{
                **values,
                "visibility": "internal",
                "audit_context": context("attachment", key="bad-link"),
            }
        )
    with pytest.raises(CommercialValidationError) as error:
        service.create_admin_support_request_attachment(
            **{**values, "content_base64": base64.b64encode(b"x" * (5 * 1024 * 1024 + 1)).decode()}
        )
    assert error.value.error_code == "service.support_request_attachment_too_large"


def test_note_only_status_intent_replays_without_duplicate_message(support_db):
    service = CommercialService(support_db)
    values = dict(
        request_id="sr_reply", admin_note="Synthetic status note", audit_context=context("status")
    )
    first = service.update_admin_support_request(**values)
    assert confirm(service, first["operation_receipt"])["state"] == "confirmed"
    again = service.update_admin_support_request(**values)
    assert again["status"] == "open"
    assert _counts(support_db) == (1, 1, 0)
