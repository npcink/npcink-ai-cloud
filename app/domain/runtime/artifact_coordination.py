from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.models import RunRecord
from app.domain.audio_generation.artifacts import (
    AUDIO_ARTIFACT_DEFAULT_MAX_BYTES,
    AUDIO_ARTIFACT_DEFAULT_TIMEOUT_SECONDS,
    AUDIO_ARTIFACT_DEFAULT_TTL_MINUTES,
    AudioArtifactMaterializationConfig,
    materialize_audio_generation_candidates,
)
from app.domain.image_generation.inline_images import (
    INLINE_IMAGE_DEFAULT_MAX_BYTES,
    INLINE_IMAGE_DEFAULT_TIMEOUT_SECONDS,
    InlineImageMaterializationConfig,
    materialize_inline_image_candidates_from_urls,
)
from app.domain.media_derivatives.artifacts import (
    build_artifact_result_json,
    create_artifact,
)
from app.domain.media_derivatives.contracts import ARTIFACT_DEFAULT_TTL_MINUTES
from app.domain.media_derivatives.errors import (
    MediaDerivativeAnimatedSourceUnavailableError,
    MediaDerivativeFormatUnavailableError,
    MediaDerivativeProcessingFailedError,
    MediaDerivativeSourceDecodeFailedError,
    MediaDerivativeSourceTooLargeError,
)
from app.domain.media_derivatives.metrics import record_media_derivative_job_metric
from app.domain.media_derivatives.processor import process_media_derivative


@dataclass(frozen=True, slots=True)
class RuntimeArtifactCoordinationConfig:
    audio_artifact_ttl_minutes: int = AUDIO_ARTIFACT_DEFAULT_TTL_MINUTES
    audio_artifact_max_bytes: int = AUDIO_ARTIFACT_DEFAULT_MAX_BYTES
    audio_artifact_download_timeout_seconds: float = AUDIO_ARTIFACT_DEFAULT_TIMEOUT_SECONDS
    inline_image_max_bytes: int = INLINE_IMAGE_DEFAULT_MAX_BYTES
    inline_image_timeout_seconds: float = INLINE_IMAGE_DEFAULT_TIMEOUT_SECONDS


class RuntimeArtifactRunController(Protocol):
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
    ) -> RunRecord: ...

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
    ) -> RunRecord: ...


class RuntimeExecutionInputLoader(Protocol):
    def __call__(self, run: RunRecord) -> dict[str, Any]: ...


class AudioCandidateMaterializer(Protocol):
    def __call__(
        self,
        *,
        session: Session,
        run: RunRecord,
        result_json: dict[str, Any],
        config: AudioArtifactMaterializationConfig,
    ) -> dict[str, Any]: ...


class InlineImageCandidateMaterializer(Protocol):
    def __call__(
        self,
        result_json: dict[str, Any],
        *,
        config: InlineImageMaterializationConfig,
    ) -> dict[str, Any]: ...


