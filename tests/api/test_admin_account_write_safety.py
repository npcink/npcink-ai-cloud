from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.db import dispose_engine, get_session
from app.core.models import Account, CreditLedgerEntry, ServiceAuditEvent
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers, seed_site_auth


def test_operator_profile_preserves_newer_suspension_and_metadata(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    account_id = "acct_operator_profile"
    created = client.post(
        "/internal/service/accounts",
        json={
            "account_id": account_id,
            "name": "Original customer",
            "metadata": {"source": "fixture", "operator_note": "old note"},
        },
        headers=build_internal_headers(idempotency_key="profile-create"),
    )
    assert created.status_code == 200
    stale = created.json()["data"]
    suspended = client.post(
        f"/internal/service/admin/accounts/{account_id}/suspend",
        json={"reason": "concurrent billing hold"},
        headers=build_internal_headers(idempotency_key="profile-concurrent-suspend"),
    )
    assert suspended.status_code == 200
    current = suspended.json()["data"]
    with get_session(database_url) as session:
        account = session.get(Account, account_id)
        assert account is not None
        account.name = "New canonical name"
        account.metadata_json = {**account.metadata_json, "newer_marker": "keep"}
        session.commit()
    assert stale["status"] == "active"
    updated = client.patch(
        f"/internal/service/admin/accounts/{account_id}/operator-profile",
        json={"operator_display_name": "  Operator alias  ", "operator_note": "  new note  "},
        headers=build_internal_headers(idempotency_key="profile-save-after-suspend"),
    )
    assert updated.status_code == 200
    result = updated.json()["data"]
    assert result["name"] == "New canonical name"
    assert result["status"] == "suspended"
    assert result["metadata"] == {
        **current["metadata"],
        "newer_marker": "keep",
        "operator_display_name": "Operator alias",
        "operator_note": "new note",
    }
    # Partial fields preserve an existing alias; explicit blank clears just that field.
    for index, fields in enumerate(({"operator_note": "next note"}, {"operator_note": " "})):
        response = client.patch(
            f"/internal/service/admin/accounts/{account_id}/operator-profile",
            json=fields,
            headers=build_internal_headers(idempotency_key=f"profile-partial-{index}"),
        )
        assert response.status_code == 200
        metadata = response.json()["data"]["metadata"]
        assert metadata["operator_display_name"] == "Operator alias"
        assert metadata["account_status_note"] == "concurrent billing hold"
    assert "operator_note" not in metadata
    with get_session(database_url) as session:
        persisted = session.get(Account, account_id)
        assert persisted is not None and persisted.status == "suspended"
        assert persisted.metadata_json == metadata
    dispose_engine(database_url)


def test_suspend_then_restore_preserve_previously_saved_operator_fields(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_order", "name": "Canonical"},
        headers=build_internal_headers(idempotency_key="reverse-create"),
    )
    profile = client.patch(
        "/internal/service/admin/accounts/acct_order/operator-profile",
        json={"operator_note": "saved first", "operator_display_name": "Alias"},
        headers=build_internal_headers(idempotency_key="reverse-profile"),
    )
    assert profile.status_code == 200
    for action in ("suspend", "restore"):
        result = client.post(
            f"/internal/service/admin/accounts/acct_order/{action}",
            json={"reason": "hold"},
            headers=build_internal_headers(idempotency_key=f"reverse-{action}"),
        )
        assert result.status_code == 200
        assert result.json()["data"]["metadata"]["operator_note"] == "saved first"
        assert result.json()["data"]["metadata"]["operator_display_name"] == "Alias"
    assert result.json()["data"]["status"] == "active"
    dispose_engine(database_url)


def test_operator_profile_rejects_full_object_and_missing_or_unauthorized_accounts(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    endpoint = "/internal/service/admin/accounts/absent/operator-profile"
    assert client.patch(endpoint, json={"operator_note": "x"}).status_code == 401
    assert (
        client.patch(
            endpoint,
            json={"operator_note": "x"},
            headers=build_internal_headers(idempotency_key="profile-missing"),
        ).status_code
        == 404
    )
    assert (
        client.patch(
            endpoint,
            json={"name": "stale", "status": "active", "metadata": {}},
            headers=build_internal_headers(idempotency_key="profile-forbidden-fields"),
        ).status_code
        == 422
    )
    dispose_engine(database_url)


@pytest.mark.parametrize(("event_type", "delta"), [("grant", 250), ("adjustment", -250)])
def test_credit_adjustment_confirmation_is_exact_read_only_and_replay_safe(
    tmp_path: Path,
    event_type: str,
    delta: int,
) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    seed_site_auth(
        database_url, site_id="credit_safety", budgets={"max_ai_credits_per_period": 500}
    )
    account_id = "acct_credit_safety"
    endpoint = f"/internal/service/admin/accounts/{account_id}/credit-ledger/adjustments"
    operation_id = "credit-safety-operation"
    confirmation = f"{endpoint}/{operation_id}"
    assert client.get(confirmation).status_code == 401
    before = client.get(confirmation, headers=build_internal_headers())
    assert before.status_code == 200
    assert before.json()["data"]["state"] == "unconfirmed"
    assert before.json()["data"]["entry"] is None
    body = {
        "event_type": event_type,
        "ai_credit_delta": delta,
        "reason": "correction",
        "note": "one intent",
    }
    applied = client.post(
        endpoint,
        json=body,
        headers=build_internal_headers(idempotency_key=operation_id),
    )
    assert applied.status_code == 200
    entry = applied.json()["data"]["entry"]
    # The UI may lose this response; repeated GETs identify the durable entry,
    # without reposting or relying on the current balance/first ledger page.
    for _ in range(3):
        result = client.get(confirmation, headers=build_internal_headers())
        assert result.status_code == 200
        assert result.json()["data"] == {
            "account_id": account_id,
            "operation_id": operation_id,
            "state": "applied",
            "entry": entry,
        }
    replay = client.post(
        endpoint,
        json=body,
        headers=build_internal_headers(idempotency_key=operation_id),
    )
    assert replay.status_code == 409
    assert replay.json()["error_code"] == "auth.replay_blocked"
    assert (
        client.get(confirmation, headers=build_internal_headers()).json()["data"]["entry"] == entry
    )
    # Authenticated caller identity is also part of the confirmation boundary.
    from app.domain.commercial.audit_context import ServiceAuditContext
    from app.domain.commercial.service import CommercialService

    mismatch = CommercialService(database_url).get_admin_account_credit_adjustment(
        account_id,
        operation_id=operation_id,
        audit_context=ServiceAuditContext(
            trace_id="test",
            idempotency_key="",
            method="GET",
            path=confirmation,
            actor_kind="platform_admin",
            actor_ref="another-admin",
        ),
    )
    assert mismatch["state"] == "unconfirmed" and mismatch["entry"] is None
    # Same key on another account must not expose or confirm this account's entry.
    client.post(
        "/internal/service/accounts",
        json={"account_id": "acct_other", "name": "Other"},
        headers=build_internal_headers(idempotency_key="credit-other-create"),
    )
    other = client.get(
        f"/internal/service/admin/accounts/acct_other/credit-ledger/adjustments/{operation_id}",
        headers=build_internal_headers(),
    )
    assert other.json()["data"]["state"] == "unconfirmed"
    with get_session(database_url) as session:
        entries = list(
            session.scalars(
                select(CreditLedgerEntry).where(
                    CreditLedgerEntry.source_type == "operator_credit_adjustment",
                )
            )
        )
        assert len(entries) == 1
        assert entries[0].ai_credit_delta == delta
        audits = list(
            session.scalars(
                select(ServiceAuditEvent).where(
                    ServiceAuditEvent.event_kind == "credit_ledger.adjustment",
                    ServiceAuditEvent.outcome == "succeeded",
                )
            )
        )
        assert len(audits) == 1
    dispose_engine(database_url)


def test_credit_business_rejection_has_no_successful_confirmation(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path, providers={})
    seed_site_auth(database_url, site_id="credit_rejected")
    endpoint = "/internal/service/admin/accounts/acct_credit_rejected/credit-ledger/adjustments"
    result = client.post(
        endpoint,
        json={"event_type": "grant", "ai_credit_delta": -1, "reason": "invalid grant"},
        headers=build_internal_headers(idempotency_key="credit-rejected"),
    )
    assert result.status_code == 400
    confirmed = client.get(f"{endpoint}/credit-rejected", headers=build_internal_headers())
    assert confirmed.json()["data"]["state"] == "unconfirmed"
    dispose_engine(database_url)
