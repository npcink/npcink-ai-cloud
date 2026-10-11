from __future__ import annotations

from datetime import UTC, datetime

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Site, SiteKnowledgeDocument
from app.domain.site_knowledge.repository import SiteKnowledgeRepository
from app.domain.site_knowledge.service import SiteKnowledgeService


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
            session.add(
                SiteKnowledgeDocument(
                    site_id="site_two",
                    post_id=2,
                    source_type="media",
                    source_id=2,
                    parent_post_id=None,
                    post_type="attachment",
                    post_status="publish",
                    title="Indexed image",
                    url="https://example.test/indexed.jpg",
                    modified_gmt="2026-08-25 00:00:00",
                    content_hash="hash-2",
                    last_sync_run_id="run-2",
                    metadata_json={},
                    last_indexed_at=now,
                )
            )
            session.commit()

        with get_session(database_url) as session:
            repository = SiteKnowledgeRepository(session)
            assert repository.lock_account_and_count_documents("acct_shared") == 2
            assert (
                repository.lock_account_and_count_documents(
                    "acct_shared",
                    source_type="media",
                )
                == 1
            )
            assert (
                repository.lock_account_and_count_documents(
                    "acct_shared",
                    exclude_source_type="media",
                )
                == 1
            )
    finally:
        dispose_engine(database_url)


def test_media_images_do_not_consume_article_capacity_and_zero_is_unlimited(
    tmp_path,
) -> None:
    database_url = f"sqlite:///{tmp_path / 'independent-media-quota.sqlite3'}"
    init_schema(database_url)
    now = datetime.now(UTC)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_independent", name="Independent quotas"))
            session.add(
                Site(
                    site_id="site_independent",
                    account_id="acct_independent",
                    name="Independent site",
                )
            )
            session.add(
                SiteKnowledgeDocument(
                    site_id="site_independent",
                    post_id=1,
                    source_type="post",
                    source_id=1,
                    parent_post_id=None,
                    post_type="post",
                    post_status="publish",
                    title="Existing article",
                    url="https://example.test/article",
                    modified_gmt="2026-08-25 00:00:00",
                    content_hash="hash-article",
                    last_sync_run_id="run-article",
                    metadata_json={},
                    last_indexed_at=now,
                )
            )
            session.commit()

        with get_session(database_url) as session:
            service = SiteKnowledgeService(
                session,
                settings=Settings(_env_file=None, environment="test", database_url=database_url),
                account_id="acct_independent",
                account_vector_document_limit=1,
                account_media_image_limit=0,
            )
            result = service.sync(
                site_id="site_independent",
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [2],
                    "media_items": [
                        {
                            "attachment_id": 2,
                            "mime_type": "image/jpeg",
                            "title": "Independent image",
                            "url": "https://example.test/independent.jpg",
                            "media_fingerprint": "sha256:independent-image",
                            "visual_summary": "An image indexed outside article capacity.",
                        }
                    ],
                    "write_posture": "suggestion_only",
                    "direct_wordpress_write": False,
                },
                run_id="run-independent-media",
            )
            assert result["sync"]["indexed_documents"] == 1
            assert result["sync"]["skipped_due_to_quota"] == 0
            assert service.repository.count_documents_for_account(
                "acct_independent",
                exclude_source_type="media",
            ) == 1
            assert service.repository.count_documents_for_account(
                "acct_independent",
                source_type="media",
            ) == 1
    finally:
        dispose_engine(database_url)


