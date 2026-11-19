from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.core.db import get_session
from app.core.models import ProviderCallRecord, RunRecord, SiteApiKey, UsageMeterEvent
from app.domain.runtime.service import RuntimeService
from tests.api.test_site_knowledge_runtime import _build_client, _execute, _sync_payload
from tests.conftest import TEST_KEY_ID, build_auth_headers


def test_receipt_lookup_recovers_lost_acceptance_without_execution(tmp_path: Path) -> None:
    database_url, settings, queue, client = _build_client(tmp_path)
    key = "receipt-recovery-original-key"
    response = _execute(client, _sync_payload(), idempotency_key=key)
    assert response["status_code"] == 200
    # The caller has lost this response. Only its original durable key survives.
    del response
    worker = RuntimeService(database_url, settings=settings, providers={}, runtime_queue=queue)
    worker.process_queued_runs(max_runs=1, timeout_seconds=0)
    path = f"/v1/runs/by-idempotency/{key}"
    with get_session(database_url) as session:
        run = session.scalar(select(RunRecord).where(RunRecord.idempotency_key == key))
        assert run is not None
        original = (run.run_id, run.status, run.finished_at, run.result_json)
        usage_before = list(session.scalars(select(UsageMeterEvent.id)))
        providers_before = list(session.scalars(select(ProviderCallRecord.id)))
        api_key = session.get(SiteApiKey, TEST_KEY_ID)
        assert api_key is not None
        api_key.scopes_json = ["runtime:read"]
        session.commit()

    for _ in range(2):
        receipt = client.get(path, headers=build_auth_headers("GET", path, site_id="site_alpha"))
        assert receipt.status_code == 200
        data = receipt.json()["data"]
        assert data["run_id"] == original[0]
        assert data["idempotency_key"] == key
        assert data["site_id"] == "site_alpha"
        assert data["ability_name"] == "npcink-cloud/site-knowledge-sync"
        assert data["contract_version"] == "site_knowledge_sync.v1"
        assert data["status"] == "succeeded"
        assert data["finished_at"]
        assert "result" not in data and "input" not in data
    with get_session(database_url) as session:
        runs = list(session.scalars(select(RunRecord)))
        assert len(runs) == 1
        run = runs[0]
        assert (run.run_id, run.status, run.finished_at, run.result_json) == original
        assert list(session.scalars(select(UsageMeterEvent.id))) == usage_before
        assert list(session.scalars(select(ProviderCallRecord.id))) == providers_before


def test_receipt_lookup_is_signed_site_scoped_and_missing_is_read_only(tmp_path: Path) -> None:
    database_url, _, _, client = _build_client(tmp_path)
    key = "receipt-private-to-alpha"
    assert _execute(client, _sync_payload(), idempotency_key=key)["status_code"] == 200
    path = f"/v1/runs/by-idempotency/{key}"
    assert client.get(path).status_code == 401
    other = client.get(
        path, headers=build_auth_headers("GET", path, site_id="site_beta", key_id="key_beta")
    )
    assert other.status_code == 404
    assert other.json()["error_code"] == "runtime.run_not_found"
    missing = "/v1/runs/by-idempotency/never-sent"
    assert client.get(
        missing, headers=build_auth_headers("GET", missing, site_id="site_alpha")
    ).status_code == 404
    with get_session(database_url) as session:
        assert len(list(session.scalars(select(RunRecord)))) == 1
        api_key = session.get(SiteApiKey, TEST_KEY_ID)
        assert api_key is not None
        api_key.scopes_json = ["runtime:execute"]
        session.commit()
    assert client.get(
        path, headers=build_auth_headers("GET", path, site_id="site_alpha")
    ).status_code == 403
    for invalid in ("key!invalid", "x" * 129):
        invalid_path = f"/v1/runs/by-idempotency/{invalid}"
        assert client.get(
            invalid_path,
            headers=build_auth_headers("GET", invalid_path, site_id="site_alpha"),
        ).status_code == 422
