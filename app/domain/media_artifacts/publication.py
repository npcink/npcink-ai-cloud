from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.orm.session import SessionTransaction

from app.domain.media_artifacts.store import ArtifactStore

_LOGGER = logging.getLogger(__name__)
_TRACKER_KEY = "media_artifact_publication_tracker.v1"
_OUTCOME_KEY = "media_artifact_publication_outcome.v1"
_COMMIT_UNCERTAIN_KEY = "media_artifact_publication_commit_uncertain.v1"
_LISTENERS_KEY = "media_artifact_publication_listeners.v1"

PublicationCleanupErrorFactory = Callable[[tuple[str, ...]], BaseException]


@dataclass(frozen=True, slots=True)
class _TrackedPublication:
    store: ArtifactStore
    storage_key: str
    cleanup_error_factory: PublicationCleanupErrorFactory


def track_artifact_publication(
    session: Session,
    *,
    store: ArtifactStore,
    storage_key: str,
    cleanup_error_factory: PublicationCleanupErrorFactory,
) -> None:
    """Delete a newly published object if the owning DB transaction rolls back.

    Artifact stores publish before the MediaArtifact row can be committed. This
    session-local tracker closes that ordinary rollback window without making
    the store implementation transaction-aware.
    """

    tracker = _tracker(session)
    if not bool(session.info.get(_LISTENERS_KEY)):
        _install_session_listeners(session)
        session.info[_LISTENERS_KEY] = True
    tracker.append(
        _TrackedPublication(
            store=store,
            storage_key=storage_key,
            cleanup_error_factory=cleanup_error_factory,
        )
    )


def forget_artifact_publications(
    session: Session,
    *,
    storage_keys: Iterable[str],
) -> None:
    forgotten = {str(storage_key) for storage_key in storage_keys}
    if not forgotten:
        return
    session.info[_TRACKER_KEY] = [
        item for item in _tracker(session) if item.storage_key not in forgotten
    ]


def tracked_artifact_storage_keys(session: Session) -> tuple[str, ...]:
    return tuple(item.storage_key for item in _tracker(session))


def _tracker(session: Session) -> list[_TrackedPublication]:
    value = session.info.setdefault(_TRACKER_KEY, [])
    assert isinstance(value, list)
    return value


def _install_session_listeners(session: Session) -> None:
    event.listen(session, "before_commit", _before_commit)
    event.listen(session, "after_commit", _after_commit)
    event.listen(session, "after_rollback", _after_rollback)
    event.listen(session, "after_transaction_end", _after_transaction_end)


def _before_commit(session: Session) -> None:
    if not session.in_nested_transaction():
        session.info[_OUTCOME_KEY] = "committing"


def _after_commit(session: Session) -> None:
    if not session.in_nested_transaction():
        session.info[_OUTCOME_KEY] = "committed"


def _after_rollback(session: Session) -> None:
    if not session.in_nested_transaction():
        session.info[_OUTCOME_KEY] = "rolled_back"


def _after_transaction_end(
    session: Session,
    transaction: SessionTransaction,
) -> None:
    if transaction.parent is not None:
        return

    publications = tuple(_tracker(session))
    if not publications:
        session.info.pop(_OUTCOME_KEY, None)
        return
    outcome = str(session.info.pop(_OUTCOME_KEY, ""))
    if outcome == "committed":
        session.info[_TRACKER_KEY] = []
        return
    if outcome == "committing":
        # No after_commit/after_rollback signal means the database outcome is
        # itself uncertain. Deleting here could break rows that did commit.
        session.info[_COMMIT_UNCERTAIN_KEY] = tuple(
            item.storage_key for item in publications
        )
        _LOGGER.critical(
            "artifact publication commit outcome is uncertain; orphan reconciliation required",
            extra={"artifact_count": len(publications)},
        )
        return

    failed: list[_TrackedPublication] = []
    deleted: list[str] = []
    for publication in publications:
        try:
            publication.store.delete(publication.storage_key)
            deleted.append(publication.storage_key)
        except Exception:
            failed.append(publication)
    forget_artifact_publications(session, storage_keys=deleted)
    if failed:
        _LOGGER.critical(
            "artifact rollback cleanup is uncertain",
            extra={"artifact_count": len(failed)},
        )
        storage_keys = tuple(item.storage_key for item in failed)
        raise failed[0].cleanup_error_factory(storage_keys)