def test_account_media_image_quota_blocks_only_new_media_documents(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'site-media-quota.sqlite3'}"
    init_schema(database_url)
    now = datetime.now(UTC)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_media", name="Media account"))
            session.add(Site(site_id="site_media", account_id="acct_media", name="Media site"))
            session.add(
                SiteKnowledgeDocument(
                    site_id="site_media",
                    post_id=1,
                    source_type="media",
                    source_id=1,
                    parent_post_id=None,
                    post_type="attachment",
                    post_status="publish",
                    title="Existing image",
                    url="https://example.test/existing.jpg",
                    modified_gmt="2026-08-25 00:00:00",
                    content_hash="hash-existing",
                    last_sync_run_id="run-existing",
                    metadata_json={},
                    last_indexed_at=now,
                )
            )
            session.commit()

        with get_session(database_url) as session:
            service = SiteKnowledgeService(
                session,
                settings=Settings(_env_file=None, environment="test", database_url=database_url),
                account_id="acct_media",
                account_vector_document_limit=100,
                account_media_image_limit=1,
            )
            result = service.sync(
                site_id="site_media",
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [2],
                    "media_items": [
                        {
                            "attachment_id": 2,
                            "mime_type": "image/jpeg",
                            "title": "New image",
                            "url": "https://example.test/new.jpg",
                            "media_fingerprint": "sha256:new-image",
                            "visual_summary": (
                                "A new image that should exceed the package capacity."
                            ),
                        }
                    ],
                    "write_posture": "suggestion_only",
                    "direct_wordpress_write": False,
                },
                run_id="run-new-media",
            )
            assert result["sync"]["indexed_documents"] == 0
            assert result["sync"]["skipped_due_to_quota"] == 1
            assert (
                service.repository.count_documents_for_account(
                    "acct_media",
                    source_type="media",
                )
                == 1
            )
    finally:
        dispose_engine(database_url)


def test_progress_commit_cannot_bypass_final_media_capacity_check(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'site-media-progress-race.sqlite3'}"
    init_schema(database_url)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="acct_race", name="Race account"))
            session.add_all(
                [
                    Site(site_id="site_candidate", account_id="acct_race", name="Candidate"),
                    Site(site_id="site_competing", account_id="acct_race", name="Competing"),
                ]
            )
            session.commit()

        competing_inserted = False
        with get_session(database_url) as session:

            def record_progress(progress: dict[str, object]) -> None:
                nonlocal competing_inserted
                session.commit()
                if progress.get("stage") != "writing" or competing_inserted:
                    return
                with get_session(database_url) as competing_session:
                    competing_session.add(
                        SiteKnowledgeDocument(
                            site_id="site_competing",
                            post_id=900,
                            source_type="media",
                            source_id=900,
                            parent_post_id=None,
                            post_type="attachment",
                            post_status="publish",
                            title="Competing image",
                            url="https://example.test/competing.jpg",
                            modified_gmt="2026-08-31 00:00:00",
                            content_hash="competing-hash",
                            last_sync_run_id="run-competing",
                            metadata_json={},
                            last_indexed_at=datetime.now(UTC),
                        )
                    )
                    competing_session.commit()
                competing_inserted = True

            service = SiteKnowledgeService(
                session,
                settings=Settings(_env_file=None, environment="test", database_url=database_url),
                progress_callback=record_progress,
                account_id="acct_race",
                account_vector_document_limit=100,
                account_media_image_limit=1,
            )
            result = service.sync(
                site_id="site_candidate",
                input_payload={
                    "contract_version": "site_knowledge_sync.v1",
                    "sync_mode": "refresh",
                    "post_ids": [901],
                    "media_items": [
                        {
                            "attachment_id": 901,
                            "mime_type": "image/jpeg",
                            "title": "Candidate image",
                            "url": "https://example.test/candidate.jpg",
                            "media_fingerprint": "sha256:candidate-image",
                            "visual_summary": "A candidate image competing for the final slot.",
                        }
                    ],
                    "write_posture": "suggestion_only",
                    "direct_wordpress_write": False,
                },
                run_id="run-candidate",
            )

            assert competing_inserted is True
            assert result["sync"]["indexed_documents"] == 0
            assert result["sync"]["skipped_due_to_quota"] == 1
            assert service.repository.count_documents_for_account(
                "acct_race",
                source_type="media",
            ) == 1
    finally:
        dispose_engine(database_url)
