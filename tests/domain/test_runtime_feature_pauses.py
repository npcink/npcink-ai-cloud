from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.db import dispose_engine, get_session
from app.core.models import ProviderCallRecord, RunRecord
from app.domain.runtime import availability
from app.domain.runtime.errors import RuntimeErrorBase
from app.domain.runtime.models import RuntimeRequest
from app.domain.runtime.service import RuntimeService
from tests.api.test_cloud_batch_runtime import _build_client, _get_result, _payload, _post_execute


@pytest.mark.parametrize("marker", sorted(set().union(*availability._FEATURE_MARKERS.values())))
@pytest.mark.parametrize(
    "field", ["ability_name", "execution_kind", "contract_version", "profile_id"]
)
def test_pause_precedes_any_runtime_dependency(marker: str, field: str) -> None:
    request = RuntimeRequest(
        site_id="retained-site",
        ability_name="generic",
        channel="openapi",
        execution_kind="text",
        profile_id="text",
        input_payload={},
    )
    setattr(request, field, marker)
    # No database, queue, router or provider is even constructed.
    service = object.__new__(RuntimeService)
    with pytest.raises(RuntimeErrorBase) as error:
        service.execute(request)
    assert error.value.status_code == 409
    assert error.value.error_code == "runtime.feature_paused"
    with pytest.raises(RuntimeErrorBase):
        service.resolve(request)


