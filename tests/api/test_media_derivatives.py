from __future__ import annotations

import asyncio
import hashlib
import io
import json
import tempfile
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import starlette.formparsers as starlette_formparsers
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from PIL import Image

import app.api.media_ingress as media_ingress_module
import app.api.routes.media_derivatives as media_derivatives_route
from app.adapters.queue.in_memory import InMemoryRuntimeQueue
from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    MediaArtifact,
    MediaDerivativeJobMetric,
    ProviderCallRecord,
    RunRecord,
)
from app.core.security import build_canonical_request, build_hmac_signature
from app.core.services import CloudServices
from app.domain.media_artifacts import build_artifact_store
from app.domain.media_derivatives.contracts import BLOCKED_RESPONSE_FIELDS, MAX_UPLOAD_BYTES_IMAGE
from app.domain.runtime.service import RuntimeService
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    TEST_SECRET,
    build_auth_headers,
    build_traceparent,
    seed_site_auth,
)


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'media-derivative-api.sqlite3'}"


def _build_client(
    tmp_path: Path,
    *,
    runtime_queue: InMemoryRuntimeQueue | None = None,
    settings_overrides: dict[str, object] | None = None,
) -> tuple[str, TestClient]:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(
        database_url,
        site_id="site_alpha",
        scopes=["runtime:execute", "runtime:read"],
    )
    seed_site_auth(
        database_url,
        site_id="site_beta",
        key_id="key_beta",
        scopes=["runtime:execute", "runtime:read"],
    )
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        artifact_store_root=str(tmp_path / "artifacts"),
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        **(settings_overrides or {}),
    )
    return database_url, TestClient(
        create_app(
            CloudServices(
                settings=settings,
                providers={},
                runtime_queue=runtime_queue or InMemoryRuntimeQueue(),
            )
        )
    )


