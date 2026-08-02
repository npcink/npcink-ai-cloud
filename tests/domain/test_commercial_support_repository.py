from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_support_repository import (
    CommercialSupportRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Principal, Site


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'commercial-support-repository.db'}"


def _seed_support_owners(session: Session) -> None:
    session.add_all(
        [
            Account(account_id="acct_support", name="Support", status="active"),
            Site(
                site_id="site_support",
                account_id="acct_support",
                name="Support Site",
            ),
            Principal(
                principal_id="prn_support",
                email="support@example.com",
                status="active",
            ),
        ]
    )
    session.flush()


def test_support_write_characterization_preserves_activity_and_visibility_state(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    created_at = datetime(2026, 8, 3, 1, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        _seed_support_owners(session)
        repository = CommercialSupportRepository(session)
        facade = CommercialRepository(session)
        request = repository.create_support_request(
            request_id="sr_write",
            account_id="acct_support",
            site_id="site_support",
            principal_id="prn_support",
            email="support@example.com",
            topic="technical",
            title="Write characterization",
            description="Preserve current mutation semantics.",
            status="open",
            priority="normal",
            source_path="/portal/support",
            context_json={"source": "test"},
            activity_at=created_at,
        )
        assert repository.get_support_request("sr_write") is request
        assert facade.get_support_request("sr_write") is request
        assert request.last_customer_activity_at == created_at
        assert request.waiting_on == "operator"
        assert request.waiting_since == created_at

        customer_at = created_at + timedelta(minutes=1)
        customer_message = repository.create_support_request_message(
            message_id="srm_customer",
            request=request,
            author_kind="customer",
            visibility="public",
            body="Customer reply",
            principal_id="prn_support",
            email="support@example.com",
            activity_at=customer_at,
        )
        assert repository.get_support_request_message("srm_customer") is customer_message
        assert request.updated_at == customer_at
        assert request.last_customer_activity_at == customer_at
        assert request.waiting_on == "operator"
        assert request.waiting_since == customer_at

        operator_at = created_at + timedelta(minutes=2)
        repository.create_support_request_message(
            message_id="srm_operator",
            request=request,
            author_kind="operator",
            visibility="public",
            body="Operator reply",
            activity_at=operator_at,
        )
        assert request.first_operator_response_at == operator_at
        assert request.last_operator_public_activity_at == operator_at
        assert request.waiting_on == "customer"
        assert request.waiting_since == operator_at

        internal_at = created_at + timedelta(minutes=3)
        repository.create_support_request_message(
            message_id="srm_internal",
            request=request,
            author_kind="operator",
            visibility="internal",
            body="Internal note",
            activity_at=internal_at,
        )
        assert request.updated_at == internal_at
        assert request.waiting_on == "customer"
        assert request.waiting_since == operator_at

        customer_attachment_at = created_at + timedelta(minutes=4)
        customer_attachment = repository.create_support_request_attachment(
            attachment_id="sra_customer",
            request=request,
            uploader_kind="customer",
            visibility="public",
            filename="customer.txt",
            content_type="text/plain",
            content_bytes=b"customer",
            principal_id="prn_support",
            email="support@example.com",
            activity_at=customer_attachment_at,
        )
        assert customer_attachment.byte_size == 8
        assert request.last_customer_activity_at == customer_attachment_at
        assert request.waiting_on == "operator"
        assert request.waiting_since == customer_attachment_at

        operator_attachment_at = created_at + timedelta(minutes=5)
        repository.create_support_request_attachment(
            attachment_id="sra_operator",
            request=request,
            uploader_kind="operator",
            visibility="public",
            filename="operator.txt",
            content_type="text/plain",
            content_bytes=b"operator",
            activity_at=operator_attachment_at,
        )
        assert request.first_operator_response_at == operator_at
        assert request.last_operator_public_activity_at == operator_attachment_at
        assert request.waiting_on == "customer"
        assert request.waiting_since == operator_attachment_at
        assert repository.count_support_request_attachments(request_id="sr_write") == 2

    dispose_engine(database_url)


def test_support_write_characterization_preserves_feedback_upsert_and_state_helpers(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    created_at = datetime(2026, 8, 3, 2, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        _seed_support_owners(session)
        repository = CommercialSupportRepository(session)
        facade = CommercialRepository(session)
        request = repository.create_support_request(
            request_id="sr_feedback",
            account_id="acct_support",
            site_id="site_support",
            principal_id="prn_support",
            email="support@example.com",
            topic="general",
            title="Feedback characterization",
            description="Preserve feedback upsert behavior.",
            status="resolved",
            priority="normal",
            source_path="/portal/support",
            activity_at=created_at,
        )
        first = repository.upsert_support_request_feedback(
            feedback_id="srf_first",
            request=request,
            principal_id="prn_support",
            email="first@example.com",
            resolved=True,
            rating=5,
            comment="Resolved",
            metadata_json={"revision": 1},
            activity_at=created_at + timedelta(minutes=1),
        )
        second = repository.upsert_support_request_feedback(
            feedback_id="srf_ignored",
            request=request,
            principal_id="prn_support",
            email="second@example.com",
            resolved=False,
            rating=2,
            comment="Still open",
            metadata_json={"revision": 2},
            activity_at=created_at + timedelta(minutes=2),
        )
        assert second is first
        assert second.feedback_id == "srf_first"
        assert second.email == "second@example.com"
        assert second.resolved is False
        assert second.rating == 2
        assert second.comment == "Still open"
        assert second.metadata_json == {"revision": 2}
        assert request.updated_at == created_at + timedelta(minutes=2)
        assert facade.get_support_request_feedback("sr_feedback") is second

        repository.mark_support_request_complete(request)
        assert request.waiting_on == "none"
        assert request.waiting_since is None

        customer_at = created_at + timedelta(minutes=3)
        repository.mark_support_request_waiting_for_operator(
            request,
            activity_at=customer_at,
        )
        assert request.last_customer_activity_at == customer_at
        assert request.waiting_on == "operator"
        assert request.waiting_since == customer_at

        request.last_operator_public_activity_at = customer_at + timedelta(minutes=1)
        repository.restore_support_request_waiting_state(request)
        assert request.waiting_on == "customer"
        assert request.waiting_since == customer_at + timedelta(minutes=1)

        request.last_customer_activity_at = customer_at + timedelta(minutes=2)
        repository.restore_support_request_waiting_state(request)
        assert request.waiting_on == "operator"
        assert request.waiting_since == customer_at + timedelta(minutes=2)

    dispose_engine(database_url)
