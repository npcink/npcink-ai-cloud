from __future__ import annotations

from datetime import UTC, datetime

from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Site, SiteKnowledgeDocument
from app.domain.site_knowledge.repository import SiteKnowledgeRepository


def test_account_document_quota_lock_counts_documents_across_sites(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'site-knowledge-quota.sqlite3'}"
    init_schema(database_url)
    now = datetime.now(UTC)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_shared", name="Shared account"))
            session.add_all(
                [
                    Site(site_id="site_one", account_id="acct_shared", name="Site one"),
                    Site(site_id="site_two", account_id="acct_shared", name="Site two"),
                ]
            )
            session.add(
                SiteKnowledgeDocument(
                    site_id="site_one",
                    post_id=1,
                    source_type="post",
                    source_id=1,
                    parent_post_id=None,
                    post_type="post",
                    post_status="publish",
                    title="Indexed page",
                    url="https://example.test/indexed",
                    modified_gmt="2026-08-25 00:00:00",
                    content_hash="hash-1",
                    last_sync_run_id="run-1",
                    metadata_json={},
                    last_indexed_at=now,
                )
            )
            session.commit()

        with get_session(database_url) as session:
            repository = SiteKnowledgeRepository(session)
            assert repository.lock_account_and_count_documents("acct_shared") == 1
    finally:
        dispose_engine(database_url)
