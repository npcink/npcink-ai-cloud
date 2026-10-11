from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.adapters.queue.in_memory import InMemoryRuntimeQueue
from app.api.main import create_app
from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import RunRecord, UsageMeterEvent
from app.core.services import CloudServices
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_auth_headers,
    merge_json_headers,
    seed_site_auth,
)


def _build_client(tmp_path: Path) -> tuple[str, TestClient]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'media-governance-audit.sqlite3'}"
    init_schema(database_url)
    seed_site_auth(
        database_url,
        site_id="site_alpha",
        scopes=["runtime:execute", "runtime:read"],
    )
    settings = Settings(
        _env_file=None,
        project_name="Npcink AI Cloud Media Governance Audit Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
    )
    client = TestClient(
        create_app(
            CloudServices(
                settings=settings,
                providers={},
                runtime_queue=InMemoryRuntimeQueue(),
            )
        )
    )
    return database_url, client


def _payload(input_overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    input_payload: dict[str, Any] = {
        "contract_version": "media_governance_audit_request.v1",
        "snapshot": {
            "snapshot_id": "scan_api_001",
            "captured_at": "2026-08-31T12:00:00Z",
            "inventory_complete": True,
            "capacity": {
                "uploads_bytes": 1_200_000,
                "backup_bytes": 0,
                "logs_bytes": 0,
                "filesystem_used_bytes": 10_000_000,
                "filesystem_available_bytes": 20_000_000,
            },
            "coverage": {
                "complete": True,
                "sources": ["attachment_meta", "termmeta"],
            },
            "items": [
                {
                    "item_id": "attachment:501",
                    "source_sha256": "e" * 64,
                    "filesize_bytes": 1_200_000,
                    "format": "jpeg",
                    "width": 1920,
                    "height": 1080,
                    "animated": False,
                    "reference_state": "referenced",
                    "evidence_revision": "refs_501_v1",
                    "evidence_sources": ["attachment_meta", "termmeta"],
                }
            ],
        },
    }
    input_payload.update(input_overrides or {})
    return {
        "ability_name": "npcink-toolbox/audit-media-governance",
        "contract_version": "media_governance_audit_request.v1",
        "execution_pattern": "inline",
        "data_classification": "internal",
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
    idempotency_key: str,
    nonce: str,
) -> Any:
    body = json.dumps(payload).encode("utf-8")
    headers = merge_json_headers(
        build_auth_headers(
            "POST",
            "/v1/runtime/execute",
            site_id="site_alpha",
            key_id="key_default",
            idempotency_key=idempotency_key,
            nonce=nonce,
            trace_id="mediagovernanceaudit000000000000",
            body=body,
        )
    )
    return client.post("/v1/runtime/execute", content=body, headers=headers)


def test_media_governance_audit_runtime_is_read_only_and_provider_free(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)

    response = _execute(
        client,
        _payload(),
        idempotency_key="media-governance-audit-001",
        nonce="nonce-media-governance-audit-001",
    )

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["provider_id"] == "media_governance_audit"
    assert data["model_id"] == "deterministic-auditor"
    assert data["provider_call_count"] == 0
    assert data["profile_id"] == "media-governance-audit.managed"
    result = data["result"]
    assert result["contract_version"] == "media_governance_audit.v1"
    assert result["candidate_summary"]["eligible_count"] == 1
    assert result["candidate_summary"]["minimum_qualified_savings_bytes"] == 180_000
    assert result["candidates"][0]["evidence_sources"] == [
        "attachment_meta",
        "termmeta",
    ]
    assert result["write_posture"] == "read_only"
    assert result["direct_wordpress_write"] is False

    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.execution_kind == "media_governance_audit"
        assert run.input_json == {}
        contract = run.policy_json["execution_contract"]
        assert contract["inventory_owner"] == "local_wordpress_host"
        assert contract["wordpress_write_owner"] == "npcink-abilities-toolkit"
        assert contract["write_posture"] == "read_only"
        assert contract["cloud_scan"] is False
        assert contract["direct_wordpress_write"] is False
        meter_events = list(
            session.scalars(
                select(UsageMeterEvent)
                .where(UsageMeterEvent.run_id == run.run_id)
                .order_by(UsageMeterEvent.id.asc())
            )
        )
        assert [event.meter_key for event in meter_events] == ["runs"]


def test_media_governance_audit_runtime_replays_idempotently(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()

    first = _execute(
        client,
        payload,
        idempotency_key="media-governance-audit-replay",
        nonce="nonce-media-governance-audit-replay-1",
    )
    second = _execute(
        client,
        payload,
        idempotency_key="media-governance-audit-replay",
        nonce="nonce-media-governance-audit-replay-2",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["idempotent_replay"] is True
    assert second.json()["data"]["run_id"] == first.json()["data"]["run_id"]


def test_media_governance_audit_runtime_rejects_write_field(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    payload = _payload()
    payload["input"]["snapshot"]["items"][0]["replace_file"] = True

    response = _execute(
        client,
        payload,
        idempotency_key="media-governance-audit-write",
        nonce="nonce-media-governance-audit-write",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "media_governance_audit.write_field_forbidden"
