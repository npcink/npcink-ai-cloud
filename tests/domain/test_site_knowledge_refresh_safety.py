from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import inspect, select

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, Site, SiteKnowledgeChunk, SiteKnowledgeDocument
from app.domain.site_knowledge.service import SiteKnowledgeService


def _document(post_id: int, text: str = "Original public content.") -> dict[str, Any]:
    return {
        "post_id": post_id,
        "post_type": "post",
        "post_status": "publish",
        "title": f"Article {post_id}",
        "url": f"https://example.test/{post_id}",
        "content_excerpt": text,
    }


def _payload(documents: list[Any], **extra: Any) -> dict[str, Any]:
    return {
        "contract_version": "site_knowledge_sync.v1",
        "sync_mode": "refresh",
        "post_ids": [1, 2],
        "documents": documents,
        "write_posture": "suggestion_only",
        "direct_wordpress_write": False,
        **extra,
    }


def _snapshot(service: SiteKnowledgeService) -> list[dict[str, Any]]:
    result = []
    for model in (SiteKnowledgeDocument, SiteKnowledgeChunk):
        for row in service.repository.session.scalars(select(model).order_by(model.id)):
            result.append(
                {column.key: getattr(row, column.key) for column in inspect(model).columns}
            )
    return result


@pytest.fixture
def service(tmp_path: Any) -> Iterator[SiteKnowledgeService]:
    database_url = f"sqlite:///{tmp_path / 'refresh.sqlite3'}"
    init_schema(database_url)
    try:
        with get_session(database_url) as session:
            session.add(Account(account_id="account", name="Account"))
            session.add(Site(site_id="site", account_id="account", name="Site"))
            session.commit()
            value = SiteKnowledgeService(
                session,
                settings=Settings(
                    _env_file=None,
                    environment="test",
                    database_url=database_url,
                    site_knowledge_embedding_provider="deterministic",
                ),
                account_id="account",
                account_vector_document_limit=2,
            )
            value.sync(
                site_id="site", input_payload=_payload([_document(1), _document(2)]), run_id="seed"
            )
            session.commit()
            yield value
    finally:
        dispose_engine(database_url)


@pytest.mark.parametrize("documents", [[], [{}], [_document(1, "") | {"post_status": "private"}]])
def test_empty_or_invalid_refresh_keeps_existing_rows(
    service: SiteKnowledgeService,
    documents: list[Any],
) -> None:
    before = _snapshot(service)
    result = service.sync(site_id="site", input_payload=_payload(documents), run_id="invalid")
    service.repository.session.commit()
    assert result["sync"]["deleted_entries"] == 0
    assert _snapshot(service) == before


def test_full_or_downgraded_account_refreshes_existing_without_deleting_omitted_sources(
    service: SiteKnowledgeService,
) -> None:
    service.account_vector_document_limit = 1  # Existing two rows already exceed the new plan.
    original_second = [row for row in _snapshot(service) if row["post_id"] == 2]
    result = service.sync(
        site_id="site",
        input_payload=_payload(
            [
                _document(1, "Updated article text."),
                _document(3, "New article text."),
            ]
        ),
        run_id="limited",
    )
    service.repository.session.commit()
    assert result["sync"]["indexed_documents"] == 1
    assert result["sync"]["skipped_due_to_quota"] == 1
    assert result["sync"]["deleted_entries"] == 0
    assert [row for row in _snapshot(service) if row["post_id"] == 2] == original_second
    assert service.repository.count_documents("site") == 2
    assert service.repository.document_content_hash(site_id="site", source_type="post", source_id=1)
    assert any("Updated article text." in row.get("chunk_text", "") for row in _snapshot(service))


