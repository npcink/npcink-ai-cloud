from __future__ import annotations

import ast
import base64
from collections.abc import Iterator
from dataclasses import FrozenInstanceError
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    MediaDerivativeArtifact,
    MediaDerivativeJobMetric,
    RunRecord,
    Site,
)
from app.domain.audio_generation.artifacts import AudioArtifactMaterializationConfig
from app.domain.image_generation.inline_images import InlineImageMaterializationConfig
from app.domain.media_derivatives.errors import MediaDerivativeSourceDecodeFailedError
from app.domain.media_derivatives.processor import MediaDerivativeResult
from app.domain.runtime import artifact_coordination
from app.domain.runtime.artifact_coordination import (
    RuntimeArtifactCoordinationConfig,
    RuntimeArtifactCoordinationService,
)


class RecordingRunController:
    def fail_run(
        self,
        repository: RuntimeRepository,
        run: RunRecord,
        *,
        error_code: str,
        error_message: str,
        provider_id: str | None = None,
        model_id: str | None = None,
        instance_id: str | None = None,
        fallback_used: bool | None = None,
    ) -> RunRecord:
        return repository.mark_run_failed(
            run,
            error_code=error_code,
            error_message=error_message,
            provider_id=provider_id,
            model_id=model_id,
            instance_id=instance_id,
            fallback_used=fallback_used,
        )

    def succeed_run(
        self,
        repository: RuntimeRepository,
        run: RunRecord,
        *,
        result_json: dict[str, Any],
        provider_id: str,
        model_id: str,
        instance_id: str,
        fallback_used: bool,
    ) -> RunRecord:
        return repository.mark_run_succeeded(
            run,
            result_json=result_json,
            provider_id=provider_id,
            model_id=model_id,
            instance_id=instance_id,
            fallback_used=fallback_used,
        )


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    url = f"sqlite+pysqlite:///{tmp_path / 'runtime-artifact-coordination.sqlite3'}"
    init_schema(url)
    with get_session(url) as session:
        session.add(Site(site_id="site_alpha", name="Alpha", status="active"))
        session.commit()
    yield url
    dispose_engine(url)


def _create_run(repository: RuntimeRepository, *, run_id: str) -> RunRecord:
    return repository.create_run(
        run_id=run_id,
        site_id="site_alpha",
        account_id=None,
        subscription_id=None,
        plan_version_id=None,
        ability_name="generate_optimized_media_derivative",
        ability_family="vision",
        skill_id="",
        workflow_id="",
        contract_version="media_derivative_cloud_request.v1",
        channel="openapi",
        execution_kind="media_derivative",
        execution_tier="cloud",
        execution_pattern="whole_run_offload",
        data_classification="internal",
        profile_id="media_derivative.worker",
        canonical_run_id=None,
        status="running",
        idempotency_key=f"idem-{run_id}",
        request_fingerprint=f"fingerprint-{run_id}",
        trace_id=f"trace-{run_id}",
        input_json={},
        execution_input_ciphertext=None,
        policy_json={"storage_mode": "result_only"},
    )


def _service(
    *,
    input_payload: dict[str, Any] | None = None,
    config: RuntimeArtifactCoordinationConfig | None = None,
) -> RuntimeArtifactCoordinationService:
    return RuntimeArtifactCoordinationService(
        config=config or RuntimeArtifactCoordinationConfig(),
        run_controller=RecordingRunController(),
        execution_input_loader=lambda run: input_payload or {},
    )


def test_artifact_coordination_config_is_frozen() -> None:
    config = RuntimeArtifactCoordinationConfig(audio_artifact_ttl_minutes=9)

    with pytest.raises(FrozenInstanceError):
        config.audio_artifact_ttl_minutes = 10  # type: ignore[misc]


