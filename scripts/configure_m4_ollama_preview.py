from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionRequest
from app.adapters.providers.registry import build_provider_adapter_from_connection
from app.adapters.repositories.catalog_repository import CatalogRepository
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.models import (
    CatalogInstance,
    ProviderConnection,
    RoutingBinding,
    RoutingProfile,
)
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_LOCAL_PREVIEW_BASE_URL,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_CONNECTION_ID,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_METRIC,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_PROBE_REVISION,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_PROFILE_ID,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_NAME,
)
from app.domain.wordpress_ai_connector.routing_profiles import (
    WP_AI_CONNECTOR_CLASSIFICATION_PROFILE_ID,
    WP_AI_CONNECTOR_EDITORIAL_PROFILE_ID,
    WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
)

CONNECTION_ID = "ollama_m4"
PROVIDER_ID = "ollama-m4"
MODEL_ID = "qwen3.5:9b"
CATALOG_MODEL_ID = f"{PROVIDER_ID}/{MODEL_ID}"
BASE_URL = "http://host.docker.internal:11434/v1"
PROFILE_IDS = (
    WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
    WP_AI_CONNECTOR_EDITORIAL_PROFILE_ID,
    WP_AI_CONNECTOR_CLASSIFICATION_PROFILE_ID,
)
ALLOWED_ENVIRONMENTS = frozenset({"development", "dev", "test"})
CLASSIFICATION_TIMEOUT_MS = 60_000


def _connection_payload() -> dict[str, object]:
    return {
        "connection_id": CONNECTION_ID,
        "provider_id": PROVIDER_ID,
        "provider_type": "openai_compatible",
        "kind": "openai_compatible",
        "display_name": "Ollama M4",
        "enabled": True,
        "base_url": BASE_URL,
        "source_role": "execution_source",
        "capability_ids": ["text_generation"],
        "runtime_profile_ids": list(PROFILE_IDS),
        "config": {
            "model_ids": [MODEL_ID],
            "timeout_seconds": 60,
            "default_reasoning_effort": "none",
        },
        "metadata": {"operator_surface": "m4_preview"},
        "secretless": True,
    }


def _embedding_connection_payload() -> dict[str, object]:
    return {
        "connection_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_CONNECTION_ID,
        "provider_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
        "provider_type": "openai_compatible",
        "kind": "openai_compatible",
        "display_name": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_NAME,
        "enabled": True,
        "base_url": SITE_KNOWLEDGE_LOCAL_PREVIEW_BASE_URL,
        "source_role": "execution_source",
        "capability_ids": ["embedding"],
        "runtime_profile_ids": ["embed.default"],
        "config": {
            "model_ids": [SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID],
            "site_knowledge_model_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
            "local_preview_profile_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROFILE_ID,
            "local_preview_probe_revision": (
                SITE_KNOWLEDGE_LOCAL_PREVIEW_PROBE_REVISION
            ),
            "dimensions": SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS,
            "metric": SITE_KNOWLEDGE_LOCAL_PREVIEW_METRIC,
            "timeout_seconds": 30,
        },
        "metadata": {"operator_surface": "m4_preview"},
        "secretless": True,
    }


def _validate_environment(settings: Settings) -> None:
    environment = str(settings.environment or "").strip().lower()
    if environment not in ALLOWED_ENVIRONMENTS:
        raise RuntimeError("M4 Ollama preview configuration is development-only")


