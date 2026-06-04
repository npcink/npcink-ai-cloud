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
from app.core.models import ProviderCallRecord, RunRecord, UsageMeterEvent
from app.core.services import CloudServices
from app.domain.web_search.service import (
    TavilyWebSearchProvider,
    WebSearchExecutionResult,
    WebSearchProviderUsage,
)
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_PORTAL_JWT_SECRET,
    build_auth_headers,
    merge_json_headers,
    seed_site_auth,
)


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'web-search.sqlite3'}"


def _build_client(tmp_path: Path) -> tuple[str, TestClient]:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    seed_site_auth(
        database_url,
        site_id="site_alpha",
        scopes=["runtime:execute", "runtime:read"],
    )
    settings = Settings(
        _env_file=None,
        project_name="Magick AI Cloud Web Search Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        web_search_provider="tavily",
        web_search_tavily_api_key="placeholder-tavily-key",
        web_search_tavily_cost_per_query=0.002,
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
        "contract_version": "web_search.v1",
        "query": "latest WordPress AI search trends",
        "intent": "news",
        "max_results": 3,
        "recency_days": 7,
        "language": "en",
        "region": "US",
        "evidence_policy": {
            "min_score": 0,
            "required_sources": 1,
            "no_hit_policy": "abstain",
        },
        "write_posture": "suggestion_only",
    }
    input_payload.update(input_overrides or {})
    return {
        "ability_name": "magick-ai-cloud/web-search",
        "contract_version": "web_search.v1",
        "execution_pattern": "inline",
        "storage_mode": "result_only",
        "timeout_seconds": 20,
        "retry_max": 0,
        "input": input_payload,
        "policy": {"allow_fallback": True},
    }


def _execute(
    client: TestClient,
    payload: dict[str, Any],
    *,
    idempotency_key: str = "web-search-idem",
) -> Any:
    body = json.dumps(payload).encode("utf-8")
    headers = merge_json_headers(
        build_auth_headers(
            "POST",
            "/v1/runtime/execute",
            site_id="site_alpha",
            key_id="key_default",
            idempotency_key=idempotency_key,
            nonce=f"nonce-{idempotency_key}",
            trace_id="websearch0000000000000000000000",
            body=body,
        )
    )
    return client.post("/v1/runtime/execute", content=body, headers=headers)


def test_cloud_managed_web_search_executes_and_records_provider_usage(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    database_url, client = _build_client(tmp_path)

    def fake_search(
        self: TavilyWebSearchProvider,
        *,
        query: str,
        options: dict[str, Any],
        site_id: str,
        run_id: str,
    ) -> WebSearchExecutionResult:
        assert query == "latest WordPress AI search trends"
        assert options["intent"] == "news"
        return WebSearchExecutionResult(
            result_json={
                "artifact_type": "web_search_results",
                "composition_role": "external_web_evidence",
                "status": "ready",
                "provider": "tavily",
                "intent": options["intent"],
                "query_hash": "hash-only",
                "query_chars": len(query),
                "evidence_gate": {
                    "status": "passed",
                    "allows_web_grounded_assertion": True,
                    "source_count": 1,
                },
                "results": [
                    {
                        "title": "WordPress AI search roundup",
                        "url": "https://example.com/wp-ai-search",
                        "snippet": "A current external source.",
                        "score": 0.91,
                        "source": "tavily",
                        "suggested_use": "time_sensitive_context",
                        "write_posture": "suggestion_only",
                        "direct_wordpress_write": False,
                    }
                ],
                "sources": [
                    {
                        "title": "WordPress AI search roundup",
                        "url": "https://example.com/wp-ai-search",
                        "source": "tavily",
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
                latency_ms=12,
                cost=0.002,
            ),
        )

    monkeypatch.setattr(TavilyWebSearchProvider, "search", fake_search)

    response = _execute(client, _payload())

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["provider_id"] == "web_search"
    assert data["provider_call_count"] == 1
    assert data["profile_id"] == "web-search.managed"
    assert data["execution_context"]["ability_family"] == "knowledge"
    assert data["execution_context"]["execution_pattern"] == "inline"
    result = data["result"]
    assert result["artifact_type"] == "web_search_results"
    assert result["direct_wordpress_write"] is False
    assert result["evidence_gate"]["allows_web_grounded_assertion"] is True
    assert result["results"][0]["url"] == "https://example.com/wp-ai-search"
    assert "latest WordPress AI search trends" not in json.dumps(result)

    with get_session(database_url) as session:
        run = session.get(RunRecord, data["run_id"])
        assert run is not None
        assert run.input_json == {}
        provider_calls = list(
            session.scalars(
                select(ProviderCallRecord).where(ProviderCallRecord.run_id == run.run_id)
            )
        )
        assert provider_calls[0].provider_id == "tavily"
        meter_events = list(
            session.scalars(
                select(UsageMeterEvent)
                .where(UsageMeterEvent.run_id == run.run_id)
                .order_by(UsageMeterEvent.id.asc())
            )
        )
        assert [event.meter_key for event in meter_events] == [
            "runs",
            "provider_calls",
            "cost",
        ]
        assert all(event.ability_family == "knowledge" for event in meter_events)


def test_web_search_rejects_provider_keys_in_runtime_input(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)

    response = _execute(
        client,
        _payload({"provider_key": "tvly-user-secret"}),
        idempotency_key="web-search-forbid-provider-key",
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "web_search.write_or_secret_field_forbidden"
