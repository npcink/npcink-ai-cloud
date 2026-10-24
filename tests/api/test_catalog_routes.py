from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.adapters.notifications.base import PortalEmailDeliveryError, PortalEmailSender
from app.api.main import create_app
from app.api.routes import internal as internal_routes
from app.core.config import Settings
from app.core.db import dispose_engine, init_schema
from app.core.services import CloudServices
from app.domain.catalog.service import CatalogService
from tests.conftest import (
    TEST_INTERNAL_AUTH_TOKEN,
    build_auth_headers,
    build_internal_headers,
    merge_json_headers,
    seed_site_auth,
)

MALICIOUS_EXCEPTION_DETAIL = (
    "Traceback (most recent call last): /srv/private/smtp.py smtp_password=super-secret-token"
)


def _raise_malicious_value_error(*_args: object, **_kwargs: object) -> None:
    raise ValueError(MALICIOUS_EXCEPTION_DETAIL)


def _raise_malicious_email_error(*_args: object, **_kwargs: object) -> None:
    raise PortalEmailDeliveryError(MALICIOUS_EXCEPTION_DETAIL)


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'catalog-api.sqlite3'}"


class FakePortalEmailSender(PortalEmailSender):
    def __init__(self) -> None:
        self.test_messages: list[dict[str, str]] = []

    def send_test_email(
        self,
        *,
        recipient_email: str,
        project_name: str,
        portal_url: str,
    ) -> None:
        self.test_messages.append(
            {
                "recipient_email": recipient_email,
                "project_name": project_name,
                "portal_url": portal_url,
            }
        )

    def send_login_code(
        self,
        *,
        recipient_email: str,
        principal_id: str,
        code: str,
        expires_in_seconds: int,
        project_name: str,
        locale: str = "zh-CN",
    ) -> None:
        return None

    def send_registration_code(
        self,
        *,
        recipient_email: str,
        principal_id: str,
        code: str,
        expires_in_seconds: int,
        project_name: str,
        site_name: str = "",
        site_url: str = "",
        locale: str = "zh-CN",
    ) -> None:
        return None

    def send_email_change_code(
        self,
        *,
        recipient_email: str,
        old_email: str,
        principal_id: str,
        code: str,
        expires_in_seconds: int,
        project_name: str,
        locale: str = "zh-CN",
    ) -> None:
        return None

    def send_email_changed_notice(
        self,
        *,
        recipient_email: str,
        new_email: str,
        principal_id: str,
        project_name: str,
        locale: str = "zh-CN",
    ) -> None:
        return None


