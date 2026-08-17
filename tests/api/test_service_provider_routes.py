from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.adapters.providers.base import (
    CatalogInstanceSeed,
    CatalogModelSeed,
    ProviderCatalogSnapshot,
)
from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.api.routes import service as service_routes
from app.core.db import get_session
from app.core.models import (
    ModelReferenceModel,
    ModelReferenceSource,
    ProviderConnection,
    ServiceAuditEvent,
    Site,
)
from app.core.secrets import (
    decrypt_provider_connection_secret,
)
from app.domain.catalog.service import CatalogService
from app.domain.hosted_model_defaults import (
    AUDIO_NARRATION_PROFILE_ID,
    TEXT_AI_PROFILE_ID,
)
from app.domain.model_references import MODELS_DEV_API_URL
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.web_search.service import (
    TavilyWebSearchProvider,
    WebSearchExecutionResult,
    WebSearchProviderUsage,
)
from tests.api.service_routes_test_support import (
    _build_client,
    _sqlite_url,
)
from tests.conftest import (
    build_internal_headers,
    merge_json_headers,
)


class _UnavailableAuditService:
    def record_service_audit_event(self, **_: Any) -> None:
        raise RuntimeError("audit storage unavailable")


def test_admin_web_search_provider_env_settings_route_is_retired(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)

    get_response = client.get(
        "/internal/service/admin/web-search-providers",
        headers=build_internal_headers(),
    )
    post_response = client.post(
        "/internal/service/admin/web-search-providers",
        headers=build_internal_headers(idempotency_key="web-search-provider-save"),
        json={
            "provider_mode": "auto",
            "providers": {},
        },
    )

    assert get_response.status_code == 404
    assert post_response.status_code == 404


def test_admin_image_source_provider_env_settings_route_is_retired(
    tmp_path: Path,
) -> None:
    _, client = _build_client(
        tmp_path,
        settings_overrides={
            "image_source_provider": "disabled",
        },
    )

    get_response = client.get(
        "/internal/service/admin/image-source-providers",
        headers=build_internal_headers(),
    )
    post_response = client.post(
        "/internal/service/admin/image-source-providers",
        headers=build_internal_headers(idempotency_key="image-source-provider-save"),
        json={
            "provider_mode": "auto",
            "providers": {},
            "runtime": {},
        },
    )

    assert get_response.status_code == 404
    assert post_response.status_code == 404


