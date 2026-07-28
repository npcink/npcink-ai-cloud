"""Disposable PostgreSQL validation for the Portal two-user ownership boundary.

The runtime test derives an admin connection from the current application
database only on an explicitly allowed non-production host. It creates a
uniquely named database, migrates it to head, and drops it in ``finally``.
No row is written to the long-lived application database.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import NullPool

from app.api.main import create_app
from app.core.config import Settings, get_settings
from app.core.db import dispose_engine, get_session
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    PRINCIPAL_STATUS_DISABLED,
    AccountUserMembership,
    CreditLedgerEntry,
    PaymentOrder,
    Principal,
    PrincipalSiteBinding,
)
from app.core.services import CloudServices
from app.domain.catalog.service import CatalogService
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_internal_headers,
    build_portal_bearer_headers,
)

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "tests/fixtures/runtime/portal_synthetic_multi_user_matrix_v1.json"
SAFE_POSTGRES_HOSTS = {"127.0.0.1", "localhost", "::1", "postgres"}
ADMIN_URL_ENV = "NPCINK_CLOUD_SYNTHETIC_POSTGRES_ADMIN_URL"
M4_COMPOSE_ADMIN_URL = "postgresql+psycopg://npcink:npcink@postgres:5432/postgres"


def _load_matrix() -> dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def test_synthetic_matrix_contains_only_bounded_user_roles_and_reserved_data() -> None:
    matrix = _load_matrix()

    assert matrix["contract_version"] == "portal-synthetic-multi-user-matrix-v1"
    assert {user["role"] for user in matrix["users"]} == {"user"}
    assert {user["status"] for user in matrix["users"]} == {"active", "disabled"}
    assert all(user["email"].endswith("@example.com") for user in matrix["users"])
    assert all(site["site_id"].startswith("site_synthetic_") for site in matrix["sites"])

    serialized = json.dumps(matrix, sort_keys=True).lower()
    assert "token" not in serialized
    assert "secret" not in serialized
    assert "password" not in serialized


def _admin_database_url() -> str:
    explicit = os.environ.get(ADMIN_URL_ENV, "").strip()
    if explicit:
        return explicit
    application_url = os.environ.get("NPCINK_CLOUD_DATABASE_URL", "").strip()
    if application_url:
        return application_url
    if ROOT == Path("/app"):
        try:
            socket.getaddrinfo("postgres", 5432)
        except OSError:
            return ""
        return M4_COMPOSE_ADMIN_URL
    return ""


def _database_url(base: URL, database_name: str) -> str:
    return base.set(database=database_name).render_as_string(hide_password=False)


def _quoted_database_name(database_name: str) -> str:
    if not database_name.replace("_", "").isalnum():
        raise AssertionError("generated database name is not safe")
    return f'"{database_name}"'


def _drop_database(connection: sa.Connection, database_name: str) -> None:
    connection.execute(
        text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = :database_name AND pid <> pg_backend_pid()"
        ),
        {"database_name": database_name},
    )
    connection.execute(text(f"DROP DATABASE IF EXISTS {_quoted_database_name(database_name)}"))


def _upgrade_to_head(database_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    with monkeypatch.context() as isolated_environment:
        isolated_environment.setenv("NPCINK_CLOUD_DATABASE_URL", database_url)
        get_settings.cache_clear()
        config = AlembicConfig(str(ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "migrations"))
        command.upgrade(config, "head")
    get_settings.cache_clear()


@contextmanager
def _disposable_database(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[str, Engine, str]]:
    raw_admin_url = _admin_database_url()
    if not raw_admin_url:
        pytest.skip(
            f"set {ADMIN_URL_ENV} or NPCINK_CLOUD_DATABASE_URL to a safe PostgreSQL admin URL"
        )
    if os.environ.get("NPCINK_CLOUD_ENVIRONMENT", "test").strip().lower() == "production":
        raise AssertionError("synthetic user validation is forbidden in production")

    parsed = make_url(raw_admin_url)
    if parsed.get_backend_name() != "postgresql":
        pytest.skip("synthetic user validation requires PostgreSQL")
    if parsed.host not in SAFE_POSTGRES_HOSTS:
        raise AssertionError("synthetic user validation accepts only an approved local/M4 host")

    admin_url = parsed.set(drivername="postgresql+psycopg", database="postgres")
    database_name = f"npcink_synthetic_users_{secrets.token_hex(6)}"
    database_url = _database_url(admin_url, database_name)
    admin_engine = sa.create_engine(
        admin_url,
        isolation_level="AUTOCOMMIT",
        hide_parameters=True,
        poolclass=NullPool,
    )

    try:
        with admin_engine.connect() as connection:
            _drop_database(connection, database_name)
            connection.execute(
                text(f"CREATE DATABASE {_quoted_database_name(database_name)} TEMPLATE template0")
            )
        _upgrade_to_head(database_url, monkeypatch)
        yield database_url, admin_engine, database_name
    finally:
        dispose_engine(database_url)
        get_settings.cache_clear()
        with admin_engine.connect() as connection:
            _drop_database(connection, database_name)
        admin_engine.dispose()


def _build_client(database_url: str) -> TestClient:
    CatalogService(database_url).refresh_catalog()
    settings = Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Synthetic User Validation",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        debug_local_origin_allowlist="http://testserver",
    )
    client = TestClient(create_app(CloudServices(settings=settings, providers={})))
    client.headers.update({"origin": "http://testserver", "referer": "http://testserver/"})
    return client


def _seed_identity_matrix(
    client: TestClient,
    matrix: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    account = matrix["account"]
    response = client.post(
        "/internal/service/accounts",
        json=account,
        headers=build_internal_headers(idempotency_key="synthetic-account"),
    )
    assert response.status_code == 200, response.text

    sites = {item["key"]: item for item in matrix["sites"]}
    for site in sites.values():
        response = client.post(
            "/internal/service/sites",
            json={
                "site_id": site["site_id"],
                "account_id": account["account_id"],
                "name": site["name"],
                "status": site["status"],
            },
            headers=build_internal_headers(idempotency_key=f"synthetic-{site['key']}-site"),
        )
        assert response.status_code == 200, response.text

    grants: dict[str, dict[str, Any]] = {}
    users = {item["key"]: item for item in matrix["users"]}
    for user_key in ("user_a", "user_b", "disabled_user"):
        user = users[user_key]
        owned_site = next(
            (site for site in sites.values() if site["owner"] == user_key),
            sites["site_a"],
        )
        member_payload = {
            "email": user["email"],
            "status": "active",
        }
        if user_key != "disabled_user":
            member_payload["site_id"] = owned_site["site_id"]
        response = client.post(
            f"/internal/service/accounts/{account['account_id']}/members",
            json=member_payload,
            headers=build_internal_headers(idempotency_key=f"synthetic-{user_key}-member"),
        )
        assert response.status_code == 200, response.text
        grants[user_key] = response.json()["data"]

    database_url = client.app.state.services.settings.database_url
    with get_session(database_url) as session:
        disabled = session.get(Principal, grants["disabled_user"]["principal_id"])
        assert disabled is not None
        disabled.status = PRINCIPAL_STATUS_DISABLED
        disabled.session_version = int(disabled.session_version or 1) + 1
        session.commit()

    return grants, {key: str(value["site_id"]) for key, value in sites.items()}


def _headers(grant: dict[str, Any], site_id: str, *, key: str = "") -> dict[str, str]:
    return build_portal_bearer_headers(
        principal_id=str(grant["principal_id"]),
        session_version=int(grant.get("session_version") or 1),
        site_id=site_id,
        idempotency_key=key,
    )


def _seed_commercial_rows(
    database_url: str,
    account_id: str,
    site_ids: dict[str, str],
) -> None:
    with get_session(database_url) as session:
        for suffix in ("a", "b"):
            site_id = site_ids[f"site_{suffix}"]
            session.add(
                PaymentOrder(
                    order_id=f"order_synthetic_{suffix}",
                    account_id=account_id,
                    site_id=site_id,
                    plan_id="plan_synthetic",
                    plan_version_id="plan_version_synthetic",
                    provider="alipay",
                    external_order_no=f"external_synthetic_{suffix}",
                    status="pending",
                    amount=1.0,
                    currency="CNY",
                    subject=f"Synthetic order {suffix.upper()}",
                    idempotency_key=f"synthetic-order-{suffix}",
                )
            )
            session.add(
                CreditLedgerEntry(
                    ledger_entry_id=f"ledger_synthetic_{suffix}",
                    account_id=account_id,
                    site_id=site_id,
                    event_type="consume",
                    source_type="synthetic_validation",
                    source_id=f"source_synthetic_{suffix}",
                    ai_credit_delta=-1.0,
                    quantity=1.0,
                    unit="ai_credits",
                    rate=1.0,
                    rate_version="synthetic-v1",
                    idempotency_key=f"synthetic-ledger-{suffix}",
                )
            )
        session.commit()


def _claim_site(
    database_url: str,
    *,
    principal_id: str,
    account_id: str,
    site_id: str,
    suffix: str,
) -> str:
    engine = sa.create_engine(database_url, hide_parameters=True, poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.insert(PrincipalSiteBinding).values(
                    binding_id=f"binding_synthetic_race_{suffix}",
                    principal_id=principal_id,
                    site_id=site_id,
                    account_id=account_id,
                    status="active",
                    bound_at=sa.func.now(),
                    released_at=None,
                )
            )
        return "committed"
    except IntegrityError:
        return "integrity_error"
    finally:
        engine.dispose()


def test_portal_two_user_matrix_on_disposable_postgres(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    matrix = _load_matrix()
    account_id = str(matrix["account"]["account_id"])

    with _disposable_database(monkeypatch) as (
        database_url,
        admin_engine,
        database_name,
    ):
        with _build_client(database_url) as client:
            grants, site_ids = _seed_identity_matrix(client, matrix)
            _seed_commercial_rows(database_url, account_id, site_ids)

            headers_a = _headers(grants["user_a"], site_ids["site_a"])
            headers_b = _headers(grants["user_b"], site_ids["site_b"])

            sites_a = client.get("/portal/v1/account/usage-summary", headers=headers_a)
            sites_b = client.get("/portal/v1/account/usage-summary", headers=headers_b)
            assert sites_a.status_code == 200, sites_a.text
            assert sites_b.status_code == 200, sites_b.text
            assert sites_a.json()["data"]["site_ids"] == [site_ids["site_a"]]
            assert sites_b.json()["data"]["site_ids"] == [site_ids["site_b"]]

            for path_template in matrix["site_read_paths"]:
                own_response = client.get(
                    path_template.format(site_id=site_ids["site_a"]),
                    headers=headers_a,
                )
                cross_response = client.get(
                    path_template.format(site_id=site_ids["site_b"]),
                    headers=headers_a,
                )
                assert own_response.status_code == 200, own_response.text
                assert cross_response.status_code == 403, cross_response.text

            orders_a = client.get("/portal/v1/account/payment-orders", headers=headers_a)
            credits_a = client.get("/portal/v1/account/credit-ledger", headers=headers_a)
            assert orders_a.status_code == 200, orders_a.text
            assert credits_a.status_code == 200, credits_a.text
            assert [item["order_id"] for item in orders_a.json()["data"]["items"]] == [
                "order_synthetic_a"
            ]
            assert {item["site_id"] for item in credits_a.json()["data"]["items"]} == {
                site_ids["site_a"]
            }

            cross_order = client.get(
                "/portal/v1/account/payment-orders/order_synthetic_b",
                headers=headers_a,
            )
            assert cross_order.status_code == 404, cross_order.text

            support_payload_a = {
                "topic": "billing",
                "title": "Synthetic request A",
                "description": "Synthetic two-user boundary validation for site A.",
                "site_id": site_ids["site_a"],
                "source_path": "/portal/support",
            }
            support_payload_b = {
                **support_payload_a,
                "title": "Synthetic request B",
                "description": "Synthetic two-user boundary validation for site B.",
                "site_id": site_ids["site_b"],
            }
            support_a = client.post(
                "/portal/v1/support-requests",
                json=support_payload_a,
                headers=_headers(
                    grants["user_a"],
                    site_ids["site_a"],
                    key="synthetic-shared-idempotency",
                ),
            )
            support_b = client.post(
                "/portal/v1/support-requests",
                json=support_payload_b,
                headers=_headers(
                    grants["user_b"],
                    site_ids["site_b"],
                    key="synthetic-shared-idempotency",
                ),
            )
            assert support_a.status_code == 200, support_a.text
            assert support_b.status_code == 200, support_b.text
            listed_a = client.get("/portal/v1/support-requests", headers=headers_a)
            listed_b = client.get("/portal/v1/support-requests", headers=headers_b)
            assert listed_a.json()["data"]["pagination"]["total"] == 1
            assert listed_b.json()["data"]["pagination"]["total"] == 1
            assert (
                listed_a.json()["data"]["items"][0]["request_id"]
                != listed_b.json()["data"]["items"][0]["request_id"]
            )

            with get_session(database_url) as session:
                membership_b = session.scalar(
                    select(AccountUserMembership).where(
                        AccountUserMembership.principal_id == str(grants["user_b"]["principal_id"]),
                        AccountUserMembership.account_id == account_id,
                    )
                )
                assert membership_b is not None
                membership_b.status = ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED
                session.commit()

            revoked_replay = client.post(
                "/portal/v1/support-requests",
                json=support_payload_b,
                headers=_headers(
                    grants["user_b"],
                    site_ids["site_b"],
                    key="synthetic-shared-idempotency",
                ),
            )
            disabled_access = client.get(
                "/portal/v1/account/usage-summary",
                headers=_headers(
                    grants["disabled_user"],
                    site_ids["site_a"],
                ),
            )
            assert revoked_replay.status_code == 403, revoked_replay.text
            assert disabled_access.status_code == 401, disabled_access.text

            with ThreadPoolExecutor(max_workers=2) as executor:
                outcomes = list(
                    executor.map(
                        lambda item: _claim_site(
                            database_url,
                            principal_id=str(grants[item]["principal_id"]),
                            account_id=account_id,
                            site_id=site_ids["claim_race"],
                            suffix=item,
                        ),
                        ("user_a", "user_b"),
                    )
                )
            assert sorted(outcomes) == ["committed", "integrity_error"]
            with get_session(database_url) as session:
                active_claims = list(
                    session.scalars(
                        select(PrincipalSiteBinding).where(
                            PrincipalSiteBinding.site_id == site_ids["claim_race"],
                            PrincipalSiteBinding.released_at.is_(None),
                        )
                    )
                )
            assert len(active_claims) == 1

        dispose_engine(database_url)

    with admin_engine.connect() as connection:
        assert (
            connection.scalar(
                text("SELECT count(*) FROM pg_database WHERE datname = :database_name"),
                {"database_name": database_name},
            )
            == 0
        )
