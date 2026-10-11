from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import select

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    ProviderConnection,
    Site,
    SiteKnowledgeChunk,
    SiteKnowledgeDocument,
)
from app.domain.site_knowledge.contracts import SITE_KNOWLEDGE_STALE_POST_STATUS
from app.domain.site_knowledge.maintenance import (
    SITE_KNOWLEDGE_LAST_PRUNED_COUNT_FIELD,
    SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD,
    maintenance_request_id,
    merge_maintenance_manifest_sources,
    prune_unmanifested_sources,
    record_maintenance_batch,
)
from app.domain.site_knowledge.service import SiteKnowledgeService
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID,
)

SITE_ID = "site_manifest_prune"


class FakeSession:
    def __init__(self) -> None:
        self.site = SimpleNamespace(site_id="site-1", metadata_json={})

    def get(self, model: object, key: str) -> object | None:
        if model is Site and key == "site-1":
            return self.site
        return None

    def flush(self) -> None:
        return None


def _document(post_id: int, *, title: str, content: str) -> dict[str, object]:
    return {
        "post_id": post_id,
        "post_type": "post",
        "post_status": "publish",
        "title": title,
        "url": f"https://example.test/posts/{post_id}",
        "modified_gmt": "2026-10-11 00:00:00",
        "excerpt": content[:80],
        "content_excerpt": content,
        "content_hash": f"hash-{post_id}",
    }


def _maintenance_payload(
    *,
    sync_mode: str,
    post_ids: list[int],
    documents: list[dict[str, object]],
    request_id: str,
    batch_index: int,
    batch_count: int,
    is_final: bool,
) -> dict[str, object]:
    return {
        "contract_version": "site_knowledge_sync.v1",
        "sync_mode": sync_mode,
        "post_ids": post_ids,
        "max_posts": 20,
        "documents": documents,
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
        "maintenance": {
            "action": "full_sync",
            "request_id": request_id,
            "batch_index": batch_index,
            "batch_count": batch_count,
            "is_final": is_final,
        },
    }


def _seed(database_url: str) -> None:
    with get_session(database_url) as session:
        session.add(Site(site_id=SITE_ID, account_id="acct_prune", name="Manifest prune site"))
        session.add(
            ProviderConnection(
                connection_id=SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID,
                provider_type="vector_store",
                display_name="Site knowledge vector store",
                enabled=True,
                status="ready",
                config_json={
                    "site_knowledge_index_lifecycle": {"status": "awaiting_site_sync"}
                },
            )
        )
        session.commit()


def _document_statuses(database_url: str) -> dict[tuple[str, int], str]:
    with get_session(database_url) as session:
        return {
            (str(document.source_type), int(document.source_id)): str(document.post_status)
            for document in session.scalars(
                select(SiteKnowledgeDocument).where(SiteKnowledgeDocument.site_id == SITE_ID)
            )
        }


def _chunk_statuses(database_url: str) -> dict[tuple[str, int], set[str]]:
    with get_session(database_url) as session:
        statuses: dict[tuple[str, int], set[str]] = {}
        for chunk in session.scalars(
            select(SiteKnowledgeChunk).where(SiteKnowledgeChunk.site_id == SITE_ID)
        ):
            statuses.setdefault((str(chunk.source_type), int(chunk.source_id)), set()).add(
                str(chunk.post_status)
            )
        return statuses


def _result_post_ids(service: SiteKnowledgeService, query: str, run_id: str) -> list[int]:
    result = service.search(
        site_id=SITE_ID,
        run_id=run_id,
        input_payload={
            "contract_version": "site_knowledge_search.v1",
            "query": query,
            "intent": "site_search",
            "write_posture": "suggestion_only",
        },
    )
    assert result["status"] == "ready"
    return [int(item["post_id"]) for item in result["results"]]


def test_full_sync_manifest_diff_prunes_offline_deleted_source(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_url = f"sqlite:///{tmp_path / 'manifest-prune.sqlite3'}"
    init_schema(database_url)
    _seed(database_url)
    monkeypatch.setattr(
        "app.domain.site_knowledge.vector_profile.SiteKnowledgeVectorProfileAdminService"
        ".publish_site_index",
        lambda self, site_id, *, source_session: {"status": "ready"},
    )

    try:
        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            service.sync(
                site_id=SITE_ID,
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [101, 102],
                    "documents": [
                        _document(
                            101,
                            title="Kept launch notes",
                            content=(
                                "Cloud managed site knowledge keeps public launch "
                                "notes about the hosted runtime."
                            ),
                        ),
                        _document(
                            102,
                            title="Retired quantum page",
                            content=(
                                "The retired quantum widget maintenance page still "
                                "lingers in the index until the manifest diff runs."
                            ),
                        ),
                    ],
                    "write_posture": "suggestion_only",
                },
                run_id="run-seed",
            )
            session.commit()

        request_id = maintenance_request_id(SITE_ID)
        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            # Batch 0 uses a partial rebuild (post_ids scoped to the batch) so
            # the offline-deleted post 102 survives into the final batch and
            # the manifest diff, not the rebuild wipe, is what must prune it.
            service.sync(
                site_id=SITE_ID,
                input_payload=_maintenance_payload(
                    sync_mode="rebuild",
                    post_ids=[101],
                    documents=[
                        _document(
                            101,
                            title="Kept launch notes",
                            content=(
                                "Cloud managed site knowledge keeps public launch "
                                "notes about the hosted runtime."
                            ),
                        )
                    ],
                    request_id=request_id,
                    batch_index=0,
                    batch_count=2,
                    is_final=False,
                ),
                run_id="run-full-sync-0",
            )
            session.commit()
        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            service.sync(
                site_id=SITE_ID,
                input_payload=_maintenance_payload(
                    sync_mode="refresh",
                    post_ids=[103],
                    documents=[
                        _document(
                            103,
                            title="New related notes",
                            content="A new public page joins the refreshed manifest.",
                        )
                    ],
                    request_id=request_id,
                    batch_index=1,
                    batch_count=2,
                    is_final=True,
                ),
                run_id="run-full-sync-1",
            )
            session.commit()

        document_statuses = _document_statuses(database_url)
        assert document_statuses[("post", 101)] == "publish"
        assert document_statuses[("post", 102)] == SITE_KNOWLEDGE_STALE_POST_STATUS
        assert document_statuses[("post", 103)] == "publish"

        chunk_statuses = _chunk_statuses(database_url)
        assert chunk_statuses[("post", 101)] == {"publish"}
        assert chunk_statuses[("post", 102)] == {SITE_KNOWLEDGE_STALE_POST_STATUS}
        assert chunk_statuses[("post", 103)] == {"publish"}

        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            assert 102 not in _result_post_ids(service, "quantum widget", "run-search-retired")
            assert 102 not in _result_post_ids(
                service, "manifest diff runs", "run-search-retired-2"
            )
            assert 101 in _result_post_ids(service, "public launch notes", "run-search-kept")
            assert 103 in _result_post_ids(service, "new public page", "run-search-new")
    finally:
        dispose_engine(database_url)