@pytest.mark.parametrize("failure", ["empty_chunks", "embedding_exception", "writing_exception"])
def test_failed_replacement_keeps_old_chunks_even_when_progress_is_committed(
    service: SiteKnowledgeService,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    before = _snapshot(service)

    def progress(value: dict[str, Any]) -> None:
        service.repository.session.commit()
        if failure == "writing_exception" and value["stage"] == "writing":
            raise RuntimeError("Simulated worker interruption")

    service.progress_callback = progress
    if failure == "empty_chunks":
        monkeypatch.setattr(service, "_build_chunks", lambda *_args, **_kwargs: [])
    elif failure == "embedding_exception":

        def fail(*_args: Any, **_kwargs: Any) -> Any:
            raise RuntimeError("Simulated embedding failure")

        monkeypatch.setattr(service, "_build_chunks", fail)
    if failure == "empty_chunks":
        result = service.sync(
            site_id="site", input_payload=_payload([_document(1, "Changed")]), run_id="failed"
        )
        assert result["sync"]["failed_documents"] == 1
    else:
        with pytest.raises(RuntimeError):
            service.sync(
                site_id="site", input_payload=_payload([_document(1, "Changed")]), run_id="failed"
            )
    service.repository.session.commit()
    assert _snapshot(service) == before


def test_run_limit_keeps_unprocessed_existing_source(service: SiteKnowledgeService) -> None:
    service.settings.site_knowledge_max_sync_documents_per_run = 1
    original_second = [row for row in _snapshot(service) if row["post_id"] == 2]
    result = service.sync(
        site_id="site",
        input_payload=_payload(
            [
                _document(1, "Changed one"),
                _document(2, "Changed two"),
            ]
        ),
        run_id="bounded",
    )
    assert result["sync"]["indexed_documents"] == 1
    assert result["sync"]["skipped_due_to_quota"] == 1
    assert [row for row in _snapshot(service) if row["post_id"] == 2] == original_second


def test_explicit_delete_still_withdraws_selected_index(service: SiteKnowledgeService) -> None:
    result = service.sync(
        site_id="site",
        input_payload=_payload([], sync_mode="delete", post_ids=[1]),
        run_id="withdrawn",
    )
    assert result["sync"]["deleted_entries"] > 0
    assert {row["post_id"] for row in _snapshot(service)} == {2}


def test_vector_refresh_upserts_before_scoped_obsolete_tail_cleanup(
    service: SiteKnowledgeService,
) -> None:
    from app.domain.site_knowledge.backends import ZillizCloudSiteKnowledgeBackend

    events: list[tuple[str, Any]] = []

    class Client:
        def upsert(self, **kwargs: Any) -> None:
            events.append(("upsert", kwargs["data"]))

        def delete(self, **kwargs: Any) -> None:
            events.append(("delete", kwargs["filter"]))

    backend = ZillizCloudSiteKnowledgeBackend.__new__(ZillizCloudSiteKnowledgeBackend)
    backend.client = Client()
    backend.collection = "local-fixture"
    service.vector_backend = backend
    result = service.sync(
        site_id="site", input_payload=_payload([_document(1, "Replacement")]), run_id="replace"
    )
    assert result["sync"]["indexed_documents"] == 1
    assert [kind for kind, _ in events] == ["upsert", "delete"]
    assert (
        events[1][1]
        == 'site_id == "site" and source_type == "post" and source_id == 1 and chunk_index >= 1'
    )
    assert {row["post_id"] for row in _snapshot(service)} == {1, 2}


def test_vector_upsert_failure_does_not_delete_old_source(
    service: SiteKnowledgeService,
) -> None:
    from app.domain.site_knowledge.backends import (
        SiteKnowledgeBackendError,
        ZillizCloudSiteKnowledgeBackend,
    )

    before = _snapshot(service)

    class Client:
        def upsert(self, **_kwargs: Any) -> None:
            raise RuntimeError("Simulated vector outage")

        def delete(self, **_kwargs: Any) -> None:
            pytest.fail("Must not delete any old vectors after failed upsert")

    backend = ZillizCloudSiteKnowledgeBackend.__new__(ZillizCloudSiteKnowledgeBackend)
    backend.client = Client()
    backend.collection = "local-fixture"
    service.vector_backend = backend
    service.progress_callback = lambda _value: service.repository.session.commit()
    with pytest.raises(SiteKnowledgeBackendError):
        service.sync(
            site_id="site",
            input_payload=_payload([_document(1, "Replacement")]),
            run_id="failed-vector",
        )
    service.repository.session.commit()
    assert _snapshot(service) == before


def test_explicit_refresh_withdrawal_survives_mixed_quota_skips(
    service: SiteKnowledgeService,
) -> None:
    service.account_vector_document_limit = 1
    result = service.sync(
        site_id="site",
        input_payload=_payload(
            [_document(2, "Updated retained source"), _document(3)],
            withdrawn_post_ids=[1],
        ),
        run_id="withdrawal",
    )
    assert result["sync"]["deleted_entries"] == 2
    assert result["sync"]["skipped_due_to_quota"] == 1
    assert result["sync"]["indexed_documents"] == 1
    assert not service.repository.document_exists(site_id="site", source_type="post", source_id=1)
    assert service.repository.document_exists(site_id="site", source_type="post", source_id=2)


@pytest.mark.parametrize("withdrawal", [[True], ["1"], [-1], None, list(range(1, 1002))])
def test_invalid_explicit_withdrawal_cannot_change_index(
    service: SiteKnowledgeService,
    withdrawal: Any,
) -> None:
    from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation

    before = _snapshot(service)
    with pytest.raises(SiteKnowledgeContractViolation):
        service.sync(
            site_id="site",
            input_payload=_payload([], withdrawn_post_ids=withdrawal),
            run_id="bad-withdrawal",
        )
    assert _snapshot(service) == before


def test_delivery_withdrawal_conflict_rejected_before_any_cleanup(
    service: SiteKnowledgeService,
) -> None:
    from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation

    before = _snapshot(service)
    with pytest.raises(SiteKnowledgeContractViolation):
        service.sync(
            site_id="site",
            input_payload=_payload([_document(1)], withdrawn_post_ids=[1, 2]),
            run_id="conflict",
        )
    assert _snapshot(service) == before


def test_comment_withdrawal_uses_exact_type_without_touching_same_id_post(
    service: SiteKnowledgeService,
) -> None:
    service.settings.site_knowledge_comments_enabled = True
    service.account_vector_document_limit = 3
    service.sync(
        site_id="site",
        input_payload=_payload(
            [],
            comments=[
                {
                    "comment_id": 1,
                    "post_id": 2,
                    "comment_status": "approved",
                    "content_excerpt": "A useful public comment.",
                }
            ],
        ),
        run_id="seed-comment",
    )
    assert service.repository.document_exists(site_id="site", source_type="comment", source_id=1)
    result = service.sync(
        site_id="site",
        input_payload=_payload([], withdrawn_comment_ids=[1]),
        run_id="comment-withdrawal",
    )
    assert result["sync"]["deleted_entries"] == 2
    assert service.repository.document_exists(site_id="site", source_type="post", source_id=1)
    assert not service.repository.document_exists(
        site_id="site", source_type="comment", source_id=1
    )
    assert service.repository.count_documents("site") == 2


@pytest.mark.parametrize("mode", ["delete", "rebuild"])
def test_withdrawal_markers_are_refresh_only(service: SiteKnowledgeService, mode: str) -> None:
    from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation

    before = _snapshot(service)
    with pytest.raises(SiteKnowledgeContractViolation):
        service.sync(
            site_id="site",
            input_payload=_payload([], sync_mode=mode, withdrawn_post_ids=[1]),
            run_id="wrong-mode",
        )
    assert _snapshot(service) == before


def test_parent_withdrawal_and_child_delivery_conflict(service: SiteKnowledgeService) -> None:
    from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation

    before = _snapshot(service)
    with pytest.raises(SiteKnowledgeContractViolation):
        service.sync(
            site_id="site",
            input_payload=_payload(
                [],
                withdrawn_post_ids=[2],
                comments=[
                    {
                        "comment_id": 9,
                        "post_id": 2,
                        "comment_status": "approved",
                        "content_excerpt": "Child",
                    }
                ],
            ),
            run_id="parent-conflict",
        )
    assert _snapshot(service) == before


def test_chunk_capacity_rejection_preserves_old_source(service: SiteKnowledgeService) -> None:
    service.settings.site_knowledge_max_indexed_chunks_per_site = 1
    before = _snapshot(service)
    result = service.sync(
        site_id="site",
        input_payload=_payload([_document(1, "Longer replacement. " * 400)]),
        run_id="chunk-limit",
    )
    assert result["sync"]["skipped_due_to_quota"] == 1
    assert _snapshot(service) == before
