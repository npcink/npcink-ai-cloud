from __future__ import annotations

import io
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.adapters.providers.base import (
    CatalogInstanceSeed,
    CatalogModelSeed,
    ProviderCatalogSnapshot,
    ProviderExecutionRequest,
    ProviderExecutionResult,
)
from app.api.main import create_app
from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import (
    MediaArtifact,
    ProviderCallRecord,
    RunRecord,
    ServiceSetting,
    SiteKnowledgeDocument,
)
from app.core.services import CloudServices
from app.domain.catalog.service import CatalogService
from app.domain.media_artifacts.input_loading import VISION_IMAGE_MAX_BYTES
from app.domain.media_artifacts.store import LocalVolumeArtifactStore
from app.domain.runtime.service import RuntimeService
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_auth_headers,
    merge_json_headers,
    seed_site_auth,
    seed_verified_capability_evidence_for_catalog,
)

SOURCE_ARTIFACT_ID = "art_0123456789abcdef0123456789abcdef"


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'image-context-evidence.sqlite3'}"


class FakeVisionProvider:
    provider_id = "fakevision"
    display_name = "Fake Vision"
    adapter_type = "openai"

    def __init__(self, *, invalid_response: bool = False, attachment_id: str = "101") -> None:
        self.invalid_response = invalid_response
        self.attachment_id = attachment_id
        self.requests: list[ProviderExecutionRequest] = []

    def fetch_catalog(self) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id=self.provider_id,
            display_name=self.display_name,
            adapter_type=self.adapter_type,
            models=[
                CatalogModelSeed(
                    model_id="fake-vision-model",
                    family="fake-vision",
                    feature="vision",
                    status="available",
                    price_input=0.1,
                    price_output=0.2,
                    instances=[
                        CatalogInstanceSeed(
                            instance_id="fakevision-global-default",
                            endpoint_variant="responses",
                            region="global",
                            capability_tags=["vision", "default", "quality"],
                            is_default=True,
                            weight=100,
                        )
                    ],
                )
            ],
        )

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.requests.append(request)
        output_text = (
            "not json"
            if self.invalid_response
            else json.dumps(
                {
                    "contract_version": "image_context_evidence.v1",
                    "artifact_type": "image_context_evidence",
                    "items": [
                        {
                            "attachment_id": self.attachment_id,
                            "visual_summary": "A red notebook beside a coffee mug.",
                            "visible_text": ["NPCINK"],
                            "subject_tags": ["notebook", "coffee mug"],
                            "alt_text_basis": "red notebook and coffee mug on desk",
                            "caption_basis": "workspace detail with branded notebook",
                            "confidence": 0.82,
                            "uncertainty_flags": [],
                        }
                    ],
                    "direct_wordpress_write": False,
                    "requires_human_visual_check": True,
                }
            )
        )
        return ProviderExecutionResult(
            output={
                "output_text": output_text,
                "messages": [{"role": "assistant", "content": output_text}],
                "model_id": request.model_id,
            },
            latency_ms=33,
            tokens_in=123,
            tokens_out=45,
            cost=0.001,
        )


def _build_client(
    tmp_path: Path,
    *,
    provider: FakeVisionProvider | None = None,
) -> tuple[str, TestClient, FakeVisionProvider]:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    selected_provider = provider or FakeVisionProvider()
    providers = {selected_provider.provider_id: selected_provider}
    CatalogService(database_url, providers=providers).refresh_catalog()
    seed_verified_capability_evidence_for_catalog(database_url)
    seed_site_auth(
        database_url,
        site_id="site_alpha",
        scopes=["runtime:execute", "runtime:read"],
    )
    settings = _settings(tmp_path, database_url)
    client = TestClient(create_app(CloudServices(settings=settings, providers=providers)))
    return database_url, client, selected_provider


def _settings(tmp_path: Path, database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Image Context Evidence Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        artifact_store_root=str(tmp_path / "artifacts"),
    )