def _probe_embedding(settings: Settings) -> int:
    with get_session(settings.database_url) as session:
        connection = session.get(
            ProviderConnection,
            SITE_KNOWLEDGE_LOCAL_PREVIEW_CONNECTION_ID,
        )
        if connection is None:
            raise RuntimeError("M4 Ollama embedding connection is missing")
        adapter = build_provider_adapter_from_connection(settings, connection)
    if adapter is None:
        raise RuntimeError("M4 Ollama embedding adapter is unavailable")
    result = adapter.execute(
        ProviderExecutionRequest(
            run_id="m4-preview-ollama-embedding-probe",
            site_id="m4_preview",
            ability_name="npcink-cloud/site-knowledge-local-preview-probe",
            profile_id=SITE_KNOWLEDGE_LOCAL_PREVIEW_PROFILE_ID,
            execution_kind="embedding",
            model_id=SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
            instance_id=SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
            endpoint_variant="embeddings",
            trace_id="m4-preview-ollama-embedding-probe",
            input_payload={"text": "猫咪媒体语义搜索"},
            policy={"storage_mode": "no_store"},
            timeout_ms=30_000,
        )
    )
    embedding = result.output.get("embedding")
    if not isinstance(embedding, list) or len(embedding) != (
        SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS
    ):
        raise RuntimeError("M4 Ollama embedding probe returned unexpected dimensions")
    return max(0, int(result.latency_ms))


def _apply_classification_timeout(profile: RoutingProfile) -> None:
    policy = dict(profile.default_policy_json or {})
    policy["timeout_ms"] = CLASSIFICATION_TIMEOUT_MS
    profile.default_policy_json = policy


def configure(settings: Settings) -> dict[str, object]:
    _validate_environment(settings)
    service = ProviderConnectionAdminService(settings.database_url, settings)
    service.save_connection(_connection_payload())
    test_result = service.test_connection(CONNECTION_ID)
    if test_result.get("status") != "ready":
        raise RuntimeError("M4 Ollama provider catalog test did not become ready")
    embedding_connection_payload = _embedding_connection_payload()
    service.save_connection(
        {
            **embedding_connection_payload,
            "enabled": False,
        }
    )
    embedding_probe_latency_ms = _probe_embedding(settings)
    service.save_connection(embedding_connection_payload)
    embedding_test_result = service.test_connection(
        SITE_KNOWLEDGE_LOCAL_PREVIEW_CONNECTION_ID
    )
    if embedding_test_result.get("status") != "ready":
        raise RuntimeError("M4 Ollama embedding catalog test did not become ready")

    revision = f"m4-preview-ollama-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    with get_session(settings.database_url) as session:
        instances = list(
            session.scalars(
                select(CatalogInstance).where(
                    CatalogInstance.provider_id == PROVIDER_ID,
                    CatalogInstance.model_id == CATALOG_MODEL_ID,
                    CatalogInstance.endpoint_variant == "chat_completions",
                )
            )
        )
        if len(instances) != 1:
            raise RuntimeError("M4 Ollama qwen3.5:9b catalog instance is not unique")
        instance_id = instances[0].instance_id
        classification_profile = session.get(
            RoutingProfile,
            WP_AI_CONNECTOR_CLASSIFICATION_PROFILE_ID,
        )
        if classification_profile is None:
            raise RuntimeError("M4 Ollama classification routing profile is missing")
        _apply_classification_timeout(classification_profile)
        repository = CatalogRepository(session)
        for profile_id in PROFILE_IDS:
            existing = session.get(RoutingBinding, profile_id)
            repository.upsert_routing_binding(
                profile_id=profile_id,
                candidate_instance_ids=[instance_id],
                selection_policy_json=(
                    dict(existing.selection_policy_json or {}) if existing is not None else {}
                ),
                revision=revision,
            )
        session.commit()

    return {
        "status": "configured",
        "provider_id": PROVIDER_ID,
        "model_id": MODEL_ID,
        "embedding_provider_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
        "embedding_model_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
        "embedding_dimensions": SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS,
        "embedding_probe_latency_ms": embedding_probe_latency_ms,
        "reasoning_effort": "none",
        "classification_timeout_ms": CLASSIFICATION_TIMEOUT_MS,
        "profile_ids": list(PROFILE_IDS),
        "revision": revision,
        "secretless": True,
    }


def main() -> int:
    print(json.dumps(configure(get_settings()), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
