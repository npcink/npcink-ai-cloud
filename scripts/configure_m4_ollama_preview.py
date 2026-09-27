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
from app.domain.hosted_model_defaults import VISION_AI_PROFILE_ID
from app.domain.model_capabilities.probes import probe_vision, vision_probe_fingerprint
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.routing.service import RoutingService
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
PROVIDER_ID = "ollama-m4"
CONNECTION_ID = PROVIDER_ID
LEGACY_CONNECTION_ID = "ollama_m4"
MODEL_ID = "qwen3.5:9b"
CATALOG_MODEL_ID = f"{PROVIDER_ID}/{MODEL_ID}"
VISION_MODEL_ID = "qwen3-vl:2b"
VISION_CATALOG_MODEL_ID = f"{PROVIDER_ID}/{VISION_MODEL_ID}"
BASE_URL = "http://host.docker.internal:11434/v1"
TEXT_PROFILE_IDS = (
    WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
    WP_AI_CONNECTOR_EDITORIAL_PROFILE_ID,
    WP_AI_CONNECTOR_CLASSIFICATION_PROFILE_ID,
)
PROFILE_IDS = (*TEXT_PROFILE_IDS, VISION_AI_PROFILE_ID)
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
        "capability_ids": ["text_generation", "vision"],
        "runtime_profile_ids": list(PROFILE_IDS),
        "config": {
            "model_ids": [MODEL_ID, VISION_MODEL_ID],
            "model_metadata_overrides": {
                VISION_MODEL_ID: {
                    "feature": "vision",
                    # Ollama receives the bounded image as a data URI. The
                    # runtime budget is measured before Provider execution, so
                    # leave enough room for the encoded media plus prompt.
                    "context_window": 262144,
                    "source": "m4_preview_operator_config",
                    "revision": "qwen3-vl-2b-context-v1",
                }
            },
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


def _probe_vision(settings: Settings, instance: CatalogInstance) -> None:
    with get_session(settings.database_url) as session:
        connection = session.get(ProviderConnection, CONNECTION_ID)
        if connection is None:
            raise RuntimeError("M4 Ollama vision connection is missing")
        adapter = build_provider_adapter_from_connection(settings, connection)
    if adapter is None:
        raise RuntimeError("M4 Ollama vision adapter is unavailable")
    result = probe_vision(
        provider=adapter,
        run_id="m4-preview-ollama-vision-probe",
        site_id="m4_preview",
        model_id=instance.model_id,
        instance_id=instance.instance_id,
        endpoint_variant=instance.endpoint_variant,
        trace_id="m4-preview-ollama-vision-probe",
        timeout_ms=30_000,
    )
    fingerprint = vision_probe_fingerprint(
        provider_connection_id=PROVIDER_ID,
        model_id=instance.model_id,
        endpoint_variant=instance.endpoint_variant,
    )
    with get_session(settings.database_url) as session:
        repository = CatalogRepository(session)
        repository.upsert_capability_evidence(
            instance_id=instance.instance_id,
            capability="vision",
            state=result.state,
            route_fingerprint=fingerprint,
            source="m4_preview_configure",
            revision=f"m4-preview-ollama-{datetime.now(UTC).isoformat()}",
            checked_at=datetime.now(UTC),
            error_code=result.error_code,
            error_detail=result.detail[:500] if result.detail else None,
        )
        if result.state == "verified":
            refreshed_instance = session.get(CatalogInstance, instance.instance_id)
            if refreshed_instance is not None:
                refreshed_instance.health_status = "healthy"
        session.commit()

    if result.state != "verified":
        raise RuntimeError(
            f"M4 Ollama vision capability probe failed: {result.error_code or result.state}"
        )


def _apply_classification_timeout(profile: RoutingProfile) -> None:
    policy = dict(profile.default_policy_json or {})
    policy["timeout_ms"] = CLASSIFICATION_TIMEOUT_MS
    profile.default_policy_json = policy


def configure(settings: Settings) -> dict[str, object]:
    _validate_environment(settings)
    service = ProviderConnectionAdminService(settings.database_url, settings)
    # Keep the route identity stable: capability evidence fingerprints use the
    # provider id when the connection id is identical. Disable the earlier
    # underscore-named candidate so stale evidence cannot shadow this route.
    with get_session(settings.database_url) as session:
        legacy = session.get(ProviderConnection, LEGACY_CONNECTION_ID)
        if legacy is not None:
            legacy.enabled = False
            session.commit()
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
    embedding_probe_latency_ms: int | None = None
    embedding_probe_error: str | None = None
    try:
        embedding_probe_latency_ms = _probe_embedding(settings)
    except Exception as exc:  # noqa: BLE001 - embedding is an independent preview seam
        # The WordPress AI provider route must remain configurable when the
        # optional Site Knowledge embedding probe is temporarily unavailable.
        # Keep the connection enabled so the failure is observable without
        # blocking text/vision routing configuration.
        embedding_probe_error = str(exc)[:500]
    finally:
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
                )
            )
        )
        instance_by_model = {instance.model_id: instance for instance in instances}
        if CATALOG_MODEL_ID not in instance_by_model:
            raise RuntimeError("M4 Ollama qwen3.5:9b catalog instance is not unique")
        if VISION_CATALOG_MODEL_ID not in instance_by_model:
            raise RuntimeError("M4 Ollama qwen3-vl:2b catalog instance is missing")
        instance_id = instance_by_model[CATALOG_MODEL_ID].instance_id
        vision_instance_id = instance_by_model[VISION_CATALOG_MODEL_ID].instance_id
        text_instance = instance_by_model[CATALOG_MODEL_ID]
        # This is a disposable candidate reset.  The connection test above is
        # the preview's bounded text probe; carry that result into routing so
        # historical provider-call failures cannot poison the next acceptance
        # run.  Production health policy remains unchanged and still scores
        # the normal rolling call window.
        text_instance.health_status = "healthy"
        vision_instance = instance_by_model[VISION_CATALOG_MODEL_ID]
        # Qwen-VL's native Ollama API returns the visible answer reliably for
        # this bounded vision prompt and accepts the provider's think=false
        # control directly.
        vision_instance.endpoint_variant = "ollama_chat"
        session.flush()
        _probe_vision(settings, vision_instance)
        # _probe_vision persists its evidence in a short-lived session.  The
        # surrounding configuration session still holds the pre-probe ORM
        # object, so explicitly carry the verified health state forward before
        # its later commit; otherwise the stale `unhealthy` value can overwrite
        # the successful probe result.
        vision_instance.health_status = "healthy"
        classification_profile = session.get(
            RoutingProfile,
            WP_AI_CONNECTOR_CLASSIFICATION_PROFILE_ID,
        )
        if classification_profile is None:
            raise RuntimeError("M4 Ollama classification routing profile is missing")
        _apply_classification_timeout(classification_profile)
        repository = CatalogRepository(session)
        for profile_id in TEXT_PROFILE_IDS:
            existing = session.get(RoutingBinding, profile_id)
            repository.upsert_routing_binding(
                profile_id=profile_id,
                candidate_instance_ids=[instance_id],
                selection_policy_json=(
                    dict(existing.selection_policy_json or {}) if existing is not None else {}
                ),
                revision=revision,
            )
        existing = session.get(RoutingBinding, VISION_AI_PROFILE_ID)
        repository.upsert_routing_binding(
            profile_id=VISION_AI_PROFILE_ID,
            candidate_instance_ids=[vision_instance_id],
            selection_policy_json=(
                dict(existing.selection_policy_json or {}) if existing is not None else {}
            ),
            revision=revision,
        )
        session.commit()

    vision_diagnostics: dict[str, object] = {}
    try:
        with get_session(settings.database_url) as session:
            instance = session.scalar(
                select(CatalogInstance).where(
                    CatalogInstance.provider_id == PROVIDER_ID,
                    CatalogInstance.model_id == VISION_CATALOG_MODEL_ID,
                )
            )
            if instance is not None:
                vision_diagnostics = {
                    "instance_id": instance.instance_id,
                    "endpoint_variant": instance.endpoint_variant,
                    "health_status": instance.health_status,
                    "capability_tags": instance.capability_tags,
                }
        resolution = RoutingService(
            settings.database_url,
            settings=settings,
            execution_provider_ids={PROVIDER_ID},
        ).resolve(profile_id=VISION_AI_PROFILE_ID, execution_kind="vision")
        vision_diagnostics["routing_candidates"] = [
            candidate.instance_id for candidate in resolution.candidates
        ]
    except Exception as exc:  # noqa: BLE001 - diagnostics must not hide config result
        vision_diagnostics["routing_error"] = str(exc)[:500]

    return {
        "status": "configured",
        "provider_id": PROVIDER_ID,
        "model_id": MODEL_ID,
        "vision_model_id": VISION_MODEL_ID,
        "vision_diagnostics": vision_diagnostics,
        "embedding_provider_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
        "embedding_model_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
        "embedding_dimensions": SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS,
        "embedding_probe_latency_ms": embedding_probe_latency_ms,
        "embedding_probe_error": embedding_probe_error,
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
