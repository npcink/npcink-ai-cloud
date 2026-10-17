import sys
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import Site, SiteKnowledgeChunk, SiteKnowledgeDocument
from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation
from app.domain.site_knowledge.delivery_evidence import normalize_delivery_evidence
from app.domain.site_knowledge.service import SiteKnowledgeService, _normalize_public_document
from app.domain.site_knowledge.source_evidence import reconcile_source_evidence


def _document(post_id, text="public text", post_type="post"):
    return {
        "post_id": post_id,
        "post_type": post_type,
        "post_status": "publish",
        "title": f"Article {post_id}",
        "url": f"https://example.test/{post_id}",
        "content_excerpt": text,
        "modified_gmt": "2026-10-17 00:00:00",
    }


def _evidence():
    return {
        "contract_version": "site_knowledge_delivery_evidence.v1",
        "projection_version": "wordpress_public_text_bytes.v1",
        "length_basis": "sanitized_public_text_before_byte_limit",
        "source_bytes": 2700,
        "source_chars": 900,
        "delivered_bytes": 1800,
        "delivered_chars": 600,
        "max_bytes": 1800,
        "truncated": True,
    }


@pytest.fixture
def seeded(tmp_path):
    database = f"sqlite:///{tmp_path / 'source-evidence.sqlite3'}"
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database,
        site_knowledge_embedding_provider="deterministic",
        site_knowledge_embedding_dimensions=32,
    )
    init_schema(database)
    with get_session(database) as session:
        session.add_all(
            [
                Site(site_id="own", name="Own", site_url="https://example.test"),
                Site(site_id="other", name="Other", site_url="https://other.test"),
            ]
        )
        session.flush()
        service = SiteKnowledgeService(session, settings=settings)
        for site_id, docs in [
            ("own", [_document(1, "汉" * 600), _document(2), _document(3, post_type="page")]),
            ("other", [_document(2)]),
        ]:
            service.sync(
                site_id=site_id,
                input_payload={"sync_mode": "refresh", "documents": docs},
                run_id="seed",
            )
        session.commit()
    document = _document(1, "汉" * 600)
    document["delivery_evidence"] = _evidence()
    snapshot = {
        "contract_version": "site_knowledge_source_evidence.v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "site_url": "https://example.test",
        "public_sources_complete": True,
        "public_source_count": 2,
        "public_sources": [
            {"source_type": "post", "source_id": 1},
            {"source_type": "page", "source_id": 3},
        ],
        "expected_retained_post_ids": [2],
        "documents": [document],
    }
    return settings, snapshot


def test_apply_preserves_records_vectors_and_other_site_and_is_idempotent(seeded):
    settings, snapshot = seeded
    with get_session(settings.database_url) as session:
        before = [
            (c.id, c.embedding_json, c.chunk_text, c.indexed_at)
            for c in session.scalars(select(SiteKnowledgeChunk))
        ]
        first = reconcile_source_evidence(session, settings=settings, snapshot=snapshot, apply=True)
        second = reconcile_source_evidence(
            session, settings=settings, snapshot=snapshot, apply=True
        )
        assert first["newly_isolated_documents"] == 1
        assert second["newly_isolated_documents"] == 0
        assert first["retained_content_unchanged"]
        assert first["embedding_calls"] == 0
        after = [
            (c.id, c.embedding_json, c.chunk_text, c.indexed_at)
            for c in session.scalars(select(SiteKnowledgeChunk))
        ]
        assert before == after
        statuses = {
            (d.site_id, d.post_id): d.post_status
            for d in session.scalars(select(SiteKnowledgeDocument))
        }
        assert statuses == {
            ("own", 1): "publish",
            ("own", 2): "stale",
            ("own", 3): "publish",
            ("other", 2): "publish",
        }
        result = SiteKnowledgeService(session, settings=settings).search(
            site_id="own",
            input_payload={
                "query": "Article 2",
                "intent": "related_content",
                "max_results": 20,
                "filters": {"status": ["stale"]},
            },
            run_id="search",
        )
        assert all(r["post_id"] != 2 for r in result["results"])
        row = session.scalar(
            select(SiteKnowledgeDocument).where(
                SiteKnowledgeDocument.site_id == "own", SiteKnowledgeDocument.post_id == 1
            )
        )
        assert row.metadata_json["delivery_truncated"] is True
        assert row.metadata_json["content_truncated"] is False
        assert row.metadata_json["truncated"] is True


def test_dry_run_never_constructs_vector_store_or_changes_state(seeded, monkeypatch):
    settings, snapshot = seeded

    def forbidden(_settings):
        raise AssertionError("dry run must not contact vector backend")

    monkeypatch.setattr("app.domain.site_knowledge.source_evidence.build_vector_backend", forbidden)
    with get_session(settings.database_url) as session:
        result = reconcile_source_evidence(session, settings=settings, snapshot=snapshot)
        assert result["applied"] is False
        assert all(
            d.post_status == "publish" for d in session.scalars(select(SiteKnowledgeDocument))
        )
        assert session.get(Site, "own").metadata_json is None