def test_execute_media_derivative_success_records_artifact_metric_and_terminal_evidence(
    database_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_bytes = b"source-image-bytes"

    def fake_process(**kwargs: Any) -> MediaDerivativeResult:
        assert kwargs == {
            "source_bytes": source_bytes,
            "source_media_type": "image",
            "target_format": "png",
            "max_width": 320,
            "quality": 77,
            "crop_options": None,
            "watermark_bytes": None,
            "watermark_options": None,
        }
        return MediaDerivativeResult(
            output_bytes=b"processed-image-bytes",
            width=320,
            height=200,
            filesize_bytes=len(b"processed-image-bytes"),
            checksum="sha256:processed",
            mime_type="image/png",
            format="png",
            source_width=640,
            source_height=400,
        )

    monkeypatch.setattr(artifact_coordination, "process_media_derivative", fake_process)
    service = _service(
        input_payload={
            "cloud_job_payload": {
                "source_media_type": "image",
                "target_format": "png",
                "max_width": 320,
                "quality": 77,
            },
            "ttl_minutes": 11,
            "_source_bytes_b64": base64.b64encode(source_bytes).decode("ascii"),
        }
    )

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = _create_run(repository, run_id="run_artifact_success")
        service.execute_media_derivative_run(run, repository=repository)

        artifact = session.scalar(
            select(MediaDerivativeArtifact).where(MediaDerivativeArtifact.run_id == run.run_id)
        )
        metric = session.scalar(
            select(MediaDerivativeJobMetric).where(MediaDerivativeJobMetric.run_id == run.run_id)
        )
        assert run.status == "succeeded"
        assert run.selected_provider_id == "media_derivative"
        assert run.selected_model_id == "pillow"
        assert run.selected_instance_id == "cloud-worker"
        assert run.fallback_used is False
        assert artifact is not None
        assert artifact.site_id == run.site_id
        assert isinstance(run.result_json, dict)
        assert run.result_json["artifact"]["artifact_id"] == artifact.artifact_id
        assert metric is not None
        assert metric.status == "succeeded"
        assert metric.artifact_id == artifact.artifact_id
        assert metric.source_bytes == len(source_bytes)
        assert metric.output_bytes == len(b"processed-image-bytes")


def test_execute_media_derivative_domain_failure_preserves_result_and_metric(
    database_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_bytes = b"bad-image"

    def fail_process(**kwargs: Any) -> MediaDerivativeResult:
        raise MediaDerivativeSourceDecodeFailedError()

    monkeypatch.setattr(artifact_coordination, "process_media_derivative", fail_process)
    service = _service(
        input_payload={
            "cloud_job_payload": {
                "source_media_type": "image",
                "target_format": "webp",
            },
            "_source_bytes_b64": base64.b64encode(source_bytes).decode("ascii"),
        }
    )

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = _create_run(repository, run_id="run_artifact_failure")
        service.execute_media_derivative_run(run, repository=repository)

        metric = session.scalar(
            select(MediaDerivativeJobMetric).where(MediaDerivativeJobMetric.run_id == run.run_id)
        )
        assert run.status == "failed"
        assert run.error_code == "media_derivative.source_decode_failed"
        assert run.result_json == {
            "status": "failed",
            "error_code": "media_derivative.source_decode_failed",
            "error_message": "source image could not be decoded",
        }
        assert metric is not None
        assert metric.status == "failed"
        assert metric.error_code == run.error_code
        assert metric.source_bytes == len(source_bytes)
        assert metric.output_bytes == 0
        assert metric.artifact_id is None


def test_audio_and_inline_image_wrappers_delegate_with_frozen_config(
    database_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_audio_materialization(
        *,
        session: Any,
        run: RunRecord,
        result_json: dict[str, Any],
        config: AudioArtifactMaterializationConfig,
    ) -> dict[str, Any]:
        captured["audio_session"] = session
        captured["audio_run"] = run
        captured["audio_input"] = result_json
        captured["audio_config"] = config
        return {"audio": "materialized"}

    def fake_inline_materialization(
        result_json: dict[str, Any],
        *,
        config: InlineImageMaterializationConfig,
    ) -> dict[str, Any]:
        captured["inline_input"] = result_json
        captured["inline_config"] = config
        return {"image": "materialized"}

    monkeypatch.setattr(
        artifact_coordination,
        "materialize_audio_generation_candidates",
        fake_audio_materialization,
    )
    monkeypatch.setattr(
        artifact_coordination,
        "materialize_inline_image_candidates_from_urls",
        fake_inline_materialization,
    )
    config = RuntimeArtifactCoordinationConfig(
        audio_artifact_ttl_minutes=9,
        audio_artifact_max_bytes=1234,
        audio_artifact_download_timeout_seconds=2.5,
        inline_image_max_bytes=5678,
        inline_image_timeout_seconds=3.5,
    )
    service = _service(config=config)

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = _create_run(repository, run_id="run_artifact_wrappers")
        audio_input = {"artifact_type": "audio_generation_candidates"}
        inline_input = {"artifact_type": "image_generation_candidates"}

        assert service.materialize_audio_generation_output(
            run,
            repository=repository,
            provider_output=audio_input,
        ) == {"audio": "materialized"}
        assert service.materialize_inline_image_output(inline_input) == {"image": "materialized"}
        assert captured["audio_session"] is session
        assert captured["audio_run"] is run
        assert captured["audio_input"] is audio_input
        assert captured["audio_config"] == AudioArtifactMaterializationConfig(
            ttl_minutes=9,
            max_bytes=1234,
            timeout_seconds=2.5,
        )
        assert captured["inline_input"] is inline_input
        assert captured["inline_config"] == InlineImageMaterializationConfig(
            max_bytes=5678,
            timeout_seconds=3.5,
        )


def test_artifact_coordination_module_and_runtime_facade_keep_boundaries() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    module_path = repository_root / "app/domain/runtime/artifact_coordination.py"
    service_path = repository_root / "app/domain/runtime/service.py"
    module_tree = ast.parse(module_path.read_text(encoding="utf-8"))
    service_source = service_path.read_text(encoding="utf-8")

    imported_modules = {
        node.module or "" for node in ast.walk(module_tree) if isinstance(node, ast.ImportFrom)
    }
    imported_modules.update(
        alias.name
        for node in ast.walk(module_tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    )
    forbidden_prefixes = (
        "app.domain.runtime.service",
        "app.core.config",
        "app.domain.commercial",
        "app.domain.routing",
        "app.adapters.providers",
        "app.domain.wordpress",
        "app.domain.connector_runtime",
        "app.domain.runtime.callback_delivery",
        "app.api",
        "fastapi",
    )
    assert not {
        module
        for module in imported_modules
        if any(module.startswith(prefix) for prefix in forbidden_prefixes)
    }

    forbidden_service_calls = (
        "process_media_derivative(",
        "create_artifact(",
        "record_media_derivative_job_metric(",
        "materialize_audio_generation_candidates(",
        "materialize_inline_image_candidates_from_urls(",
    )
    assert not {call for call in forbidden_service_calls if call in service_source}
    assert "except InlineImageMaterializationError as error:" in service_source
    assert "except AudioArtifactMaterializationError as error:" in service_source