def _make_png_bytes(
    width: int = 100,
    height: int = 80,
    *,
    color: str | tuple[int, int, int, int] = "red",
    mode: str = "RGB",
) -> bytes:
    img = Image.new(mode, (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_bmp_bytes(width: int = 1200, height: int = 1200) -> bytes:
    img = Image.new("RGB", (width, height), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="BMP")
    return buf.getvalue()


def _make_animated_gif_bytes() -> bytes:
    frames = [Image.new("RGB", (10, 10), color=c) for c in ("red", "green")]
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    return buf.getvalue()


def _build_multipart_body(
    request_dict: dict,
    image_bytes: bytes,
    watermark_bytes: bytes | None = None,
    boundary: str = "boundary123",
) -> tuple[bytes, str]:
    parts = []
    parts.append(f"--{boundary}".encode())
    parts.append(b'Content-Disposition: form-data; name="request"')
    parts.append(b"")
    parts.append(json.dumps(request_dict).encode())
    parts.append(f"--{boundary}".encode())
    parts.append(b'Content-Disposition: form-data; name="source_file"; filename="test.png"')
    parts.append(b"Content-Type: image/png")
    parts.append(b"")
    parts.append(image_bytes)
    if watermark_bytes is not None:
        parts.append(f"--{boundary}".encode())
        parts.append(b'Content-Disposition: form-data; name="watermark_file"; filename="logo.png"')
        parts.append(b"Content-Type: image/png")
        parts.append(b"")
        parts.append(watermark_bytes)
    parts.append(f"--{boundary}--".encode())
    body = b"\r\n".join(parts)
    content_type = f"multipart/form-data; boundary={boundary}"
    return body, content_type


def _minimal_request_dict() -> dict[str, object]:
    return {
        "request_contract_version": "media_derivative_cloud_request.v1",
        "cloud_job_payload": {
            "job_type": "generate_optimized_media_derivative",
            "target_format": "png",
            "max_width": 100,
            "quality": 80,
            "source_media_type": "image",
        },
    }


def _build_custom_multipart_body(
    parts: list[tuple[str, bytes, str | None]],
    *,
    boundary: str,
    complete: bool = True,
) -> tuple[bytes, str]:
    body_parts: list[bytes] = []
    for name, value, filename in parts:
        body_parts.append(f"--{boundary}".encode())
        disposition = f'Content-Disposition: form-data; name="{name}"'
        if filename is not None:
            disposition += f'; filename="{filename}"'
        body_parts.append(disposition.encode())
        if filename is not None:
            body_parts.append(b"Content-Type: application/octet-stream")
        body_parts.extend((b"", value))
    if complete:
        body_parts.append(f"--{boundary}--".encode())
    return (
        b"\r\n".join(body_parts),
        f"multipart/form-data; boundary={boundary}",
    )


def _build_auth_headers_for_digest(
    body_digest: str,
    *,
    idempotency_key: str,
    nonce: str,
) -> dict[str, str]:
    timestamp = str(int(datetime.now(UTC).timestamp()))
    traceparent = build_traceparent("fedcba9876543210fedcba9876543210")
    canonical_request = build_canonical_request(
        method="POST",
        path="/v1/runtime/media-derivatives",
        query="",
        site_id="site_alpha",
        key_id="key_default",
        timestamp=timestamp,
        nonce=nonce,
        idempotency_key=idempotency_key,
        traceparent=traceparent,
        body_digest=body_digest,
    )
    return {
        "X-Npcink-Site-Id": "site_alpha",
        "X-Npcink-Key-Id": "key_default",
        "X-Npcink-Timestamp": timestamp,
        "X-Npcink-Signature": build_hmac_signature(TEST_SECRET, canonical_request),
        "X-Npcink-Nonce": nonce,
        "Idempotency-Key": idempotency_key,
        "traceparent": traceparent,
    }


def _track_ingress_tempfiles(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[list[object], list[object]]:
    original_temporary_file = tempfile.TemporaryFile
    original_spooled_file = tempfile.SpooledTemporaryFile
    raw_files: list[object] = []
    upload_files: list[object] = []

    def tracking_temporary_file(*args: object, **kwargs: object) -> object:
        file_object = original_temporary_file(*args, **kwargs)
        raw_files.append(file_object)
        return file_object

    def tracking_spooled_file(*args: object, **kwargs: object) -> object:
        file_object = original_spooled_file(*args, **kwargs)
        upload_files.append(file_object)
        return file_object

    monkeypatch.setattr(
        media_ingress_module.tempfile,
        "TemporaryFile",
        tracking_temporary_file,
    )
    monkeypatch.setattr(
        starlette_formparsers,
        "SpooledTemporaryFile",
        tracking_spooled_file,
    )
    return raw_files, upload_files


def _assert_tempfiles_closed(file_objects: list[object]) -> None:
    assert file_objects
    assert all(file_object.closed for file_object in file_objects)


def _process_queued_runs(database_url: str) -> None:
    service = RuntimeService(
        database_url,
        settings=Settings(
            environment="test",
            database_url=database_url,
            redis_url="redis://localhost:6379/0",
            internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
            admin_session_secret=TEST_ADMIN_SESSION_SECRET,
            portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
            artifact_store_root=str(
                Path(database_url.removeprefix("sqlite+pysqlite:///")).parent / "artifacts"
            ),
        ),
    )
    service.process_queued_runs(max_runs=10, timeout_seconds=0)


def test_worker_success_path(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(200, 160)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
            "ttl_minutes": 30,
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-worker-test-001",
            nonce="nonce-worker-test-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        data = response.json()["data"]
        assert data["status"] == "queued"
        run_id = data["run_id"]

        _process_queued_runs(database_url)

        result_headers = build_auth_headers(
            "GET",
            f"/v1/runs/{run_id}/result",
            site_id="site_alpha",
        )
        result_headers["content-type"] = "application/json"
        result_response = client.get(f"/v1/runs/{run_id}/result", headers=result_headers)
        assert result_response.status_code == 200, result_response.json()
        result_data = result_response.json()["data"]
        assert result_data["status"] == "succeeded"
        workflow_metadata = result_data["result"]["workflow_metadata"]
        assert workflow_metadata["workflow_id"] == "media_derivative_artifact_generation"
        assert workflow_metadata["workflow_version"] == "media_derivative_workflow.v1"
        assert workflow_metadata["workflow_kind"] == "fixed_worker_workflow"
        assert workflow_metadata["triggering_ability"] == "generate_optimized_media_derivative"
        assert workflow_metadata["triggering_contract"] == "media_derivative_cloud_request.v1"
        assert workflow_metadata["execution_pattern"] == "whole_run_offload"
        assert workflow_metadata["cloud_output"] == "temporary_derivative_artifact"
        assert workflow_metadata["handoff_owner"] == "wordpress_local"
        assert workflow_metadata["write_posture"] == "artifact_only"
        assert workflow_metadata["direct_wordpress_write"] is False
        assert "store_short_ttl_artifact" in workflow_metadata["steps"]
        assert "local_approval_required" in workflow_metadata["stop_conditions"]
        artifact = result_data["result"]["artifact"]
        assert artifact["format"] == "webp"
        assert artifact["width"] == 100
        assert artifact["height"] == 80
        assert artifact["filesize_bytes"] > 0
        assert artifact["checksum"].startswith("sha256:")
        assert artifact["mime_type"] == "image/webp"
        assert artifact["suggested_filename"].endswith(".webp")
        assert artifact["suggested_filename"].startswith("media-derivative-webp-")
        assert artifact["filename_basis"]["owner"] == "wordpress_write_ability_final"
        assert artifact["processing_warnings"] == []
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.status == "succeeded"
            assert metric.target_format == "webp"
            assert metric.output_format == "webp"
            assert metric.source_bytes == len(image_bytes)
            assert metric.output_bytes == artifact["filesize_bytes"]
            assert metric.source_width == 200
            assert metric.source_height == 160
            assert metric.output_width == 100
            assert metric.output_height == 80
            assert metric.processing_duration_ms >= 0
            assert metric.artifact_id == artifact["artifact_id"]
    finally:
        dispose_engine(database_url)


def test_worker_success_path_with_crop(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(200, 100)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
                "crop": {
                    "type": "aspect_ratio",
                    "aspect_ratio": "1:1",
                    "position": "center",
                },
            },
            "ttl_minutes": 30,
        }
        body, content_type = _build_multipart_body(
            request_dict,
            image_bytes,
            boundary="boundary-worker-crop",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-worker-crop-001",
            nonce="nonce-worker-crop-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        run_id = response.json()["data"]["run_id"]

        _process_queued_runs(database_url)

        result_headers = build_auth_headers(
            "GET",
            f"/v1/runs/{run_id}/result",
            site_id="site_alpha",
        )
        result_response = client.get(f"/v1/runs/{run_id}/result", headers=result_headers)
        assert result_response.status_code == 200, result_response.json()
        artifact = result_response.json()["data"]["result"]["artifact"]
        assert artifact["format"] == "png"
        assert artifact["width"] == 50
        assert artifact["height"] == 50
        assert "source_cropped_to_aspect_ratio_1_1" in artifact["processing_warnings"]
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.output_width == 50
            assert metric.output_height == 50
    finally:
        dispose_engine(database_url)


def test_response_contains_no_wordpress_write_fields(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-no-wp-001",
            nonce="nonce-no-wp-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        response_text = json.dumps(response.json())
        for field in BLOCKED_RESPONSE_FIELDS:
            assert field not in response_text, f"blocked field '{field}' found in response"
    finally:
        dispose_engine(database_url)


def test_batch_context_response_includes_queue_pressure_and_policy(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "media_derivative_batch_default_chunk_size": 6,
            "media_derivative_batch_max_chunk_size": 12,
            "media_derivative_site_queued_limit": 20,
            "media_derivative_site_running_limit": 2,
        },
    )
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
            "batch_context": {
                "batch_id": "batch-april-media",
                "item_index": 1,
                "item_count": 12,
                "chunk_size": 6,
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-batch-context",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-batch-context-001",
            nonce="nonce-batch-context-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        data = response.json()["data"]
        assert data["batch"]["context"]["batch_id"] == "batch-april-media"
        assert data["batch"]["chunking"]["recommended_chunk_size"] == 6
        assert data["batch"]["chunking"]["max_chunk_size"] == 12
        assert data["batch"]["avif_policy"]["batch_requires_explicit_opt_in"] is True
        assert data["queue_pressure"]["queued"] == 1
        assert data["queue_pressure"]["running"] == 0
        assert data["queue_pressure"]["pressure_state"] == "healthy"
        with get_session(database_url) as session:
            run = session.get(RunRecord, data["run_id"])
            assert run is not None
            media_policy = run.policy_json["media_derivative"]
            assert media_policy["batch_context"]["batch_id"] == "batch-april-media"
            assert media_policy["limits"]["site_queued"] == 20
            assert media_policy["write_posture"] == "artifact_only"
            assert media_policy["direct_wordpress_write"] is False
    finally:
        dispose_engine(database_url)


def test_batch_avif_requires_explicit_opt_in(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "avif",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
            "batch_context": {
                "batch_id": "batch-avif-media",
                "item_index": 1,
                "item_count": 2,
                "chunk_size": 2,
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-batch-avif",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-batch-avif-001",
            nonce="nonce-batch-avif-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert response.json()["error_code"] == "media_derivative.invalid_format"
    finally:
        dispose_engine(database_url)


def test_site_queue_full_rejects_new_media_derivative(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={
            "media_derivative_site_queued_limit": 1,
            "media_derivative_site_running_limit": 1,
        },
    )
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        first_body, first_content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-queue-full-first",
        )
        first_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=first_body,
            idempotency_key="idem-queue-full-001",
            nonce="nonce-queue-full-001",
        )
        first_headers["content-type"] = first_content_type
        first_response = client.post(
            "/v1/runtime/media-derivatives",
            content=first_body,
            headers=first_headers,
        )
        assert first_response.status_code == 200, first_response.json()

        second_body, second_content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-queue-full-second",
        )
        second_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=second_body,
            idempotency_key="idem-queue-full-002",
            nonce="nonce-queue-full-002",
        )
        second_headers["content-type"] = second_content_type
        second_response = client.post(
            "/v1/runtime/media-derivatives",
            content=second_body,
            headers=second_headers,
        )
        assert second_response.status_code == 429
        assert second_response.json()["error_code"] == "media_derivative.site_queue_full"
    finally:
        dispose_engine(database_url)


def test_watermark_file_success_path(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(100, 100, color="white")
        watermark_bytes = _make_png_bytes(10, 10, color="red")
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "position": "bottom_right",
                    "opacity": 1.0,
                    "scale_percent": 20,
                    "margin_px": 0,
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            image_bytes,
            watermark_bytes=watermark_bytes,
            boundary="boundary-watermark-file",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-watermark-file-001",
            nonce="nonce-watermark-file-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        run_id = response.json()["data"]["run_id"]

        _process_queued_runs(database_url)

        result_headers = build_auth_headers(
            "GET",
            f"/v1/runs/{run_id}/result",
            site_id="site_alpha",
        )
        result_response = client.get(f"/v1/runs/{run_id}/result", headers=result_headers)
        assert result_response.status_code == 200, result_response.json()
        artifact = result_response.json()["data"]["result"]["artifact"]
        assert artifact["format"] == "png"
        artifact_id = artifact["artifact_id"]

        dl_headers = build_auth_headers(
            "GET",
            f"/v1/runtime/artifacts/{artifact_id}/download",
            site_id="site_alpha",
        )
        dl_response = client.get(
            f"/v1/runtime/artifacts/{artifact_id}/download",
            headers=dl_headers,
        )
        assert dl_response.status_code == 200
        watermarked = Image.open(io.BytesIO(dl_response.content))
        assert watermarked.getpixel((95, 95))[:3] == (255, 0, 0)
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.watermark_applied is True
            assert metric.artifact_download_count == 1
            assert metric.artifact_last_downloaded_at is not None
            stored = session.get(MediaArtifact, artifact_id)
            assert stored is not None
            build_artifact_store(client.app.state.services.settings).delete(stored.storage_key)
        unavailable = client.get(
            f"/v1/runtime/artifacts/{artifact_id}/download", headers=dl_headers
        )
        assert unavailable.status_code == 503
        assert unavailable.json()["error_code"] == "media_derivative.artifact_unavailable"
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.artifact_download_count == 1
    finally:
        dispose_engine(database_url)


def test_text_watermark_success_path_without_watermark_artifact(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(100, 100, color="white")
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "text",
                    "text": "AI",
                    "position": "top_right",
                    "opacity": 1.0,
                    "font_size": 24,
                    "color": "#000000",
                    "background": "transparent",
                    "margin_px": 0,
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            image_bytes,
            boundary="boundary-text-watermark",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-text-watermark-001",
            nonce="nonce-text-watermark-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        run_id = response.json()["data"]["run_id"]

        _process_queued_runs(database_url)

        result_headers = build_auth_headers(
            "GET",
            f"/v1/runs/{run_id}/result",
            site_id="site_alpha",
        )
        result_response = client.get(f"/v1/runs/{run_id}/result", headers=result_headers)
        assert result_response.status_code == 200, result_response.json()
        artifact = result_response.json()["data"]["result"]["artifact"]
        artifact_id = artifact["artifact_id"]

        dl_headers = build_auth_headers(
            "GET",
            f"/v1/runtime/artifacts/{artifact_id}/download",
            site_id="site_alpha",
        )
        dl_response = client.get(
            f"/v1/runtime/artifacts/{artifact_id}/download",
            headers=dl_headers,
        )
        assert dl_response.status_code == 200
        watermarked = Image.open(io.BytesIO(dl_response.content)).convert("RGB")
        top_right_pixels = [
            watermarked.getpixel((x, y)) for x in range(50, 100) for y in range(0, 40)
        ]
        assert any(pixel != (255, 255, 255) for pixel in top_right_pixels)
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.watermark_applied is True
    finally:
        dispose_engine(database_url)


def test_watermark_file_and_artifact_conflict_is_rejected(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(100, 100, color="white")
        watermark_bytes = _make_png_bytes(10, 10, color="red")
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "artifact_id": "art_conflicting_logo",
                    "position": "bottom_right",
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            image_bytes,
            watermark_bytes=watermark_bytes,
            boundary="boundary-watermark-conflict",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-watermark-conflict-001",
            nonce="nonce-watermark-conflict-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 400
        assert response.json()["error_code"] == "media_derivative.invalid_watermark"
    finally:
        dispose_engine(database_url)


def test_watermark_artifact_must_be_same_site(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        logo_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 10,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        logo_body, logo_content_type = _build_multipart_body(
            logo_request,
            _make_png_bytes(10, 10, color="red"),
            boundary="boundary-watermark-artifact-logo",
        )
        logo_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=logo_body,
            idempotency_key="idem-watermark-artifact-logo-001",
            nonce="nonce-watermark-artifact-logo-001",
        )
        logo_headers["content-type"] = logo_content_type
        logo_response = client.post(
            "/v1/runtime/media-derivatives",
            content=logo_body,
            headers=logo_headers,
        )
        assert logo_response.status_code == 200, logo_response.json()
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact_id = artifact.artifact_id

        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "artifact_id": artifact_id,
                    "position": "bottom_right",
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100, color="white"),
            boundary="boundary-watermark-cross-site",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_beta",
            key_id="key_beta",
            body=body,
            idempotency_key="idem-watermark-cross-site-001",
            nonce="nonce-watermark-cross-site-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 404
        assert response.json()["error_code"] == "media_derivative.watermark_artifact_not_found"
    finally:
        dispose_engine(database_url)


def test_expired_watermark_artifact_is_rejected(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        logo_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 10,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        logo_body, logo_content_type = _build_multipart_body(
            logo_request,
            _make_png_bytes(10, 10, color="red"),
            boundary="boundary-watermark-expired-logo",
        )
        logo_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=logo_body,
            idempotency_key="idem-watermark-expired-logo-001",
            nonce="nonce-watermark-expired-logo-001",
        )
        logo_headers["content-type"] = logo_content_type
        logo_response = client.post(
            "/v1/runtime/media-derivatives",
            content=logo_body,
            headers=logo_headers,
        )
        assert logo_response.status_code == 200, logo_response.json()
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            session.commit()
            artifact_id = artifact.artifact_id

        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "artifact_id": artifact_id,
                    "position": "bottom_right",
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100, color="white"),
            boundary="boundary-watermark-expired",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-watermark-expired-001",
            nonce="nonce-watermark-expired-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 404
        assert response.json()["error_code"] == "media_derivative.watermark_artifact_not_found"
    finally:
        dispose_engine(database_url)


def test_missing_watermark_artifact_bytes_fail_closed(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        logo_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 10,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        logo_body, logo_content_type = _build_multipart_body(
            logo_request,
            _make_png_bytes(10, 10, color="red"),
            boundary="boundary-watermark-missing-logo",
        )
        logo_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=logo_body,
            idempotency_key="idem-watermark-missing-logo-001",
            nonce="nonce-watermark-missing-logo-001",
        )
        logo_headers["content-type"] = logo_content_type
        assert client.post(
            "/v1/runtime/media-derivatives", content=logo_body, headers=logo_headers
        ).status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact_id = artifact.artifact_id
            build_artifact_store(client.app.state.services.settings).delete(artifact.storage_key)

        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "artifact_id": artifact_id,
                    "position": "bottom_right",
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100, color="white"),
            boundary="boundary-watermark-missing",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-watermark-missing-001",
            nonce="nonce-watermark-missing-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 503
        assert response.json()["error_code"] == "media_derivative.watermark_artifact_unavailable"
    finally:
        dispose_engine(database_url)


def test_invalid_format_gif_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "gif",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body = json.dumps(request_dict).encode()
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-gif-001",
            nonce="nonce-gif-001",
        )
        headers["content-type"] = "application/json"
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert "invalid_format" in response.json()["error_code"]
    finally:
        dispose_engine(database_url)


def test_invalid_watermark_position_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "watermark": {
                    "type": "image",
                    "position": "diagonal",
                    "opacity": 0.75,
                    "scale_percent": 20,
                    "margin_px": 8,
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            watermark_bytes=_make_png_bytes(10, 10),
            boundary="boundary-invalid-watermark-position",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-invalid-watermark-position-001",
            nonce="nonce-invalid-watermark-position-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert response.json()["error_code"] == "media_derivative.invalid_watermark"
    finally:
        dispose_engine(database_url)


def test_invalid_crop_ratio_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
                "crop": {
                    "type": "aspect_ratio",
                    "aspect_ratio": "freeform",
                    "position": "center",
                },
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-invalid-crop-ratio",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-invalid-crop-ratio-001",
            nonce="nonce-invalid-crop-ratio-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert response.json()["error_code"] == "media_derivative.invalid_crop"
    finally:
        dispose_engine(database_url)


def test_quality_out_of_bounds_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 0,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-quality-out-of-bounds",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-quality-out-of-bounds-001",
            nonce="nonce-quality-out-of-bounds-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert response.json()["error_code"] == "media_derivative.validation_error"
    finally:
        dispose_engine(database_url)


def test_ttl_out_of_bounds_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
            "ttl_minutes": 120,
        }
        body, content_type = _build_multipart_body(
            request_dict,
            _make_png_bytes(100, 100),
            boundary="boundary-ttl-out-of-bounds",
        )
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-ttl-out-of-bounds-001",
            nonce="nonce-ttl-out-of-bounds-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert response.json()["error_code"] == "media_derivative.validation_error"
    finally:
        dispose_engine(database_url)


def test_valid_upload_above_default_runtime_body_limit_is_accepted(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_bmp_bytes()
        assert len(image_bytes) > 1_048_576
        assert len(image_bytes) < MAX_UPLOAD_BYTES_IMAGE
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-large-valid-001",
            nonce="nonce-large-valid-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200, response.json()
        assert response.json()["data"]["status"] == "queued"
    finally:
        dispose_engine(database_url)


def test_idempotency_key_conflict_returns_409(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        base_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        first_body, first_content_type = _build_multipart_body(
            base_request,
            _make_png_bytes(50, 50),
            boundary="boundary-idem-a",
        )
        first_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=first_body,
            idempotency_key="idem-conflict-001",
            nonce="nonce-conflict-001",
        )
        first_headers["content-type"] = first_content_type
        first_response = client.post(
            "/v1/runtime/media-derivatives",
            content=first_body,
            headers=first_headers,
        )
        assert first_response.status_code == 200, first_response.json()

        changed_request = {
            **base_request,
            "cloud_job_payload": {
                **base_request["cloud_job_payload"],
                "quality": 60,
            },
        }
        second_body, second_content_type = _build_multipart_body(
            changed_request,
            _make_png_bytes(50, 50),
            boundary="boundary-idem-b",
        )
        second_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=second_body,
            idempotency_key="idem-conflict-001",
            nonce="nonce-conflict-002",
        )
        second_headers["content-type"] = second_content_type
        second_response = client.post(
            "/v1/runtime/media-derivatives",
            content=second_body,
            headers=second_headers,
        )
        assert second_response.status_code == 409
        assert second_response.json()["error_code"] == "runtime.idempotency_conflict"
    finally:
        dispose_engine(database_url)


def test_video_source_media_type_returns_422(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "video",
            },
        }
        body = json.dumps(request_dict).encode()
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-video-001",
            nonce="nonce-video-001",
        )
        headers["content-type"] = "application/json"
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 422
        assert "source_media_type_unavailable" in response.json()["error_code"]
    finally:
        dispose_engine(database_url)


