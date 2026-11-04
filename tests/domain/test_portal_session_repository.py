"""Storage behavior only: SQLite does not prove migration or row locking."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from app.adapters.repositories.portal_session_repository import PortalSessionRepository
from app.core.models import PortalSession, Principal

NOW = datetime(2026, 10, 24, tzinfo=UTC)


@pytest.fixture
def engine():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Principal.__table__.create(engine)
    PortalSession.__table__.create(engine)
    with Session(engine) as session:
        session.add_all([
            Principal(principal_id="own", email="own@example.test", session_version=2),
            Principal(principal_id="peer", email="peer@example.test"),
        ])
        session.commit()
    yield engine
    engine.dispose()


def _create(repo, sid, **overrides):
    values = dict(
        session_id=sid, principal_id="own", session_version=2, created_at=NOW,
        expires_at=NOW + timedelta(hours=1), auth_method="email_code",
    )
    values.update(overrides)
    return repo.create(**values)


def test_create_participates_in_caller_transaction(engine):
    with Session(engine) as session:
        repo = PortalSessionRepository(session)
        assert repo.lock_principal(principal_id="own").session_version == 2
        assert repo.lock_principal(principal_id="unknown") is None
        _create(repo, "rolled-back")
        session.rollback()
    with Session(engine) as session:
        assert session.get(PortalSession, "rolled-back") is None
        _create(PortalSessionRepository(session), "committed")
        session.commit()
    with Session(engine) as session:
        row = session.get(PortalSession, "committed")
        assert row.principal_id == "own"
        assert row.session_version == 2
        assert row.absolute_expires_at == (NOW + timedelta(hours=1)).replace(tzinfo=None)
        assert row.client_hint is None


def test_active_owned_pagination_filters_versions_expiry_and_revocation(engine):
    with Session(engine) as session:
        repo = PortalSessionRepository(session)
        for sid in ["a", "c", "b"]:
            _create(repo, sid)
        _create(repo, "old-version", session_version=1)
        _create(repo, "expired", created_at=NOW-timedelta(hours=1), expires_at=NOW)
        row = _create(repo, "revoked")
        row.revoked_at, row.revoke_reason = NOW, "logout"
        _create(repo, "peer", principal_id="peer", session_version=1)
        session.commit()
    with Session(engine) as session:
        repo = PortalSessionRepository(session)
        assert [r.session_id for r in repo.list_active(principal_id="own", now=NOW)] == [
            "c", "b", "a"
        ]
        assert [r.session_id for r in repo.list_active(
            principal_id="own", now=NOW, limit=1, offset=1
        )] == ["b"]
        assert repo.get_owned(principal_id="peer", session_id="a") is None
        assert repo.get_owned(principal_id="own", session_id="missing") is None
        assert repo.get_owned(principal_id="own", session_id="revoked").revoke_reason == "logout"
        principal = session.scalar(select(Principal).where(Principal.principal_id == "own"))
        principal.status = "disabled"
        session.flush()
        assert repo.list_active(principal_id="own", now=NOW) == []


@pytest.mark.parametrize("limit,offset", [(0, 0), (51, 0), (1, -1)])
def test_pagination_is_bounded(engine, limit, offset):
    with Session(engine) as session:
        with pytest.raises(ValueError, match="pagination"):
            PortalSessionRepository(session).list_active(
                principal_id="own", now=NOW, limit=limit, offset=offset
            )


def test_owned_lock_refreshes_stale_rows_and_preserves_scope_and_rollback(engine):
    with Session(engine) as session:
        repo = PortalSessionRepository(session)
        _create(repo, "z")
        _create(repo, "a")
        _create(repo, "peer", principal_id="peer", session_version=1)
        session.commit()
    with Session(engine) as session:
        stale = session.get(PortalSession, "a")
        # Bypass the identity map to reproduce cached ORM state in a transaction.
        session.connection().execute(
            PortalSession.__table__.update()
            .where(PortalSession.session_id == "a")
            .values(client_hint="Browser hint")
        )
        assert stale.client_hint is None
        repo = PortalSessionRepository(session)
        rows = repo.lock_owned_rows(principal_id="own", session_ids=["z", "peer", "a"])
        assert [row.session_id for row in rows] == ["a", "z"]
        assert stale.client_hint == "Browser hint"
        assert repo.count_active(principal_id="own", now=NOW) == 2
        rows[0].revoked_at, rows[0].revoke_reason = NOW, "self_revoke"
        session.flush()
        assert repo.count_active(principal_id="own", now=NOW) == 1
        session.rollback()
    with Session(engine) as session:
        assert session.get(PortalSession, "a").revoked_at is None
        assert session.get(PortalSession, "a").client_hint is None
