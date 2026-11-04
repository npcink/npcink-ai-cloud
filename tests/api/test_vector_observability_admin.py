from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import (
    RunRecord,
    SiteKnowledgeChunk,
    SiteKnowledgeDocument,
    SiteKnowledgeIndexJobMetric,
    SiteKnowledgeIndexSnapshot,
    SiteKnowledgeSearchMetric,
)
from app.core.services import CloudServices
from tests.conftest import TEST_INTERNAL_AUTH_TOKEN, build_internal_headers, seed_site_auth


def _build_client(tmp_path: Path) -> tuple[str, TestClient]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'vector-obs-admin.sqlite3'}"
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site-vector-001", scopes=["runtime:execute"])
    seed_site_auth(database_url, site_id="site-vector-002", scopes=["runtime:execute"])
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
    )
    return database_url, TestClient(create_app(CloudServices(settings=settings)))


def _run_record(
    run_id: str,
    site_id: str,
    *,
    ability_name: str,
    status: str,
    now: datetime,
) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id=f"account-{site_id}",
        subscription_id=f"sub-{site_id}",
        plan_version_id="plan-vector",
        ability_name=ability_name,
        ability_family="knowledge",
        skill_id="",
        workflow_id="",
        contract_version="site_knowledge_search.v1",
        channel="openapi",
        execution_kind="site_knowledge",
        execution_tier="cloud",
        execution_pattern="inline",
        data_classification="public_site_content",
        profile_id="site-knowledge.managed",
        canonical_run_id=None,
        status=status,
        idempotency_key=f"idem-{run_id}",
        request_fingerprint=f"fingerprint-{run_id}",
        trace_id=f"trace-{run_id}",
        input_json={},
        execution_input_ciphertext=None,
        policy_json={},
        selected_provider_id="site_knowledge",
        selected_model_id="site-knowledge-managed",
        selected_instance_id="cloud-runtime",
        fallback_used=False,
        started_at=now - timedelta(seconds=5),
        processing_started_at=now - timedelta(seconds=4),
        finished_at=now,
    )