def _seed_image_artifact(
    tmp_path: Path,
    database_url: str,
    *,
    artifact_id: str = SOURCE_ARTIFACT_ID,
    site_id: str = "site_alpha",
    declared_byte_size: int | None = None,
) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (64, 48), color="red").save(output, format="PNG")
    content = output.getvalue()
    stored = LocalVolumeArtifactStore(tmp_path / "artifacts").put(
        io.BytesIO(content),
        max_bytes=VISION_IMAGE_MAX_BYTES,
    )
    with get_session(database_url) as session:
        session.add(
            MediaArtifact(
                artifact_id=artifact_id,
                run_id=f"run_upload_{artifact_id}",
                site_id=site_id,
                media_kind="image",
                operation="image.upload.v1",
                content_type="image/png",
                byte_size=declared_byte_size or stored.byte_size,
                storage_key=stored.storage_key,
                status="available",
                format="png",
                width=64,
                height=48,
                checksum=stored.checksum,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        session.commit()
    return content


def _payload(input_overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    input_payload: dict[str, Any] = {
        "contract_version": "image_context_evidence_request.v1",
        "items": [
            {
                "attachment_id": "101",
                "source_url": "https://example.com/uploads/notebook.jpg",
                "thumbnail_url": "https://example.com/uploads/notebook-300x200.jpg",
                "title": "Notebook product shot",
                "filename": "notebook.jpg",
                "mime_type": "image/jpeg",
                "attachment_url": "https://example.com/uploads/notebook.jpg",
                "media_fingerprint": "sha256:notebook-fixture",
                "modified_gmt": "2026-08-27T00:00:00Z",
                "alt": "",
                "caption": "",
                "description": "",
                "existing_alt": "",
                "existing_caption": "",
            }
        ],
        "locale": "zh_CN",
    }
    input_payload.update(input_overrides or {})
    return {
        "ability_name": "npcink-cloud/image-context-evidence",
        "contract_version": "image_context_evidence_request.v1",
        "execution_pattern": "inline",
        "data_classification": "public_site_media_metadata",
        "storage_mode": "result_only",
        "timeout_seconds": 20,
        "retry_max": 0,
        "retention_ttl": 3600,
        "input": input_payload,
        "policy": {"allow_fallback": False},
    }


def _execute(
    client: TestClient,
    payload: dict[str, Any],
    *,
    idempotency_key: str = "image-context-evidence-idem",
    nonce: str | None = None,
) -> Any:
    body = json.dumps(payload).encode("utf-8")
    headers = merge_json_headers(
        build_auth_headers(
            "POST",
            "/v1/runtime/execute",
            site_id="site_alpha",
            key_id="key_default",
            idempotency_key=idempotency_key,
            nonce=nonce or f"nonce-{idempotency_key}",
            trace_id="imagecontextevidence0000000000",
            body=body,
        )
    )
    return client.post("/v1/runtime/execute", content=body, headers=headers)


def _clock_offset(minutes: int) -> str:
    value = datetime.now(UTC) + timedelta(minutes=minutes)
    return f"{value.hour:02d}:{value.minute:02d}"


def _set_media_recognition_policy(
    database_url: str,
    *,
    enabled: bool,
    window_start: str,
    window_end: str,
    daily_limit: int,
) -> None:
    with get_session(database_url) as session:
        session.merge(
            ServiceSetting(
                setting_id="media_recognition_policy",
                setting_kind="runtime",
                enabled=enabled,
                config_json={
                    "window_start": window_start,
                    "window_end": window_end,
                    "daily_limit": daily_limit,
                },
                secret_ciphertext_json={},
                status="ready" if enabled else "disabled",
                metadata_json={},
            )
        )
        session.merge(
            ServiceSetting(
                setting_id="platform_preferences",
                setting_kind="runtime",
                enabled=True,
                config_json={"timezone": "UTC"},
                secret_ciphertext_json={},
                status="ready",
                metadata_json={},
            )
        )
        session.commit()


def test_image_context_evidence_runtime_calls_vision_provider(tmp_path: Path) -> None:
    database_url, client, provider = _build_client(tmp_path)

    response = _execute(client, _payload())

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["profile_id"] == "vision.ai"
    assert data["provider_id"] == "fakevision"
    assert data["model_id"] == "fake-vision-model"
    assert data["provider_call_count"] == 1
    assert data["execution_context"]["ability_family"] == "vision"
    assert data["execution_context"]["data_classification"] == "public_site_media_metadata"

    result = data["result"]
    assert result["contract_version"] == "image_context_evidence.v1"
    assert result["artifact_type"] == "image_context_evidence"
    assert result["write_posture"] == "suggestion_only"
    assert result["direct_wordpress_write"] is False
    assert result["requires_human_visual_check"] is True
    assert result["items"][0]["attachment_id"] == "101"
    assert result["items"][0]["source_url"] == "https://example.com/uploads/notebook.jpg"
    assert result["items"][0]["alt_text_basis"] == "red notebook and coffee mug on desk"
    assert result["items"][0]["confidence"] == 0.82

    assert len(provider.requests) == 1
    provider_input = provider.requests[0].input_payload
    assert provider_input["input"][0]["content"][2] == {
        "type": "input_image",
        "image_url": "https://example.com/uploads/notebook.jpg",
    }
    assert provider.requests[0].execution_kind == "vision"

    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.execution_kind == "image_context_evidence"
        assert run.input_json == {}
        assert run.policy_json["execution_contract"]["direct_wordpress_write"] is False
        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord)
                .where(ProviderCallRecord.run_id == run.run_id)
                .order_by(ProviderCallRecord.id.asc())
            )
        )
        assert len(provider_calls) == 1
        assert provider_calls[0].provider_id == "fakevision"
        assert provider_calls[0].tokens_in == 123
        assert provider_calls[0].tokens_out == 45