@pytest.mark.parametrize(
    "mutation",
    [
        "partial",
        "duplicate",
        "wrong_count",
        "unexpected_cohort",
        "expired",
        "site",
        "content",
        "missing_evidence",
        "modified",
    ],
)
def test_invalid_snapshot_cannot_partially_apply(seeded, mutation):
    settings, snapshot = seeded
    bad = deepcopy(snapshot)
    if mutation == "partial":
        bad["public_sources_complete"] = False
    if mutation == "duplicate":
        bad["public_sources"][1] = bad["public_sources"][0]
    if mutation == "wrong_count":
        bad["public_source_count"] = 1
    if mutation == "unexpected_cohort":
        bad["expected_retained_post_ids"] = [99]
    if mutation == "expired":
        bad["generated_at"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    if mutation == "site":
        bad["site_url"] = "https://missing.test"
    if mutation == "content":
        bad["documents"][0]["title"] = "changed"
    if mutation == "missing_evidence":
        bad["documents"][0].pop("delivery_evidence")
    if mutation == "modified":
        bad["documents"][0]["modified_gmt"] = "2026-10-18 00:00:00"
    with get_session(settings.database_url) as session:
        with pytest.raises(ValueError):
            reconcile_source_evidence(session, settings=settings, snapshot=bad, apply=True)
        assert all(
            d.post_status == "publish" for d in session.scalars(select(SiteKnowledgeDocument))
        )


def test_external_mirror_changes_only_qualification_payload(seeded, monkeypatch):
    settings, snapshot = seeded
    calls = []

    class Backend:
        def upsert_chunks(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(
        "app.domain.site_knowledge.source_evidence.build_vector_backend", lambda _s: Backend()
    )
    with get_session(settings.database_url) as session:
        original = session.scalar(
            select(SiteKnowledgeChunk).where(
                SiteKnowledgeChunk.site_id == "own", SiteKnowledgeChunk.post_id == 2
            )
        )
        vector = list(original.embedding_json)
        reconcile_source_evidence(session, settings=settings, snapshot=snapshot, apply=True)
        assert calls[0]["site_id"] == "own"
        assert calls[0]["chunks"][0]["embedding"] == vector
        assert calls[0]["chunks"][0]["post_status"] == "stale"


def test_external_failure_does_not_isolate_sql_rows(seeded, monkeypatch):
    settings, snapshot = seeded

    class Backend:
        def upsert_chunks(self, **_kwargs):
            raise RuntimeError("fake SDK unavailable")

    monkeypatch.setattr(
        "app.domain.site_knowledge.source_evidence.build_vector_backend", lambda _s: Backend()
    )
    with get_session(settings.database_url) as session:
        with pytest.raises(RuntimeError):
            reconcile_source_evidence(session, settings=settings, snapshot=snapshot, apply=True)
        session.rollback()
        assert all(
            d.post_status == "publish" for d in session.scalars(select(SiteKnowledgeDocument))
        )


def test_delivery_metadata_does_not_change_content_hash_and_missing_is_unknown():
    doc = _document(1, "汉" * 600)
    legacy = _normalize_public_document(doc)
    assert legacy["delivery_evidence"] is None
    doc["delivery_evidence"] = _evidence()
    current = _normalize_public_document(doc)
    assert current["content_hash"] == legacy["content_hash"]
    assert current["content_truncated"] is False
    assert current["delivery_truncated"] is True
    for key, value in [
        ("delivered_bytes", 600),
        ("source_chars", True),
        ("truncated", False),
        ("delivered_chars", 599),
    ]:
        bad = _evidence()
        bad[key] = value
        with pytest.raises(SiteKnowledgeContractViolation):
            normalize_delivery_evidence(bad, "汉" * 600)


def test_normal_sync_persists_upstream_clipping(seeded):
    settings, snapshot = seeded
    with get_session(settings.database_url) as session:
        result = SiteKnowledgeService(session, settings=settings).sync(
            site_id="own",
            input_payload={"sync_mode": "refresh", "documents": snapshot["documents"]},
            run_id="new-evidence",
        )
        assert result["sync"]["truncated_documents"] == 1
        row = session.scalar(
            select(SiteKnowledgeDocument).where(
                SiteKnowledgeDocument.site_id == "own", SiteKnowledgeDocument.post_id == 1
            )
        )
        assert row.metadata_json["delivery_evidence"]["source_bytes"] == 2700


def test_operator_apply_refuses_production_before_provider_or_database_access(
    tmp_path, monkeypatch
):
    from app.domain.site_knowledge import source_evidence

    manifest = tmp_path / "manifest.json"
    manifest.write_text("{}")
    monkeypatch.setattr(sys, "argv", ["source-evidence", "--manifest", str(manifest), "--apply"])
    monkeypatch.setattr(
        source_evidence,
        "get_settings",
        lambda: Settings(_env_file=None, environment="test").model_copy(
            update={"environment": "production"}
        ),
    )

    def forbidden(*_args, **_kwargs):
        raise AssertionError("production apply must not reach provider projection or the database")

    monkeypatch.setattr(source_evidence, "apply_provider_connection_runtime_settings", forbidden)
    monkeypatch.setattr(source_evidence, "get_session", forbidden)
    with pytest.raises(ValueError, match="restricted"):
        source_evidence.main()
