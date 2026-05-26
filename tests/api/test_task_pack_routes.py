from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, init_schema
from app.core.services import CloudServices
from tests.conftest import (
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PROVIDER_CONNECTION_SECRET,
    build_auth_headers,
    merge_json_headers,
    seed_site_auth,
)


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'task-packs-api.sqlite3'}"


def test_analyze_product_returns_ok_with_suggestions(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_taskpack", scopes=["task_pack:write"])

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    analyze_body = json.dumps({
        "product": {
            "product_id": "prod_001",
            "title": "Wireless Mouse",
            "short_description": "A great wireless mouse.",
            "long_description": "This wireless mouse offers precision and comfort.",
            "attributes": {"color": "black"},
            "categories": ["Electronics"],
            "tags": ["wireless", "mouse"],
            "target_locales": ["zh-CN"],
        },
    }).encode("utf-8")
    response = client.post(
        "/v1/task-packs/woocommerce-growth/analyze",
        content=analyze_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/task-packs/woocommerce-growth/analyze",
                site_id="site_taskpack",
                trace_id="tracetaskpack00100000000000000",
                idempotency_key="idempotency-taskpack-001",
                body=analyze_body,
            ),
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    data = payload["data"]
    assert data["requires_local_approval"] is True
    assert data["product_id"] == "prod_001"
    assert data["title_suggestion"] is not None
    assert len(data["description_drafts"]) == 2
    assert data["schema_suggestion"] is not None
    assert "已写入 WooCommerce" not in str(data)

    dispose_engine(database_url)


def test_batch_plan_returns_ok_with_summary(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_taskpack2", scopes=["task_pack:write"])

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    batch_body = json.dumps({
        "items": [
            {
                "product_id": "prod_001",
                "title": "Item A",
                "short_description": "Short A",
                "long_description": "Long A",
            },
            {
                "product_id": "prod_002",
                "title": "Item B",
            },
        ],
    }).encode("utf-8")
    response = client.post(
        "/v1/task-packs/woocommerce-growth/batch-plan",
        content=batch_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/task-packs/woocommerce-growth/batch-plan",
                site_id="site_taskpack2",
                trace_id="tracetaskpack00200000000000000",
                idempotency_key="idempotency-taskpack-002",
                body=batch_body,
            ),
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    data = payload["data"]
    assert data["requires_local_approval"] is True
    assert data["total_products"] == 2
    assert len(data["items"]) == 2
    assert "title_optimization" in data["task_types"]
    assert "已写入 WooCommerce" not in str(data)

    dispose_engine(database_url)


def test_analyze_product_requires_auth(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    response = client.post(
        "/v1/task-packs/woocommerce-growth/analyze",
        headers={"content-type": "application/json"},
        json={"product": {"title": "Test"}},
    )

    assert response.status_code == 401
    payload = response.json()
    assert payload["status"] == "error"

    dispose_engine(database_url)


def test_analyze_product_denies_without_scope(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_taskpack3", scopes=["catalog:read"])

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    analyze_body = json.dumps({"product": {"title": "Test"}}).encode("utf-8")
    response = client.post(
        "/v1/task-packs/woocommerce-growth/analyze",
        content=analyze_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/task-packs/woocommerce-growth/analyze",
                site_id="site_taskpack3",
                trace_id="tracetaskpack00300000000000000",
                idempotency_key="idempotency-taskpack-003",
                body=analyze_body,
            ),
        ),
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["status"] == "error"
    assert "scope" in payload["error_code"]

    dispose_engine(database_url)


def test_batch_plan_enforces_max_items(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_taskpack4", scopes=["task_pack:write"])

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    batch_body = json.dumps({"items": []}).encode("utf-8")
    response = client.post(
        "/v1/task-packs/woocommerce-growth/batch-plan",
        content=batch_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/task-packs/woocommerce-growth/batch-plan",
                site_id="site_taskpack4",
                trace_id="tracetaskpack00400000000000000",
                idempotency_key="idempotency-taskpack-004",
                body=batch_body,
            ),
        ),
    )

    assert response.status_code == 422

    dispose_engine(database_url)


def test_analyze_product_response_contains_no_write_claims(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_taskpack5", scopes=["task_pack:write"])

    settings = Settings(
        project_name="Magick AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        provider_connection_secret=TEST_PROVIDER_CONNECTION_SECRET,
    )
    client = TestClient(create_app(CloudServices(settings=settings)))

    analyze_body = json.dumps({
        "product": {
            "product_id": "prod_099",
            "title": "Test Product",
        },
    }).encode("utf-8")
    response = client.post(
        "/v1/task-packs/woocommerce-growth/analyze",
        content=analyze_body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/task-packs/woocommerce-growth/analyze",
                site_id="site_taskpack5",
                trace_id="tracetaskpack00500000000000000",
                idempotency_key="idempotency-taskpack-005",
                body=analyze_body,
            ),
        ),
    )

    assert response.status_code == 200
    full_response = response.text
    assert "已写入 WooCommerce" not in full_response
    assert "written to WooCommerce" not in full_response.lower()
    assert "requires_local_approval" in full_response

    dispose_engine(database_url)
