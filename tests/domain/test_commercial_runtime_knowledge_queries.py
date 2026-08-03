from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_runtime_knowledge_queries import (
    CommercialRuntimeKnowledgeQueries,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    RunRecord,
    Site,
    SiteKnowledgeChunk,
    SiteKnowledgeDocument,
    SiteKnowledgeIndexJobMetric,
)


def _run_record(
    run_id: str,
    site_id: str,
    *,
    status: str,
    now: datetime,
    execution_pattern: str = "inline",
) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id=f"account-{site_id}",
        subscription_id=f"subscription-{site_id}",
        plan_version_id="plan-runtime-v1",
        ability_name="npcink-cloud/site-knowledge-sync",
        ability_family="knowledge",
        skill_id="",
        workflow_id="",
        contract_version="site_knowledge_sync.v1",
        channel="openapi",
        execution_kind="site_knowledge",
        execution_tier="cloud",
        execution_pattern=execution_pattern,
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
        finished_at=now if status not in {"queued", "running"} else None,
    )


def _index_metric(
    run_id: str,
    site_id: str,
    *,
    account_id: str,
    subscription_id: str,
    accepted: int,
    documents: int,
    chunks: int,
    created_at: datetime,
) -> SiteKnowledgeIndexJobMetric:
    return SiteKnowledgeIndexJobMetric(
        run_id=run_id,
        site_id=site_id,
        account_id=account_id,
        subscription_id=subscription_id,
        status="succeeded",
        sync_mode="refresh",
        accepted_documents=accepted,
        indexed_documents=documents,
        indexed_chunks=chunks,
        failed_documents=0,
        deleted_entries=0,
        embedding_provider="deterministic",
        embedding_model="test-embedding",
        embedding_dimensions=3,
        vector_backend="local",
        duration_ms=10,
        created_at=created_at,
        finished_at=created_at,
    )


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialRuntimeKnowledgeQueries],
)
def test_commercial_repository_preserves_runtime_and_knowledge_query_semantics(
    tmp_path: Path,
    repository_type: type[CommercialRuntimeKnowledgeQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 20, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Site(
                    site_id="site_runtime_primary",
                    account_id=None,
                    name="Primary",
                    status="active",
                    site_url="https://primary.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
                Site(
                    site_id="site_runtime_other",
                    account_id=None,
                    name="Other",
                    status="active",
                    site_url="https://other.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)
        assert isinstance(repository, CommercialRuntimeKnowledgeQueries)
        assert repository.count_active_runs("missing") == 0
        assert repository.count_active_runs_by_site(site_ids=[]) == {}
        assert repository.summarize_site_knowledge_current_counts(site_ids=[]) == {}
        assert repository.summarize_site_knowledge_index_usage() == {
            "accepted_documents": 0,
            "indexed_documents": 0,
            "indexed_chunks": 0,
        }

        runs = [
            _run_record("run_queued", "site_runtime_primary", status="queued", now=now),
            _run_record(
                "run_running",
                "site_runtime_primary",
                status="running",
                now=now,
                execution_pattern="whole_run_offload",
            ),
            _run_record("run_succeeded", "site_runtime_primary", status="succeeded", now=now),
            _run_record("run_other", "site_runtime_other", status="running", now=now),
        ]
        session.add_all(runs)
        session.flush()
        assert repository.count_active_runs("site_runtime_primary") == 2
        assert repository.count_active_runs(
            "site_runtime_primary",
            execution_patterns=("inline",),
        ) == 1
        assert repository.count_active_runs(
            "site_runtime_primary",
            execution_patterns=("step_offload", "whole_run_offload"),
        ) == 1
        assert repository.count_active_runs("site_runtime_other") == 1
        assert repository.count_active_runs_by_site(
            site_ids=["site_runtime_primary", "site_runtime_other", "missing"]
        ) == {"site_runtime_primary": 2, "site_runtime_other": 1}
        assert repository.count_active_runs_by_site(
            site_ids=["site_runtime_primary", "site_runtime_other"],
            execution_patterns=("inline",),
        ) == {"site_runtime_primary": 1, "site_runtime_other": 1}
        assert repository.count_active_runs_by_site(
            site_ids=["site_runtime_primary", "site_runtime_other"],
            execution_patterns=("step_offload", "whole_run_offload"),
        ) == {"site_runtime_primary": 1}

        session.add_all(
            [
                SiteKnowledgeDocument(
                    site_id="site_runtime_primary",
                    post_id=1,
                    source_type="post",
                    source_id=1,
                    parent_post_id=None,
                    post_type="post",
                    post_status="publish",
                    title="Primary",
                    url="https://primary.example.test/post",
                    modified_gmt=None,
                    content_hash="hash-primary",
                    last_sync_run_id="run_succeeded",
                    metadata_json=None,
                    last_indexed_at=now,
                ),
                SiteKnowledgeDocument(
                    site_id="site_runtime_other",
                    post_id=2,
                    source_type="post",
                    source_id=2,
                    parent_post_id=None,
                    post_type="post",
                    post_status="publish",
                    title="Other",
                    url="https://other.example.test/post",
                    modified_gmt=None,
                    content_hash="hash-other",
                    last_sync_run_id="run_other",
                    metadata_json=None,
                    last_indexed_at=now,
                ),
                SiteKnowledgeChunk(
                    site_id="site_runtime_primary",
                    post_id=1,
                    source_type="post",
                    source_id=1,
                    parent_post_id=None,
                    chunk_index=0,
                    post_type="post",
                    post_status="publish",
                    title="Primary",
                    url="https://primary.example.test/post",
                    chunk_text="chunk zero",
                    embedding_json=[0.1, 0.2, 0.3],
                    embedding_model="test-embedding",
                    content_hash="hash-primary-0",
                    metadata_json=None,
                    indexed_at=now,
                ),
                SiteKnowledgeChunk(
                    site_id="site_runtime_primary",
                    post_id=1,
                    source_type="post",
                    source_id=1,
                    parent_post_id=None,
                    chunk_index=1,
                    post_type="post",
                    post_status="publish",
                    title="Primary",
                    url="https://primary.example.test/post",
                    chunk_text="chunk one",
                    embedding_json=[0.4, 0.5, 0.6],
                    embedding_model="test-embedding",
                    content_hash="hash-primary-1",
                    metadata_json=None,
                    indexed_at=now,
                ),
            ]
        )
        session.flush()
        assert repository.summarize_site_knowledge_current_counts(
            site_ids=["site_runtime_primary", "site_runtime_other", "missing"]
        ) == {
            "site_runtime_primary": {"documents": 1, "chunks": 2},
            "site_runtime_other": {"documents": 1, "chunks": 0},
            "missing": {"documents": 0, "chunks": 0},
        }

        session.add_all(
            [
                _index_metric(
                    "run_succeeded",
                    "site_runtime_primary",
                    account_id="account_a",
                    subscription_id="subscription_a",
                    accepted=1,
                    documents=2,
                    chunks=3,
                    created_at=now - timedelta(days=2),
                ),
                _index_metric(
                    "run_running",
                    "site_runtime_primary",
                    account_id="account_a",
                    subscription_id="subscription_b",
                    accepted=4,
                    documents=5,
                    chunks=6,
                    created_at=now,
                ),
                _index_metric(
                    "run_other",
                    "site_runtime_other",
                    account_id="account_b",
                    subscription_id="subscription_a",
                    accepted=7,
                    documents=8,
                    chunks=9,
                    created_at=now + timedelta(days=2),
                ),
            ]
        )
        session.flush()
        assert repository.summarize_site_knowledge_index_usage() == {
            "accepted_documents": 12,
            "indexed_documents": 15,
            "indexed_chunks": 18,
        }
        assert repository.summarize_site_knowledge_index_usage(account_id="account_a") == {
            "accepted_documents": 5,
            "indexed_documents": 7,
            "indexed_chunks": 9,
        }
        assert repository.summarize_site_knowledge_index_usage(
            subscription_id="subscription_a"
        ) == {
            "accepted_documents": 8,
            "indexed_documents": 10,
            "indexed_chunks": 12,
        }
        assert repository.summarize_site_knowledge_index_usage(since=now, until=now) == {
            "accepted_documents": 4,
            "indexed_documents": 5,
            "indexed_chunks": 6,
        }

    dispose_engine(database_url)
