from pathlib import Path

import pytest

from app.api.routes import service as routes
from app.core.db import dispose_engine
from app.domain.audio_generation.workbench import AudioWorkbenchService
from app.domain.runtime.errors import RuntimeErrorBase
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


@pytest.mark.parametrize("intent", ["article_narration", "article_audio_summary"])
def test_audio_pause_precedes_workbench_construction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, intent: str
) -> None:
    database_url, client = _build_client(tmp_path)

    def forbidden(*args: object) -> None:
        pytest.fail("paused audio must not construct a workbench or prepare a summary")

    monkeypatch.setattr(routes, "_audio_workbench_service", forbidden)
    payload = {"intent": intent, "title": "Retained article", "body": "Retained content"}
    try:
        response = client.post(
            "/internal/service/admin/audio-jobs",
            headers=build_internal_headers(idempotency_key=f"paused-{intent}"),
            json=payload,
        )
        assert response.status_code == 409, response.text
        assert response.json()["error_code"] == "runtime.feature_paused"
        assert response.json()["data"] == {"feature": "audio_generation", "retryable": False}
        assert client.post("/internal/service/admin/audio-jobs", json=payload).status_code in {
            401, 403
        }
    finally:
        client.close()
        dispose_engine(database_url)


def test_direct_audio_workbench_pause_precedes_payload_or_provider_work() -> None:
    workbench = object.__new__(AudioWorkbenchService)
    with pytest.raises(RuntimeErrorBase) as error:
        workbench.create_job({})
    assert error.value.status_code == 409
    assert error.value.error_code == "runtime.feature_paused"


def test_paused_audio_recent_history_remains_readable(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        response = client.get(
            "/internal/service/admin/audio-jobs/recent", headers=build_internal_headers()
        )
        assert response.status_code == 200, response.text
    finally:
        client.close()
        dispose_engine(database_url)