def test_expired_artifact_download_returns_410(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-expire-001",
            nonce="nonce-expire-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            session.commit()
            artifact_id = artifact.artifact_id

        dl_headers = build_auth_headers(
            "GET",
            f"/v1/runtime/artifacts/{artifact_id}/download",
            site_id="site_alpha",
        )
        dl_response = client.get(
            f"/v1/runtime/artifacts/{artifact_id}/download",
            headers=dl_headers,
        )
        assert dl_response.status_code == 410
    finally:
        dispose_engine(database_url)


def test_artifact_reference_must_be_same_site(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-cross-site-001",
            nonce="nonce-cross-site-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact_id = artifact.artifact_id

        ref_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
            "source": {"artifact_id": artifact_id},
        }
        ref_body = json.dumps(ref_request).encode()
        ref_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_beta",
            key_id="key_beta",
            body=ref_body,
            idempotency_key="idem-cross-site-002",
            nonce="nonce-cross-site-002",
        )
        ref_headers["content-type"] = "application/json"
        ref_response = client.post(
            "/v1/runtime/media-derivatives",
            content=ref_body,
            headers=ref_headers,
        )
        assert ref_response.status_code == 404

        with get_session(database_url) as session:
            stored = session.get(MediaArtifact, artifact_id)
            assert stored is not None
            build_artifact_store(client.app.state.services.settings).delete(stored.storage_key)
        unavailable_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=ref_body,
            idempotency_key="idem-source-unavailable-001",
            nonce="nonce-source-unavailable-001",
        )
        unavailable_headers["content-type"] = "application/json"
        unavailable = client.post(
            "/v1/runtime/media-derivatives",
            content=ref_body,
            headers=unavailable_headers,
        )
        assert unavailable.status_code == 503
        assert unavailable.json()["error_code"] == "media_derivative.source_artifact_unavailable"
    finally:
        dispose_engine(database_url)


