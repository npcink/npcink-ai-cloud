from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_support_queries import (
    CommercialSupportQueries,
)
from app.core.models import (
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestFeedback,
    SupportRequestMessage,
)


class CommercialSupportRepository(CommercialSupportQueries):
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_support_request(
        self,
        *,
        request_id: str,
        account_id: str,
        site_id: str | None,
        principal_id: str,
        email: str,
        topic: str,
        title: str,
        description: str,
        status: str,
        priority: str,
        source_path: str,
        admin_note: str | None = None,
        context_json: dict[str, object] | None = None,
        activity_at: datetime | None = None,
    ) -> SupportRequest:
        now = activity_at or datetime.now(UTC)
        request = SupportRequest(
            request_id=request_id,
            account_id=account_id,
            site_id=site_id or None,
            principal_id=principal_id or None,
            email=email,
            topic=topic,
            title=title,
            description=description,
            status=status,
            priority=priority,
            source_path=source_path,
            admin_note=admin_note,
            context_json=context_json,
            last_customer_activity_at=now,
            waiting_on="operator",
            waiting_since=now,
            created_at=now,
            updated_at=now,
        )
        self.session.add(request)
        self.session.flush()
        return request

    def create_support_request_message(
        self,
        *,
        message_id: str,
        request: SupportRequest,
        author_kind: str,
        visibility: str,
        body: str,
        principal_id: str | None = None,
        email: str = "",
        metadata_json: dict[str, object] | None = None,
        activity_at: datetime | None = None,
    ) -> SupportRequestMessage:
        now = activity_at or datetime.now(UTC)
        message = SupportRequestMessage(
            message_id=message_id,
            request_id=str(request.request_id or ""),
            account_id=str(request.account_id or ""),
            site_id=str(request.site_id or "") or None,
            principal_id=str(principal_id or request.principal_id or "") or None,
            email=str(email or request.email or ""),
            author_kind=author_kind,
            visibility=visibility,
            body=body,
            metadata_json=metadata_json,
            created_at=now,
        )
        request.updated_at = now
        if visibility == "public" and author_kind == "customer":
            request.last_customer_activity_at = now
            request.waiting_on = "operator"
            request.waiting_since = now
        elif visibility == "public" and author_kind == "operator":
            if request.first_operator_response_at is None:
                request.first_operator_response_at = now
            request.last_operator_public_activity_at = now
            request.waiting_on = "customer"
            request.waiting_since = now
        self.session.add(message)
        self.session.flush()
        return message

    def create_support_request_attachment(
        self,
        *,
        attachment_id: str,
        request: SupportRequest,
        uploader_kind: str,
        visibility: str,
        filename: str,
        content_type: str,
        content_bytes: bytes,
        message_id: str | None = None,
        principal_id: str | None = None,
        email: str = "",
        metadata_json: dict[str, object] | None = None,
        activity_at: datetime | None = None,
    ) -> SupportRequestAttachment:
        now = activity_at or datetime.now(UTC)
        attachment = SupportRequestAttachment(
            attachment_id=attachment_id,
            request_id=str(request.request_id or ""),
            message_id=str(message_id or "") or None,
            account_id=str(request.account_id or ""),
            site_id=str(request.site_id or "") or None,
            principal_id=str(principal_id or request.principal_id or "") or None,
            email=str(email or request.email or ""),
            uploader_kind=uploader_kind,
            visibility=visibility,
            filename=filename,
            content_type=content_type,
            byte_size=len(content_bytes),
            content_bytes=content_bytes,
            metadata_json=metadata_json,
            created_at=now,
        )
        request.updated_at = now
        if visibility == "public" and uploader_kind == "customer":
            request.last_customer_activity_at = now
            request.waiting_on = "operator"
            request.waiting_since = now
        elif visibility == "public" and uploader_kind == "operator":
            if request.first_operator_response_at is None:
                request.first_operator_response_at = now
            request.last_operator_public_activity_at = now
            request.waiting_on = "customer"
            request.waiting_since = now
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def upsert_support_request_feedback(
        self,
        *,
        feedback_id: str,
        request: SupportRequest,
        principal_id: str,
        email: str,
        resolved: bool,
        rating: int,
        comment: str,
        metadata_json: dict[str, object] | None = None,
        activity_at: datetime | None = None,
    ) -> SupportRequestFeedback:
        now = activity_at or datetime.now(UTC)
        feedback = self.get_support_request_feedback(str(request.request_id or ""))
        if feedback is None:
            feedback = SupportRequestFeedback(
                feedback_id=feedback_id,
                request_id=str(request.request_id or ""),
                account_id=str(request.account_id or ""),
                site_id=str(request.site_id or "") or None,
                principal_id=principal_id,
                email=email,
                resolved=resolved,
                rating=rating,
                comment=comment,
                metadata_json=metadata_json,
            )
            self.session.add(feedback)
        else:
            feedback.principal_id = principal_id
            feedback.email = email
            feedback.resolved = resolved
            feedback.rating = rating
            feedback.comment = comment
            feedback.metadata_json = metadata_json
        request.updated_at = now
        self.session.flush()
        return feedback

    @staticmethod
    def mark_support_request_complete(request: SupportRequest) -> None:
        request.waiting_on = "none"
        request.waiting_since = None

    @staticmethod
    def mark_support_request_waiting_for_operator(
        request: SupportRequest,
        *,
        activity_at: datetime,
    ) -> None:
        request.last_customer_activity_at = activity_at
        request.waiting_on = "operator"
        request.waiting_since = activity_at

    @staticmethod
    def restore_support_request_waiting_state(request: SupportRequest) -> None:
        customer_at = request.last_customer_activity_at
        operator_at = request.last_operator_public_activity_at
        if operator_at is not None and (customer_at is None or operator_at > customer_at):
            request.waiting_on = "customer"
            request.waiting_since = operator_at
            return
        request.waiting_on = "operator"
        request.waiting_since = customer_at or request.created_at