def test_background_media_recognition_requires_enabled_policy(tmp_path: Path) -> None:
    database_url, client, provider = _build_client(tmp_path)

    response = _execute(
        client,
        _payload({"dispatch_mode": "background_completion"}),
        idempotency_key="image-context-background-disabled",
    )

    assert response.status_code == 409, response.json()
    assert response.json()["error_code"] == "media_recognition.background_disabled"
    assert provider.requests == []
    with get_session(database_url) as session:
        assert session.scalar(
            select(RunRecord).where(
                RunRecord.idempotency_key == "image-context-background-disabled"
            )
        ) is None


def test_background_media_recognition_enforces_window_model_and_daily_item_limit(
    tmp_path: Path,
) -> None:
    database_url, client, provider = _build_client(tmp_path)
    window_start = _clock_offset(-1)
    window_end = _clock_offset(1)
    _set_media_recognition_policy(
        database_url,
        enabled=True,
        window_start=window_start,
        window_end=window_end,
        daily_limit=1,
    )

    first = _execute(
        client,
        _payload({"dispatch_mode": "background_completion"}),
        idempotency_key="image-context-background-first",
    )
    assert first.status_code == 200, first.json()
    first_data = first.json()["data"]
    assert first_data["status"] == "queued"
    assert first_data["model_id"] == "fake-vision-model"
    assert first_data["provider_call_count"] == 0
    assert provider.requests == []

    worker = RuntimeService(
        database_url,
        settings=_settings(tmp_path, database_url),
        providers={provider.provider_id: provider},
    )
    processed = worker.process_next_queued_run(timeout_seconds=0)
    assert processed == {
        "run_id": first_data["run_id"],
        "status": "succeeded",
        "trace_id": "imagecontextevidence000000000000",
    }
    assert len(provider.requests) == 1

    with get_session(database_url) as session:
        completed_run = session.get(RunRecord, first_data["run_id"])
        assert completed_run is not None
        assert completed_run.execution_input_ciphertext is None
        assert completed_run.result_json["progress"]["status"] == "completed"
        assert completed_run.result_json["progress"]["processed_items"] == 1
        assert completed_run.result_json["site_knowledge_projection"]["status"] == (
            "completed"
        )
        media_document = session.scalar(
            select(SiteKnowledgeDocument).where(
                SiteKnowledgeDocument.site_id == "site_alpha",
                SiteKnowledgeDocument.source_type == "media",
                SiteKnowledgeDocument.source_id == 101,
            )
        )
        assert media_document is not None
        assert media_document.url == "https://example.com/uploads/notebook.jpg"
        assert media_document.metadata_json["media_fingerprint"] == (
            "sha256:notebook-fixture"
        )

    second = _execute(
        client,
        _payload({"dispatch_mode": "background_completion"}),
        idempotency_key="image-context-background-second",
    )
    assert second.status_code == 200, second.json()
    second_data = second.json()["data"]
    assert second_data["status"] == "queued"
    assert second_data["provider_call_count"] == 0

    interactive = _execute(
        client,
        _payload(),
        idempotency_key="image-context-interactive-after-background-limit",
    )
    assert interactive.status_code == 200, interactive.json()
    assert len(provider.requests) == 2

    with get_session(database_url) as session:
        background_run = session.scalar(
            select(RunRecord).where(
                RunRecord.idempotency_key == "image-context-background-first"
            )
        )
        deferred_run = session.scalar(
            select(RunRecord).where(
                RunRecord.idempotency_key == "image-context-background-second"
            )
        )
    assert background_run is not None
    recognition_policy = background_run.policy_json["media_recognition_policy"]
    assert recognition_policy["dispatch_mode"] == "background_completion"
    assert recognition_policy["model_id"] == "fake-vision-model"
    assert recognition_policy["model_source_profile_id"] == "vision.ai"
    assert recognition_policy["timezone"] == "UTC"
    assert recognition_policy["window_start"] == window_start
    assert recognition_policy["window_end"] == window_end
    assert recognition_policy["daily_limit"] == 1
    assert recognition_policy["item_count"] == 1
    assert deferred_run is not None
    assert deferred_run.status == "queued"
    assert deferred_run.worker_eligible_at is not None
    assert worker.run_projector.normalize_timestamp(
        deferred_run.worker_eligible_at
    ) > datetime.now(UTC)
    assert deferred_run.execution_input_ciphertext
    assert worker.process_next_queued_run(timeout_seconds=0) is None


