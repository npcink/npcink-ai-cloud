"""Typed maintenance against real SQL and the production vector filter adapter.

The vector client below evaluates emitted filters over local records; no remote
vector/embedding service or paid provider is used. This is not live Zilliz/PG proof.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import delete, select

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Site, SiteKnowledgeChunk, SiteKnowledgeDocument
from app.domain.site_knowledge.backends import (
    SiteKnowledgeBackendError,
    ZillizCloudSiteKnowledgeBackend,
)
from app.domain.site_knowledge.contracts import (
    SITE_KNOWLEDGE_SEARCH_ABILITY,
    SITE_KNOWLEDGE_STATUS_ABILITY,
    SITE_KNOWLEDGE_SYNC_ABILITY,
    SiteKnowledgeContractViolation,
    normalize_source_items,
    validate_site_knowledge_runtime_contract,
)
from app.domain.site_knowledge.embedding import embed_text_deterministic
from app.domain.site_knowledge.repository import SiteKnowledgeRepository
from app.domain.site_knowledge.service import SiteKnowledgeService


def _input(*identities: tuple[str, int], delete_mode: bool = False) -> dict[str, Any]:
    return {
        "contract_version": "site_knowledge_sync.v1" if delete_mode else "site_knowledge_status.v1",
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
        **({"sync_mode": "delete"} if delete_mode else {}),
        "source_items": [{"source_type": kind, "source_id": key} for kind, key in identities],
    }


@pytest.fixture
def database(tmp_path: Path):
    url = f"sqlite:///{tmp_path / 'typed.sqlite3'}"
    init_schema(url)
    with get_session(url) as session:
        session.add_all([Site(site_id=key, name=key) for key in ("alpha", "beta")])
        session.commit()
    try:
        yield url
    finally:
        dispose_engine(url)


def _seed(
    session, source_type, source_id, *, site="alpha", parent=None, status="publish", orphan=False
):
    common = dict(
        site_id=site,
        source_type=source_type,
        source_id=source_id,
        post_id=source_id,
        parent_post_id=parent,
        post_type="attachment" if source_type == "media" else source_type,
        post_status=status,
        title="typed fixture",
        url="https://example.test/item",
        content_hash="fixture",
        metadata_json={},
    )
    if not orphan:
        session.add(SiteKnowledgeDocument(**common))
    session.add(
        SiteKnowledgeChunk(
            **common,
            chunk_index=0,
            chunk_text="typed fixture evidence",
            embedding_json=embed_text_deterministic("typed fixture evidence", dimensions=8),
            embedding_model="deterministic:BAAI/bge-m3",
        )
    )
    session.flush()


def _service(session):
    return SiteKnowledgeService(
        session,
        settings=Settings(
            _env_file=None,
            environment="test",
            site_knowledge_vector_backend="postgres_json",
            site_knowledge_embedding_provider="deterministic",
            site_knowledge_embedding_dimensions=8,
        ),
    )


class LocalVectorClient:
    """Execute the limited Milvus filter grammar used by this adapter, no eval."""

    def __init__(self, session):
        self.rows = [
            {
                key: getattr(row, key)
                for key in (
                    "site_id",
                    "source_type",
                    "source_id",
                    "post_id",
                    "parent_post_id",
                    "post_type",
                    "post_status",
                    "chunk_index",
                    "title",
                    "url",
                    "chunk_text",
                )
            }
            for row in session.scalars(select(SiteKnowledgeChunk))
        ]
        self.filters = []
        self.fail_delete = False

    @staticmethod
    def matches(row, expression):
        for part in expression.split(" and "):
            match = re.fullmatch(r"(\w+) (==|!=|in) (.+)", part)
            assert match is not None, expression
            field, operation, encoded = match.groups()
            value = json.loads(encoded)
            if operation == "==" and row[field] != value:
                return False
            if operation == "!=" and row[field] == value:
                return False
            if operation == "in" and row[field] not in value:
                return False
        return True

    def delete(self, *, collection_name, filter):
        assert collection_name == "fixture"
        if self.fail_delete:
            raise RuntimeError("synthetic vector failure")
        self.filters.append(filter)
        self.rows = [row for row in self.rows if not self.matches(row, filter)]

    def search(self, *, collection_name, filter, limit, **kwargs):
        assert collection_name == "fixture"
        return [
            [{"entity": row, "distance": 0.9} for row in self.rows if self.matches(row, filter)][
                :limit
            ]
        ]


def _vector(session):
    backend = object.__new__(ZillizCloudSiteKnowledgeBackend)
    backend.client = LocalVectorClient(session)
    backend.collection = "fixture"
    return backend


def _hits(service, site="alpha"):
    if service.vector_backend is not None:
        rows = service.vector_backend.search(
            site_id=site,
            query_embedding=[1.0] * 8,
            post_types=[],
            statuses=["publish"],
            source_types=[],
            current_post_id=0,
            limit=100,
        )
    else:
        rows = service.repository.list_search_chunks(
            site_id=site,
            post_types=[],
            statuses=["publish"],
            source_types=[],
            current_post_id=0,
            limit=100,
        )
    return {(row.source_type, row.source_id) for row in rows}


INVALID_SELECTORS = (
    [
        None,
        [],
        {},
        "all",
        [None],
        [1],
    ]
    + [
        [{"source_type": "post", "source_id": value}]
        for value in (True, False, 0, -1, 1.0, "1", None)
    ]
    + [
        [{"source_type": kind, "source_id": 1}]
        for kind in ("text", "attachment", "pdf", "video", "POST")
    ]
    + [
        [{"source_type": "post", "source_id": 1, key: "injected"}]
        for key in ("site_id", "customer_id", "content")
    ]
    + [
        [{"source_type": "post"}],
        [{"source_id": 1}],
        [{"source_type": "post", "source_id": 1}] * 101,
        [{"source_type": "post", "source_id": 1}, {"source_type": "page", "source_id": "2"}],
    ]
)


@pytest.mark.parametrize("ability", [SITE_KNOWLEDGE_SYNC_ABILITY, SITE_KNOWLEDGE_STATUS_ABILITY])
@pytest.mark.parametrize("selectors", INVALID_SELECTORS)
def test_strict_selectors_rejected_before_any_deletion(database, monkeypatch, ability, selectors):
    with get_session(database) as session:
        _seed(session, "post", 1)
        service = _service(session)
        payload = _input(("post", 1), delete_mode=ability == SITE_KNOWLEDGE_SYNC_ABILITY)
        payload["source_items"] = selectors
        service.vector_backend = _vector(session)
        calls = []
        for name in ("delete_site_index", "delete_post_indexes", "delete_source_index"):
            monkeypatch.setattr(service.repository, name, lambda *a, **k: calls.append(a))
        with pytest.raises(SiteKnowledgeContractViolation) as error:
            service.execute(
                site_id="alpha",
                ability_name=ability,
                contract_version=payload["contract_version"],
                input_payload=payload,
                run_id="invalid",
            )
        assert error.value.error_code == "site_knowledge.source_items_invalid"
        assert calls == []
        assert service.vector_backend.client.filters == []
        assert service.repository.count_documents("alpha") == 1


@pytest.mark.parametrize(
    "field",
    [
        "post_ids",
        "documents",
        "comments",
        "media_items",
        "maintenance",
        "site_id",
        "customer_id",
        "account_id",
    ],
)
def test_typed_delete_rejects_mixed_fields_even_empty(database, field):
    payload = _input(("page", 42), delete_mode=True)
    payload[field] = []
    with get_session(database) as session:
        _seed(session, "page", 42)
        with pytest.raises(SiteKnowledgeContractViolation) as error:
            _service(session).sync(site_id="alpha", input_payload=payload, run_id="mixed")
        assert error.value.error_code == "site_knowledge.source_selector_conflict"
        assert SiteKnowledgeRepository(session).count_documents("alpha") == 1


def test_selectors_are_bounded_deduplicated_ordered_and_ability_specific():
    payload = _input(("media", 42), ("page", 42), ("media", 42), ("comment", 9))
    assert normalize_source_items(payload, ability_name=SITE_KNOWLEDGE_STATUS_ABILITY) == [
        ("media", 42),
        ("page", 42),
        ("comment", 9),
    ]
    hundred = _input(*[("post", key) for key in range(1, 101)], delete_mode=True)
    assert len(normalize_source_items(hundred, ability_name=SITE_KNOWLEDGE_SYNC_ABILITY)) == 100
    for ability, value in [
        (SITE_KNOWLEDGE_SEARCH_ABILITY, _input(("post", 1))),
        (SITE_KNOWLEDGE_SYNC_ABILITY, _input(("comment", 1), delete_mode=True)),
        (SITE_KNOWLEDGE_SYNC_ABILITY, {**hundred, "sync_mode": "refresh"}),
        (SITE_KNOWLEDGE_STATUS_ABILITY, {**payload, "site_id": "beta"}),
    ]:
        with pytest.raises(SiteKnowledgeContractViolation):
            normalize_source_items(value, ability_name=ability)


@pytest.mark.parametrize("backend", ["sql", "zilliz"])
@pytest.mark.parametrize("root_type", ["post", "page"])
def test_typed_root_deletes_comments_orphans_and_vector_only_but_preserves_sentinels(
    database, backend, root_type
):
    with get_session(database) as session:
        _seed(session, root_type, 42)
        _seed(session, "media", 42, parent=42)  # same number is not an article cascade
        _seed(session, "comment", 5, parent=42)
        _seed(session, "comment", 6, parent=42, orphan=True, status="stale")
        _seed(session, "comment", 7, parent=99)
        _seed(session, "media", 8, parent=42)
        _seed(session, root_type, 42, site="beta")
        _seed(session, "comment", 5, site="beta", parent=42)
        service = _service(session)
        if backend == "zilliz":
            service.vector_backend = _vector(session)
            service.vector_backend.client.rows.append(
                {
                    **service.vector_backend.client.rows[0],
                    "source_type": "comment",
                    "source_id": 900,
                    "post_id": 900,
                    "parent_post_id": 42,
                }
            )
        before = _hits(service)
        assert (root_type, 42) in before and ("comment", 5) in before
        result = service.execute(
            site_id="alpha",
            ability_name=SITE_KNOWLEDGE_SYNC_ABILITY,
            contract_version="site_knowledge_sync.v1",
            input_payload=_input((root_type, 42), (root_type, 42), delete_mode=True),
            run_id="delete",
        )
        assert result["status"] == "completed"
        assert result["sync"]["deleted_entries"] == 5  # root 2 + comment 2 + orphan 1
        assert _hits(service) == {("media", 42), ("media", 8), ("comment", 7)}
        assert _hits(service, "beta") == {(root_type, 42), ("comment", 5)}
        if backend == "zilliz":
            assert not any(
                row["site_id"] == "alpha"
                and row["source_type"] == "comment"
                and row["parent_post_id"] == 42
                for row in service.vector_backend.client.rows
            )
            assert any(
                'source_type == "comment"' in query and "parent_post_id == 42" in query
                for query in service.vector_backend.client.filters
            )
            assert any(
                'source_type == "comment"' in query and "source_id == 6" in query
                for query in service.vector_backend.client.filters
            )
        presence = service.status(site_id="alpha", input_payload=_input((root_type, 42)))
        item = presence["source_presence"]["items"][0]
        assert item["document_present"] is False and item["stored_chunk_count"] == 0
        assert item["associated_comment_document_count"] == 0
        assert item["associated_comment_stored_chunk_count"] == 0
        session.commit()
    with get_session(database) as session:
        assert {
            (row.source_type, row.source_id)
            for row in session.scalars(
                select(SiteKnowledgeChunk).where(SiteKnowledgeChunk.site_id == "alpha")
            )
        } == {("media", 42), ("media", 8), ("comment", 7)}


@pytest.mark.parametrize("backend", ["sql", "zilliz"])
def test_typed_media_delete_has_no_parent_or_same_id_cascade(database, backend):
    with get_session(database) as session:
        for kind, key, parent in [
            ("post", 42, None),
            ("media", 42, 42),
            ("media", 43, 42),
            ("comment", 8, 42),
        ]:
            _seed(session, kind, key, parent=parent)
        _seed(session, "media", 42, site="beta")
        service = _service(session)
        if backend == "zilliz":
            service.vector_backend = _vector(session)
        service.sync(
            site_id="alpha", input_payload=_input(("media", 42), delete_mode=True), run_id="media"
        )
        assert _hits(service) == {("post", 42), ("media", 43), ("comment", 8)}
        assert _hits(service, "beta") == {("media", 42)}
        assert (
            service.repository.source_presence(site_id="alpha", source_items=[("media", 42)])[0][
                "document_present"
            ]
            is False
        )


def test_conflicting_post_page_selection_is_rejected_even_without_stored_root(database):
    with get_session(database) as session:
        with pytest.raises(SiteKnowledgeContractViolation) as error:
            _service(session).sync(
                site_id="alpha",
                input_payload=_input(("post", 42), ("page", 42), delete_mode=True),
                run_id="ambiguous",
            )
        assert error.value.error_code == "site_knowledge.source_identity_conflict"


@pytest.mark.parametrize("orphan", [False, True])
def test_other_post_type_conflict_rejects_entire_batch_before_vector_or_sql(database, orphan):
    with get_session(database) as session:
        _seed(session, "media", 1)
        _seed(session, "post", 42, orphan=orphan)
        _seed(session, "comment", 8, parent=42)
        service = _service(session)
        service.vector_backend = _vector(session)
        with pytest.raises(SiteKnowledgeContractViolation) as error:
            service.sync(
                site_id="alpha",
                input_payload=_input(("media", 1), ("page", 42), delete_mode=True),
                run_id="conflict",
            )
        assert error.value.error_code == "site_knowledge.source_identity_conflict"
        assert service.vector_backend.client.filters == []
        assert _hits(service) == {("media", 1), ("post", 42), ("comment", 8)}
        assert (
            service.repository.count_chunks_for_source(
                site_id="alpha", source_type="media", source_id=1
            )
            == 1
        )


def test_presence_counts_stale_orphan_and_public_separately_without_payload_leaks(database):
    with get_session(database) as session:
        _seed(session, "page", 42, status="stale")
        _seed(session, "media", 42, parent=42)
        _seed(session, "comment", 5, parent=42, status="stale")
        _seed(session, "comment", 6, parent=42, orphan=True)
        _seed(session, "post", 42, site="beta")
        _seed(session, "post", 99, orphan=True)
        service = _service(session)

        def fail_vector(*a, **k):
            pytest.fail("relational presence must not query vector storage")

        service.vector_backend = type("NoVectorRead", (), {"search": fail_vector})()
        selectors = _input(
            ("media", 42), ("page", 42), ("comment", 6), ("post", 99), ("post", 404), ("media", 42)
        )
        before = datetime.now(UTC)
        result = service.status(site_id="alpha", input_payload=selectors)
        presence = result["source_presence"]
        assert presence["status"] == "complete"
        assert presence["storage_scope"] == "relational_index"
        assert before <= datetime.fromisoformat(presence["observed_at"]) <= datetime.now(UTC)
        assert presence["requested_count"] == 5
        items = presence["items"]
        assert [(r["source_type"], r["source_id"]) for r in items] == [
            ("media", 42),
            ("page", 42),
            ("comment", 6),
            ("post", 99),
            ("post", 404),
        ]
        assert items[0]["public_document_present"] and items[0]["public_chunk_count"] == 1
        assert items[0]["associated_comment_document_count"] == 0
        assert items[1] == {
            "source_type": "page",
            "source_id": 42,
            "document_present": True,
            "stored_chunk_count": 1,
            "public_document_present": False,
            "public_chunk_count": 0,
            "associated_comment_document_count": 1,
            "associated_comment_stored_chunk_count": 2,
        }
        assert not items[2]["document_present"] and items[2]["stored_chunk_count"] == 1
        assert not items[3]["document_present"] and items[3]["public_chunk_count"] == 1
        assert all(
            value == 0 for key, value in items[4].items() if key not in ("source_id", "source_type")
        )
        assert "typed fixture" not in json.dumps(presence) and "beta" not in json.dumps(presence)
        # A fresh SQL projection observes later change without depending on summary counts.
        session.execute(
            delete(SiteKnowledgeChunk).where(
                SiteKnowledgeChunk.site_id == "alpha",
                SiteKnowledgeChunk.source_type == "post",
                SiteKnowledgeChunk.source_id == 99,
            )
        )
        again = service.status(site_id="alpha", input_payload=_input(("post", 99)))
        assert again["source_presence"]["items"][0]["stored_chunk_count"] == 0
        assert "source_presence" not in service.status(site_id="alpha", input_payload={})


def test_presence_is_independent_of_total_capacity_and_returns_all_100_identities(database):
    with get_session(database) as session:
        _seed(session, "post", 1)
        _seed(session, "post", 2)
        service = _service(session)
        first = service.status(site_id="alpha", input_payload=_input(("post", 1)))
        assert first["coverage"]["indexed_posts"] == 2
        service.sync(
            site_id="alpha", input_payload=_input(("post", 2), delete_mode=True), run_id="unrelated"
        )
        lower_usage = service.status(site_id="alpha", input_payload=_input(("post", 1)))
        assert lower_usage["coverage"]["indexed_posts"] == 1
        assert lower_usage["source_presence"]["items"][0]["document_present"]
        service.sync(
            site_id="alpha", input_payload=_input(("post", 1), delete_mode=True), run_id="target"
        )
        _seed(session, "post", 3)
        same_usage = service.status(site_id="alpha", input_payload=_input(("post", 1)))
        assert same_usage["coverage"]["indexed_posts"] == 1
        assert not same_usage["source_presence"]["items"][0]["document_present"]
        bounded = service.status(
            site_id="alpha", input_payload=_input(*[("post", key) for key in range(1, 101)])
        )["source_presence"]
        assert bounded["requested_count"] == len(bounded["items"]) == 100
        assert [row["source_id"] for row in bounded["items"]] == list(range(1, 101))
        assert sum(row["document_present"] for row in bounded["items"]) == 1


@pytest.mark.parametrize("failure", ["vector", "sql", "vector_comments"])
def test_partial_storage_failure_never_reports_cleanup_completed(database, monkeypatch, failure):
    with get_session(database) as session:
        _seed(session, "post", 42)
        session.commit()
        progress = []
        service = _service(session)
        service.progress_callback = progress.append
        service.vector_backend = _vector(session)
        if failure == "vector":
            service.vector_backend.client.fail_delete = True
        elif failure == "vector_comments":
            monkeypatch.setattr(
                service.vector_backend,
                "delete_associated_comment_indexes",
                lambda *a: (_ for _ in ()).throw(
                    SiteKnowledgeBackendError("site_knowledge.zilliz_delete_failed", "synthetic")
                ),
            )
        else:
            monkeypatch.setattr(
                service.repository,
                "delete_source_index",
                lambda **k: (_ for _ in ()).throw(RuntimeError("synthetic SQL")),
            )
        with pytest.raises((SiteKnowledgeBackendError, RuntimeError)):
            service.sync(
                site_id="alpha",
                input_payload=_input(("post", 42), delete_mode=True),
                run_id="failed",
            )
        assert not any(p.get("status") == "completed" for p in progress)
        if failure == "sql":
            assert _hits(service) == set()  # vector committed, SQL still physically present
            assert service.repository.source_presence(site_id="alpha", source_items=[("post", 42)])[
                0
            ]["document_present"]
        session.rollback()
    with get_session(database) as session:
        assert SiteKnowledgeRepository(session).count_documents("alpha") == 1


@pytest.mark.parametrize("backend", ["sql", "zilliz"])
def test_absent_parent_with_residual_comments_is_not_absent_until_cleaned(database, backend):
    with get_session(database) as session:
        _seed(session, "comment", 5, parent=42, orphan=True)
        service = _service(session)
        if backend == "zilliz":
            service.vector_backend = _vector(session)
        before = service.status(site_id="alpha", input_payload=_input(("page", 42)))[
            "source_presence"
        ]["items"][0]
        assert not before["document_present"] and before["stored_chunk_count"] == 0
        assert before["associated_comment_stored_chunk_count"] == 1
        service.sync(
            site_id="alpha",
            input_payload=_input(("page", 42), delete_mode=True),
            run_id="orphan-parent",
        )
        after = service.status(site_id="alpha", input_payload=_input(("page", 42)))[
            "source_presence"
        ]["items"][0]
        assert after["associated_comment_stored_chunk_count"] == 0
        assert _hits(service) == set()


def test_legacy_delete_retains_absent_selector_behavior(database):
    with get_session(database) as session:
        _seed(session, "post", 1)
        _seed(session, "media", 2)
        service = _service(session)
        legacy = {"sync_mode": "delete", "write_posture": "suggestion_only"}
        validate_site_knowledge_runtime_contract(
            ability_name=SITE_KNOWLEDGE_SYNC_ABILITY,
            contract_version="site_knowledge_sync.v1",
            input_payload=legacy,
        )
        service.sync(site_id="alpha", input_payload={**legacy, "post_ids": [1]}, run_id="one")
        assert _hits(service) == {("media", 2)}
        service.sync(site_id="alpha", input_payload=legacy, run_id="all")
        assert _hits(service) == set()
