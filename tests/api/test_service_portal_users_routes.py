from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.adapters.repositories.commercial_identity_repository import (
    CommercialIdentityRepository,
)
from app.core.db import dispose_engine, get_session
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
    PRINCIPAL_STATUS_DISABLED,
    SUBSCRIPTION_STATUS_ACTIVE,
    AccountSubscription,
    AccountUserMembership,
    IdentityProviderBinding,
    Principal,
    Site,
)
from tests.api.service_routes_test_support import (
    _build_client,
)
from tests.conftest import (
    TEST_PORTAL_JWT_SECRET,
    build_internal_headers,
)


def _request_portal_registration_code(
    client: TestClient,
    *,
    email: str,
) -> dict[str, object]:
    response = client.post(
        "/portal/v1/register/code/request",
        json={"email": email},
        headers={
            "origin": "http://testserver",
            "referer": "http://testserver/",
            "x-npcink-debug-portal-link": "1",
            "x-npcink-dev-login-code": "1",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _verify_portal_registration_code(
    client: TestClient,
    *,
    email: str,
    code: str,
) -> dict[str, object]:
    response = client.post(
        "/portal/v1/register/verify",
        json={"email": email, "code": code},
        headers={
            "origin": "http://testserver",
            "referer": "http://testserver/",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_admin_portal_users_lists_self_registered_users_and_disables_access(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "portal_jwt_secret": TEST_PORTAL_JWT_SECRET,
            "portal_login_code_ttl_seconds": 300,
            "debug_local_origin_allowlist": "http://testserver",
        },
    )

    email = "admin-portal-user@example.com"
    request_data = _request_portal_registration_code(
        client,
        email=email,
    )
    registration_data = _verify_portal_registration_code(
        client,
        email=email,
        code=str(request_data["code"]),
    )
    assert registration_data["email"] == email
    with get_session(database_url) as session:
        principal = session.scalar(select(Principal).where(Principal.email == email))
        assert principal is not None
        principal_id = principal.principal_id

    list_response = client.get(
        "/internal/service/admin/portal-users?q=admin-portal-user",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200, list_response.text
    list_data = list_response.json()["data"]
    items = list_data["items"]
    assert list_data["total"] == 1
    assert list_data["pagination"] == {
        "offset": 0,
        "limit": 100,
        "total": 1,
        "has_more": False,
    }
    assert items[0]["principal_id"] == principal_id
    assert items[0]["email"] == email
    assert items[0]["source"] == "portal_self_registration"
    assert items[0]["package_alias"] == ""
    assert items[0]["plan_id"] == ""
    assert items[0]["qq_bound"] is False
    assert items[0]["site_id"] == ""

    principal_lookup_response = client.get(
        f"/internal/service/admin/portal-users?q={principal_id}",
        headers=build_internal_headers(),
    )
    assert principal_lookup_response.status_code == 200, principal_lookup_response.text
    principal_lookup_items = principal_lookup_response.json()["data"]["items"]
    assert len(principal_lookup_items) == 1
    assert principal_lookup_items[0]["principal_id"] == principal_id

    empty_page_response = client.get(
        "/internal/service/admin/portal-users?q=admin-portal-user&offset=1&limit=1",
        headers=build_internal_headers(),
    )
    assert empty_page_response.status_code == 200, empty_page_response.text
    empty_page = empty_page_response.json()["data"]
    assert empty_page["items"] == []
    assert empty_page["pagination"] == {
        "offset": 1,
        "limit": 1,
        "total": 1,
        "has_more": False,
    }

    oversized_reason_response = client.post(
        f"/internal/service/admin/portal-users/{principal_id}/disable",
        json={"reason": "x" * 501},
        headers=build_internal_headers(
            idempotency_key="admin-portal-user-disable-oversized-reason"
        ),
    )
    assert oversized_reason_response.status_code == 422

    blank_reason_response = client.post(
        f"/internal/service/admin/portal-users/{principal_id}/disable",
        json={"reason": "   "},
        headers=build_internal_headers(
            idempotency_key="admin-portal-user-disable-blank-reason"
        ),
    )
    assert blank_reason_response.status_code == 400
    assert (
        blank_reason_response.json()["error_code"]
        == "service.portal_user_disable_reason_required"
    )

    disable_response = client.post(
        f"/internal/service/admin/portal-users/{principal_id}/disable",
        json={"reason": "operator test disable"},
        headers=build_internal_headers(idempotency_key="admin-portal-user-disable-001"),
    )
    assert disable_response.status_code == 200, disable_response.text
    disable_data = disable_response.json()["data"]
    assert disable_data["status"] == PRINCIPAL_STATUS_DISABLED
    assert disable_data["outcome"] == "disabled"
    assert disable_data["revoked_account_memberships"] == 1
    disabled_session_version = disable_data["session_version"]

    repeated_disable_response = client.post(
        f"/internal/service/admin/portal-users/{principal_id}/disable",
        json={"reason": "confirm access remains disabled"},
        headers=build_internal_headers(
            idempotency_key="admin-portal-user-disable-002"
        ),
    )
    assert repeated_disable_response.status_code == 200, repeated_disable_response.text
    repeated_disable_data = repeated_disable_response.json()["data"]
    assert repeated_disable_data["outcome"] == "already_disabled"
    assert repeated_disable_data["session_version"] == disabled_session_version
    assert repeated_disable_data["revoked_account_memberships"] == 0
    assert repeated_disable_data["revoked_identity_provider_bindings"] == 0

    revoked_session_response = client.get("/portal/v1/session")
    assert revoked_session_response.status_code == 401
    assert revoked_session_response.json()["error_code"] == "auth.portal_session_revoked"

    audit_response = client.get(
        f"/internal/service/admin/portal-users/{principal_id}/audit",
        headers=build_internal_headers(),
    )
    assert audit_response.status_code == 200, audit_response.text
    audit_data = audit_response.json()["data"]
    assert audit_data["principal"]["principal_id"] == principal_id
    assert audit_data["principal"]["email"] == email
    assert audit_data["summary"]["registration_events"] == 1
    assert audit_data["summary"]["disable_events"] == 3
    assert audit_data["summary"]["failed"] == 1
    assert (
        audit_data["summary"]["latest_disable_reason"]
        == "confirm access remains disabled"
    )
    assert audit_data["summary"]["latest_disable_revoked_account_memberships"] == 0
    event_kinds = {item["event_kind"] for item in audit_data["items"]}
    assert "portal.registration" in event_kinds
    assert "portal_user.disable" in event_kinds

    disabled_list_response = client.get(
        "/internal/service/admin/portal-users?status=disabled&q=admin-portal-user",
        headers=build_internal_headers(),
    )
    assert disabled_list_response.status_code == 200, disabled_list_response.text
    disabled_item = disabled_list_response.json()["data"]["items"][0]
    assert disabled_item["status"] == PRINCIPAL_STATUS_DISABLED
    assert disabled_item["membership_status"] == ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED

    with get_session(database_url) as session:
        identity = session.scalar(select(Principal).where(Principal.principal_id == principal_id))
        assert identity is not None
        assert identity.status == PRINCIPAL_STATUS_DISABLED
        assert int(identity.session_version or 0) > 1
        membership = session.scalar(
            select(AccountUserMembership).where(AccountUserMembership.principal_id == principal_id)
        )
        assert membership is not None
        assert membership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED

    dispose_engine(database_url)


def test_admin_portal_users_filters_counts_and_paginates_in_repository(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "portal_jwt_secret": TEST_PORTAL_JWT_SECRET,
            "portal_login_code_ttl_seconds": 300,
            "debug_local_origin_allowlist": "http://testserver",
        },
    )
    seeded: list[tuple[str, str]] = []
    for index, email in enumerate(
        (
            "sql-page-alpha@example.com",
            "sql-page-beta@example.com",
            "sql-page-gamma@example.com",
        )
    ):
        request_data = _request_portal_registration_code(client, email=email)
        registration_data = _verify_portal_registration_code(
            client,
            email=email,
            code=str(request_data["code"]),
        )
        assert registration_data["email"] == email
        with get_session(database_url) as session:
            principal = session.scalar(select(Principal).where(Principal.email == email))
            assert principal is not None
            membership = session.scalar(
                select(AccountUserMembership).where(
                    AccountUserMembership.principal_id == principal.principal_id
                )
            )
            assert membership is not None
            principal.created_at = datetime(2026, 7, 29, 1, index, tzinfo=UTC)
            seeded.append((principal.principal_id, membership.account_id))
            session.commit()

    alpha_principal_id, alpha_account_id = seeded[0]
    with get_session(database_url) as session:
        session.add(
            Site(
                site_id="site_sql_page_alpha",
                account_id=alpha_account_id,
                name="Alpha SQL Site",
                status="active",
                site_url="https://alpha-sql.example.com",
                platform_kind="wordpress",
                metadata_json={"source": "portal_self_registration"},
            )
        )
        session.add(
            AccountSubscription(
                subscription_id="sub_sql_page_alpha",
                account_id=alpha_account_id,
                plan_id="pro",
                plan_version_id="pro-v1",
                status=SUBSCRIPTION_STATUS_ACTIVE,
                metadata_json={"tier_id": "pro", "package_alias": "Pro"},
            )
        )
        session.add(
            IdentityProviderBinding(
                binding_id="idp_sql_page_alpha",
                principal_id=alpha_principal_id,
                provider="qq",
                external_subject_hash="qq-subject-sql-page-alpha",
                unionid_hash=None,
                status=IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
                metadata_json={},
                last_login_at=datetime(2026, 7, 29, 2, 0, tzinfo=UTC),
            )
        )
        session.commit()

    original_list_principals = CommercialIdentityRepository.list_principals
    hydrated_principal_ids: list[list[str]] = []

    def record_page_hydration(
        repository: CommercialIdentityRepository,
        **kwargs: Any,
    ) -> list[Principal]:
        principal_ids = kwargs.get("principal_ids")
        hydrated_principal_ids.append(list(principal_ids) if principal_ids is not None else [])
        return original_list_principals(repository, **kwargs)

    monkeypatch.setattr(
        CommercialIdentityRepository,
        "list_principals",
        record_page_hydration,
    )

    first_page_response = client.get(
        "/internal/service/admin/portal-users?source=all&limit=1",
        headers=build_internal_headers(),
    )
    assert first_page_response.status_code == 200, first_page_response.text
    first_page = first_page_response.json()["data"]
    assert first_page["total"] == 3
    assert first_page["pagination"] == {
        "offset": 0,
        "limit": 1,
        "total": 3,
        "has_more": True,
    }
    assert [item["principal_id"] for item in first_page["items"]] == [seeded[2][0]]
    assert hydrated_principal_ids == [[seeded[2][0]]]

    second_page_response = client.get(
        "/internal/service/admin/portal-users?source=all&limit=1&offset=1",
        headers=build_internal_headers(),
    )
    assert second_page_response.status_code == 200, second_page_response.text
    assert [item["principal_id"] for item in second_page_response.json()["data"]["items"]] == [
        seeded[1][0]
    ]

    site_search = client.get(
        "/internal/service/admin/portal-users?q=alpha-sql.example.com",
        headers=build_internal_headers(),
    ).json()["data"]
    assert site_search["total"] == 1
    assert site_search["items"][0]["principal_id"] == alpha_principal_id

    package_search = client.get(
        "/internal/service/admin/portal-users?package_alias=pro",
        headers=build_internal_headers(),
    ).json()["data"]
    assert package_search["total"] == 1
    assert package_search["items"][0]["package_alias"] == "Pro"

    qq_search = client.get(
        "/internal/service/admin/portal-users?qq_bound=true",
        headers=build_internal_headers(),
    ).json()["data"]
    assert qq_search["total"] == 1
    assert qq_search["items"][0]["principal_id"] == alpha_principal_id
    assert qq_search["summary"]["qq_bound"] == 1

    literal_wildcard_search = client.get(
        "/internal/service/admin/portal-users?q=%25",
        headers=build_internal_headers(),
    ).json()["data"]
    assert literal_wildcard_search["total"] == 0

    dispose_engine(database_url)


def test_admin_portal_users_batch_disable_processes_each_principal(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "portal_jwt_secret": TEST_PORTAL_JWT_SECRET,
            "portal_login_code_ttl_seconds": 300,
            "debug_local_origin_allowlist": "http://testserver",
        },
    )

    principal_ids: list[str] = []
    for email in ("batch-one@example.com", "batch-two@example.com"):
        request_data = _request_portal_registration_code(
            client,
            email=email,
        )
        registration_data = _verify_portal_registration_code(
            client,
            email=email,
            code=str(request_data["code"]),
        )
        assert registration_data["email"] == email
        with get_session(database_url) as session:
            principal = session.scalar(select(Principal).where(Principal.email == email))
            assert principal is not None
            principal_ids.append(principal.principal_id)

    missing_principal_id = "prn_missing_batch_disable"
    blank_reason_response = client.post(
        "/internal/service/admin/portal-users/batch-disable",
        json={"principal_ids": [principal_ids[0]], "reason": ""},
        headers=build_internal_headers(idempotency_key="admin-portal-batch-disable-blank"),
    )
    assert blank_reason_response.status_code == 400
    assert (
        blank_reason_response.json()["error_code"]
        == "service.portal_user_batch_disable_reason_required"
    )

    batch_response = client.post(
        "/internal/service/admin/portal-users/batch-disable",
        json={
            "principal_ids": [*principal_ids, missing_principal_id],
            "reason": "abuse risk review",
        },
        headers=build_internal_headers(idempotency_key="admin-portal-batch-disable-001"),
    )
    assert batch_response.status_code == 200, batch_response.text
    batch_data = batch_response.json()["data"]
    assert batch_data["totals"]["attempted"] == 3
    assert batch_data["totals"]["disabled"] == 2
    assert batch_data["totals"]["failed"] == 1
    failed_items = [item for item in batch_data["items"] if item["outcome"] == "failed"]
    assert failed_items[0]["principal_id"] == missing_principal_id
    assert failed_items[0]["error_code"] == "service.principal_not_found"

    with get_session(database_url) as session:
        identities = list(
            session.scalars(select(Principal).where(Principal.principal_id.in_(principal_ids)))
        )
        assert {identity.status for identity in identities} == {PRINCIPAL_STATUS_DISABLED}
        memberships = list(
            session.scalars(
                select(AccountUserMembership).where(
                    AccountUserMembership.principal_id.in_(principal_ids)
                )
            )
        )
        assert {membership.status for membership in memberships} == {
            ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED
        }

    audit_response = client.get(
        f"/internal/service/admin/portal-users/{principal_ids[0]}/audit",
        headers=build_internal_headers(),
    )
    assert audit_response.status_code == 200, audit_response.text
    audit_data = audit_response.json()["data"]
    assert audit_data["summary"]["disable_events"] == 1
    assert audit_data["summary"]["latest_disable_reason"] == "abuse risk review"

    dispose_engine(database_url)
