from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.providers.base import (
    ProviderExecutionResult,
)
from app.adapters.providers.siliconflow import SiliconFlowProviderAdapter
from app.core.db import get_session
from app.core.models import (
    ProviderConnection,
    ServiceAuditEvent,
)
from app.domain.site_knowledge import vector_profile as vector_profile_module
from app.domain.site_knowledge.vector_profile import SiteKnowledgeVectorProfileAdminService
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
    SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
    SITE_KNOWLEDGE_VECTOR_MODEL_ID,
    SITE_KNOWLEDGE_VECTOR_STORE_COLLECTION,
    SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID,
)
from tests.api.service_routes_test_support import (
    _build_client,
)
from tests.conftest import (
    build_internal_headers,
)


def test_admin_site_knowledge_vector_profile_verifies_before_saving(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    monkeypatch.setattr(
        SiliconFlowProviderAdapter,
        "execute",
        lambda _adapter, _request: ProviderExecutionResult(
            output={
                "embedding": [0.01] * SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
                "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            },
            latency_ms=19,
            tokens_in=8,
            tokens_out=0,
            cost=0.0,
        ),
    )

    initial = client.get(
        "/internal/service/admin/site-knowledge-vector-profile",
        headers=build_internal_headers(),
    )
    assert initial.status_code == 200, initial.text
    assert initial.json()["data"]["status"] == "not_configured"

    forged = client.put(
        "/internal/service/admin/site-knowledge-vector-profile",
        headers=build_internal_headers(idempotency_key="site-knowledge-vector-profile-forged"),
        json={
            "credential": "siliconflow-secret",
            "model_id": "text-embedding-3-small",
            "dimensions": 1536,
        },
    )
    assert forged.status_code == 422, forged.text
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID) is None

    response = client.put(
        "/internal/service/admin/site-knowledge-vector-profile",
        headers=build_internal_headers(idempotency_key="site-knowledge-vector-profile-save"),
        json={"credential": "siliconflow-secret"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "ready"
    assert data["model_id"] == SITE_KNOWLEDGE_VECTOR_MODEL_ID
    assert data["dimensions"] == SITE_KNOWLEDGE_VECTOR_DIMENSIONS
    assert data["provider"]["verified"] is True
    assert data["receipt"]["event_kind"] == ("site_knowledge_vector_profile.save_and_verify")
    assert "siliconflow-secret" not in json.dumps(data)

    with get_session(database_url) as session:
        connection = session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID)
        assert connection is not None
        assert connection.status == "ready"
        assert connection.secret_ciphertext != "siliconflow-secret"
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.event_kind == "site_knowledge_vector_profile.save_and_verify"
            )
        )
        assert audit is not None
        assert "siliconflow-secret" not in json.dumps(audit.payload_json)


def test_admin_site_knowledge_vector_store_verifies_before_saving(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    monkeypatch.setattr(
        vector_profile_module,
        "ZillizCloudSiteKnowledgeBackend",
        lambda _settings: object(),
    )

    forged = client.put(
        "/internal/service/admin/site-knowledge-vector-profile/vector-store",
        headers=build_internal_headers(idempotency_key="site-knowledge-vector-store-forged"),
        json={
            "endpoint": "https://cluster.example.zillizcloud.com",
            "token": "zilliz-secret",
            "collection": "caller_owned_collection",
        },
    )
    assert forged.status_code == 422, forged.text
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID) is None

    response = client.put(
        "/internal/service/admin/site-knowledge-vector-profile/vector-store",
        headers=build_internal_headers(idempotency_key="site-knowledge-vector-store-save"),
        json={
            "endpoint": "https://cluster.example.zillizcloud.com/",
            "token": "zilliz-secret",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["vector_store"]["verified"] is True
    assert data["vector_store"]["collection"] == SITE_KNOWLEDGE_VECTOR_STORE_COLLECTION
    assert data["vector_store"]["endpoint"] == ("https://cluster.example.zillizcloud.com")
    assert data["receipt"]["event_kind"] == (
        "site_knowledge_vector_profile.vector_store.save_and_verify"
    )
    assert "zilliz-secret" not in json.dumps(data)

    with get_session(database_url) as session:
        connection = session.get(
            ProviderConnection,
            SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID,
        )
        assert connection is not None
        assert connection.status == "ready"
        assert connection.secret_ciphertext != "zilliz-secret"
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.event_kind
                == "site_knowledge_vector_profile.vector_store.save_and_verify"
            )
        )
        assert audit is not None
        assert "zilliz-secret" not in json.dumps(audit.payload_json)


def test_admin_site_knowledge_vector_rebuild_uses_fixed_server_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    result = {
        "status": "ready",
        "profile_id": "site-knowledge.zh.v1",
        "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
        "dimensions": SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
        "vector_store": {"provider_id": "zilliz"},
        "validation": {
            "index": {"status": "ready", "indexed_chunk_count": 1},
            "retrieval": {"status": "pending"},
        },
    }
    monkeypatch.setattr(
        SiteKnowledgeVectorProfileAdminService,
        "rebuild_index",
        lambda _service: result,
    )

    forged = client.post(
        "/internal/service/admin/site-knowledge-vector-profile/index-rebuilds",
        headers=build_internal_headers(idempotency_key="site-knowledge-index-forged"),
        json={
            "confirmation": "rebuild_site_knowledge_index",
            "dimensions": 1536,
            "collection": "caller_owned_collection",
        },
    )
    assert forged.status_code == 422, forged.text

    response = client.post(
        "/internal/service/admin/site-knowledge-vector-profile/index-rebuilds",
        headers=build_internal_headers(idempotency_key="site-knowledge-index-rebuild"),
        json={"confirmation": "rebuild_site_knowledge_index"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["validation"]["index"]["status"] == "ready"
    assert data["receipt"]["event_kind"] == ("site_knowledge_vector_profile.index.rebuild")
    with get_session(database_url) as session:
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.event_kind == "site_knowledge_vector_profile.index.rebuild"
            )
        )
        assert audit is not None
        assert audit.payload_json["direct_wordpress_write"] is False