class RuntimeArtifactCoordinationService:
    def __init__(
        self,
        *,
        config: RuntimeArtifactCoordinationConfig,
        run_controller: RuntimeArtifactRunController,
        execution_input_loader: RuntimeExecutionInputLoader,
        audio_candidate_materializer: AudioCandidateMaterializer | None = None,
        inline_image_candidate_materializer: InlineImageCandidateMaterializer | None = None,
    ) -> None:
        self.config = config
        self.run_controller = run_controller
        self.execution_input_loader = execution_input_loader
        self.audio_candidate_materializer = (
            audio_candidate_materializer or materialize_audio_generation_candidates
        )
        self.inline_image_candidate_materializer = (
            inline_image_candidate_materializer or materialize_inline_image_candidates_from_urls
        )

    def execute_media_derivative_run(
        self,
        run: RunRecord,
        *,
        repository: RuntimeRepository,
    ) -> None:
        media_input = self.execution_input_loader(run)
        cloud_job_payload = media_input.get("cloud_job_payload", {})
        source_media_type = cloud_job_payload.get("source_media_type", "image")
        target_format = cloud_job_payload.get("target_format", "webp")
        max_width = int(cloud_job_payload.get("max_width", 1200))
        quality = int(cloud_job_payload.get("quality", 82))
        crop_options = cloud_job_payload.get("crop")
        crop_options = crop_options if isinstance(crop_options, dict) else None
        watermark_options = cloud_job_payload.get("watermark")
        watermark_options = watermark_options if isinstance(watermark_options, dict) else None
        ttl_minutes = int(media_input.get("ttl_minutes", ARTIFACT_DEFAULT_TTL_MINUTES))

        source_b64 = media_input.get("_source_bytes_b64", "")
        source_bytes = base64.b64decode(source_b64) if source_b64 else b""
        watermark_b64 = media_input.get("_watermark_bytes_b64", "")
        watermark_bytes = base64.b64decode(watermark_b64) if watermark_b64 else None
        processing_started_at = datetime.now(UTC)
        watermark_applied = bool(watermark_bytes) or bool(
            watermark_options and watermark_options.get("type") == "text"
        )

        if not source_bytes:
            self.run_controller.fail_run(
                repository,
                run,
                error_code="media_derivative.source_decode_failed",
                error_message="no source bytes found in media derivative run",
            )
            run.result_json = {
                "status": "failed",
                "error_code": "media_derivative.source_decode_failed",
                "error_message": "no source bytes found in media derivative run",
            }
            record_media_derivative_job_metric(
                session=repository.session,
                run=run,
                target_format=target_format,
                source_media_type=source_media_type,
                source_bytes=0,
                processing_started_at=processing_started_at,
                error_code="media_derivative.source_decode_failed",
                watermark_applied=watermark_applied,
            )
            return

        try:
            result = process_media_derivative(
                source_bytes=source_bytes,
                source_media_type=source_media_type,
                target_format=target_format,
                max_width=max_width,
                quality=quality,
                crop_options=crop_options,
                watermark_bytes=watermark_bytes,
                watermark_options=watermark_options,
            )
        except (
            MediaDerivativeSourceDecodeFailedError,
            MediaDerivativeSourceTooLargeError,
            MediaDerivativeAnimatedSourceUnavailableError,
            MediaDerivativeFormatUnavailableError,
            MediaDerivativeProcessingFailedError,
        ) as error:
            self.run_controller.fail_run(
                repository,
                run,
                error_code=error.error_code,
                error_message=error.message,
            )
            run.result_json = {
                "status": "failed",
                "error_code": error.error_code,
                "error_message": error.message,
            }
            record_media_derivative_job_metric(
                session=repository.session,
                run=run,
                target_format=target_format,
                source_media_type=source_media_type,
                source_bytes=len(source_bytes),
                processing_started_at=processing_started_at,
                error_code=error.error_code,
                watermark_applied=watermark_applied,
            )
            return

        artifact = create_artifact(
            session=repository.session,
            run_id=run.run_id,
            site_id=run.site_id,
            result=result,
            source_media_type=source_media_type,
            ttl_minutes=ttl_minutes,
        )
        result_json = build_artifact_result_json(artifact)
        self.run_controller.succeed_run(
            repository,
            run,
            result_json=result_json,
            provider_id="media_derivative",
            model_id="pillow",
            instance_id="cloud-worker",
            fallback_used=False,
        )
        record_media_derivative_job_metric(
            session=repository.session,
            run=run,
            target_format=target_format,
            source_media_type=source_media_type,
            source_bytes=len(source_bytes),
            processing_started_at=processing_started_at,
            result=result,
            artifact=artifact,
            watermark_applied=watermark_applied,
        )

    def materialize_audio_generation_output(
        self,
        run: RunRecord,
        *,
        repository: RuntimeRepository,
        provider_output: dict[str, Any],
    ) -> dict[str, Any]:
        return self.audio_candidate_materializer(
            session=repository.session,
            run=run,
            result_json=provider_output,
            config=AudioArtifactMaterializationConfig(
                ttl_minutes=max(1, int(self.config.audio_artifact_ttl_minutes)),
                max_bytes=max(1, int(self.config.audio_artifact_max_bytes)),
                timeout_seconds=max(
                    0.001,
                    float(self.config.audio_artifact_download_timeout_seconds),
                ),
            ),
        )

    def materialize_inline_image_output(
        self,
        provider_output: dict[str, Any],
    ) -> dict[str, Any]:
        return self.inline_image_candidate_materializer(
            provider_output,
            config=InlineImageMaterializationConfig(
                max_bytes=max(1, int(self.config.inline_image_max_bytes)),
                timeout_seconds=max(0.001, float(self.config.inline_image_timeout_seconds)),
            ),
        )