def test_pruned_source_recovers_when_redelivered(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'manifest-recover.sqlite3'}"
    init_schema(database_url)
    _seed(database_url)
    monkeypatch.setattr(
        "app.domain.site_knowledge.vector_profile.SiteKnowledgeVectorProfileAdminService"
        ".publish_site_index",
        lambda self, site_id, *, source_session: {"status": "ready"},
    )

    try:
        request_id = maintenance_request_id(SITE_ID)
        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            service.sync(
                site_id=SITE_ID,
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [201],
                    "documents": [
                        _document(
                            201,
                            title="Restorable page",
                            content="A page that disappears and later returns.",
                        )
                    ],
                    "write_posture": "suggestion_only",
                },
                run_id="run-seed",
            )
            service.sync(
                site_id=SITE_ID,
                input_payload=_maintenance_payload(
                    sync_mode="rebuild",
                    post_ids=[999],
                    documents=[
                        _document(
                            999,
                            title="Only manifest member",
                            content="The one public page this full manifest delivers.",
                        )
                    ],
                    request_id=request_id,
                    batch_index=0,
                    batch_count=1,
                    is_final=True,
                ),
                run_id="run-single-full-sync",
            )
            session.commit()

        assert _document_statuses(database_url)[("post", 201)] == (
            SITE_KNOWLEDGE_STALE_POST_STATUS
        )

        with get_session(database_url) as session:
            settings = Settings(
                _env_file=None, environment="test", database_url=database_url
            )
            service = SiteKnowledgeService(session, settings=settings)
            service.sync(
                site_id=SITE_ID,
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [201],
                    "documents": [
                        _document(
                            201,
                            title="Restored page",
                            content="The page is public again and must be searchable.",
                        )
                    ],
                    "write_posture": "suggestion_only",
                },
                run_id="run-restore",
            )
            session.commit()
            assert 201 in _result_post_ids(service, "public again", "run-search-restored")

        assert _document_statuses(database_url)[("post", 201)] == "publish"
    finally:
        dispose_engine(database_url)


def test_manifest_accumulation_survives_batch_progress_records() -> None:
    session = FakeSession()
    request_id = maintenance_request_id("site-1")

    merge_maintenance_manifest_sources(
        session, site_id="site-1", delivered_sources=[("post", 1), ("post", 1)]
    )
    record_maintenance_batch(
        session,
        site_id="site-1",
        maintenance={"request_id": request_id, "batch_index": 0, "batch_count": 2},
        status="delivering",
    )
    merge_maintenance_manifest_sources(
        session, site_id="site-1", delivered_sources=[("page", 7)]
    )

    state = session.site.metadata_json["site_knowledge_maintenance"]
    assert state[SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD] == ["post:1", "page:7"]

    record_maintenance_batch(
        session,
        site_id="site-1",
        maintenance={"request_id": request_id, "batch_index": 1, "batch_count": 2},
        status="ready",
    )
    state = session.site.metadata_json["site_knowledge_maintenance"]
    assert SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD not in state
    assert SITE_KNOWLEDGE_LAST_PRUNED_COUNT_FIELD not in state


def test_prune_skips_truncated_manifest_and_empty_state() -> None:
    session = FakeSession()
    calls: list[object] = []

    class RecordingRepository:
        def mark_unmanifested_sources_stale(
            self,
            site_id: str,
            *,
            keep_sources: set[tuple[str, int]],
            source_types: set[str],
        ) -> int:
            calls.append((keep_sources, source_types))
            return 0

    repository = RecordingRepository()

    empty_summary = prune_unmanifested_sources(
        session,  # type: ignore[arg-type]
        site_id="site-1",
        repository=repository,  # type: ignore[arg-type]
    )
    assert empty_summary == {"status": "skipped_empty_manifest", "pruned_source_count": 0}

    session.site.metadata_json = {
        "site_knowledge_maintenance": {
            "manifest_sources": ["post:1"],
            "manifest_truncated": True,
        }
    }
    truncated_summary = prune_unmanifested_sources(
        session,  # type: ignore[arg-type]
        site_id="site-1",
        repository=repository,  # type: ignore[arg-type]
    )
    assert truncated_summary == {
        "status": "skipped_truncated_manifest",
        "pruned_source_count": 0,
    }
    assert calls == []
