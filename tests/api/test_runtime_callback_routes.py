from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Site
from app.core.secrets import decrypt_runtime_terminal_callback_secret
from app.core.services import CloudServices
from tests.conftest import build_auth_headers, merge_json_headers, seed_site_auth


def _build_client(tmp_path: Path) -> tuple[str, Settings, TestClient]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'runtime-callback-api.sqlite3'}"
    init_schema(database_url)
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
    )
    seed_site_auth(
        database_url,
        site_id="site_callback",
        scopes=["runtime:execute"],
    )
    return database_url, settings, TestClient(create_app(CloudServices(settings=settings)))


def _payload(*, enabled: bool = True) -> dict[str, object]:
    return {
        "contract_version": "runtime_terminal_callback_registration.v1",
        "enabled": enabled,
        "callback_url": "https://wordpress.example.test/wp-json/npcink-cloud-addon/v1/runtime-callbacks/terminal",
        "key_id": "callback_key_1",
        "secret": "callback-secret-" + ("x" * 32),
        "registration_id": "registration_site_callback_1",
    }


def test_site_key_registers_encrypted_terminal_callback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.domain.commercial.mixins._site_mixin.validate_runtime_callback_target",
        lambda callback_url: None,
    )
    database_url, settings, client = _build_client(tmp_path)
    payload = _payload()
    body = json.dumps(payload, separators=(",", ":")).encode()
    path = "/v1/runtime/callbacks/terminal"

    response = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_callback",
                body=body,
                idempotency_key="register-terminal-callback-1",
            )
        ),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data == {
        "contract_version": "runtime_terminal_callback_registration.v1",
        "site_id": "site_callback",
        "runtime_callback": {
            "enabled": True,
            "callback_url": payload["callback_url"],
            "key_id": "callback_key_1",
            "registration_id": "registration_site_callback_1",
        },
    }
    assert str(payload["secret"]) not in response.text

    with get_session(database_url) as session:
        site = session.get(Site, "site_callback")
        assert site is not None
        registration = site.metadata_json["runtime_callbacks"]["terminal"]
        assert registration["registration_id"] == "registration_site_callback_1"
        assert "secret" not in registration
        assert str(payload["secret"]) not in json.dumps(registration)
        assert (
            decrypt_runtime_terminal_callback_secret(
                registration["secret_ciphertext"],
                settings=settings,
            )
            == payload["secret"]
        )

    dispose_engine(database_url)


def test_site_key_can_disable_terminal_callback_without_secret(tmp_path: Path) -> None:
    database_url, _, client = _build_client(tmp_path)
    payload = {
        "contract_version": "runtime_terminal_callback_registration.v1",
        "enabled": False,
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    path = "/v1/runtime/callbacks/terminal"

    response = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_callback",
                body=body,
                idempotency_key="disable-terminal-callback-1",
            )
        ),
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["runtime_callback"] == {
        "enabled": False,
        "callback_url": "",
        "key_id": "",
        "registration_id": "",
    }
    dispose_engine(database_url)


def test_enabled_terminal_callback_rejects_incomplete_registration(tmp_path: Path) -> None:
    database_url, _, client = _build_client(tmp_path)
    payload = _payload()
    payload["secret"] = "too-short"
    body = json.dumps(payload, separators=(",", ":")).encode()
    path = "/v1/runtime/callbacks/terminal"

    response = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_callback",
                body=body,
                idempotency_key="invalid-terminal-callback-1",
            )
        ),
    )

    assert response.status_code == 422
    dispose_engine(database_url)


def test_terminal_callback_registration_requires_idempotency_and_execute_scope(
    tmp_path: Path,
) -> None:
    database_url, _, client = _build_client(tmp_path)
    payload = _payload()
    body = json.dumps(payload, separators=(",", ":")).encode()
    path = "/v1/runtime/callbacks/terminal"

    missing_idempotency = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_callback",
                body=body,
            )
        ),
    )
    assert missing_idempotency.status_code == 401
    assert missing_idempotency.json()["error_code"] == "auth.idempotency_required"

    seed_site_auth(
        database_url,
        site_id="site_callback_readonly",
        scopes=["runtime:read"],
    )
    wrong_scope = client.post(
        path,
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                path,
                site_id="site_callback_readonly",
                body=body,
                idempotency_key="register-terminal-callback-readonly",
            )
        ),
    )
    assert wrong_scope.status_code == 403
    assert wrong_scope.json()["error_code"] == "auth.scope_denied"
    dispose_engine(database_url)