def test_animated_image_rejected(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_animated_gif_bytes()
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-animated-001",
            nonce="nonce-animated-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        run_id = response.json()["data"]["run_id"]
        result_headers = build_auth_headers(
            "GET",
            f"/v1/runs/{run_id}/result",
            site_id="site_alpha",
        )
        result_headers["content-type"] = "application/json"
        result_response = client.get(f"/v1/runs/{run_id}/result", headers=result_headers)
        assert result_response.status_code == 200
        result_data = result_response.json()["data"]
        assert result_data["status"] == "failed"
        assert "animated_source_unavailable" in (
            result_data.get("result", {}).get("error_code") or ""
        )
        with get_session(database_url) as session:
            metric = session.query(MediaDerivativeJobMetric).filter_by(run_id=run_id).one()
            assert metric.status == "failed"
            assert metric.error_code == "media_derivative.animated_source_unavailable"
            assert metric.target_format == "webp"
            assert metric.source_bytes == len(image_bytes)
            assert metric.output_bytes == 0
    finally:
        dispose_engine(database_url)


def test_no_provider_call_record_created(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-no-provider-001",
            nonce="nonce-no-provider-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            count = len(list(session.query(ProviderCallRecord).all()))
            assert count == 0
    finally:
        dispose_engine(database_url)


def test_artifact_expires_at_is_short_ttl(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
            "ttl_minutes": 20,
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-ttl-001",
            nonce="nonce-ttl-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            created_at = artifact.created_at
            expires_at = artifact.expires_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=UTC)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            delta_minutes = (expires_at - created_at).total_seconds() / 60
            assert 15 <= delta_minutes <= 60
    finally:
        dispose_engine(database_url)


def test_oversized_upload_returns_413(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        oversized_bytes = b"\x00" * (MAX_UPLOAD_BYTES_IMAGE + 1)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 100,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, oversized_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-oversized-001",
            nonce="nonce-oversized-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 413, response.json()
        assert response.json()["error_code"] == "media_derivative.upload_too_large"
    finally:
        dispose_engine(database_url)


def test_purged_artifact_reference_is_rejected(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "png",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-purged-001",
            nonce="nonce-purged-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        _process_queued_runs(database_url)

        with get_session(database_url) as session:
            artifact = session.query(MediaArtifact).first()
            assert artifact is not None
            artifact.purged_at = datetime.now(UTC)
            session.commit()
            artifact_id = artifact.artifact_id

        ref_request = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
            "source": {"artifact_id": artifact_id},
        }
        ref_body = json.dumps(ref_request).encode()
        ref_headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=ref_body,
            idempotency_key="idem-purged-002",
            nonce="nonce-purged-002",
        )
        ref_headers["content-type"] = "application/json"
        ref_response = client.post(
            "/v1/runtime/media-derivatives",
            content=ref_body,
            headers=ref_headers,
        )
        assert ref_response.status_code == 404
    finally:
        dispose_engine(database_url)


def test_endpoint_bypasses_model_routing(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        image_bytes = _make_png_bytes(50, 50)
        request_dict = {
            "request_contract_version": "media_derivative_cloud_request.v1",
            "cloud_job_payload": {
                "job_type": "generate_optimized_media_derivative",
                "target_format": "webp",
                "max_width": 50,
                "quality": 80,
                "source_media_type": "image",
            },
        }
        body, content_type = _build_multipart_body(request_dict, image_bytes)
        headers = build_auth_headers(
            "POST",
            "/v1/runtime/media-derivatives",
            site_id="site_alpha",
            body=body,
            idempotency_key="idem-no-routing-001",
            nonce="nonce-no-routing-001",
        )
        headers["content-type"] = content_type
        response = client.post("/v1/runtime/media-derivatives", content=body, headers=headers)
        assert response.status_code == 200
        run_id = response.json()["data"]["run_id"]

        with get_session(database_url) as session:
            run = session.get(RunRecord, run_id)
            assert run is not None
            assert run.execution_kind == "media_derivative"
            assert run.selected_provider_id == "media_derivative"
            assert run.selected_model_id == "pillow"
    finally:
        dispose_engine(database_url)


@pytest.mark.asyncio
async def test_signed_multipart_ingress_accepts_multiple_transport_chunks(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    body, content_type = _build_multipart_body(
        _minimal_request_dict(),
        _make_png_bytes(30, 20),
        boundary="boundary-multi-chunk",
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-multi-chunk",
        nonce="nonce-multi-chunk",
    )
    headers["content-type"] = content_type

    async def body_chunks() -> AsyncIterator[bytes]:
        for offset in range(0, len(body), 17):
            yield body[offset : offset + 17]

    try:
        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as async_client:
            response = await async_client.post(
                "/v1/runtime/media-derivatives",
                content=body_chunks(),
                headers=headers,
            )
        assert response.status_code == 200, response.json()
        assert response.json()["data"]["status"] == "queued"
    finally:
        dispose_engine(database_url)


def test_missing_auth_header_wins_over_oversize_content_length(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"media_derivative_max_body_bytes": 64},
    )
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=b"{}",
            headers={
                "content-type": "application/json",
                "content-length": "65",
            },
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "auth.site_id_required"
    finally:
        dispose_engine(database_url)


def test_oversize_content_length_returns_stable_auth_error(tmp_path: Path) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"media_derivative_max_body_bytes": 64},
    )
    body = b"{}"
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-content-length-over",
        nonce="nonce-content-length-over",
    )
    headers.update(
        {
            "content-type": "application/json",
            "content-length": "65",
        }
    )
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 413
        assert response.json()["error_code"] == "auth.payload_too_large"
    finally:
        dispose_engine(database_url)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_signature", [False, True])