def _seed_vector_metrics(database_url: str) -> None:
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        session.add_all(
            [
                _run_record(
                    "run-vector-sync-001",
                    "site-vector-001",
                    ability_name="npcink-cloud/site-knowledge-sync",
                    status="succeeded",
                    now=now,
                ),
                _run_record(
                    "run-vector-search-001",
                    "site-vector-001",
                    ability_name="npcink-cloud/site-knowledge-search",
                    status="succeeded",
                    now=now,
                ),
                _run_record(
                    "run-vector-search-002",
                    "site-vector-002",
                    ability_name="npcink-cloud/site-knowledge-search",
                    status="failed",
                    now=now,
                ),
            ]
        )
        session.flush()
        session.add(
            SiteKnowledgeDocument(
                site_id="site-vector-001",
                post_id=123,
                source_type="post",
                source_id=123,
                parent_post_id=123,
                post_type="post",
                post_status="publish",
                title="Cloud vector launch",
                url="https://example.test/vector",
                modified_gmt="2026-06-03 00:00:00",
                content_hash="content-hash",
                last_sync_run_id="run-vector-sync-001",
                metadata_json={},
                last_indexed_at=now - timedelta(minutes=20),
            )
        )
        session.add(
            SiteKnowledgeChunk(
                site_id="site-vector-001",
                post_id=123,
                source_type="post",
                source_id=123,
                parent_post_id=123,
                chunk_index=0,
                post_type="post",
                post_status="publish",
                title="Cloud vector launch",
                url="https://example.test/vector",
                chunk_text="This sensitive chunk text must not appear in observability.",
                embedding_json=[0.1, 0.2, 0.3],
                embedding_model="BAAI/bge-m3",
                content_hash="content-hash",
                metadata_json={},
                indexed_at=now - timedelta(minutes=20),
            )
        )
        session.add_all(
            [
                SiteKnowledgeIndexJobMetric(
                    run_id="run-vector-sync-001",
                    site_id="site-vector-001",
                    account_id="account-site-vector-001",
                    subscription_id="sub-site-vector-001",
                    status="succeeded",
                    sync_mode="refresh",
                    accepted_documents=1,
                    indexed_documents=1,
                    indexed_chunks=2,
                    failed_documents=0,
                    deleted_entries=0,
                    embedding_provider="deterministic",
                    embedding_model="BAAI/bge-m3",
                    embedding_dimensions=1024,
                    vector_backend="local",
                    duration_ms=150,
                    created_at=now - timedelta(minutes=20),
                    finished_at=now - timedelta(minutes=20),
                ),
                SiteKnowledgeSearchMetric(
                    run_id="run-vector-search-001",
                    site_id="site-vector-001",
                    account_id="account-site-vector-001",
                    subscription_id="sub-site-vector-001",
                    status="succeeded",
                    intent="internal_links",
                    result_count=2,
                    no_hit=False,
                    top1_score=0.91,
                    avg_score=0.82,
                    query_hash="hash-only-no-query-text",
                    query_chars=27,
                    max_results=8,
                    filter_json={"post_types": ["post"], "status": ["publish"]},
                    embedding_provider="deterministic",
                    embedding_model="BAAI/bge-m3",
                    embedding_dimensions=1024,
                    vector_backend="local",
                    latency_ms=45,
                    created_at=now - timedelta(minutes=10),
                    finished_at=now - timedelta(minutes=10),
                ),
                SiteKnowledgeSearchMetric(
                    run_id="run-vector-search-002",
                    site_id="site-vector-002",
                    account_id="account-site-vector-002",
                    subscription_id="sub-site-vector-002",
                    status="failed",
                    error_code="site_knowledge.embedding_provider_missing",
                    intent="site_search",
                    result_count=0,
                    no_hit=True,
                    top1_score=0,
                    avg_score=0,
                    query_hash="failed-query-hash-only",
                    query_chars=12,
                    max_results=8,
                    filter_json={"source_types": ["post"]},
                    embedding_provider="tei",
                    embedding_model="BAAI/bge-m3",
                    embedding_dimensions=1024,
                    vector_backend="zilliz",
                    latency_ms=20,
                    created_at=now - timedelta(minutes=5),
                    finished_at=now - timedelta(minutes=5),
                ),
                SiteKnowledgeIndexSnapshot(
                    site_id="site-vector-001",
                    run_id="run-vector-sync-001",
                    document_count=1,
                    chunk_count=2,
                    post_type_counts_json={"post": 1},
                    source_type_counts_json={"post": 1},
                    last_indexed_at=now - timedelta(minutes=20),
                    embedding_provider="deterministic",
                    embedding_model="BAAI/bge-m3",
                    embedding_dimensions=1024,
                    vector_backend="local",
                    captured_at=now - timedelta(minutes=20),
                ),
            ]
        )
        session.commit()


