"""Real transaction serialization checks in the disposable Postgres lane."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event, get_ident

import pytest
from sqlalchemy import func, select

from app.core.db import get_session, init_schema
from app.core.models import (
    Account,
    PortalNotification,
    ServiceAuditEvent,
    SupportRequest,
    SupportRequestMessage,
)
from app.domain.commercial.errors import CommercialConflictError
from app.domain.commercial.mixins import _support_mixin
from app.domain.commercial.service import CommercialService
from tests.domain.test_admin_support_operations import context, send
from tests.integration.test_portal_postgres_acceptance import (  # noqa: F401
    m4_database_url,
    portal_database,
)


@pytest.mark.parametrize("case", ["same", "payload", "target", "action"])
def test_support_writers_wait_for_durable_predecessor(request, monkeypatch, case):
    url = request.getfixturevalue("portal_database")
    init_schema(url)
    with get_session(url) as session:
        session.add(Account(account_id="acct_reply", name="Synthetic"))
        session.flush()
        for target in ["sr_reply", "sr_other"]:
            session.add(
                SupportRequest(
                    request_id=target,
                    account_id="acct_reply",
                    email="test@example.invalid",
                    title="Synthetic",
                    description="Test",
                )
            )
        session.commit()
    service = CommercialService(url)
    locked, waiting, read, release = Event(), Event(), Event(), Event()
    holder_id = []
    original = _support_mixin.lock_support_write

    def hold(session, target, ctx):
        first = get_ident() == holder_id[0]
        if not first:
            waiting.set()
        row = original(session, target, ctx)
        if first:
            locked.set()
            assert release.wait(10)
        else:
            read.set()
        return row

    monkeypatch.setattr(_support_mixin, "lock_support_write", hold)

    def first():
        holder_id.append(get_ident())
        return send(service)

    def second():
        if case == "action":
            return service.update_admin_support_request(
                request_id="sr_reply",
                status="resolved",
                audit_context=context("status", key="another-action"),
            )
        if case == "target":
            return service.create_admin_support_request_message(
                request_id="sr_other",
                body="Original intended reply",
                audit_context=context(target="sr_other"),
            )
        return send(
            service, body="Changed payload" if case == "payload" else "Original intended reply"
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(first)
        assert locked.wait(10)
        b = pool.submit(second)
        try:
            assert waiting.wait(10)
            assert not read.wait(0.2), "follower read before predecessor committed"
        finally:
            release.set()
        first_result = a.result(10)
        if case in ["payload", "target"]:
            with pytest.raises(CommercialConflictError):
                b.result(10)
        else:
            second_result = b.result(10)
            if case == "same":
                assert (
                    first_result["message"]["message_id"] == second_result["message"]["message_id"]
                )
    with get_session(url) as session:
        assert session.scalar(select(func.count()).select_from(SupportRequestMessage)) == 1
        assert session.scalar(select(func.count()).select_from(PortalNotification)) == 1
        assert session.scalar(select(func.count()).select_from(ServiceAuditEvent)) == (
            2 if case == "action" else 1
        )
        if case == "action":
            assert session.get(SupportRequest, "sr_reply").status == "resolved"
