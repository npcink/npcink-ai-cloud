"""Optional row-lock regression in the integrator's disposable PostgreSQL schema."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event, get_ident

import pytest

from app.adapters.repositories.commercial_account_site_repository import (
    CommercialAccountSiteRepository,
)
from app.core.db import get_session, init_schema
from app.core.models import Account
from app.domain.commercial.service import CommercialService
from tests.integration.test_portal_postgres_acceptance import (  # noqa: F401
    m4_database_url,
    portal_database,
)


@pytest.mark.parametrize("first", ["profile", "suspend"])
def test_operator_profile_and_suspend_serialize_on_the_account_row(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch, first: str
) -> None:
    database_url = request.getfixturevalue("portal_database")
    init_schema(database_url)
    service = CommercialService(database_url)
    service.upsert_account(
        account_id="acct_row_lock", name="Canonical", metadata_json={"source": "test"}
    )
    locked = Event()
    second_started = Event()
    second_read = Event()
    release = Event()
    first_thread: list[int] = []
    original = CommercialAccountSiteRepository.get_account_for_update

    def hold_first(repository: CommercialAccountSiteRepository, account_id: str) -> Account | None:
        if first_thread and get_ident() != first_thread[0]:
            second_started.set()
        account = original(repository, account_id)
        if get_ident() == first_thread[0]:
            locked.set()
            assert release.wait(10), "first writer was not released"
        else:
            second_read.set()
        return account

    monkeypatch.setattr(CommercialAccountSiteRepository, "get_account_for_update", hold_first)

    def write(kind: str, *, holder: bool = False) -> None:
        if holder:
            first_thread.append(get_ident())
        if kind == "profile":
            service.update_account_operator_profile(
                "acct_row_lock", fields={"operator_display_name": "Alias", "operator_note": "keep"}
            )
        else:
            service.set_account_status("acct_row_lock", status="suspended", reason="hold")

    with ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(write, first, holder=True)
        assert locked.wait(10)
        follower = pool.submit(write, "suspend" if first == "profile" else "profile")
        try:
            assert second_started.wait(10)
            assert not second_read.wait(0.2), "second writer read stale metadata without waiting"
        finally:
            release.set()
        holder.result(timeout=10)
        follower.result(timeout=10)
    with get_session(database_url) as session:
        account = session.get(Account, "acct_row_lock")
        assert account is not None
        assert account.name == "Canonical" and account.status == "suspended"
        assert account.metadata_json["source"] == "test"
        assert account.metadata_json["operator_note"] == "keep"
        assert account.metadata_json["operator_display_name"] == "Alias"
        assert account.metadata_json["account_status_note"] == "hold"
        assert account.metadata_json["account_status_updated_at"]
