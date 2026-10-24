"""All-session revocation with synthetic principals; no shared demo credentials."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.api.portal_session import COOKIE_PORTAL_SESSION_TOKEN
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Principal
from app.core.services import CloudServices
from tests.conftest import TEST_PORTAL_JWT_SECRET, build_portal_bearer_headers


def assert_session_revocation_api_readback(database_url: str) -> None:
    """Used by SQLite and the opt-in, random-schema PostgreSQL acceptance case."""
    with get_session(database_url) as session:
        session.add_all(
            [
                Principal(principal_id="prn_revoke", email="revoke@example.test", status="active"),
                Principal(
                    principal_id="prn_unaffected", email="peer@example.test", status="active"
                ),
            ]
        )
        session.commit()
        versions = {
            key: session.get(Principal, key).session_version
            for key in ("prn_revoke", "prn_unaffected")
        }
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        debug_local_origin_allowlist="http://testserver",
    )
    app = create_app(CloudServices(settings=settings, providers={}))
    # Different expiry times produce distinct A and B session tokens for the same principal.
    a = build_portal_bearer_headers(
        database_url=database_url, principal_id="prn_revoke", session_version=versions["prn_revoke"]
    )
    b = build_portal_bearer_headers(
        database_url=database_url,
        principal_id="prn_revoke",
        session_version=versions["prn_revoke"],
        expires_at=datetime.now(UTC) + timedelta(minutes=20),
    )
    c = build_portal_bearer_headers(
        database_url=database_url,
        principal_id="prn_unaffected",
        session_version=versions["prn_unaffected"],
    )
    assert a["Authorization"] != b["Authorization"]
    cookie_a = {"cookie": f"{COOKIE_PORTAL_SESSION_TOKEN}={a['Authorization'][7:]}"}
    cookie_b = {"cookie": f"{COOKIE_PORTAL_SESSION_TOKEN}={b['Authorization'][7:]}"}
    origin = {"origin": "http://testserver"}
    with TestClient(app) as client:
        for headers in (a, b, c, cookie_a, cookie_b):
            response = client.get("/portal/v1/session", headers=headers)
            assert response.status_code == 200, response.text
        # Even Bearer-authenticated revoke is same-origin guarded.
        for headers, status in (
            (origin, 401),
            ({**cookie_a, "origin": "https://evil.test"}, 403),
            ({**a, "origin": "https://evil.test"}, 403),
        ):
            response = client.post("/portal/v1/session/revoke", headers=headers)
            assert response.status_code == status, response.text
            with get_session(database_url) as session:
                assert (
                    session.get(Principal, "prn_revoke").session_version == versions["prn_revoke"]
                )
                assert (
                    session.get(Principal, "prn_unaffected").session_version
                    == versions["prn_unaffected"]
                )
        response = client.post("/portal/v1/session/revoke", headers={**cookie_a, **origin})
        assert response.status_code == 200, response.text
        assert any(
            COOKIE_PORTAL_SESSION_TOKEN in value and "Max-Age=0" in value
            for value in response.headers.get_list("set-cookie")
        )
        with get_session(database_url) as session:
            assert (
                session.get(Principal, "prn_revoke").session_version == versions["prn_revoke"] + 1
            )
            assert (
                session.get(Principal, "prn_unaffected").session_version
                == versions["prn_unaffected"]
            )
            assert session.get(Principal, "prn_revoke").status == "active"
        for headers in (a, b, cookie_a, cookie_b):
            response = client.get("/portal/v1/session", headers=headers)
            assert response.status_code == 401, response.text
            assert response.json()["error_code"] == "auth.portal_session_revoked"
        assert client.get("/portal/v1/session", headers=c).status_code == 200


def test_session_revocation_api_readback(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'revocation.db'}"
    init_schema(url)
    try:
        assert_session_revocation_api_readback(url)
    finally:
        dispose_engine(url)