async def test_counted_body_limit_is_authoritative_before_signature_verification(
    tmp_path: Path,
    invalid_signature: bool,
) -> None:
    database_url, client = _build_client(
        tmp_path,
        settings_overrides={"media_derivative_max_body_bytes": 64},
    )
    body = b"x" * 65
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key=f"idem-counted-over-{invalid_signature}",
        nonce=f"nonce-counted-over-{invalid_signature}",
    )
    if invalid_signature:
        headers["X-Npcink-Signature"] = "0" * 64
    headers["content-type"] = "application/json"

    async def body_chunks() -> AsyncIterator[bytes]:
        yield body[:32]
        yield body[32:]

    try:
        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as async_client:
            response = await async_client.post(
                "/v1/runtime/media-derivatives",
                content=body_chunks(),
                headers=headers,
            )
        assert response.status_code == 413
        assert response.json()["error_code"] == "auth.payload_too_large"
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize(
    ("invalid_signature", "expected_status", "expected_error"),
    [
        (True, 401, "auth.invalid_signature"),
        (False, 400, "media_derivative.invalid_request"),
    ],
)
def test_authentication_precedes_truncated_multipart_parse_error(
    tmp_path: Path,
    invalid_signature: bool,
    expected_status: int,
    expected_error: str,
) -> None:
    database_url, client = _build_client(tmp_path)
    body, content_type = _build_custom_multipart_body(
        [
            ("request", json.dumps(_minimal_request_dict()).encode(), None),
            ("source_file", b"partial-file", "partial.png"),
        ],
        boundary="boundary-truncated-priority",
        complete=False,
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key=f"idem-truncated-{invalid_signature}",
        nonce=f"nonce-truncated-{invalid_signature}",
    )
    if invalid_signature:
        headers["X-Npcink-Signature"] = "0" * 64
    headers["content-type"] = content_type
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == expected_status
        assert response.json()["error_code"] == expected_error
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize(
    "case",
    [
        "missing_boundary",
        "unknown_part",
        "duplicate_request",
        "duplicate_part",
        "too_many_files",
        "request_type_masquerade",
        "source_type_masquerade",
        "oversize_request_field",
        "oversize_part_header",
        "oversize_content_type",
    ],
)
def test_multipart_shape_rejections_are_stable(tmp_path: Path, case: str) -> None:
    database_url, client = _build_client(tmp_path)
    request_json = json.dumps(_minimal_request_dict()).encode()
    boundary = f"boundary-{case}"
    parts: list[tuple[str, bytes, str | None]]
    if case == "unknown_part":
        parts = [
            ("request", request_json, None),
            ("unexpected_file", b"x", "unexpected.bin"),
        ]
    elif case == "duplicate_request":
        parts = [
            ("request", request_json, None),
            ("request", request_json, None),
        ]
    elif case == "duplicate_part":
        parts = [
            ("request", request_json, None),
            ("source_file", b"one", "one.bin"),
            ("source_file", b"two", "two.bin"),
        ]
    elif case == "too_many_files":
        parts = [
            ("request", request_json, None),
            ("source_file", b"one", "one.bin"),
            ("watermark_file", b"two", "two.bin"),
            ("unexpected_file", b"three", "three.bin"),
        ]
    elif case == "request_type_masquerade":
        parts = [("request", request_json, "request.json")]
    elif case == "source_type_masquerade":
        parts = [
            ("request", request_json, None),
            ("source_file", b"not-a-file", None),
        ]
    elif case == "oversize_request_field":
        parts = [("request", b"x" * (64 * 1024 + 1), None)]
    elif case == "oversize_part_header":
        parts = [("x" * (16 * 1024 + 1), b"value", None)]
    else:
        parts = [("request", request_json, None)]

    body, content_type = _build_custom_multipart_body(parts, boundary=boundary)
    if case == "missing_boundary":
        content_type = "multipart/form-data"
    elif case == "oversize_content_type":
        content_type = f"multipart/form-data; boundary={'x' * (16 * 1024 + 1)}"
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key=f"idem-shape-{case}",
        nonce=f"nonce-shape-{case}",
    )
    headers["content-type"] = content_type
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["error_code"] == "media_derivative.invalid_request"
    finally:
        dispose_engine(database_url)