def test_background_media_recognition_queues_outside_window(tmp_path: Path) -> None:
    database_url, client, provider = _build_client(tmp_path)
    _set_media_recognition_policy(
        database_url,
        enabled=True,
        window_start=_clock_offset(2),
        window_end=_clock_offset(3),
        daily_limit=100,
    )

    response = _execute(
        client,
        _payload({"dispatch_mode": "background_completion"}),
        idempotency_key="image-context-background-outside-window",
    )

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "queued"
    assert data["provider_call_count"] == 0
    assert provider.requests == []
    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.worker_eligible_at is not None
        assert RuntimeService(
            database_url,
            settings=_settings(tmp_path, database_url),
            providers={provider.provider_id: provider},
        ).run_projector.normalize_timestamp(run.worker_eligible_at) > datetime.now(UTC)
        assert run.execution_input_ciphertext
    worker = RuntimeService(
        database_url,
        settings=_settings(tmp_path, database_url),
        providers={provider.provider_id: provider},
    )
    assert worker.process_next_queued_run(timeout_seconds=0) is None


def test_image_context_evidence_rejects_unknown_dispatch_mode(tmp_path: Path) -> None:
    _, client, provider = _build_client(tmp_path)

    response = _execute(
        client,
        _payload({"dispatch_mode": "price_prediction"}),
        idempotency_key="image-context-invalid-dispatch-mode",
    )

    assert response.status_code == 400, response.json()
    assert response.json()["error_code"] == "image_context_evidence.dispatch_mode_invalid"
    assert provider.requests == []


