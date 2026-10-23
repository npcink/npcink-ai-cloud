from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_STATUS_CLOSED,
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    PRINCIPAL_STATUS_ACTIVE,
    SITE_API_KEY_STATUS_ACTIVE,
    SITE_API_KEY_STATUS_REVOKED,
    SITE_STATUS_ACTIVE,
    Account,
    AccountUserMembership,
    Principal,
    PrincipalSiteBinding,
    Site,
    SiteAccountBinding,
    SiteApiKey,
)
from app.core.services import CloudServices
from app.domain.commercial.identity import resolve_principal_allowed_actions
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_portal_bearer_headers,
)

PRINCIPAL_ID = "prn_portal_deletion"
ACCOUNT_ID = "acct_portal_deletion"
SITE_ID = "site_portal_deletion"


@pytest.fixture
def portal_client(tmp_path: Path) -> Iterator[tuple[str, TestClient]]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'portal-deletion.sqlite3'}"
    init_schema(database_url)
    settings = Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Portal Deletion Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        debug_local_origin_allowlist="http://testserver",
    )
    with get_session(database_url) as session:
        session.add(
            Account(
                account_id=ACCOUNT_ID,
                name="Portal Deletion Account",
                status=ACCOUNT_STATUS_ACTIVE,
                metadata_json={"plan": "plus"},
            )
        )
        session.add(
            Site(
                site_id=SITE_ID,
                account_id=ACCOUNT_ID,
                name="Portal Deletion Site",
                status=SITE_STATUS_ACTIVE,
                site_url="https://deletion.example.com",
                metadata_json={},
            )
        )
        session.add(
            Principal(
                principal_id=PRINCIPAL_ID,
                email="portal-deletion@example.com",
                status=PRINCIPAL_STATUS_ACTIVE,
                session_version=1,
                metadata_json={},
            )
        )
        session.add(
            AccountUserMembership(
                membership_id="mem_portal_deletion",
                principal_id=PRINCIPAL_ID,
                account_id=ACCOUNT_ID,
                role="owner",
                status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                allowed_actions_json=list(resolve_principal_allowed_actions()),
                metadata_json={},
            )
        )
        session.add(
            PrincipalSiteBinding(
                binding_id="psb_portal_deletion",
                principal_id=PRINCIPAL_ID,
                site_id=SITE_ID,
                account_id=ACCOUNT_ID,
                status="active",
                bound_at=datetime.now(UTC),
                metadata_json={"source": "test"},
            )
        )
        session.add(
            SiteAccountBinding(
                binding_id="sab_portal_deletion",
                site_id=SITE_ID,
                account_id=ACCOUNT_ID,
                status="active",
                bound_at=datetime.now(UTC),
                metadata_json={"source": "test"},
            )
        )
        session.add(
            SiteApiKey(
                key_id="sakey_portal_deletion",
                site_id=SITE_ID,
                secret_hash="hash-alpha",
                label="primary",
                scopes_json=["read"],
                metadata_json={"origin": "test"},
                status=SITE_API_KEY_STATUS_ACTIVE,
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        )
        session.commit()

    try:
        with TestClient(create_app(CloudServices(settings=settings))) as client:
            client.headers.update(
                {
                    "origin": "http://testserver",
                    "referer": "http://testserver/portal",
                }
            )
            yield database_url, client
    finally:
        dispose_engine(database_url)


def _headers(*, idempotency_key: str) -> dict[str, str]:
    return build_portal_bearer_headers(
        principal_id=PRINCIPAL_ID,
        session_version=1,
        site_id=SITE_ID,
        idempotency_key=idempotency_key,
    )


def _dev_code_headers(*, idempotency_key: str) -> dict[str, str]:
    headers = _headers(idempotency_key=idempotency_key)
    headers["x-npcink-dev-login-code"] = "1"
    return headers


def test_account_deletion_closes_the_account_and_revokes_every_binding(
    portal_client: tuple[str, TestClient],
) -> None:
    database_url, client = portal_client

    requested = client.post(
        "/portal/v1/account/deletion/request",
        json={"locale": "en"},
        headers=_dev_code_headers(idempotency_key="deletion-request-001"),
    )

    assert requested.status_code == 200
    request_data = requested.json()["data"]
    assert request_data["email"] == "portal-deletion@example.com"
    assert request_data["delivery"] == "development_code"
    code = str(request_data["code"])
    assert code.isdigit()

    confirmed = client.post(
        "/portal/v1/account/deletion/confirm",
        json={"code": code},
        headers=_headers(idempotency_key="deletion-confirm-001"),
    )

    assert confirmed.status_code == 200
    deletion = confirmed.json()["data"]["account_deletion"]
    assert deletion["closed_accounts"] == 1
    assert deletion["revoked_memberships"] == 1
    assert deletion["released_site_bindings"] == 1
    assert deletion["revoked_api_keys"] == 1

    with get_session(database_url) as session:
        account = session.get(Account, ACCOUNT_ID)
        assert account is not None
        assert account.status == ACCOUNT_STATUS_CLOSED
        assert account.metadata_json["closed_reason"] == "principal_self_service_deletion"
        assert account.metadata_json["closed_at"]
        assert account.metadata_json["plan"] == "plus"

        membership = session.scalar(
            select(AccountUserMembership).where(
                AccountUserMembership.membership_id == "mem_portal_deletion"
            )
        )
        assert membership is not None
        assert membership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED

        principal_binding = session.scalar(
            select(PrincipalSiteBinding).where(
                PrincipalSiteBinding.binding_id == "psb_portal_deletion"
            )
        )
        assert principal_binding is not None
        assert principal_binding.status == "released"
        assert principal_binding.released_at is not None

        site_binding = session.scalar(
            select(SiteAccountBinding).where(SiteAccountBinding.binding_id == "sab_portal_deletion")
        )
        assert site_binding is not None
        assert site_binding.status == "released"
        assert site_binding.released_at is not None

        api_key = session.get(SiteApiKey, "sakey_portal_deletion")
        assert api_key is not None
        assert api_key.status == SITE_API_KEY_STATUS_REVOKED
        assert api_key.revoked_at is not None
        assert api_key.metadata_json["revoke_reason"] == "account_closed"
        assert api_key.metadata_json["origin"] == "test"


def test_account_deletion_rejects_an_invalid_code(
    portal_client: tuple[str, TestClient],
) -> None:
    database_url, client = portal_client

    requested = client.post(
        "/portal/v1/account/deletion/request",
        json={"locale": "en"},
        headers=_dev_code_headers(idempotency_key="deletion-request-002"),
    )
    assert requested.status_code == 200

    confirmed = client.post(
        "/portal/v1/account/deletion/confirm",
        json={"code": "000000" if requested.json()["data"]["code"] != "000000" else "000001"},
        headers=_headers(idempotency_key="deletion-confirm-002"),
    )

    assert confirmed.status_code == 401
    assert confirmed.json()["error_code"] == "auth.account_deletion_code_invalid"

    with get_session(database_url) as session:
        account = session.get(Account, ACCOUNT_ID)
        assert account is not None
        assert account.status == ACCOUNT_STATUS_ACTIVE


def _service(database_url: str):
    from app.domain.commercial.service import CommercialService

    return CommercialService(database_url)


def test_closure_disables_identity_and_blocks_old_and_new_login(portal_client):
    from app.core.models import IdentityProviderBinding, PortalLoginCode
    from app.core.security import build_secret_hash
    from app.domain.commercial.errors import CommercialPermissionError
    from app.domain.commercial.mixins._portal_mixin import _hash_external_identity

    database_url, client = portal_client
    service = _service(database_url)
    login = service.issue_portal_login_code(email="portal-deletion@example.com", ttl_seconds=600)
    # A pre-existing registration challenge cannot re-enable this identity either.
    with get_session(database_url) as session:
        session.add(
            PortalLoginCode(
                code_id="registration-before-close",
                principal_id=PRINCIPAL_ID,
                email="portal-deletion@example.com",
                code_hash=build_secret_hash("123456"),
                purpose="portal_registration",
                expires_at=datetime.now(UTC) + timedelta(minutes=10),
                metadata_json={"purpose": "portal_registration"},
            )
        )
        session.add(
            IdentityProviderBinding(
                binding_id="qq-before-close",
                principal_id=PRINCIPAL_ID,
                provider="qq",
                external_subject_hash=_hash_external_identity("qq", "qq-closure-subject"),
                status="active",
                metadata_json={},
            )
        )
        session.commit()
    issued = service.issue_portal_account_deletion_code(principal_id=PRINCIPAL_ID, ttl_seconds=600)
    response = client.post(
        "/portal/v1/account/deletion/confirm",
        json={"code": issued["code"]},
        headers=_headers(idempotency_key="close-disable"),
    )
    assert response.status_code == 200
    assert "deleted" not in response.json()["message"]
    with get_session(database_url) as session:
        identity = session.get(Principal, PRINCIPAL_ID)
        assert identity.status == "disabled"
        assert identity.session_version == 2
        assert identity.email == "portal-deletion@example.com"
        assert identity.metadata_json["closed_reason"] == "self_service_closure"
        assert session.get(IdentityProviderBinding, "qq-before-close").status == "active"
    assert (
        client.get(
            "/portal/v1/session", headers=_headers(idempotency_key="old-session")
        ).status_code
        == 401
    )
    for operation in [
        lambda: service.issue_portal_login_code(
            email="portal-deletion@example.com", ttl_seconds=600
        ),
        lambda: service.verify_portal_login_code(
            email="portal-deletion@example.com", code=login["code"], max_attempts=5
        ),
        lambda: service.issue_portal_registration_code(
            email="portal-deletion@example.com", ttl_seconds=600
        ),
        lambda: service.verify_portal_registration_code(
            email="portal-deletion@example.com", code="123456", max_attempts=5
        ),
        lambda: service.resolve_portal_identity_provider_login(
            provider="qq", external_subject="qq-closure-subject"
        ),
        lambda: service.register_portal_identity_provider_login(
            provider="qq", external_subject="qq-closure-subject"
        ),
    ]:
        with pytest.raises(CommercialPermissionError):
            operation()


@pytest.mark.parametrize("change", ["permission", "shared", "multi", "foreign_site"])
def test_closure_rechecks_scope_after_issuing_code(portal_client, change):
    from app.domain.commercial.errors import CommercialPermissionError

    database_url, _ = portal_client
    service = _service(database_url)
    issued = service.issue_portal_account_deletion_code(principal_id=PRINCIPAL_ID, ttl_seconds=600)
    with get_session(database_url) as session:
        if change == "permission":
            session.get(AccountUserMembership, "mem_portal_deletion").allowed_actions_json = [
                "view_usage"
            ]
        else:
            session.add(
                Principal(principal_id="prn_other", email="other@example.com", status="active")
            )
            session.flush()
            if change == "shared":
                session.add(
                    AccountUserMembership(
                        membership_id="other-owner",
                        account_id=ACCOUNT_ID,
                        principal_id="prn_other",
                        role="owner",
                        status="active",
                        allowed_actions_json=[],
                    )
                )
            elif change == "multi":
                session.add(Account(account_id="acct_other", name="Other", status="active"))
                session.flush()
                session.add(
                    AccountUserMembership(
                        membership_id="other-account",
                        account_id="acct_other",
                        principal_id=PRINCIPAL_ID,
                        role="owner",
                        status="active",
                        allowed_actions_json=[],
                    )
                )
            else:
                session.get(PrincipalSiteBinding, "psb_portal_deletion").principal_id = "prn_other"
        session.commit()
    with pytest.raises(CommercialPermissionError, match="exclusively owned"):
        service.verify_and_execute_portal_account_deletion(
            principal_id=PRINCIPAL_ID, code=issued["code"], max_attempts=5
        )
    with get_session(database_url) as session:
        assert session.get(Account, ACCOUNT_ID).status == "active"
        assert session.get(Principal, PRINCIPAL_ID).status == "active"
        assert session.get(SiteApiKey, "sakey_portal_deletion").status == "active"
        from app.core.models import PortalLoginCode

        challenge = session.scalar(
            select(PortalLoginCode).where(PortalLoginCode.purpose == "account_deletion")
        )
        assert challenge.status == "pending"


@pytest.mark.parametrize(
    "kind", ["paid_subscription", "trial", "scheduled", "pending_payment", "paid", "refund"]
)
def test_closure_rejects_unresolved_commerce_without_writing_commerce(portal_client, kind):
    from app.core.models import AccountSubscription, PaymentOrder, PaymentRefund
    from app.domain.commercial.errors import CommercialPermissionError

    database_url, _ = portal_client
    with get_session(database_url) as session:
        if kind in {"paid_subscription", "trial", "scheduled"}:
            session.add(
                AccountSubscription(
                    subscription_id="sub_closure",
                    account_id=ACCOUNT_ID,
                    plan_id="plus" if kind != "scheduled" else "free",
                    plan_version_id="fixture_v1",
                    status="trialing" if kind == "trial" else "active",
                    scheduled_plan_id="plus" if kind == "scheduled" else None,
                )
            )
        else:
            session.add(
                PaymentOrder(
                    order_id="payment_closure",
                    account_id=ACCOUNT_ID,
                    plan_id="plus",
                    plan_version_id="fixture_v1",
                    provider="alipay",
                    external_order_no="closure",
                    status="refunded"
                    if kind == "refund"
                    else "paid"
                    if kind == "paid"
                    else "pending",
                    amount=15,
                    currency="CNY",
                    subject="test",
                )
            )
            session.flush()
            if kind == "refund":
                session.add(
                    PaymentRefund(
                        refund_id="refund_closure",
                        order_id="payment_closure",
                        account_id=ACCOUNT_ID,
                        provider="alipay",
                        external_refund_no="closure",
                        status="unknown",
                        amount=15,
                        currency="CNY",
                        reason="test",
                        requested_at=datetime.now(UTC),
                    )
                )
        session.commit()
    with pytest.raises(CommercialPermissionError, match="unresolved commercial"):
        _service(database_url).issue_portal_account_deletion_code(
            principal_id=PRINCIPAL_ID, ttl_seconds=600
        )
    with get_session(database_url) as session:
        assert session.get(Account, ACCOUNT_ID).status == "active"
        assert session.get(Principal, PRINCIPAL_ID).status == "active"
        if kind == "refund":
            assert session.get(PaymentRefund, "refund_closure").status == "unknown"


def test_closure_works_without_sites_and_retains_free_subscription(portal_client):
    from app.core.models import AccountSubscription

    database_url, _ = portal_client
    with get_session(database_url) as session:
        for model, key in [
            (SiteApiKey, "sakey_portal_deletion"),
            (PrincipalSiteBinding, "psb_portal_deletion"),
            (SiteAccountBinding, "sab_portal_deletion"),
            (Site, SITE_ID),
        ]:
            session.delete(session.get(model, key))
            session.flush()
        session.add(
            AccountSubscription(
                subscription_id="sub_free",
                account_id=ACCOUNT_ID,
                plan_id="free",
                plan_version_id="free_v1",
                status="active",
            )
        )
        session.commit()
    service = _service(database_url)
    issued = service.issue_portal_account_deletion_code(principal_id=PRINCIPAL_ID, ttl_seconds=600)
    result = service.verify_and_execute_portal_account_deletion(
        principal_id=PRINCIPAL_ID, code=issued["code"], max_attempts=5
    )
    assert result["closed_accounts"] == 1
    assert result["revoked_api_keys"] == 0
    with get_session(database_url) as session:
        assert session.get(AccountSubscription, "sub_free").status == "active"
        assert session.get(SiteApiKey, "sakey_portal_deletion") is None
        assert session.get(Principal, PRINCIPAL_ID).status == "disabled"


@pytest.mark.parametrize("path", ["request", "confirm"])
def test_closure_rejects_anonymous_and_cross_origin(portal_client, path):
    _, client = portal_client
    payload = {"locale": "en"} if path == "request" else {"code": "123456"}
    assert client.post(f"/portal/v1/account/deletion/{path}", json=payload).status_code == 401
    headers = {**_headers(idempotency_key=f"csrf-{path}"), "origin": "https://foreign.example"}
    assert (
        client.post(
            f"/portal/v1/account/deletion/{path}", json=payload, headers=headers
        ).status_code
        == 403
    )


@pytest.mark.parametrize("failure", ["expired", "attempt_limit", "account_swap"])
def test_closure_code_scope_expiry_and_attempt_limit(portal_client, failure):
    from app.core.models import PortalLoginCode
    from app.domain.commercial.errors import CommercialPermissionError

    database_url, _ = portal_client
    service = _service(database_url)
    issued = service.issue_portal_account_deletion_code(principal_id=PRINCIPAL_ID, ttl_seconds=600)
    with get_session(database_url) as session:
        challenge = session.scalar(
            select(PortalLoginCode).where(PortalLoginCode.purpose == "account_deletion")
        )
        if failure == "expired":
            challenge.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        elif failure == "account_swap":
            challenge.metadata_json = {**challenge.metadata_json, "account_id": "acct_other"}
        session.commit()
    if failure == "attempt_limit":
        wrong = "111111" if issued["code"] != "111111" else "222222"
        with pytest.raises(CommercialPermissionError):
            service.verify_and_execute_portal_account_deletion(
                principal_id=PRINCIPAL_ID, code=wrong, max_attempts=1
            )
    with pytest.raises(CommercialPermissionError):
        service.verify_and_execute_portal_account_deletion(
            principal_id=PRINCIPAL_ID, code=issued["code"], max_attempts=1
        )
    with get_session(database_url) as session:
        assert session.get(Principal, PRINCIPAL_ID).status == "active"
        assert session.get(Account, ACCOUNT_ID).status == "active"
        if failure == "attempt_limit":
            challenge = session.scalar(
                select(PortalLoginCode).where(PortalLoginCode.purpose == "account_deletion")
            )
            assert challenge.status == "locked" and challenge.attempt_count == 1


def test_closure_commit_failure_rolls_back_identity_and_resources(portal_client, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session

    database_url, _ = portal_client
    service = _service(database_url)
    issued = service.issue_portal_account_deletion_code(principal_id=PRINCIPAL_ID, ttl_seconds=600)

    def fail(self):
        self.flush()
        raise SQLAlchemyError("injected closure commit failure")

    monkeypatch.setattr(Session, "commit", fail)
    with pytest.raises(SQLAlchemyError):
        service.verify_and_execute_portal_account_deletion(
            principal_id=PRINCIPAL_ID, code=issued["code"], max_attempts=5
        )
    with get_session(database_url) as session:
        assert session.get(Principal, PRINCIPAL_ID).status == "active"
        assert session.get(Principal, PRINCIPAL_ID).session_version == 1
        assert session.get(Account, ACCOUNT_ID).status == "active"
        assert session.get(AccountUserMembership, "mem_portal_deletion").status == "active"
        assert session.get(SiteApiKey, "sakey_portal_deletion").status == "active"
        assert session.get(SiteAccountBinding, "sab_portal_deletion").released_at is None


@pytest.mark.parametrize("delivery_failure", [False, True])
def test_closure_request_uses_dedicated_mail_and_never_returns_code(
    portal_client, delivery_failure, caplog,
):
    from types import SimpleNamespace

    from app.adapters.notifications.base import PortalEmailDeliveryError
    from app.core.models import PortalLoginCode
    from app.core.security import verify_secret_hash

    database_url, client = portal_client
    sent = []

    def send_closure(**payload):
        sent.append(payload)
        if delivery_failure:
            raise PortalEmailDeliveryError("Account closure email unavailable")

    def reject_login(**payload):
        pytest.fail("Account closure must not use login email")

    client.app.state.services.portal_email_sender = SimpleNamespace(
        send_account_deletion_code=send_closure,
        send_login_code=reject_login,
    )
    response = client.post(
        "/portal/v1/account/deletion/request",
        json={"locale": "en"},
        headers=_headers(idempotency_key="closure-dedicated-email"),
    )
    assert len(sent) == 1
    payload = sent[0]
    assert payload["recipient_email"] == "portal-deletion@example.com"
    assert payload["principal_id"] == PRINCIPAL_ID
    assert payload["locale"] == "en"
    assert payload["code"] not in response.text
    assert payload["code"] not in caplog.text
    if delivery_failure:
        assert response.status_code == 502
        assert response.json()["error_code"] == "portal.email_delivery_failed"
    else:
        assert response.status_code == 200
        assert response.json()["data"]["delivery"] == "email"
        assert response.json()["data"]["code"] == ""
    with get_session(database_url) as session:
        stored = session.scalar(select(PortalLoginCode))
        assert stored.purpose == "account_deletion"
        assert stored.code_hash != payload["code"]
        assert verify_secret_hash(payload["code"], stored.code_hash)
        assert session.get(Principal, PRINCIPAL_ID).status == PRINCIPAL_STATUS_ACTIVE
        assert session.get(Account, ACCOUNT_ID).status == ACCOUNT_STATUS_ACTIVE