def test_catalog_routes_return_seeded_models(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_site_auth(database_url, site_id="site_catalog", scopes=["catalog:read"])

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.get(
        "/v1/catalog/models",
        headers=build_auth_headers(
            "GET",
            "/v1/catalog/models",
            site_id="site_catalog",
            trace_id="tracecatalog0010000000000000000",
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["data"]["total"] == 4
    assert "recommended_sets" in payload["data"]
    assert payload["data"]["platform_models"]["surface"] == "platform_models"
    assert payload["message"] == "platform models loaded"

    dispose_engine(database_url)


def test_catalog_routes_support_recommended_profile_filter(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_site_auth(database_url, site_id="site_catalog", scopes=["catalog:read"])

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.get(
        "/v1/catalog/models",
        params={"recommended_for": "text.balanced"},
        headers=build_auth_headers(
            "GET",
            "/v1/catalog/models",
            site_id="site_catalog",
            trace_id="tracecatalog0020000000000000000",
            query="recommended_for=text.balanced",
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["recommended_for"] == "text.balanced"
    assert payload["data"]["platform_models"]["recommended_for"] == "text.balanced"
    assert payload["data"]["total"] == 1
    assert payload["data"]["items"][0]["model_id"] == "gpt-4.1-mini"
    assert payload["data"]["items"][0]["recommended_rank"] == 1

    dispose_engine(database_url)


def test_catalog_platform_model_alias_routes_match_models_surface(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_site_auth(database_url, site_id="site_catalog", scopes=["catalog:read"])

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    list_response = client.get(
        "/v1/catalog/platform-models",
        headers=build_auth_headers(
            "GET",
            "/v1/catalog/platform-models",
            site_id="site_catalog",
            trace_id="tracecatalogplatform001000000",
        ),
    )
    detail_response = client.get(
        "/v1/catalog/platform-models/gpt-4.1-mini",
        headers=build_auth_headers(
            "GET",
            "/v1/catalog/platform-models/gpt-4.1-mini",
            site_id="site_catalog",
            trace_id="tracecatalogplatform002000000",
        ),
    )
    revision_response = client.get(
        "/v1/catalog/platform-models/revision",
        headers=build_auth_headers(
            "GET",
            "/v1/catalog/platform-models/revision",
            site_id="site_catalog",
            trace_id="tracecatalogplatform003000000",
        ),
    )

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert revision_response.status_code == 200
    assert list_response.json()["message"] == "platform models loaded"
    assert detail_response.json()["message"] == "platform model loaded"
    assert revision_response.json()["message"] == "platform models revision loaded"
    assert list_response.json()["data"]["platform_models"]["surface"] == "platform_models"
    assert detail_response.json()["data"]["platform_model"]["surface"] == "platform_models"

    dispose_engine(database_url)


def test_internal_refresh_rejects_replayed_idempotency_marker(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    body = b'{"providers":["openai"]}'
    headers = merge_json_headers(
        build_internal_headers(
            internal_token=TEST_INTERNAL_AUTH_TOKEN,
            idempotency_key="catalog-refresh-replay-001",
            trace_id="tracecatalogreplay0010000000000",
        )
    )

    first_response = client.post(
        "/internal/catalog/refresh",
        content=body,
        headers=headers,
    )
    second_response = client.post(
        "/internal/catalog/refresh",
        content=body,
        headers=headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["error_code"] == "auth.replay_blocked"

    dispose_engine(database_url)


def test_catalog_routes_require_signed_headers(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.get("/v1/catalog/models")

    assert response.status_code == 401
    assert response.json()["error_code"] == "auth.site_id_required"

    dispose_engine(database_url)


def test_internal_refresh_requires_idempotency_header(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    body = b'{"providers":["openai"]}'
    response = client.post(
        "/internal/catalog/refresh",
        content=body,
        headers=merge_json_headers(
            build_internal_headers(
                internal_token=TEST_INTERNAL_AUTH_TOKEN,
                trace_id="tracecatalog0040000000000000000",
            )
        ),
    )

    assert response.status_code == 401
    assert response.json()["error_code"] == "auth.idempotency_required"

    dispose_engine(database_url)


def test_internal_refresh_rejects_public_runtime_hmac_headers(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(
        database_url,
        site_id="site_catalog",
        scopes=["catalog:refresh", "health:scan"],
    )

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    body = b'{"providers":["openai"]}'
    response = client.post(
        "/internal/catalog/refresh",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/internal/catalog/refresh",
                site_id="site_catalog",
                idempotency_key="catalog-refresh-002",
                trace_id="tracecatalog0050000000000000000",
                body=body,
            )
        ),
    )

    assert response.status_code == 401
    assert response.json()["error_code"] == "auth.internal_token_required"

    dispose_engine(database_url)


def test_internal_refresh_requires_internal_auth_configuration(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="",
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    body = b'{"providers":["openai"]}'
    response = client.post(
        "/internal/catalog/refresh",
        content=body,
        headers=merge_json_headers(
            build_internal_headers(
                internal_token=TEST_INTERNAL_AUTH_TOKEN,
                idempotency_key="catalog-refresh-003",
                trace_id="tracecatalog0060000000000000000",
            )
        ),
    )

    assert response.status_code == 503
    assert response.json()["error_code"] == "auth.internal_not_configured"

    dispose_engine(database_url)


def test_catalog_routes_do_not_accept_internal_token_only(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.get(
        "/v1/catalog/models",
        headers=build_internal_headers(internal_token=TEST_INTERNAL_AUTH_TOKEN),
    )

    assert response.status_code == 401
    assert response.json()["error_code"] == "auth.site_id_required"

    dispose_engine(database_url)


def test_internal_portal_email_test_sends_message(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    fake_sender = FakePortalEmailSender()

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(
        create_app(
            CloudServices(
                settings=settings,
                portal_email_sender=fake_sender,
            )
        )
    )
    public_response = client.patch(
        "/internal/service/admin/service-settings/portal-public",
        json={"public_base_url": "https://cloud.example.com"},
        headers=build_internal_headers(
            internal_token=TEST_INTERNAL_AUTH_TOKEN,
            idempotency_key="portal-email-public-settings-001",
        ),
    )
    assert public_response.status_code == 200, public_response.text

    response = client.post(
        "/internal/portal/email/test",
        json={"recipient_email": "admin@example.com"},
        headers=merge_json_headers(
            build_internal_headers(
                internal_token=TEST_INTERNAL_AUTH_TOKEN,
                idempotency_key="portal-email-test-001",
                trace_id="tracecatalog0070000000000000000",
            )
        ),
    )

    assert response.status_code == 200
    assert response.json()["data"]["recipient_email"] == "admin@example.com"
    assert response.json()["data"]["portal_url"] == "https://cloud.example.com/portal/login"
    assert fake_sender.test_messages == [
        {
            "recipient_email": "admin@example.com",
            "project_name": "Npcink AI Cloud Test",
            "portal_url": "https://cloud.example.com/portal/login",
        }
    ]

    dispose_engine(database_url)


def test_internal_portal_email_test_requires_configured_sender(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)

    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.post(
        "/internal/portal/email/test",
        json={"recipient_email": "admin@example.com"},
        headers=merge_json_headers(
            build_internal_headers(
                internal_token=TEST_INTERNAL_AUTH_TOKEN,
                idempotency_key="portal-email-test-002",
                trace_id="tracecatalog0080000000000000000",
            )
        ),
    )

    assert response.status_code == 503
    assert response.json()["error_code"] == "portal.email_not_configured"

    dispose_engine(database_url)


def test_internal_catalog_errors_do_not_expose_exception_details(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))
    monkeypatch.setattr(
        CatalogService,
        "refresh_catalog",
        _raise_malicious_value_error,
    )
    monkeypatch.setattr(
        CatalogService,
        "scan_provider_health",
        _raise_malicious_value_error,
    )

    for index, path in enumerate(("/internal/catalog/refresh", "/internal/health/providers/scan")):
        response = client.post(
            path,
            json={"providers": ["openai"]},
            headers=build_internal_headers(
                internal_token=TEST_INTERNAL_AUTH_TOKEN,
                idempotency_key=f"catalog-redaction-{index:02d}",
                trace_id=f"tracecatalogredaction{index:02d}0000000",
            ),
        )

        assert response.status_code == 400
        payload = response.json()
        assert payload["error_code"] == "catalog.provider_invalid"
        assert payload["message"] == "catalog provider selection is invalid"
        assert payload["data"] == {"providers": ["openai"]}
        assert "super-secret-token" not in response.text
        assert "Traceback" not in response.text
        assert "/srv/private/smtp.py" not in response.text

    dispose_engine(database_url)


def test_internal_portal_email_failure_does_not_expose_smtp_exception(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    fake_sender = FakePortalEmailSender()
    monkeypatch.setattr(
        fake_sender,
        "send_test_email",
        _raise_malicious_email_error,
    )
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    client = TestClient(
        create_app(
            CloudServices(
                settings=settings,
                portal_email_sender=fake_sender,
            )
        )
    )

    response = client.post(
        "/internal/portal/email/test",
        json={"recipient_email": "admin@example.com"},
        headers=build_internal_headers(
            internal_token=TEST_INTERNAL_AUTH_TOKEN,
            idempotency_key="portal-email-redaction-001",
            trace_id="traceemailredaction001000000000",
        ),
    )

    assert response.status_code == 502
    payload = response.json()
    assert payload["error_code"] == "portal.email_delivery_failed"
    assert payload["message"] == "portal email delivery failed"
    assert payload["data"] == {"recipient_email": "admin@example.com"}
    assert payload["meta"]["revision"] == "m6"
    assert "super-secret-token" not in response.text
    assert "Traceback" not in response.text
    assert "/srv/private/smtp.py" not in response.text

    dispose_engine(database_url)


@pytest.fixture
def internal_body_client(
    tmp_path: Path,
) -> Iterator[tuple[TestClient, FakePortalEmailSender]]:
    # Reuse this module's SQLite setup and fake sender without provisioning
    # accounts, subscriptions, public settings or any provider catalog.
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    sender = FakePortalEmailSender()
    settings = Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    try:
        with TestClient(
            create_app(CloudServices(settings=settings, portal_email_sender=sender))
        ) as client:
            yield client, sender
    finally:
        dispose_engine(database_url)


def _body_contract_headers(auth_mode: str) -> dict[str, str]:
    headers = merge_json_headers(
        build_internal_headers(
            internal_token=TEST_INTERNAL_AUTH_TOKEN,
            idempotency_key="fastapi-body-contract",
        )
    )
    if auth_mode == "missing_token":
        headers.pop("X-Npcink-Internal-Token")
    elif auth_mode == "invalid_token":
        headers["X-Npcink-Internal-Token"] = "invalid-body-contract-token"
    else:
        assert auth_mode == "authorized"
    return headers


@pytest.mark.parametrize("body", [None, "null", "{}"], ids=["omitted", "raw-null", "empty"])
@pytest.mark.parametrize("auth_mode", ["authorized", "missing_token", "invalid_token"])
def test_required_internal_body_rejects_invalid_input_before_authentication(
    internal_body_client: tuple[TestClient, FakePortalEmailSender],
    monkeypatch: MonkeyPatch,
    body: str | None,
    auth_mode: str,
) -> None:
    client, sender = internal_body_client
    authorize = AsyncMock(wraps=internal_routes.authorize_internal_request)
    monkeypatch.setattr(internal_routes, "authorize_internal_request", authorize)
    # None is our test-case marker for not supplying content, never json=None.
    headers = _body_contract_headers(auth_mode)
    if body is None:
        response = client.post("/internal/portal/email/test", headers=headers)
    else:
        response = client.post("/internal/portal/email/test", content=body, headers=headers)

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert errors
    assert all(error["loc"][0] == "body" for error in errors)
    if body == "{}":
        assert any(error["loc"] == ["body", "recipient_email"] for error in errors)
    # Do not freeze the 0.150 missing/null Pydantic error type: 0.151 deliberately
    # distinguishes explicit null from omission. Both must fail before delivery.
    assert authorize.await_count == 0
    assert sender.test_messages == []


@pytest.mark.parametrize("auth_mode", ["missing_token", "invalid_token"])
def test_required_internal_valid_body_still_requires_authentication(
    internal_body_client: tuple[TestClient, FakePortalEmailSender],
    monkeypatch: MonkeyPatch,
    auth_mode: str,
) -> None:
    client, sender = internal_body_client
    authorize = AsyncMock(wraps=internal_routes.authorize_internal_request)
    monkeypatch.setattr(internal_routes, "authorize_internal_request", authorize)
    response = client.post(
        "/internal/portal/email/test",
        content='{"recipient_email":"admin@example.com"}',
        headers=_body_contract_headers(auth_mode),
    )

    assert response.status_code == (401 if auth_mode == "missing_token" else 403)
    expected_error = (
        "auth.internal_token_required"
        if auth_mode == "missing_token"
        else "auth.internal_token_invalid"
    )
    assert response.json()["error_code"] == expected_error
    assert authorize.await_count == 1
    assert authorize.await_args.kwargs == {"require_idempotency": True}
    assert sender.test_messages == []


@pytest.mark.parametrize(
    ("body", "auth_mode"),
    [
        (None, "authorized"),
        (None, "missing_token"),
        (None, "invalid_token"),
        ("null", "authorized"),
        ("null", "missing_token"),
        ("null", "invalid_token"),
        ("{}", "authorized"),
        ("{}", "missing_token"),
        ("{}", "invalid_token"),
        ('{"providers":["openai"]}', "invalid_token"),
    ],
)
def test_optional_internal_body_preserves_defaults_and_authentication(
    internal_body_client: tuple[TestClient, FakePortalEmailSender],
    monkeypatch: MonkeyPatch,
    body: str | None,
    auth_mode: str,
) -> None:
    client, _sender = internal_body_client
    authorize = AsyncMock(wraps=internal_routes.authorize_internal_request)
    monkeypatch.setattr(internal_routes, "authorize_internal_request", authorize)
    calls: list[list[str] | None] = []

    # Follow this file's existing CatalogService method-patching pattern. Stop
    # before any real refresh/provider work; provider adapter resolution is also
    # disabled so ambient service settings cannot select a live adapter.
    def refresh_catalog(
        self: CatalogService,
        provider_ids: list[str] | None = None,
    ) -> dict[str, object]:
        calls.append(provider_ids)
        return {"revision": "body-contract-test", "total": 0}

    monkeypatch.setattr(CatalogService, "refresh_catalog", refresh_catalog)
    monkeypatch.setattr(internal_routes, "resolve_live_provider_adapters", lambda *_a, **_k: {})
    headers = _body_contract_headers(auth_mode)
    if body is None:
        response = client.post("/internal/catalog/refresh", headers=headers)
    else:
        response = client.post("/internal/catalog/refresh", content=body, headers=headers)

    assert authorize.await_count == 1
    assert authorize.await_args.kwargs == {"require_idempotency": True}
    if auth_mode == "authorized":
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["data"] == {"revision": "body-contract-test", "total": 0}
        # None, explicit null and ProviderSelection(providers=[]) all reach the
        # existing handler's providers-or-None behavior, not a new compatibility shim.
        assert calls == [None]
    else:
        assert response.status_code == (401 if auth_mode == "missing_token" else 403)
        expected_error = (
            "auth.internal_token_required"
            if auth_mode == "missing_token"
            else "auth.internal_token_invalid"
        )
        assert response.json()["error_code"] == expected_error
        assert calls == []