def test_image_context_evidence_accepts_same_site_artifact_without_persisting_bytes(
    tmp_path: Path,
) -> None:
    database_url, client, provider = _build_client(tmp_path)
    content = _seed_image_artifact(tmp_path, database_url)
    payload = _payload(
        {
            "items": [
                {
                    "attachment_id": "101",
                    "source_artifact_id": SOURCE_ARTIFACT_ID,
                    "title": "Local notebook",
                    "filename": "notebook.png",
                    "mime_type": "image/png",
                    "existing_alt": "",
                    "existing_caption": "",
                }
            ]
        }
    )
    payload["data_classification"] = "internal"

    response = _execute(
        client,
        payload,
        idempotency_key="image-context-evidence-artifact",
    )

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["execution_context"]["data_classification"] == "internal"
    provider_image = provider.requests[0].input_payload["input"][0]["content"][2]
    assert provider_image["type"] == "input_image"
    assert provider_image["image_url"].startswith("data:image/png;base64,")

    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.input_json == {}
        serialized_result = json.dumps(run.result_json)
        assert SOURCE_ARTIFACT_ID not in serialized_result
        assert content.hex() not in serialized_result


def test_image_context_evidence_rejects_cross_site_artifact_before_run_creation(
    tmp_path: Path,
) -> None:
    database_url, client, _ = _build_client(tmp_path)
    _seed_image_artifact(tmp_path, database_url, site_id="site_beta")
    payload = _payload(
        {
            "items": [
                {
                    "attachment_id": "101",
                    "source_artifact_id": SOURCE_ARTIFACT_ID,
                }
            ]
        }
    )
    payload["data_classification"] = "internal"

    response = _execute(
        client,
        payload,
        idempotency_key="image-context-evidence-cross-site-artifact",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "image_context_evidence.source_artifact_unavailable"
    with get_session(database_url) as session:
        statement = select(RunRecord).where(
            RunRecord.idempotency_key == "image-context-evidence-cross-site-artifact"
        )
        assert session.scalar(statement) is None


def test_image_context_evidence_rejects_conflicting_artifact_and_url_sources(
    tmp_path: Path,
) -> None:
    _, client, _ = _build_client(tmp_path)
    payload = _payload(
        {
            "items": [
                {
                    "attachment_id": "101",
                    "source_artifact_id": SOURCE_ARTIFACT_ID,
                    "source_url": "https://images.example.com/local.png",
                }
            ]
        }
    )

    response = _execute(
        client,
        payload,
        idempotency_key="image-context-evidence-source-conflict",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "image_context_evidence.image_source_conflict"


def test_image_context_evidence_counts_repeated_artifacts_toward_aggregate_limit(
    tmp_path: Path,
) -> None:
    database_url, client, _ = _build_client(tmp_path)
    _seed_image_artifact(
        tmp_path,
        database_url,
        declared_byte_size=4 * 1024 * 1024,
    )
    payload = _payload(
        {
            "items": [
                {
                    "attachment_id": str(attachment_id),
                    "source_artifact_id": SOURCE_ARTIFACT_ID,
                }
                for attachment_id in range(101, 108)
            ]
        }
    )

    response = _execute(
        client,
        payload,
        idempotency_key="image-context-evidence-artifact-aggregate-limit",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "image_context_evidence.source_artifacts_too_large"
    with get_session(database_url) as session:
        statement = select(RunRecord).where(
            RunRecord.idempotency_key
            == "image-context-evidence-artifact-aggregate-limit"
        )
        assert session.scalar(statement) is None


def test_image_context_evidence_rejects_wordpress_write_fields(tmp_path: Path) -> None:
    _, client, _ = _build_client(tmp_path)

    response = _execute(
        client,
        _payload({"wordpress_write_policy": {"update_attachment_metadata": True}}),
        idempotency_key="image-context-evidence-forbidden-write",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "image_context_evidence.write_or_secret_field_forbidden"


def test_image_context_evidence_fails_on_unstructured_provider_response(
    tmp_path: Path,
) -> None:
    _, client, _ = _build_client(tmp_path, provider=FakeVisionProvider(invalid_response=True))

    response = _execute(
        client,
        _payload(),
        idempotency_key="image-context-evidence-invalid-provider",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["data"]["status"] == "failed"
    assert payload["data"]["error_code"] == "image_context_evidence.invalid_provider_response"