def test_admin_vector_observability_returns_cross_site_summary(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_vector_metrics(database_url)
    response = client.get(
        "/internal/service/admin/vector-observability?window_hours=24",
        headers=build_internal_headers(trace_id="tracevector001000000000000000000"),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["contract_version"] == "magick-vector-observability-summary-v1"
    assert data["totals"]["index_jobs_total"] == 1
    assert data["totals"]["search_queries_total"] == 2
    assert data["totals"]["search_failed_total"] == 1
    assert data["totals"]["no_hit_total"] == 1
    assert data["totals"]["current_document_count"] == 1
    assert data["totals"]["current_chunk_count"] == 2
    assert data["health"]["status"] in {"ok", "warning", "error"}
    assert sum(item["search_queries_total"] for item in data["timeline"]) == 2
    assert {item["intent"] for item in data["intents"]} == {"internal_links", "site_search"}
    assert data["errors"][0]["error_code"] == "site_knowledge.embedding_provider_missing"


def test_admin_vector_observability_filters_by_site_id(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_vector_metrics(database_url)
    response = client.get(
        "/internal/service/admin/vector-observability?window_hours=24&site_id=site-vector-001",
        headers=build_internal_headers(trace_id="tracevector002000000000000000000"),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["totals"]["search_queries_total"] == 1
    assert data["totals"]["search_failed_total"] == 0
    assert all(site["site_id"] == "site-vector-001" for site in data["sites"])
    assert all(snapshot["site_id"] == "site-vector-001" for snapshot in data["index_snapshots"])


def test_admin_vector_observability_rejects_without_internal_token(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    response = client.get("/internal/service/admin/vector-observability?window_hours=24")
    assert response.status_code in (401, 403)
    assert response.json()["status"] == "error"


def test_admin_vector_observability_excludes_content_embedding_and_query_text(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_vector_metrics(database_url)
    response = client.get(
        "/internal/service/admin/vector-observability?window_hours=24",
        headers=build_internal_headers(trace_id="tracevector003000000000000000000"),
    )
    assert response.status_code == 200
    payload = json.dumps(response.json()["data"])
    assert "This sensitive chunk text" not in payload
    assert "embedding_json" not in payload
    assert "chunk_text" not in payload
    assert "semantic search internal links" not in payload
    assert "hash-only-no-query-text" not in payload


def test_admin_vector_observability_empty_data_returns_zero_counts(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    response = client.get(
        "/internal/service/admin/vector-observability?window_hours=24",
        headers=build_internal_headers(trace_id="tracevector004000000000000000000"),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["totals"]["index_jobs_total"] == 0
    assert data["totals"]["search_queries_total"] == 0
    assert data["totals"]["current_chunk_count"] == 0
    assert data["health"]["status"] == "inactive"
    assert data["sites"] == []
    assert data["errors"] == []


def test_vector_failures_without_codes_and_index_only_sites_are_visible(tmp_path: Path) -> None:
    from sqlalchemy import delete, update

    database_url, client = _build_client(tmp_path)
    _seed_vector_metrics(database_url)
    with get_session(database_url) as session:
        session.execute(delete(SiteKnowledgeSearchMetric).where(
            SiteKnowledgeSearchMetric.site_id == "site-vector-001"
        ))
        session.execute(update(SiteKnowledgeIndexJobMetric).values(
            status="failed", error_code="index.fixture_failed"
        ))
        session.execute(update(SiteKnowledgeSearchMetric).values(error_code=None))
        # Current retained stock remains visible even when its capture predates this window.
        session.execute(update(SiteKnowledgeIndexSnapshot).values(
            captured_at=datetime.now(UTC) - timedelta(days=20)
        ))
        session.commit()
    response = client.get(
        "/internal/service/admin/vector-observability?window_hours=336",
        headers=build_internal_headers(),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["totals"]["index_failed_total"] == 1
    assert data["totals"]["search_failed_total"] == 1
    assert {(g["kind"], g["error_code"], g["count"]) for g in data["failure_groups"]} == {
        ("index", "index.fixture_failed", 1), ("search", "", 1),
    }
    sites = {s["site_id"]: s for s in data["sites"]}
    assert sites["site-vector-001"]["queries_total"] == 0
    assert sites["site-vector-001"]["index_failed_total"] == 1
    assert sites["site-vector-001"]["document_count"] == 1
    assert sites["site-vector-001"]["captured_at"]
    assert data["sites_total"] == 2 and data["sites_truncated"] is False
    assert data["errors"] == []  # Legacy search-code projection is retained.
    assert data["timeline"][0]["bucket_start_at"] == data["window"]["start_at"]
    assert data["timeline"][-1]["bucket_end_at"] == data["window"]["end_at"]
    assert all(a["bucket_end_at"] == b["bucket_start_at"]
               for a, b in zip(data["timeline"], data["timeline"][1:], strict=False))


def test_vector_bounded_groups_do_not_replace_full_failure_totals(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    _seed_vector_metrics(database_url)
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        for i in range(27):
            run_id = f"run-vector-limit-{i}"
            session.add(_run_record(run_id, "site-vector-001",
                                    ability_name="knowledge-search", status="failed", now=now))
            session.flush()
            session.add(SiteKnowledgeSearchMetric(
                run_id=run_id, site_id="site-vector-001", status="failed",
                error_code=f"fixture.error.{i}", intent="site_search",
                embedding_provider="deterministic", embedding_model="fixture",
                vector_backend="local", created_at=now, finished_at=now,
            ))
        session.commit()
    data = client.get(
        "/internal/service/admin/vector-observability?window_hours=336",
        headers=build_internal_headers(),
    ).json()["data"]
    assert data["totals"]["search_failed_total"] == 28
    assert len(data["failure_groups"]) == 25
    assert data["failure_groups_total"] == 28 and data["failure_groups_truncated"] is True
