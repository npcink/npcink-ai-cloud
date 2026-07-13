from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.providers.base import ProviderExecutionResult
from app.adapters.providers.siliconflow import SiliconFlowProviderAdapter
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderConnection
from app.domain.provider_connections.runtime_settings import (
    apply_provider_connection_runtime_settings,
)
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.site_knowledge.vector_profile import (
    SiteKnowledgeVectorProfileAdminError,
    SiteKnowledgeVectorProfileAdminService,
)
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
    SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
    SITE_KNOWLEDGE_VECTOR_MODEL_ID,
    SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
)
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
)


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'site-knowledge-vector-profile.sqlite3'}"


def _settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        site_knowledge_embedding_provider="deterministic",
        siliconflow_provider_enabled=False,
        siliconflow_api_key="",
    )


def _probe_result(
    *,
    vector: object,
    model_id: str = SITE_KNOWLEDGE_VECTOR_MODEL_ID,
) -> ProviderExecutionResult:
    return ProviderExecutionResult(
        output={"embedding": vector, "model_id": model_id},
        latency_ms=24,
        tokens_in=8,
        tokens_out=0,
        cost=0.0,
    )


def test_fixed_vector_profile_saves_only_after_a_valid_probe(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = _settings(database_url)
    service = SiteKnowledgeVectorProfileAdminService(database_url, settings)

    monkeypatch.setattr(
        SiliconFlowProviderAdapter,
        "execute",
        lambda _adapter, _request: _probe_result(
            vector=[0.01] * SITE_KNOWLEDGE_VECTOR_DIMENSIONS
        ),
    )

    initial = service.get_profile()
    assert initial["status"] == "not_configured"
    assert initial["profile_id"] == SITE_KNOWLEDGE_VECTOR_PROFILE_ID
    assert initial["model_id"] == SITE_KNOWLEDGE_VECTOR_MODEL_ID
    assert initial["dimensions"] == SITE_KNOWLEDGE_VECTOR_DIMENSIONS
    assert initial["editable_fields"] == ["credential"]

    result = service.save_and_verify("siliconflow-secret")

    assert result["status"] == "ready"
    assert result["probe"]["dimensions"] == SITE_KNOWLEDGE_VECTOR_DIMENSIONS
    assert result["provider"]["verified"] is True
    assert "siliconflow-secret" not in str(result)
    assert settings.site_knowledge_embedding_provider == "siliconflow"
    assert settings.site_knowledge_embedding_model == SITE_KNOWLEDGE_VECTOR_MODEL_ID
    assert settings.site_knowledge_embedding_dimensions == SITE_KNOWLEDGE_VECTOR_DIMENSIONS

    with get_session(database_url) as session:
        row = session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID)
        assert row is not None
        assert row.secret_ciphertext
        assert row.secret_ciphertext != "siliconflow-secret"
        assert row.status == "ready"
        assert row.config_json["site_knowledge_profile_id"] == (
            SITE_KNOWLEDGE_VECTOR_PROFILE_ID
        )

    dispose_engine(database_url)


@pytest.mark.parametrize(
    ("vector", "error_code"),
    [
        ([], "site_knowledge_vector_profile.embedding_invalid"),
        ([0.0] * 768, "site_knowledge_vector_profile.dimension_mismatch"),
        ([0.0] * 1536, "site_knowledge_vector_profile.dimension_mismatch"),
        ([0.0, "invalid"] + [0.0] * 1022, "site_knowledge_vector_profile.embedding_invalid"),
        ([0.0, float("nan")] + [0.0] * 1022, "site_knowledge_vector_profile.embedding_invalid"),
        ([0.0, float("inf")] + [0.0] * 1022, "site_knowledge_vector_profile.embedding_invalid"),
    ],
)
def test_fixed_vector_profile_rejects_invalid_vectors_before_persisting(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    vector: object,
    error_code: str,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = _settings(database_url)
    service = SiteKnowledgeVectorProfileAdminService(database_url, settings)
    monkeypatch.setattr(
        SiliconFlowProviderAdapter,
        "execute",
        lambda _adapter, _request: _probe_result(vector=vector),
    )

    with pytest.raises(SiteKnowledgeVectorProfileAdminError) as caught:
        service.save_and_verify("siliconflow-secret")

    assert caught.value.error_code == error_code
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID) is None

    dispose_engine(database_url)


def test_generic_provider_connection_write_cannot_forge_profile_verification(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = _settings(database_url)
    ProviderConnectionAdminService(database_url, settings).save_connection(
        {
            "connection_id": SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
            "provider_id": "siliconflow",
            "provider_type": "siliconflow",
            "kind": "siliconflow",
            "display_name": "Forged profile",
            "enabled": True,
            "base_url": "https://example.invalid/v1",
            "capability_ids": ["embedding"],
            "runtime_profile_ids": ["embed.default"],
            "config": {
                "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
                "dimensions": SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
                "metric": "COSINE",
                "site_knowledge_profile_id": SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
                "site_knowledge_probe_revision": "site-knowledge-vector-probe.v1",
            },
            "credential": "unverified-secret",
        }
    )

    projection = apply_provider_connection_runtime_settings(settings)
    profile = SiteKnowledgeVectorProfileAdminService(database_url, settings).get_profile()

    assert projection.embedding_count == 0
    assert settings.site_knowledge_embedding_provider == "deterministic"
    assert profile["status"] == "probe_required"
    assert profile["provider"]["verified"] is False

    dispose_engine(database_url)


def test_fixed_vector_profile_rejects_unexpected_reported_model(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = SiteKnowledgeVectorProfileAdminService(
        database_url,
        _settings(database_url),
    )
    monkeypatch.setattr(
        SiliconFlowProviderAdapter,
        "execute",
        lambda _adapter, _request: _probe_result(
            vector=[0.0] * SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
            model_id="BAAI/bge-large-zh-v1.5",
        ),
    )

    with pytest.raises(SiteKnowledgeVectorProfileAdminError) as caught:
        service.save_and_verify("siliconflow-secret")

    assert caught.value.error_code == "site_knowledge_vector_profile.model_mismatch"
    dispose_engine(database_url)