def test_admin_provider_image_host_approval_uses_persisted_run_evidence_and_audit(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    services = client.app.state.services
    ProviderConnectionAdminService(database_url, services.settings).save_connection(
        {
            "connection_id": "siliconflow_primary",
            "provider_id": "siliconflow",
            "provider_type": "siliconflow",
            "kind": "siliconflow",
            "display_name": "SiliconFlow",
            "enabled": True,
            "base_url": "https://api.siliconflow.cn/v1",
            "capability_ids": ["text_generation", "embedding"],
            "runtime_profile_ids": ["text.ai", "embed.default"],
            "config": {},
            "credential": "siliconflow-key",
        }
    )
    with get_session(database_url) as session:
        session.add(Site(site_id="site_image_approval", name="Image approval", status="active"))
        run = RuntimeRepository(session).create_run(
            run_id="run_admin_image_host_approval",
            site_id="site_image_approval",
            account_id=None,
            subscription_id=None,
            plan_version_id=None,
            ability_name="image_generate",
            ability_family="image_generation",
            skill_id="",
            workflow_id="",
            contract_version="image_generation_request.v1",
            channel="wordpress_ai_connector",
            execution_kind="image_generation",
            execution_tier="cloud",
            execution_pattern="request_response",
            data_classification="internal",
            profile_id="image.generate.hosted",
            canonical_run_id=None,
            status="failed",
            idempotency_key="idem-admin-image-host-approval",
            request_fingerprint="fingerprint-admin-image-host-approval",
            trace_id="trace-admin-image-host-approval",
            input_json={},
            execution_input_ciphertext=None,
            policy_json={},
            selected_provider_id="siliconflow",
        )
        run.error_code = "image_generation.artifact_materialization_failed"
        run.error_message = "provider image host is not allowlisted"
        row = session.get(ProviderConnection, "siliconflow_primary")
        assert row is not None
        row.metadata_json = {
            "image_delivery_repair": {
                "status": "pending",
                "reason_code": "host_not_allowlisted",
                "detected_host": "images.siliconflow.example",
                "run_id": run.run_id,
                "provider_id": "siliconflow",
                "observed_at": "2026-08-11T00:00:00+00:00",
            }
        }
        session.commit()

    response = client.post(
        "/internal/service/admin/provider-connections/siliconflow_primary/approve-image-host",
        headers=build_internal_headers(idempotency_key="approve-siliconflow-image-host"),
        json={"evidence_run_id": "run_admin_image_host_approval"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["data"]["approved_image_output_host"] == "images.siliconflow.example"
    assert payload["data"]["connection"]["config"]["image_output_hosts"] == [
        "images.siliconflow.example"
    ]
    assert payload["data"]["receipt"]["event_kind"] == ("provider_connection.image_host_approve")
    serialized = json.dumps(payload)
    assert "siliconflow-key" not in serialized
    with get_session(database_url) as session:
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(
                ServiceAuditEvent.event_kind == "provider_connection.image_host_approve",
                ServiceAuditEvent.scope_id == "siliconflow_primary",
            )
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        assert audit_event.payload_json["result"]["approved_image_output_host"] == (
            "images.siliconflow.example"
        )
        assert "siliconflow-key" not in json.dumps(audit_event.payload_json)


def test_admin_provider_image_delivery_probe_is_audited_without_exposing_media(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)

    def fake_probe(
        self: ProviderConnectionAdminService,
        connection_id: str,
    ) -> dict[str, Any]:
        assert connection_id == "siliconflow_primary"
        return {
            "probe_id": "image-probe-api",
            "connection_id": connection_id,
            "provider_id": "siliconflow",
            "model_id": "siliconflow/Kwai-Kolors/Kolors",
            "status": "approval_required",
            "ok": False,
            "delivery_format": "url",
            "detected_host": "images.provider.example",
            "host_approved": False,
            "content_type": "",
            "width": 0,
            "height": 0,
            "latency_ms": 321,
            "estimated_cost": 0.0123,
            "provider_call_billable": True,
            "tested_at": "2026-08-11T00:00:00+00:00",
            "message": "provider image host approval is required",
            "connection": {"connection_id": connection_id},
        }

    monkeypatch.setattr(ProviderConnectionAdminService, "test_image_delivery", fake_probe)

    response = client.post(
        "/internal/service/admin/provider-connections/siliconflow_primary/image-delivery-probes",
        headers=build_internal_headers(idempotency_key="probe-siliconflow-image-delivery"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["data"]["status"] == "approval_required"
    assert payload["data"]["detected_host"] == "images.provider.example"
    assert payload["data"]["provider_call_billable"] is True
    serialized = json.dumps(payload)
    assert "https://" not in serialized
    assert "signature" not in serialized
    with get_session(database_url) as session:
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(
                ServiceAuditEvent.event_kind == "provider_connection.image_delivery_probe",
                ServiceAuditEvent.scope_id == "siliconflow_primary",
            )
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        assert audit_event.outcome == "succeeded"
        audit_payload = audit_event.payload_json or {}
        assert audit_payload["result"]["test"]["status"] == "approval_required"
        serialized_audit = json.dumps(audit_payload)
        assert "https://" not in serialized_audit
        assert "signature" not in serialized_audit
        assert "images.provider.example" not in serialized_audit


def test_admin_audio_provider_env_settings_routes_are_retired(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)

    get_response = client.get(
        "/internal/service/admin/audio-providers",
        headers=build_internal_headers(),
    )
    post_response = client.post(
        "/internal/service/admin/audio-providers",
        headers=build_internal_headers(idempotency_key="audio-provider-save-retired"),
        json={"provider_mode": "minimax"},
    )
    test_response = client.post(
        "/internal/service/admin/audio-providers/minimax/test",
        headers=build_internal_headers(idempotency_key="audio-provider-test-retired"),
        json={},
    )

    assert get_response.status_code == 404
    assert post_response.status_code == 404
    assert test_response.status_code == 404


def test_admin_ai_resources_projects_connections_capabilities_and_profiles(
    tmp_path: Path,
) -> None:
    _, client = _build_client(
        tmp_path,
        settings_overrides={
            "openai_api_key": "openai-test-secret",
            "openai_provider_label": "GPT 5.5 hosted",
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
            "minimax_group_id": "group-test-secret",
        },
    )

    response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["surface"] == "admin_ai_resources"
    connection_ids = {item["connection_id"] for item in data["connections"]}
    capability_ids = {item["capability_id"] for item in data["capabilities"]}
    matrix_ids = {item["capability_id"] for item in data["capability_matrix"]}
    profile_ids = {item["profile_id"] for item in data["runtime_profiles"]}
    assert "web_search_tavily" not in connection_ids
    assert "image_source_unsplash" not in connection_ids
    assert "embedding_deterministic" not in connection_ids
    assert {"text_generation", "audio_generation", "image_generation", "embedding"}.issubset(
        capability_ids
    )
    assert {"text_generation", "audio_generation", "image_generation", "embedding"}.issubset(
        matrix_ids
    )
    feature_ids = {item["feature_id"] for item in data["feature_model_usage"]}
    assert {
        "content_support",
        "audio_summary_script",
        "article_narration",
        "article_audio_summary",
        "generated_image_candidates",
        "site_knowledge_embedding",
    }.issubset(feature_ids)
    assert data["provider_model_health"]["source"] == "provider_call_records"
    assert data["provider_model_health"]["content_exposed"] is False
    assert data["provider_model_health"]["boundary"]["not_a_control_plane"] is True
    assert {
        TEXT_AI_PROFILE_ID,
        "audio.narration.default",
        "audio.summary.default",
        "grok-imagine-image-quality",
        "embed.default",
    }.issubset(profile_ids)
    matrix = {item["capability_id"]: item for item in data["capability_matrix"]}
    assert matrix["text_generation"]["selection_owner"] == "cloud_runtime_metadata"
    assert matrix["text_generation"]["direct_wordpress_write"] is False
    assert matrix["image_generation"]["write_posture"] == "candidate_artifact_only"
    assert matrix["embedding"]["default_profile_id"] == "embed.default"
    assert data["boundary"]["direct_wordpress_write"] is False
    assert data["boundary"]["not_a_control_plane"] is True
    serialized = json.dumps(data)
    assert "openai-test-secret" not in serialized
    assert "minimax-test-secret" not in serialized
    assert "group-test-secret" not in serialized


def test_admin_runtime_profiles_requires_auth_and_idempotency_and_retires_old_routes(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)
    new_path = "/internal/service/admin/runtime-profiles"
    old_paths = (
        "/internal/service/admin/ability-models/runtime-projection",
        "/internal/service/admin/ability-models/runtime-binding",
        "/internal/service/admin/ability-models/plugin-routing",
    )

    unauthorized = client.get(new_path)
    assert unauthorized.status_code == 401

    missing_idempotency = client.put(
        new_path,
        headers=merge_json_headers(build_internal_headers()),
        json={
            "contract_version": "cloud-hosted-runtime-profiles.v1",
            "platform_kind": "wordpress",
            "connector_id": "wordpress_ai_connector",
            "operation_contract_version": "wordpress_operation.v1",
            "profiles": [],
        },
    )
    assert missing_idempotency.status_code == 401
    assert missing_idempotency.json()["error_code"] == "auth.idempotency_required"

    for old_path in old_paths:
        assert client.get(old_path, headers=build_internal_headers()).status_code == 404
        assert (
            client.post(
                old_path,
                headers=merge_json_headers(
                    build_internal_headers(idempotency_key=f"retired-{old_path.rsplit('/', 1)[-1]}")
                ),
                json={},
            ).status_code
            == 404
        )


def test_admin_provider_connections_store_encrypted_credentials_and_project_to_ai_resources(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)

    response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-save"),
        json={
            "connection_id": "openai_primary",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "OpenAI primary",
            "enabled": True,
            "base_url": "https://api.openai.test/v1",
            "capability_ids": ["text_generation", "image_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID, "grok-imagine-image-quality"],
            "config": {
                "model_ids": ["gpt-5.5", "gpt-4o-mini"],
                "model_id": "gpt-5.5",
            },
            "credential": "provider-connection-test-secret",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["connection_id"] == "openai_primary"
    assert data["status"] == "ready"
    assert data["configured"] is True
    assert data["configuration_status"] == "ready"
    assert data["verification_status"] == "not_observed"
    assert data["attention_required"] is True
    assert data["attention_reasons"] == [
        "verification_not_observed",
        "image_delivery_unconfirmed",
    ]
    assert "priority" not in data
    assert "note" not in data
    assert data["receipt"]["event_kind"] == "provider_connection.save"
    assert data["receipt"]["scope_kind"] == "provider_connection"
    assert data["receipt"]["scope_id"] == "openai_primary"
    assert data["receipt"]["audit_state"] == "persisted"
    assert data["receipt"]["audit_filters"]["event_kind"] == "provider_connection.save"
    assert data["model_ids"] == ["gpt-5.5", "gpt-4o-mini"]
    assert data["secrets"]["credential"]["display"] == "configured"
    serialized = json.dumps(response.json())
    assert "provider-connection-test-secret" not in serialized

    retired_fields_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-retired-fields"),
        json={
            "connection_id": "legacy_provider_fields",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "display_name": "Legacy provider fields",
            "priority": 10,
            "note": "retired",
        },
    )
    assert retired_fields_response.status_code == 422

    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "openai_primary")
        assert row is not None
        assert row.secret_ciphertext
        assert "provider-connection-test-secret" not in row.secret_ciphertext
        services = client.app.state.services
        assert (
            decrypt_provider_connection_secret(
                row.secret_ciphertext,
                settings=services.settings,
            )
            == "provider-connection-test-secret"
        )
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(ServiceAuditEvent.event_kind == "provider_connection.save")
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        assert audit_event.outcome == "succeeded"
        assert audit_event.scope_kind == "provider_connection"
        assert audit_event.scope_id == "openai_primary"
        audit_payload = audit_event.payload_json or {}
        assert audit_payload["request"]["credential_provided"] is True
        assert audit_payload["credential_value_exposure"] == "presence_only"
        assert "provider-connection-test-secret" not in json.dumps(audit_payload)

    projection_response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )
    assert projection_response.status_code == 200, projection_response.text
    projection = projection_response.json()["data"]
    connections = {item["connection_id"]: item for item in projection["connections"]}
    assert connections["openai_primary"]["managed_by"] == "cloud_provider_connections"
    assert connections["openai_primary"]["model_ids"] == ["gpt-5.5", "gpt-4o-mini"]
    capabilities = {item["capability_id"]: item for item in projection["capabilities"]}
    assert "openai_primary" in capabilities["text_generation"]["connection_ids"]
    assert "openai_primary" in capabilities["image_generation"]["connection_ids"]
    assert projection["runtime_resolution"]
    assert "env_migration" not in projection
    assert "provider-connection-test-secret" not in json.dumps(projection)


def test_admin_provider_connection_save_returns_json_when_secret_storage_is_unavailable(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"service_settings_encryption_key_id": None},
    )

    response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(
            idempotency_key="provider-connection-secret-storage-unavailable"
        ),
        json={
            "connection_id": "unavailable_secret_storage",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "Unavailable secret storage",
            "enabled": False,
            "base_url": "https://api.openai.test/v1",
            "credential": "provider-connection-test-secret",
        },
    )

    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["error_code"] == ("provider_connection.credential_storage_unavailable")
    assert payload["message"] == "provider credential storage is unavailable"
    assert "provider-connection-test-secret" not in response.text

    with get_session(database_url) as session:
        assert session.get(ProviderConnection, "unavailable_secret_storage") is None


def test_admin_provider_connection_catalog_preview_fetches_models_without_persisting(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)

    def fake_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id="mqzj",
            display_name="MQZJ",
            adapter_type="openai",
            models=[
                CatalogModelSeed(
                    model_id="gpt-5.5",
                    family="gpt-5.5",
                    feature="text",
                    status="available",
                    instances=[
                        CatalogInstanceSeed(
                            instance_id="mqzj-gpt55",
                            endpoint_variant="chat_completions",
                            region="test",
                        )
                    ],
                ),
                CatalogModelSeed(
                    model_id="gpt-4o-mini",
                    family="gpt-4o",
                    feature="text",
                    status="available",
                    instances=[],
                ),
            ],
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-catalog"),
        json={
            "connection_id": "mqzj_preview",
            "provider_id": "mqzj",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "MQZJ",
            "enabled": True,
            "base_url": "https://api.mqzj.top/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "preview-secret-value",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["surface"] == "admin_provider_connection_catalog_preview"
    assert data["model_count"] == 2
    assert data["model_ids"] == ["gpt-5.5", "gpt-4o-mini"]
    assert data["truncated"] is False
    assert data["models"][0] == {
        "model_id": "gpt-5.5",
        "family": "gpt-5.5",
        "feature": "text",
        "status": "available",
        "is_deprecated": False,
        "runtime_supported": True,
        "verified": True,
        "capability_tags": [],
    }
    assert data["models"][1]["runtime_supported"] is False
    assert data["credential_value_exposure"] == "none"
    assert data["boundary"]["secret_exposure"] == "masked_status_only"
    assert "preview-secret-value" not in json.dumps(response.json())
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, "mqzj_preview") is None


def test_admin_provider_connection_test_syncs_catalog_for_openai_compatible_supplier(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, client = _build_client(tmp_path)

    def fake_fetch_catalog(self: Any) -> ProviderCatalogSnapshot:
        provider_id = str(getattr(self, "provider_id", "") or "")
        display_name = str(getattr(self, "display_name", "") or "")
        return ProviderCatalogSnapshot(
            provider_id=provider_id,
            display_name=display_name,
            adapter_type="openai",
            models=[
                CatalogModelSeed(
                    model_id="deepseek/deepseek-chat",
                    family="deepseek",
                    feature="text",
                    status="available",
                    instances=[
                        CatalogInstanceSeed(
                            instance_id=f"{provider_id}-global-deepseek-chat",
                            endpoint_variant="chat_completions",
                            region="global",
                            capability_tags=["text", "balanced"],
                            is_default=True,
                            weight=100,
                        )
                    ],
                )
            ],
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-deepseek-save"),
        json={
            "connection_id": "deepseek",
            "provider_id": "deepseek",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "DeepSeek",
            "enabled": True,
            "base_url": "https://api.deepseek.com/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "config": {"model_ids": ["deepseek-chat"], "model_id": "deepseek-chat"},
            "credential": "deepseek-secret-value",
        },
    )
    assert create_response.status_code == 200, create_response.text

    test_response = client.post(
        "/internal/service/admin/provider-connections/deepseek/test",
        headers=build_internal_headers(idempotency_key="provider-connection-deepseek-test"),
    )

    assert test_response.status_code == 200, test_response.text
    test_data = test_response.json()["data"]
    assert test_data["catalog"]["provider_id"] == "deepseek"
    assert test_data["catalog"]["display_name"] == "DeepSeek"
    assert test_data["catalog"]["adapter_type"] == "openai"
    assert test_data["catalog"]["sync"]["status"] == "synced"
    assert test_data["receipt"]["event_kind"] == "provider_connection.test"
    assert test_data["receipt"]["scope_id"] == "deepseek"
    assert test_data["receipt"]["audit_filters"]["event_kind"] == "provider_connection.test"
    assert "deepseek-secret-value" not in json.dumps(test_response.json())

    routing_response = client.get(
        "/internal/service/admin/runtime-profiles",
        headers=build_internal_headers(),
    )

    assert routing_response.status_code == 200, routing_response.text
    routing_data = routing_response.json()["data"]
    deepseek_instances = [
        item
        for item in routing_data["available_instances"]["text"]
        if item["provider_id"] == "deepseek"
    ]
    assert deepseek_instances
    assert deepseek_instances[0]["provider_display_name"] == "DeepSeek"
    assert deepseek_instances[0]["adapter_type"] == "openai"
    assert deepseek_instances[0]["model_id"] == "deepseek/deepseek-chat"


def test_admin_provider_connection_catalog_preview_returns_all_upstream_models(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)

    def fake_fetch_catalog(self: Any) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id="minimax",
            display_name="MiniMax",
            adapter_type="minimax",
            models=[
                CatalogModelSeed(
                    model_id=f"minimax-model-{index:03d}",
                    family="minimax",
                    feature="text" if index % 2 else "audio",
                    status="available",
                    instances=[
                        CatalogInstanceSeed(
                            instance_id=f"minimax-model-{index:03d}",
                            endpoint_variant="runtime",
                            region="global",
                        )
                    ],
                )
                for index in range(1, 110)
            ],
        )

    monkeypatch.setattr(
        "app.adapters.providers.minimax.MiniMaxProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-full-catalog"),
        json={
            "connection_id": "minimax_preview",
            "provider_id": "minimax",
            "provider_type": "minimax",
            "kind": "minimax",
            "display_name": "MiniMax",
            "enabled": True,
            "base_url": "https://api.minimaxi.com",
            "capability_ids": [
                "text_generation",
                "image_generation",
                "audio_generation",
                "video_generation",
            ],
            "runtime_profile_ids": [],
            "credential": "preview-secret-value",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["model_count"] == 109
    assert len(data["model_ids"]) == 109
    assert len(data["models"]) == 109
    assert data["model_ids"][-1] == "minimax-model-109"
    assert data["models"][-1]["model_id"] == "minimax-model-109"
    assert data["truncated"] is False


def test_admin_provider_connection_catalog_preview_uses_saved_secret_without_exposing_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-saved-create"),
        json={
            "connection_id": "mqzj_saved",
            "provider_id": "mqzj",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "MQZJ",
            "enabled": True,
            "base_url": "https://api.mqzj.top/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "saved-preview-secret",
        },
    )
    assert create_response.status_code == 200, create_response.text

    def fake_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id="mqzj",
            display_name="MQZJ",
            adapter_type="openai",
            models=[
                CatalogModelSeed(
                    model_id="gpt-5.5",
                    family="gpt-5.5",
                    feature="text",
                    status="available",
                    instances=[],
                )
            ],
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-saved"),
        json={
            "connection_id": "mqzj_saved",
            "provider_id": "mqzj",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "MQZJ",
            "enabled": True,
            "base_url": "https://api.mqzj.top/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["model_ids"] == ["gpt-5.5"]
    assert "saved-preview-secret" not in json.dumps(response.json())
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, "mqzj_saved") is not None


def test_admin_provider_connection_catalog_preview_reports_unreadable_saved_secret(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(
            idempotency_key="provider-connection-preview-unreadable-create"
        ),
        json={
            "connection_id": "minimax_unreadable",
            "provider_id": "minimax",
            "provider_type": "minimax",
            "kind": "minimax",
            "display_name": "MiniMax",
            "enabled": True,
            "base_url": "https://api.minimaxi.com",
            "capability_ids": ["audio_generation"],
            "runtime_profile_ids": [AUDIO_NARRATION_PROFILE_ID],
            "credential": "saved-preview-secret",
        },
    )
    assert create_response.status_code == 200, create_response.text
    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "minimax_unreadable")
        assert row is not None
        row.secret_ciphertext = "not-a-valid-fernet-token"
        session.commit()

    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-unreadable"),
        json={
            "connection_id": "minimax_unreadable",
            "provider_id": "minimax",
            "provider_type": "minimax",
            "kind": "minimax",
            "display_name": "MiniMax",
            "enabled": True,
            "base_url": "https://api.minimaxi.com",
            "capability_ids": ["audio_generation"],
            "runtime_profile_ids": [AUDIO_NARRATION_PROFILE_ID],
        },
    )

    assert response.status_code == 400, response.text
    payload = response.json()
    assert payload["error_code"] == "provider_connection.saved_credential_unreadable"
    assert payload["message"] == (
        "saved provider credential cannot be decrypted; enter the API key again and save"
    )
    assert "saved-preview-secret" not in json.dumps(payload)