def test_old_queued_inspection_fails_without_provider_calls(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, settings, queue, client = _build_client(tmp_path)
    try:
        with monkeypatch.context() as old_release:
            old_release.setattr(availability, "PAUSED_RUNTIME_FEATURES", frozenset())
            response = _post_execute(client, _payload())
        assert response.status_code == 200
        run_id = response.json()["data"]["run_id"]
        service = RuntimeService(database_url, settings=settings, runtime_queue=queue)
        result = service.process_next_queued_run(timeout_seconds=0)
        assert result is not None and result["status"] == "failed"
        with get_session(database_url) as session:
            run = session.get(RunRecord, run_id)
            assert run is not None and run.error_code == "runtime.feature_paused"
            assert list(session.scalars(select(ProviderCallRecord))) == []
    finally:
        client.close()
        dispose_engine(database_url)


def test_old_completed_inspection_result_is_readable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, settings, queue, client = _build_client(tmp_path)
    try:
        with monkeypatch.context() as old_release:
            old_release.setattr(availability, "PAUSED_RUNTIME_FEATURES", frozenset())
            response = _post_execute(client, _payload())
            assert response.status_code == 200
            run_id = response.json()["data"]["run_id"]
            RuntimeService(
                database_url, settings=settings, runtime_queue=queue
            ).process_next_queued_run(timeout_seconds=0)
        assert _get_result(client, run_id).status_code == 200
        response = _post_execute(client, _payload(), idempotency_key="paused-new-request")
        assert response.status_code == 409
    finally:
        client.close()
        dispose_engine(database_url)


def test_media_job_pause_precedes_artifact_reads() -> None:
    service = object.__new__(RuntimeService)
    with pytest.raises(RuntimeErrorBase) as error:
        service.enqueue_media_job_run(site_id="retained-site", input_payload={})
    assert error.value.error_code == "runtime.feature_paused"


def _single_image_payload() -> dict:
    return {
        "request_contract_version": "media_job_request.v1",
        "operation": "image.transform.v1",
        "source_artifact_id": "art_" + "1" * 32,
        "processing_purpose": "save_as_new.v1",
        "params": {
            "mode": "manual",
            "target_format": "webp",
            "max_width": 1200,
            "quality": 82,
            "source_media_type": "image",
            "resize_mode": "preserve",
        },
        "result_ttl_minutes": 30,
    }


@pytest.mark.parametrize(
    "invalid", ["purpose", "crop", "resize", "auto", "batch", "governance", "quality", "extra"]
)
def test_single_image_marker_cannot_unpause_broader_work(invalid: str) -> None:
    payload = _single_image_payload()
    if invalid == "purpose":
        payload["processing_purpose"] = "other"
    elif invalid == "crop":
        payload["params"]["crop"] = {"type": "aspect_ratio"}
    elif invalid == "resize":
        payload["params"]["resize_mode"] = "fit"
    elif invalid == "auto":
        payload["params"] = {"mode": "auto_safe", "optimization_profile": "auto_safe.v1"}
    elif invalid == "batch":
        payload["batch_context"] = {"batch_id": "one"}
    elif invalid == "governance":
        payload["governance"] = {}
    elif invalid == "quality":
        payload["params"]["quality"] = 0
    else:
        payload["skip_pause"] = True
    assert not availability.is_save_as_new_media_job(payload)
    with pytest.raises(RuntimeErrorBase) as error:
        object.__new__(RuntimeService).enqueue_media_job_run(
            site_id="site_alpha", input_payload=payload
        )
    assert error.value.error_code == "runtime.feature_paused"


@pytest.mark.parametrize("watermark", [False, True])
def test_single_image_job_runs_under_release_pause(tmp_path: Path, watermark: bool) -> None:
    from app.core.models import MediaArtifact
    from tests.api.test_media_runtime_resources import (
        _artifact_id,
        _client,
        _png,
        _post_job,
        _upload,
    )

    database_url, settings, queue, client = _client(tmp_path)
    try:
        upload = _upload(client, _png(100, 80), key="single-source", nonce="single-source")
        assert upload.status_code == 200, upload.json()
        source_id = _artifact_id(upload)
        payload = _single_image_payload()
        payload["source_artifact_id"] = source_id
        if watermark:
            payload["params"]["target_format"] = "original"
            payload["params"]["watermark"] = {
                "type": "text",
                "text": "Test",
                "position": "bottom_right",
                "opacity": 0.5,
                "font_size": 12,
            }
        response = _post_job(client, payload, key="single-job", nonce="single-job")
        assert response.status_code == 200, response.json()
        run_id = response.json()["data"]["run_id"]
        result = RuntimeService(
            database_url, settings=settings, runtime_queue=queue
        ).process_next_queued_run(timeout_seconds=0)
        assert result is not None and result["status"] == "succeeded", result
        with get_session(database_url) as session:
            run = session.get(RunRecord, run_id)
            assert run is not None and run.status == "succeeded"
            artifact = session.scalar(select(MediaArtifact).where(MediaArtifact.run_id == run_id))
            assert artifact is not None and artifact.width == 100 and artifact.height == 80
            assert session.get(MediaArtifact, source_id) is not None
            assert list(session.scalars(select(ProviderCallRecord))) == []
        replay = _post_job(client, payload, key="single-job", nonce="single-replay")
        assert replay.status_code == 200 and replay.json()["data"]["run_id"] == run_id
    finally:
        client.close()
        dispose_engine(database_url)


def test_old_queued_media_remains_paused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.models import MediaArtifact
    from tests.api.test_media_runtime_resources import (
        _artifact_id,
        _client,
        _png,
        _post_job,
        _upload,
    )

    database_url, settings, queue, client = _client(tmp_path)
    try:
        source_id = _artifact_id(_upload(client, _png(), key="old-source", nonce="old-source"))
        payload = _single_image_payload()
        payload["source_artifact_id"] = source_id
        del payload["processing_purpose"]
        with monkeypatch.context() as old_release:
            old_release.setattr(availability, "PAUSED_RUNTIME_FEATURES", frozenset())
            response = _post_job(client, payload, key="old-job", nonce="old-job")
        assert response.status_code == 200, response.json()
        run_id = response.json()["data"]["run_id"]
        result = RuntimeService(
            database_url, settings=settings, runtime_queue=queue
        ).process_next_queued_run(timeout_seconds=0)
        assert result is not None and result["status"] == "failed"
        with get_session(database_url) as session:
            run = session.get(RunRecord, run_id)
            assert run is not None and run.error_code == "runtime.feature_paused"
            assert (
                session.scalar(select(MediaArtifact).where(MediaArtifact.run_id == run_id)) is None
            )
    finally:
        client.close()
        dispose_engine(database_url)
