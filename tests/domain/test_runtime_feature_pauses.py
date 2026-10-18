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