def test_upload_larger_than_one_mib_is_spooled_to_disk(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    observed: dict[str, object] = {}
    raw_files, _ = _track_ingress_tempfiles(monkeypatch)

    async def inspect_ingress(
        _request: object,
        ingress: media_ingress_module.MediaIngress,
    ) -> JSONResponse:
        assert ingress.source_file is not None
        observed["rolled"] = getattr(ingress.source_file.file, "_rolled", False)
        observed["file"] = ingress.source_file.file
        return JSONResponse({"ok": True})

    monkeypatch.setattr(
        media_derivatives_route,
        "_create_media_derivative_from_ingress",
        inspect_ingress,
    )
    body, content_type = _build_multipart_body(
        _minimal_request_dict(),
        b"x" * (1024 * 1024 + 1),
        boundary="boundary-spooled-disk",
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-spooled-disk",
        nonce="nonce-spooled-disk",
    )
    headers["content-type"] = content_type
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 200
        assert observed["rolled"] is True
        assert observed["file"].closed is True
        _assert_tempfiles_closed(raw_files)
    finally:
        dispose_engine(database_url)


def test_auth_rejection_closes_raw_capture(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    raw_files, _ = _track_ingress_tempfiles(monkeypatch)
    body = json.dumps(_minimal_request_dict()).encode()
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-auth-cleanup",
        nonce="nonce-auth-cleanup",
    )
    headers["X-Npcink-Signature"] = "0" * 64
    headers["content-type"] = "application/json"
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 401
        _assert_tempfiles_closed(raw_files)
    finally:
        dispose_engine(database_url)


def test_truncated_file_parse_closes_raw_and_unpublished_upload_tempfiles(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    raw_files, upload_files = _track_ingress_tempfiles(monkeypatch)
    body, content_type = _build_custom_multipart_body(
        [
            ("request", json.dumps(_minimal_request_dict()).encode(), None),
            ("source_file", b"partial-file", "partial.png"),
        ],
        boundary="boundary-truncated-cleanup",
        complete=False,
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-truncated-cleanup",
        nonce="nonce-truncated-cleanup",
    )
    headers["content-type"] = content_type
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["error_code"] == "media_derivative.invalid_request"
        _assert_tempfiles_closed(raw_files)
        _assert_tempfiles_closed(upload_files)
    finally:
        dispose_engine(database_url)


def test_service_exception_closes_all_ingress_tempfiles(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    raw_files, upload_files = _track_ingress_tempfiles(monkeypatch)

    async def raise_service_error(_request: object, _ingress: object) -> JSONResponse:
        raise RuntimeError("synthetic service failure")

    monkeypatch.setattr(
        media_derivatives_route,
        "_create_media_derivative_from_ingress",
        raise_service_error,
    )
    body, content_type = _build_multipart_body(
        _minimal_request_dict(),
        b"file-bytes",
        boundary="boundary-service-cleanup",
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-service-cleanup",
        nonce="nonce-service-cleanup",
    )
    headers["content-type"] = content_type
    error_client = TestClient(client.app, raise_server_exceptions=False)
    try:
        response = error_client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 500
        _assert_tempfiles_closed(raw_files)
        _assert_tempfiles_closed(upload_files)
    finally:
        error_client.close()
        dispose_engine(database_url)


@pytest.mark.asyncio
async def test_cancelled_service_closes_all_ingress_tempfiles(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    raw_files, upload_files = _track_ingress_tempfiles(monkeypatch)

    async def cancel_service(_request: object, _ingress: object) -> JSONResponse:
        raise asyncio.CancelledError

    monkeypatch.setattr(
        media_derivatives_route,
        "_create_media_derivative_from_ingress",
        cancel_service,
    )
    body, content_type = _build_multipart_body(
        _minimal_request_dict(),
        b"file-bytes",
        boundary="boundary-cancel-cleanup",
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-cancel-cleanup",
        nonce="nonce-cancel-cleanup",
    )
    headers["content-type"] = content_type
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/v1/runtime/media-derivatives",
        "raw_path": b"/v1/runtime/media-derivatives",
        "query_string": b"",
        "headers": [
            (name.lower().encode("latin-1"), value.encode("latin-1"))
            for name, value in headers.items()
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "app": client.app,
    }
    request_consumed = False

    async def receive() -> dict[str, object]:
        nonlocal request_consumed
        if request_consumed:
            return {"type": "http.disconnect"}
        request_consumed = True
        return {
            "type": "http.request",
            "body": body,
            "more_body": False,
        }

    try:
        with pytest.raises(asyncio.CancelledError):
            await media_derivatives_route.create_media_derivative(Request(scope, receive))
        _assert_tempfiles_closed(raw_files)
        _assert_tempfiles_closed(upload_files)
    finally:
        dispose_engine(database_url)


def test_json_body_over_sixty_four_kib_is_rejected_after_auth(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    body = b"x" * (64 * 1024 + 1)
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-json-over-64k",
        nonce="nonce-json-over-64k",
    )
    headers["content-type"] = "application/json"
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["error_code"] == "media_derivative.invalid_request"
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize(
    ("content_length", "expected_status", "expected_error"),
    [
        ("-1", 400, "media_derivative.invalid_request"),
        ("not-a-number", 400, "media_derivative.invalid_request"),
        ("9" * 5000, 413, "auth.payload_too_large"),
        ("0" * 5000, 400, "media_derivative.invalid_request"),
    ],
)
def test_content_length_parsing_is_bounded_and_stable(
    tmp_path: Path,
    content_length: str,
    expected_status: int,
    expected_error: str,
) -> None:
    database_url, client = _build_client(tmp_path)
    body = b"{}"
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key=f"idem-content-length-{expected_status}-{len(content_length)}",
        nonce=f"nonce-content-length-{expected_status}-{len(content_length)}",
    )
    headers.update(
        {
            "content-type": "application/json",
            "content-length": content_length,
        }
    )
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == expected_status
        assert response.json()["error_code"] == expected_error
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize("failure_mode", ["create", "write", "short_write"])
def test_temporary_ingress_storage_failures_return_stable_503_and_cleanup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_mode: str,
) -> None:
    database_url, client = _build_client(tmp_path)
    original_temporary_file = tempfile.TemporaryFile
    backing_files: list[object] = []

    class FailingWriteFile:
        def __init__(self) -> None:
            self.backing_file = original_temporary_file("w+b")
            backing_files.append(self.backing_file)

        @property
        def closed(self) -> bool:
            return self.backing_file.closed

        def write(self, _payload: bytes) -> int:
            if failure_mode == "short_write":
                return 0
            raise OSError("synthetic ENOSPC")

        def close(self) -> None:
            self.backing_file.close()

    def failing_temporary_file(*_args: object, **_kwargs: object) -> object:
        if failure_mode == "create":
            raise OSError("synthetic ENOSPC")
        return FailingWriteFile()

    monkeypatch.setattr(
        media_ingress_module.tempfile,
        "TemporaryFile",
        failing_temporary_file,
    )
    body = json.dumps(_minimal_request_dict()).encode()
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key=f"idem-ingress-enospc-{failure_mode}",
        nonce=f"nonce-ingress-enospc-{failure_mode}",
    )
    headers["content-type"] = "application/json"
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 503
        assert response.json()["error_code"] == "media_derivative.ingress_unavailable"
        assert all(file_object.closed for file_object in backing_files)
    finally:
        dispose_engine(database_url)


def test_multipart_spool_creation_failure_returns_stable_503_and_closes_raw_capture(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    raw_files, _ = _track_ingress_tempfiles(monkeypatch)

    def failing_spooled_file(*_args: object, **_kwargs: object) -> object:
        raise OSError("synthetic multipart spool ENOSPC")

    monkeypatch.setattr(
        starlette_formparsers,
        "SpooledTemporaryFile",
        failing_spooled_file,
    )
    body, content_type = _build_multipart_body(
        _minimal_request_dict(),
        b"file-bytes",
        boundary="boundary-spool-enospc",
    )
    headers = build_auth_headers(
        "POST",
        "/v1/runtime/media-derivatives",
        site_id="site_alpha",
        body=body,
        idempotency_key="idem-spool-enospc",
        nonce="nonce-spool-enospc",
    )
    headers["content-type"] = content_type
    try:
        response = client.post(
            "/v1/runtime/media-derivatives",
            content=body,
            headers=headers,
        )
        assert response.status_code == 503
        assert response.json()["error_code"] == "media_derivative.ingress_unavailable"
        _assert_tempfiles_closed(raw_files)
    finally:
        dispose_engine(database_url)


@pytest.mark.asyncio
async def test_cleanup_error_does_not_skip_remaining_files_or_raw_capture() -> None:
    class RecordingFile:
        def __init__(self, *, fail: bool) -> None:
            self.closed = False
            self.fail = fail

        def close(self) -> None:
            self.closed = True
            if self.fail:
                raise RuntimeError("synthetic close failure")

    class RecordingCapture:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    first_file = RecordingFile(fail=True)
    second_file = RecordingFile(fail=False)
    capture = RecordingCapture()
    auth = media_ingress_module.RequestAuthContext(
        site_id="site_alpha",
        key_id="key_default",
        trace_id="0" * 32,
        traceparent=f"00-{'0' * 32}-{'0' * 16}-01",
        nonce="nonce-cleanup",
        idempotency_key="idem-cleanup",
        timestamp="0",
        body_digest="0" * 64,
    )
    ingress = media_ingress_module.MediaIngress(
        auth=auth,
        request_json="{}",
        source_file=None,
        watermark_file=None,
        _capture=capture,  # type: ignore[arg-type]
        _tracked_files=(first_file, second_file),  # type: ignore[arg-type]
    )

    with pytest.raises(RuntimeError, match="synthetic close failure"):
        await ingress.close()
    assert first_file.closed is True
    assert second_file.closed is True
    assert capture.closed is True


@pytest.mark.asyncio
async def test_upload_read_oserror_returns_stable_ingress_unavailable() -> None:
    class FailingUpload(media_ingress_module.UploadFile):
        async def read(self, size: int = -1) -> bytes:
            raise OSError("synthetic upload spool read failure")

    auth = media_ingress_module.RequestAuthContext(
        site_id="site_alpha",
        key_id="key_default",
        trace_id="0" * 32,
        traceparent=f"00-{'0' * 32}-{'0' * 16}-01",
        nonce="nonce-upload-read",
        idempotency_key="idem-upload-read",
        timestamp="0",
        body_digest="0" * 64,
    )
    ingress = media_ingress_module.MediaIngress(
        auth=auth,
        request_json="{}",
        source_file=None,
        watermark_file=None,
        _capture=object(),  # type: ignore[arg-type]
    )
    upload = FailingUpload(file=io.BytesIO(b"payload"), size=7)

    with pytest.raises(media_ingress_module.MediaIngressError) as exc_info:
        await ingress.read_upload_once(
            upload,
            max_bytes=1024,
            too_large_message="too large",
        )
    assert exc_info.value.status_code == 503
    assert exc_info.value.error_code == "media_derivative.ingress_unavailable"


@pytest.mark.asyncio
async def test_file_over_fifty_mib_is_rejected_before_materialization(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    boundary = "boundary-file-over-fifty-mib"
    request_json = json.dumps(_minimal_request_dict()).encode()
    prefix = b"\r\n".join(
        [
            f"--{boundary}".encode(),
            b'Content-Disposition: form-data; name="request"',
            b"",
            request_json,
            f"--{boundary}".encode(),
            b'Content-Disposition: form-data; name="source_file"; filename="large.bin"',
            b"Content-Type: application/octet-stream",
            b"",
        ]
    ) + b"\r\n"
    suffix = b"\r\n" + f"--{boundary}--".encode()
    file_chunk = b"x" * (64 * 1024)
    full_chunks = MAX_UPLOAD_BYTES_IMAGE // len(file_chunk)
    trailing_file_byte = b"x"
    digest = hashlib.sha256()
    digest.update(prefix)
    for _ in range(full_chunks):
        digest.update(file_chunk)
    digest.update(trailing_file_byte)
    digest.update(suffix)
    headers = _build_auth_headers_for_digest(
        digest.hexdigest(),
        idempotency_key="idem-file-over-fifty-mib",
        nonce="nonce-file-over-fifty-mib",
    )
    headers["content-type"] = f"multipart/form-data; boundary={boundary}"

    async def forbidden_upload_read(
        _upload: object,
        _size: int = -1,
    ) -> bytes:
        raise AssertionError("oversize UploadFile must be rejected before read()")

    monkeypatch.setattr(
        media_ingress_module.UploadFile,
        "read",
        forbidden_upload_read,
    )

    async def body_chunks() -> AsyncIterator[bytes]:
        yield prefix
        for _ in range(full_chunks):
            yield file_chunk
        yield trailing_file_byte
        yield suffix

    try:
        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as async_client:
            response = await async_client.post(
                "/v1/runtime/media-derivatives",
                content=body_chunks(),
                headers=headers,
            )
        assert response.status_code == 413, response.json()
        assert response.json()["error_code"] == "media_derivative.upload_too_large"
    finally:
        dispose_engine(database_url)