def test_admin_provider_connection_catalog_preview_error_hides_upstream_detail(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, client = _build_client(tmp_path)

    def fake_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        raise RuntimeError("traceback with preview-secret-value and provider stack frame")

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="provider-connection-preview-error"),
        json={
            "connection_id": "mqzj_preview_error",
            "provider_id": "mqzj",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "MQZJ",
            "enabled": True,
            "base_url": "https://api.mqzj.top/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "preview-secret-value",
        },
    )

    assert response.status_code == 502, response.text
    payload = response.json()
    assert payload["error_code"] == "provider_connection.test_failed"
    assert payload["message"] == "provider connection catalog preview failed"
    serialized = json.dumps(payload)
    assert "preview-secret-value" not in serialized
    assert "traceback" not in serialized
    assert "provider stack frame" not in serialized


def test_admin_model_references_syncs_models_dev_payload_as_reference_only(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    response = client.post(
        "/internal/service/admin/model-references/sync",
        headers=build_internal_headers(idempotency_key="model-references-sync"),
        json={
            "payload": {
                "providers": {
                    "openai": {
                        "id": "openai",
                        "name": "OpenAI",
                        "doc": "https://platform.openai.com/docs",
                        "models": {
                            "gpt-5.5": {
                                "id": "gpt-5.5",
                                "name": "GPT-5.5",
                                "family": "gpt",
                                "reasoning": True,
                                "tool_call": True,
                                "structured_output": True,
                                "release_date": "2026-06-01",
                                "last_updated": "2026-06-18",
                                "modalities": {
                                    "input": ["text", "image"],
                                    "output": ["text"],
                                },
                                "limit": {"context": 256000, "output": 64000},
                                "cost": {
                                    "input": 1.25,
                                    "output": 10.0,
                                    "cache_read": 0.125,
                                },
                            },
                            "gpt-image-2": {
                                "id": "gpt-image-2",
                                "name": "GPT Image 2",
                                "family": "gpt-image",
                                "deprecated": True,
                                "modalities": {
                                    "input": ["text", "image"],
                                    "output": ["image"],
                                },
                                "limit": {"context": 32000, "output": 1},
                                "cost": {
                                    "input": 2.0,
                                    "output": 12.0,
                                },
                            },
                        },
                    },
                    "deepseek": {
                        "id": "deepseek",
                        "name": "DeepSeek",
                        "doc": "https://api-docs.deepseek.com",
                        "models": {
                            "deepseek-v4-flash": {
                                "id": "deepseek-v4-flash",
                                "name": "DeepSeek V4 Flash",
                                "family": "deepseek",
                                "reasoning": True,
                                "modalities": {
                                    "input": ["text"],
                                    "output": ["text"],
                                },
                                "limit": {"context": 128000, "output": 8000},
                                "cost": {
                                    "input": 0.14,
                                    "output": 0.28,
                                    "cache_read": 0.0028,
                                },
                            },
                            "deepseek-v4-pro": {
                                "id": "deepseek-v4-pro",
                                "name": "DeepSeek V4 Pro",
                                "family": "deepseek",
                                "reasoning": True,
                                "modalities": {
                                    "input": ["text"],
                                    "output": ["text"],
                                },
                                "limit": {"context": 128000, "output": 8000},
                                "cost": {
                                    "input": 0.435,
                                    "output": 0.87,
                                    "cache_read": 0.003625,
                                },
                            },
                        },
                    },
                }
            }
        },
    )

    assert response.status_code == 200, response.text
    sync_data = response.json()["data"]
    assert sync_data["surface"] == "admin_model_reference_sync"
    assert sync_data["source_id"] == "models.dev"
    assert sync_data["model_count"] == 4
    assert sync_data["price_unit"] == "usd_per_1m_tokens"
    assert sync_data["billing_truth"] is False
    assert sync_data["boundary"]["reference_only"] is True
    assert sync_data["boundary"]["routing_truth"] is False

    with get_session(database_url) as session:
        source = session.get(ModelReferenceSource, "models.dev")
        assert source is not None
        assert source.status == "active"

    list_response = client.get(
        "/internal/service/admin/model-references?provider_id=openai",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200, list_response.text
    data = list_response.json()["data"]
    assert data["surface"] == "admin_model_references"
    assert data["boundary"]["billing_truth"] is False
    assert data["total"] == 2
    assert data["items"][0]["model_id"] == "gpt-5.5"
    assert data["items"][0]["feature"] == "text"
    assert data["items"][0]["capability_flags"]["reasoning"] is True
    assert data["items"][0]["price"] == {
        "input": 1.25,
        "output": 10.0,
        "cache_read": 0.125,
        "cache_write": None,
        "unit": "usd_per_1m_tokens",
        "billing_truth": False,
    }
    assert "OpenAI" in json.dumps(data)

    image_response = client.get(
        "/internal/service/admin/model-references?provider_id=openai&feature=image",
        headers=build_internal_headers(),
    )
    assert image_response.status_code == 200, image_response.text
    image_data = image_response.json()["data"]
    assert image_data["total"] == 1
    assert image_data["items"][0]["model_id"] == "gpt-image-2"
    assert image_data["items"][0]["feature"] == "image"
    assert image_data["items"][0]["is_deprecated"] is True

    deepseek_response = client.get(
        "/internal/service/admin/model-references?provider_id=deepseek",
        headers=build_internal_headers(),
    )
    assert deepseek_response.status_code == 200, deepseek_response.text
    deepseek_data = deepseek_response.json()["data"]
    assert deepseek_data["total"] == 2
    assert deepseek_data["items"][0]["model_id"] == "deepseek-v4-flash"
    assert deepseek_data["items"][0]["feature"] == "text"
    assert deepseek_data["items"][0]["context_window"] == 128000
    assert deepseek_data["items"][0]["price"]["cache_read"] == 0.0028
    assert deepseek_data["items"][1]["model_id"] == "deepseek-v4-pro"

    active_response = client.get(
        "/internal/service/admin/model-references?provider_id=openai&include_deprecated=false&search=image",
        headers=build_internal_headers(),
    )
    assert active_response.status_code == 200, active_response.text
    active_data = active_response.json()["data"]
    assert active_data["total"] == 0

    with get_session(database_url) as session:
        row = session.scalar(
            select(ModelReferenceModel).where(
                ModelReferenceModel.provider_id == "openai",
                ModelReferenceModel.model_id == "gpt-5.5",
            )
        )
        assert row is not None
        assert row.context_window == 256000


def test_admin_model_references_sync_rejects_caller_controlled_source_url_before_http(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, client = _build_client(tmp_path)

    class UnexpectedHttpClient:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise AssertionError("caller-controlled source URL reached the HTTP client")

    monkeypatch.setattr("app.domain.model_references.httpx.Client", UnexpectedHttpClient)

    response = client.post(
        "/internal/service/admin/model-references/sync",
        headers=build_internal_headers(idempotency_key="model-references-reject-source-url"),
        json={"source_url": "http://127.0.0.1:8000/internal/service/observability/summary"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"][0]["type"] == "extra_forbidden"


def test_admin_model_references_sync_fetches_only_fixed_models_dev_url(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, client = _build_client(tmp_path)
    requested_urls: list[str] = []

    class FixedSourceHttpClient:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def __enter__(self) -> FixedSourceHttpClient:
            return self

        def __exit__(
            self,
            _exc_type: object,
            _exc_value: object,
            _traceback: object,
        ) -> None:
            return None

        def get(self, source_url: str) -> httpx.Response:
            requested_urls.append(source_url)
            return httpx.Response(
                200,
                request=httpx.Request("GET", source_url),
                json={
                    "providers": {
                        "openai": {
                            "models": {
                                "gpt-fixed-source": {
                                    "id": "gpt-fixed-source",
                                    "name": "GPT Fixed Source",
                                }
                            }
                        }
                    }
                },
            )

    monkeypatch.setattr("app.domain.model_references.httpx.Client", FixedSourceHttpClient)

    response = client.post(
        "/internal/service/admin/model-references/sync",
        headers=build_internal_headers(idempotency_key="model-references-fixed-source"),
        json={},
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["model_count"] == 1
    assert response.json()["data"]["source_url"] == MODELS_DEV_API_URL
    assert requested_urls == [MODELS_DEV_API_URL]


def test_admin_ai_resources_lists_only_added_capability_provider_connections(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)

    initial_response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )
    assert initial_response.status_code == 200, initial_response.text
    initial_connections = {
        item["connection_id"]: item for item in initial_response.json()["data"]["connections"]
    }
    assert "search_apify" not in initial_connections
    assert "web_search_tavily" not in initial_connections

    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-apify-save"),
        json={
            "connection_id": "search_apify",
            "provider_id": "apify",
            "provider_type": "web_search_provider",
            "kind": "web_search_provider",
            "display_name": "Apify",
            "enabled": True,
            "base_url": "https://api.apify.com/v2",
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.managed"],
            "credential": "apify-provider-secret",
        },
    )
    assert create_response.status_code == 200, create_response.text

    projection_response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )
    assert projection_response.status_code == 200, projection_response.text
    projection = projection_response.json()["data"]
    connections = {item["connection_id"]: item for item in projection["connections"]}
    web_search_connections = [
        item for item in projection["connections"] if item.get("kind") == "web_search_provider"
    ]

    assert list(connections.keys()).count("search_apify") == 1
    assert connections["search_apify"]["provider_id"] == "apify"
    assert connections["search_apify"]["status"] == "ready"
    assert connections["search_apify"]["configuration_status"] == "ready"
    assert connections["search_apify"]["verification_status"] == "not_observed"
    assert connections["search_apify"]["attention_required"] is True
    assert connections["search_apify"]["attention_reasons"] == ["verification_not_observed"]
    assert [item["connection_id"] for item in web_search_connections] == ["search_apify"]
    capabilities = {item["capability_id"]: item for item in projection["capabilities"]}
    assert capabilities["web_search"]["connection_ids"] == ["search_apify"]
    assert "apify-provider-secret" not in json.dumps(projection)


def _assert_admin_provider_test_failure_is_redacted(
    *,
    database_url: str,
    client: TestClient,
    connection_id: str,
    idempotency_key: str,
    expected_stage: str,
    expected_error_code: str,
    expected_message: str,
    redacted_values: tuple[str, ...],
) -> None:
    response = client.post(
        f"/internal/service/admin/provider-connections/{connection_id}/test",
        headers=build_internal_headers(idempotency_key=idempotency_key),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["error_code"] == expected_error_code
    assert payload["message"] == expected_message
    data = payload["data"]
    assert data["ok"] is False
    assert data["stage"] == expected_stage
    assert data["error_code"] == expected_error_code
    assert data["message"] == expected_message
    serialized_response = json.dumps(payload)
    for value in redacted_values:
        assert value not in serialized_response

    with get_session(database_url) as session:
        row = session.get(ProviderConnection, connection_id)
        assert row is not None
        assert row.last_error_code == expected_error_code
        assert row.last_error_message == expected_message
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(
                ServiceAuditEvent.event_kind == "provider_connection.test",
                ServiceAuditEvent.scope_id == connection_id,
            )
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        audit_payload = audit_event.payload_json or {}
        assert audit_payload["error_code"] == expected_error_code
        assert audit_payload["message"] == expected_message
        assert audit_payload["result"]["test"]["stage"] == expected_stage
        serialized_audit = json.dumps(audit_payload)
        for value in redacted_values:
            assert value not in serialized_audit

    list_response = client.get(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200, list_response.text
    listed = next(
        item
        for item in list_response.json()["data"]["connections"]
        if item["connection_id"] == connection_id
    )
    assert listed["status"] == "ready"
    assert listed["configuration_status"] == "ready"
    assert listed["verification_status"] == "failed"
    assert listed["attention_required"] is True
    assert "last_test_failed" in listed["attention_reasons"]


def test_admin_provider_connection_test_redacts_catalog_fetch_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-catalog-failure-create"),
        json={
            "connection_id": "catalog_failure",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "Catalog failure",
            "enabled": True,
            "base_url": "https://api.openai.test/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "catalog-secret-value",
        },
    )
    assert create_response.status_code == 200, create_response.text

    class MaliciousCatalogError(RuntimeError):
        error_code = "provider.private_catalog-secret-value"

    def fail_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        raise MaliciousCatalogError(
            "auth failure credential=catalog-secret-value "
            "at /srv/private/provider.py with traceback"
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fail_fetch_catalog,
    )

    _assert_admin_provider_test_failure_is_redacted(
        database_url=database_url,
        client=client,
        connection_id="catalog_failure",
        idempotency_key="provider-catalog-failure-test",
        expected_stage="catalog_fetch",
        expected_error_code="provider_connection.auth_failed",
        expected_message="provider catalog request failed",
        redacted_values=(
            "catalog-secret-value",
            "provider.private_catalog-secret-value",
            "/srv/private/provider.py",
            "traceback",
        ),
    )


def test_admin_provider_connection_test_redacts_catalog_sync_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-sync-failure-create"),
        json={
            "connection_id": "catalog_sync_failure",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "Catalog sync failure",
            "enabled": True,
            "base_url": "https://api.openai.test/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "catalog-sync-secret-value",
        },
    )
    assert create_response.status_code == 200, create_response.text

    def fake_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id="openai",
            display_name="Catalog sync failure",
            adapter_type="openai",
            models=[
                CatalogModelSeed(
                    model_id="sync-test-model",
                    family="sync-test-model",
                    feature="text",
                    status="available",
                    instances=[],
                )
            ],
        )

    def fail_store_provider_snapshot(*_args: object, **_kwargs: object) -> dict[str, Any]:
        raise RuntimeError(
            "catalog-sync-secret-value leaked from /srv/private/catalog_sync.py traceback"
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )
    monkeypatch.setattr(
        CatalogService,
        "store_provider_snapshot",
        fail_store_provider_snapshot,
    )

    _assert_admin_provider_test_failure_is_redacted(
        database_url=database_url,
        client=client,
        connection_id="catalog_sync_failure",
        idempotency_key="provider-sync-failure-test",
        expected_stage="catalog_sync",
        expected_error_code="provider_connection.catalog_sync_failed",
        expected_message="provider catalog sync failed",
        redacted_values=(
            "catalog-sync-secret-value",
            "/srv/private/catalog_sync.py",
            "traceback",
        ),
    )


def test_admin_provider_connection_test_redacts_web_search_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-search-failure-create"),
        json={
            "connection_id": "search_failure",
            "provider_id": "tavily",
            "provider_type": "web_search_provider",
            "kind": "web_search_provider",
            "display_name": "Search failure",
            "enabled": True,
            "base_url": "https://api.tavily.test",
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.managed"],
            "credential": "search-probe-secret-value",
        },
    )
    assert create_response.status_code == 200, create_response.text

    class MaliciousWebSearchError(RuntimeError):
        error_code = "provider.timeout"

    def fail_web_search(*_args: object, **_kwargs: object) -> WebSearchExecutionResult:
        raise MaliciousWebSearchError(
            "search-probe-secret-value from /srv/private/search.py with traceback"
        )

    monkeypatch.setattr(
        "app.domain.provider_connections.service.WebSearchService.execute",
        fail_web_search,
    )

    _assert_admin_provider_test_failure_is_redacted(
        database_url=database_url,
        client=client,
        connection_id="search_failure",
        idempotency_key="provider-search-failure-test",
        expected_stage="web_search_probe",
        expected_error_code="provider.timeout",
        expected_message="web search provider probe failed",
        redacted_values=(
            "search-probe-secret-value",
            "/srv/private/search.py",
            "traceback",
        ),
    )


def test_admin_provider_connection_test_redacts_jina_reader_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-reader-failure-create"),
        json={
            "connection_id": "reader_failure",
            "provider_id": "jina_reader",
            "provider_type": "web_search_provider",
            "kind": "web_search_provider",
            "display_name": "Reader failure",
            "enabled": True,
            "base_url": "https://r.jina.test",
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.reader"],
        },
    )
    assert create_response.status_code == 200, create_response.text

    class FailingReaderClient:
        def __init__(self, *, timeout: float) -> None:
            assert timeout > 0

        def __enter__(self) -> FailingReaderClient:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def get(self, url: str, *, headers: dict[str, str]) -> httpx.Response:
            assert url == "https://r.jina.test/https://example.com/"
            assert headers == {"Accept": "text/plain"}
            raise RuntimeError(
                "network connect reader-secret-value at /srv/private/reader.py with traceback"
            )

    monkeypatch.setattr(
        "app.domain.provider_connections.service.httpx.Client",
        FailingReaderClient,
    )

    _assert_admin_provider_test_failure_is_redacted(
        database_url=database_url,
        client=client,
        connection_id="reader_failure",
        idempotency_key="provider-reader-failure-test",
        expected_stage="web_search_reader_probe",
        expected_error_code="provider_connection.network_error",
        expected_message="web search reader probe failed",
        redacted_values=(
            "reader-secret-value",
            "/srv/private/reader.py",
            "traceback",
        ),
    )


def test_admin_provider_connection_test_updates_masked_diagnostics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-test-create"),
        json={
            "connection_id": "openai_testable",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "OpenAI testable",
            "enabled": True,
            "base_url": "https://api.openai.test/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "provider-connection-test-secret",
        },
    )

    def fake_fetch_catalog(self: object) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id="openai",
            display_name="OpenAI testable",
            adapter_type="openai",
            models=[
                CatalogModelSeed(
                    model_id="gpt-test",
                    family="gpt-test",
                    feature="text",
                    status="available",
                    instances=[
                        CatalogInstanceSeed(
                            instance_id="openai-test-text",
                            endpoint_variant="responses",
                            region="test",
                        )
                    ],
                )
            ],
        )

    monkeypatch.setattr(
        "app.adapters.providers.openai.OpenAIProviderAdapter.fetch_catalog",
        fake_fetch_catalog,
    )

    response = client.post(
        "/internal/service/admin/provider-connections/openai_testable/test",
        headers=build_internal_headers(idempotency_key="provider-connection-test-run"),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["ok"] is True
    assert data["status"] == "ready"
    assert data["catalog"]["model_count"] == 1
    assert data["catalog"]["sample_model_ids"] == ["gpt-test"]
    assert "provider-connection-test-secret" not in json.dumps(response.json())
    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "openai_testable")
        assert row is not None
        assert row.last_tested_at is not None
        assert row.last_error_code in {None, ""}

    list_response = client.get(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(),
    )
    listed = next(
        item
        for item in list_response.json()["data"]["connections"]
        if item["connection_id"] == "openai_testable"
    )
    assert listed["verification_status"] == "passed"
    assert listed["attention_required"] is False

    update_response = client.patch(
        "/internal/service/admin/provider-connections/openai_testable",
        headers=build_internal_headers(idempotency_key="provider-connection-test-update"),
        json={
            "connection_id": "openai_testable",
            "provider_id": "openai",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "OpenAI testable",
            "enabled": True,
            "base_url": "https://api.openai.changed.test/v1",
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()["data"]
    assert updated["status"] == "ready"
    assert updated["last_tested_at"] == ""
    assert updated["verification_status"] == "not_observed"
    assert updated["attention_required"] is True
    assert "verification_not_observed" in updated["attention_reasons"]


def test_admin_provider_connection_test_runs_web_search_probe_without_result_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-web-search-create"),
        json={
            "connection_id": "search_tavily_probe",
            "provider_id": "tavily",
            "provider_type": "web_search_provider",
            "kind": "web_search_provider",
            "display_name": "Tavily probe",
            "enabled": True,
            "base_url": "https://api.tavily.test",
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.managed"],
            "credential": "tavily-provider-secret",
        },
    )

    def fake_search(
        self: TavilyWebSearchProvider,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> WebSearchExecutionResult:
        assert query == "WordPress AI provider connection smoke test"
        assert options["provider"] == "tavily"
        assert site_id == "admin_provider_connection_test"
        assert run_id.startswith("provider-connection-test-search_tavily_probe-")
        return WebSearchExecutionResult(
            result_json={
                "artifact_type": "web_search_results",
                "provider": "tavily",
                "result_count": 1,
                "results": [
                    {
                        "title": "Do not expose this result title",
                        "url": "https://example.com/source",
                        "snippet": "Do not expose this snippet",
                    }
                ],
                "write_posture": "suggestion_only",
                "direct_wordpress_write": False,
            },
            usage=WebSearchProviderUsage(
                provider_id="tavily",
                model_id="web-search",
                instance_id="cloud-managed",
                region="unspecified",
                latency_ms=17,
            ),
        )

    monkeypatch.setattr(TavilyWebSearchProvider, "search", fake_search)

    response = client.post(
        "/internal/service/admin/provider-connections/search_tavily_probe/test",
        headers=build_internal_headers(idempotency_key="provider-connection-web-search-test"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    data = payload["data"]
    assert data["ok"] is True
    assert data["stage"] == "web_search_probe"
    assert data["probe"] == {
        "provider_id": "tavily",
        "result_count": 1,
        "latency_ms": 17,
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
    }
    serialized = json.dumps(payload)
    assert "tavily-provider-secret" not in serialized
    assert "Do not expose this result title" not in serialized
    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "search_tavily_probe")
        assert row is not None
        assert row.status == "ready"
        assert row.last_tested_at is not None
        assert row.last_error_code in {None, ""}


def test_admin_provider_connection_test_runs_jina_reader_probe_as_secretless_enhancement(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-jina-reader-create"),
        json={
            "connection_id": "search_jina_reader_probe",
            "provider_id": "jina_reader",
            "provider_type": "web_search_provider",
            "kind": "web_search_provider",
            "display_name": "Jina Reader probe",
            "enabled": True,
            "base_url": "https://r.jina.test",
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.reader"],
        },
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()["data"]
    assert created["configured"] is True
    assert created["status"] == "ready"

    def fail_web_search_execute(*args: object, **kwargs: object) -> None:
        raise AssertionError("Jina Reader probe must not run the primary web search service")

    class FakeReaderClient:
        def __init__(self, *, timeout: float) -> None:
            assert timeout > 0

        def __enter__(self) -> FakeReaderClient:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def get(self, url: str, *, headers: dict[str, str]) -> httpx.Response:
            assert url == "https://r.jina.test/https://example.com/"
            assert headers == {"Accept": "text/plain"}
            return httpx.Response(
                200,
                content=b"Readable source text that must not leak.",
                request=httpx.Request("GET", url),
            )

    monkeypatch.setattr(
        "app.domain.provider_connections.service.WebSearchService.execute",
        fail_web_search_execute,
    )
    monkeypatch.setattr("app.domain.provider_connections.service.httpx.Client", FakeReaderClient)

    response = client.post(
        "/internal/service/admin/provider-connections/search_jina_reader_probe/test",
        headers=build_internal_headers(idempotency_key="provider-connection-jina-reader-test"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    data = payload["data"]
    assert data["ok"] is True
    assert data["stage"] == "web_search_reader_probe"
    assert data["probe"] == {
        "provider_id": "jina_reader",
        "result_count": 1,
        "latency_ms": data["probe"]["latency_ms"],
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
    }
    assert isinstance(data["probe"]["latency_ms"], int)
    assert data["probe"]["latency_ms"] >= 0
    serialized = json.dumps(payload)
    assert "Readable source text" not in serialized
    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "search_jina_reader_probe")
        assert row is not None
        assert row.status == "ready"
        assert (row.config_json or {})["secretless"] is True
        assert row.last_tested_at is not None
        assert row.last_error_code in {None, ""}


def test_admin_provider_connection_test_reports_missing_secret_without_leaking(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-test-missing-create"),
        json={
            "connection_id": "missing_secret_provider",
            "provider_id": "missing_secret",
            "provider_type": "openai_compatible",
            "kind": "openai_compatible",
            "display_name": "Missing secret",
            "enabled": True,
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
        },
    )
    assert create_response.status_code == 200, create_response.text

    response = client.post(
        "/internal/service/admin/provider-connections/missing_secret_provider/test",
        headers=build_internal_headers(idempotency_key="provider-connection-test-missing"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["error_code"] == "provider_connection.missing_secret"
    data = payload["data"]
    assert data["ok"] is False
    assert data["status"] == "missing_secret"
    assert data["error_code"] == "provider_connection.missing_secret"
    assert data["boundary"]["secret_exposure"] == "masked_status_only"
    with get_session(_sqlite_url(tmp_path)) as session:
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(ServiceAuditEvent.event_kind == "provider_connection.test")
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        assert audit_event.outcome == "error"
        assert audit_event.scope_id == "missing_secret_provider"
        assert (audit_event.payload_json or {})["result"]["test"]["error_code"] == (
            "provider_connection.missing_secret"
        )


def test_admin_provider_connection_success_reports_unavailable_audit_evidence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service_routes,
        "_get_commercial_service",
        lambda request: _UnavailableAuditService(),
    )
    _, client = _build_client(tmp_path)

    response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-audit-unavailable"),
        json={
            "connection_id": "audit_unavailable_provider",
            "provider_id": "audit_unavailable",
            "provider_type": "openai_compatible",
            "display_name": "Audit unavailable",
            "enabled": False,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["connection_id"] == "audit_unavailable_provider"
    assert data["receipt"]["outcome"] == "succeeded"
    assert data["receipt"]["audit_state"] == "unavailable"
    assert "audit_event_id" not in data["receipt"]
    with get_session(_sqlite_url(tmp_path)) as session:
        assert session.get(ProviderConnection, "audit_unavailable_provider") is not None
        assert session.scalar(select(ServiceAuditEvent)) is None


def test_admin_provider_connections_env_import_route_is_retired(
    tmp_path: Path,
) -> None:
    _, client = _build_client(
        tmp_path,
        settings_overrides={
            "openai_api_key": "openai-env-secret",
            "openai_base_url": "https://env-openai.test/v1",
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-env-secret",
            "minimax_group_id": "minimax-env-group",
        },
    )

    response = client.post(
        "/internal/service/admin/provider-connections/import-env",
        headers=build_internal_headers(idempotency_key="provider-connection-import-env"),
    )

    assert response.status_code in {404, 405}, response.text
    with get_session(_sqlite_url(tmp_path)) as session:
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(ServiceAuditEvent.event_kind == "provider_connection.import_env")
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is None

    projection_response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )
    assert projection_response.status_code == 200, projection_response.text
    projection = projection_response.json()["data"]
    assert "env_migration" not in projection
    assert "openai-env-secret" not in json.dumps(projection)
    assert "minimax-env-secret" not in json.dumps(projection)


def test_admin_provider_connections_can_be_deleted(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-connection-create-delete"),
        json={
            "connection_id": "delete_me_provider",
            "provider_id": "delete_me",
            "provider_type": "web_search_provider",
            "display_name": "Delete me",
            "enabled": True,
            "capability_ids": ["web_search"],
            "runtime_profile_ids": ["web-search.managed"],
            "credential": "delete-me-secret",
        },
    )
    assert create_response.status_code == 200, create_response.text

    preflight_response = client.get(
        "/internal/service/admin/provider-connections/delete_me_provider/delete-preflight",
        headers=build_internal_headers(),
    )
    assert preflight_response.status_code == 200, preflight_response.text
    preflight = preflight_response.json()["data"]
    assert preflight["surface"] == "admin_provider_connection_delete_preflight"
    assert preflight["expected_updated_at"]
    assert preflight["impact"]["risk_level"] == "high"
    assert preflight["impact"]["runtime_profile_ids"] == ["web-search.managed"]
    assert preflight["impact"]["uncovered_runtime_profile_ids"] == [
        "web-search.managed"
    ]
    assert preflight["impact"]["model_count"] == 0
    assert preflight["requires_confirmation"] is True
    assert "delete-me-secret" not in preflight_response.text

    missing_version_response = client.request(
        "DELETE",
        "/internal/service/admin/provider-connections/delete_me_provider",
        headers=build_internal_headers(idempotency_key="provider-connection-delete-missing"),
    )
    assert missing_version_response.status_code == 422, missing_version_response.text

    delete_response = client.request(
        "DELETE",
        "/internal/service/admin/provider-connections/delete_me_provider",
        headers=build_internal_headers(idempotency_key="provider-connection-delete"),
        json={"expected_updated_at": preflight["expected_updated_at"]},
    )
    assert delete_response.status_code == 200, delete_response.text
    delete_data = delete_response.json()["data"]
    assert delete_data["deleted"] is True
    assert delete_data["receipt"]["event_kind"] == "provider_connection.delete"
    assert delete_data["receipt"]["scope_id"] == "delete_me_provider"
    assert delete_data["receipt"]["audit_state"] == "persisted"
    assert delete_data["receipt"]["audit_filters"]["event_kind"] == "provider_connection.delete"
    with get_session(_sqlite_url(tmp_path)) as session:
        audit_event = session.scalar(
            select(ServiceAuditEvent)
            .where(ServiceAuditEvent.event_kind == "provider_connection.delete")
            .order_by(ServiceAuditEvent.id.desc())
        )
        assert audit_event is not None
        assert audit_event.outcome == "succeeded"
        assert audit_event.scope_id == "delete_me_provider"
        assert "delete-me-secret" not in json.dumps(audit_event.payload_json or {})

    list_response = client.get(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200, list_response.text
    assert list_response.json()["data"]["connections"] == []


def test_admin_provider_connection_delete_rejects_stale_preflight(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path)
    create_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-delete-conflict-create"),
        json={
            "connection_id": "delete_conflict_provider",
            "provider_id": "delete_conflict",
            "provider_type": "openai_compatible",
            "display_name": "Delete conflict",
            "enabled": True,
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
            "credential": "delete-conflict-secret",
        },
    )
    assert create_response.status_code == 200, create_response.text
    preflight_response = client.get(
        "/internal/service/admin/provider-connections/delete_conflict_provider/delete-preflight",
        headers=build_internal_headers(),
    )
    assert preflight_response.status_code == 200, preflight_response.text
    expected_updated_at = preflight_response.json()["data"]["expected_updated_at"]

    update_response = client.post(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(idempotency_key="provider-delete-conflict-update"),
        json={
            "connection_id": "delete_conflict_provider",
            "provider_id": "delete_conflict",
            "provider_type": "openai_compatible",
            "display_name": "Delete conflict updated",
            "enabled": True,
            "capability_ids": ["text_generation"],
            "runtime_profile_ids": [TEXT_AI_PROFILE_ID],
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["data"]["updated_at"] != expected_updated_at

    stale_delete_response = client.request(
        "DELETE",
        "/internal/service/admin/provider-connections/delete_conflict_provider",
        headers=build_internal_headers(idempotency_key="provider-delete-conflict-stale"),
        json={"expected_updated_at": expected_updated_at},
    )
    assert stale_delete_response.status_code == 409, stale_delete_response.text
    assert stale_delete_response.json()["error_code"] == (
        "provider_connection.delete_conflict"
    )

    list_response = client.get(
        "/internal/service/admin/provider-connections",
        headers=build_internal_headers(),
    )
    assert list_response.status_code == 200, list_response.text
    assert [
        connection["display_name"]
        for connection in list_response.json()["data"]["connections"]
    ] == ["Delete conflict updated"]
