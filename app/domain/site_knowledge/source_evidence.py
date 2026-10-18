"""Explicit Cloud operator reconciliation; dry-run by default, no model calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.models import Site, SiteKnowledgeChunk, SiteKnowledgeDocument
from app.domain.provider_connections.runtime_settings import (
    apply_provider_connection_runtime_settings,
)
from app.domain.site_knowledge.backends import build_vector_backend
from app.domain.site_knowledge.contracts import SITE_KNOWLEDGE_STALE_POST_STATUS
from app.domain.site_knowledge.repository import SiteKnowledgeRepository
from app.domain.site_knowledge.service import _normalize_public_document


def _retained_fingerprint(documents: list[Any], chunks: list[Any]) -> str:
    data = {
        "documents": sorted(
            (
                d.id,
                d.content_hash,
                d.title,
                d.url,
                d.modified_gmt,
                json.dumps(d.metadata_json, sort_keys=True),
            )
            for d in documents
        ),
        "chunks": sorted(
            (
                c.id,
                c.content_hash,
                c.embedding_model,
                c.chunk_text,
                str(c.indexed_at),
                c.embedding_json,
            )
            for c in chunks
        ),
    }
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def reconcile_source_evidence(
    session: Session,
    *,
    settings: Settings,
    snapshot: dict[str, Any],
    apply: bool = False,
) -> dict[str, Any]:
    """Preserve absent rows; validate the entire snapshot before changing state."""
    if (
        snapshot.get("contract_version") != "site_knowledge_source_evidence.v1"
        or snapshot.get("public_sources_complete") is not True
    ):
        raise ValueError("complete source evidence snapshot required")
    generated = datetime.fromisoformat(str(snapshot.get("generated_at", "")).replace("Z", "+00:00"))
    if (
        generated.tzinfo is None
        or not -60 <= (datetime.now(UTC) - generated).total_seconds() <= 900
    ):
        raise ValueError("snapshot must be fresh and timezone-aware")
    sources = snapshot.get("public_sources")
    expected_ids = snapshot.get("expected_retained_post_ids")
    if (
        not isinstance(sources, list)
        or not 1 <= len(sources) <= 10000
        or type(snapshot.get("public_source_count")) is not int
        or snapshot["public_source_count"] != len(sources)
        or not isinstance(expected_ids, list)
        or not 1 <= len(expected_ids) <= 1000
        or any(type(i) is not int or i < 1 for i in expected_ids)
        or len(set(expected_ids)) != len(expected_ids)
    ):
        raise ValueError("bounded counts and exact expected retained cohort required")
    keep = set()
    for source in sources:
        if (
            not isinstance(source, dict)
            or source.get("source_type") not in {"post", "page"}
            or type(source.get("source_id")) is not int
            or source["source_id"] < 1
        ):
            raise ValueError("only positive public post/page source keys are allowed")
        keep.add((source["source_type"], source["source_id"]))
    if len(keep) != len(sources):
        raise ValueError("duplicate source keys are not a complete manifest")
    site_query = select(Site).where(Site.site_url == snapshot.get("site_url"))
    if apply:
        site_query = site_query.with_for_update()
    sites = list(session.scalars(site_query))
    if len(sites) != 1:
        raise ValueError("snapshot URL must identify exactly one existing site")
    site = sites[0]
    documents = list(
        session.scalars(
            select(SiteKnowledgeDocument).where(
                SiteKnowledgeDocument.site_id == site.site_id,
                SiteKnowledgeDocument.source_type.in_(["post", "page"]),
                SiteKnowledgeDocument.post_status.in_(
                    ["publish", SITE_KNOWLEDGE_STALE_POST_STATUS]
                ),
            )
        )
    )
    indexed = {(d.source_type, d.source_id): d for d in documents}
    if not keep.issubset(indexed):
        raise ValueError("public manifest contains missing indexed sources")
    retained = [d for key, d in indexed.items() if key not in keep]
    if len(retained) != len(expected_ids) or {d.post_id for d in retained} != set(expected_ids):
        raise ValueError("retained cohort changed; obtain a new reviewed snapshot")
    retained_keys = {(d.source_type, d.source_id) for d in retained}
    # The exact cohort is bounded above; all reads and writes remain site scoped.
    chunks = list(
        session.scalars(
            select(SiteKnowledgeChunk).where(
                SiteKnowledgeChunk.site_id == site.site_id,
                SiteKnowledgeChunk.post_id.in_(expected_ids),
                SiteKnowledgeChunk.source_type.in_(["post", "page"]),
            )
        )
    )
    if any((c.source_type, c.source_id) not in retained_keys for c in chunks):
        raise ValueError("ambiguous retained chunk identity")
    evidence_documents = snapshot.get("documents", [])
    if not isinstance(evidence_documents, list) or not 1 <= len(evidence_documents) <= 50:
        raise ValueError("one bounded evidence document batch required")
    evidence_updates: list[tuple[SiteKnowledgeDocument, dict[str, Any]]] = []
    seen = set()
    for document in evidence_documents:
        if not isinstance(document, dict):
            raise ValueError("evidence documents must be objects")
        normalized = _normalize_public_document(document)
        if normalized is None or not isinstance(normalized["delivery_evidence"], dict):
            raise ValueError("public document with delivery evidence required")
        key = (normalized["source_type"], normalized["source_id"])
        row = indexed.get(key)
        if (
            key not in keep
            or key in seen
            or row is None
            or row.content_hash != normalized["content_hash"]
        ):
            raise ValueError("evidence must match unchanged current public indexed content")
        if row.post_status != "publish" or row.modified_gmt != normalized["modified_gmt"]:
            raise ValueError("evidence updates do not requalify stale records")
        seen.add(key)
        evidence_updates.append((row, normalized["delivery_evidence"]))
    before = _retained_fingerprint(retained, chunks)
    receipt = {
        "contract_version": "site_knowledge_source_evidence.v1",
        "applied": apply,
        "site_id": site.site_id,
        "retained_document_count": len(retained),
        "retained_chunk_count": len(chunks),
        "retained_post_ids": sorted(expected_ids),
        "public_source_count": len(keep),
        "delivery_evidence_documents": len(evidence_updates),
        "retained_content_sha256": before,
        "snapshot_sha256": hashlib.sha256(
            json.dumps(snapshot, sort_keys=True).encode()
        ).hexdigest(),
        "policy_version": "site_knowledge_source_eligibility.v2",
        "recorded_at": datetime.now(UTC).isoformat(),
        "embedding_calls": 0,
    }
    if not apply:
        return receipt
    backend = build_vector_backend(settings)
    if backend is not None and chunks:
        backend.upsert_chunks(
            site_id=site.site_id,
            chunks=[
                {
                    "post_id": c.post_id,
                    "source_type": c.source_type,
                    "source_id": c.source_id,
                    "parent_post_id": c.parent_post_id or 0,
                    "chunk_index": c.chunk_index,
                    "post_type": c.post_type,
                    "post_status": SITE_KNOWLEDGE_STALE_POST_STATUS,
                    "title": c.title,
                    "url": c.url,
                    "chunk_text": c.chunk_text,
                    "content_hash": c.content_hash,
                    "embedding": c.embedding_json,
                    "indexed_at": c.indexed_at.isoformat(),
                }
                for c in chunks
            ],
        )
    receipt["newly_isolated_documents"] = SiteKnowledgeRepository(
        session
    ).mark_unmanifested_sources_stale(
        site.site_id, keep_sources=keep, source_types={"post", "page"}
    )
    for row, evidence in evidence_updates:
        metadata = dict(row.metadata_json or {})
        metadata.update(
            {"delivery_evidence": evidence, "delivery_truncated": evidence["truncated"]}
        )
        metadata["truncated"] = bool(
            metadata.get("content_truncated")
            or metadata.get("chunk_limit_truncated")
            or evidence["truncated"]
        )
        row.metadata_json = metadata
    metadata = dict(site.metadata_json or {})
    metadata["source_eligibility_receipt"] = {
        k: receipt[k]
        for k in (
            "policy_version",
            "snapshot_sha256",
            "retained_document_count",
            "retained_post_ids",
            "recorded_at",
        )
    }
    site.metadata_json = metadata
    session.flush()
    session.expire_all()
    if _retained_fingerprint(retained, chunks) != before:
        raise ValueError("retained content changed during qualification")
    receipt["retained_content_unchanged"] = True
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="JSON file, or - for stdin")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    snapshot = (
        json.load(sys.stdin)
        if args.manifest == "-"
        else json.loads(Path(args.manifest).read_text())
    )
    settings = get_settings().model_copy(deep=True)
    if args.apply and settings.environment not in {"development", "test"}:
        raise ValueError("this operator apply lane is restricted to development/test")
    apply_provider_connection_runtime_settings(settings)
    with get_session(settings.database_url) as session:
        try:
            receipt = reconcile_source_evidence(
                session, settings=settings, snapshot=snapshot, apply=args.apply
            )
            if args.apply:
                session.commit()
            else:
                session.rollback()
        except Exception:
            session.rollback()
            raise
    print(json.dumps(receipt))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            json.dumps(
                {
                    "error_type": type(error).__name__,
                    "error_code": getattr(error, "error_code", "source_evidence_failed"),
                }
            ),
            file=sys.stderr,
        )
        raise SystemExit(2) from None
