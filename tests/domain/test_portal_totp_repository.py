"""Dormant state/storage checks; SQLite is not row-lock or migration proof."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.repositories.portal_totp_repository import PortalTotpRepository
from app.core.models import (
    PortalAuthChallenge,
    PortalRecoveryCode,
    PortalSession,
    PortalTotpFactor,
    Principal,
)

NOW = datetime(2026, 10, 24, tzinfo=UTC)


@pytest.fixture
def engine():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    for model in (
        Principal,
        PortalSession,
        PortalTotpFactor,
        PortalRecoveryCode,
        PortalAuthChallenge,
    ):
        model.__table__.create(engine)
    with Session(engine) as session:
        session.add_all(
            [Principal(principal_id=p, email=p + "@example.test") for p in ("own", "peer")]
        )
        session.commit()
    yield engine
    engine.dispose()


def factor(**overrides):
    data = dict(
        principal_id="own",
        factor_version=1,
        state="disabled",
        recovery_generation=0,
        created_at=NOW,
        updated_at=NOW,
    )
    data.update(overrides)
    return PortalTotpFactor(**data)


def challenge(**overrides):
    data = dict(
        challenge_id="challenge",
        principal_id="own",
        credential_hash="synthetic-hash",
        purpose="login",
        primary_method="email_code",
        primary_authenticated_at=NOW,
        bound_session_version=1,
        bound_factor_version=0,
        bound_recovery_generation=0,
        created_at=NOW,
        expires_at=NOW + timedelta(minutes=5),
        attempt_count=0,
        attempt_limit=5,
    )
    data.update(overrides)
    return PortalAuthChallenge(**data)


def test_create_rollback_unique_and_owned_refresh(engine):
    with Session(engine) as session:
        repo = PortalTotpRepository(session)
        repo.create_disabled_factor(principal_id="own", factor_version=2, now=NOW)
        session.rollback()
    with Session(engine) as session:
        assert session.get(PortalTotpFactor, "own") is None
        session.expire_on_commit = False
        repo = PortalTotpRepository(session)
        row = repo.create_disabled_factor(principal_id="own", factor_version=2, now=NOW)
        session.commit()
        session.connection().execute(PortalTotpFactor.__table__.update().values(factor_version=3))
        assert row.factor_version == 2
        assert repo.lock_factor(principal_id="own").factor_version == 3
        assert repo.lock_factor(principal_id="peer") is None
        session.rollback()
        session.expunge_all()
        with pytest.raises(IntegrityError):
            repo.create_disabled_factor(principal_id="own", factor_version=1, now=NOW)
        session.rollback()
        assert session.get(PortalTotpFactor, "own").factor_version == 2


def test_recovery_and_challenge_ownership_no_consumption(engine):
    with Session(engine) as session:
        session.add(
            PortalRecoveryCode(
                code_id="code",
                principal_id="own",
                factor_version=1,
                generation=1,
                code_hash="synthetic-salted-hash",
                created_at=NOW,
            )
        )
        session.add(challenge())
        session.commit()
    with Session(engine) as session:
        repo = PortalTotpRepository(session)
        assert repo.lock_recovery_owned(principal_id="peer", code_id="code") is None
        assert repo.lock_challenge_owned(principal_id="peer", challenge_id="challenge") is None
        assert repo.lock_recovery_owned(principal_id="own", code_id="code").consumed_at is None
        assert (
            repo.lock_challenge_owned(principal_id="own", challenge_id="challenge").attempt_count
            == 0
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"factor_version": 0},
        {"state": "enabled"},
        {"state": "invalid"},
        {"last_accepted_counter": -1},
        {"last_accepted_counter": 0},
        {"pending_setup_id": "setup"},
        {"recovery_generation": -1},
        {
            "state": "enabled",
            "active_seed_ciphertext": "",
            "enabled_at": NOW,
            "recovery_generation": 1,
        },
    ],
)
def test_factor_constraints(engine, overrides):
    with Session(engine) as session:
        session.add(factor(**overrides))
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


@pytest.mark.parametrize(
    "overrides",
    [
        {"purpose": "admin"},
        {"attempt_count": 6},
        {"attempt_limit": 0},
        {"expires_at": NOW},
        {"bound_factor_version": -1},
        {"credential_hash": ""},
        {"purpose": "disable"},
        {"bound_session_id": "sid"},
        {"consumed_at": NOW - timedelta(seconds=1)},
    ],
)
def test_challenge_constraints(engine, overrides):
    with Session(engine) as session:
        session.add(challenge(**overrides))
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


@pytest.mark.parametrize(
    "evidence,valid",
    [
        ({}, True),
        ({"primary_authenticated_at": NOW}, True),
        ({"factor_version": 1}, False),
        ({"second_factor_method": "totp"}, False),
        (
            {
                "primary_authenticated_at": NOW,
                "second_factor_verified_at": NOW,
                "second_factor_method": "totp",
            },
            False,
        ),
        (
            {
                "factor_version": 1,
                "primary_authenticated_at": NOW,
                "second_factor_verified_at": NOW,
            },
            False,
        ),
        (
            {
                "factor_version": 1,
                "primary_authenticated_at": NOW,
                "second_factor_verified_at": NOW,
                "second_factor_method": "totp",
            },
            True,
        ),
        (
            {
                "factor_version": 1,
                "primary_authenticated_at": NOW,
                "second_factor_verified_at": NOW - timedelta(seconds=1),
                "second_factor_method": "totp",
            },
            False,
        ),
    ],
)
def test_session_evidence_shapes(engine, evidence, valid):
    with Session(engine) as session:
        row = PortalSession(
            session_id="sid",
            principal_id="own",
            session_version=1,
            created_at=NOW,
            absolute_expires_at=NOW + timedelta(hours=1),
            auth_method="email_code",
            **evidence,
        )
        session.add(row)
        if valid:
            session.commit()
        else:
            with pytest.raises(IntegrityError):
                session.flush()
            session.rollback()


def test_additive_sqlite_migration_and_downgrade_preserve_old_session(tmp_path):
    """Executes actual migration bodies locally; PostgreSQL proof remains separate."""
    import runpy
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import MetaData, Table, inspect, select

    engine = create_engine("sqlite://")
    Principal.__table__.create(engine)
    migration_dir = Path(__file__).resolve().parents[2] / "migrations/versions"
    previous = runpy.run_path(str(migration_dir / "20261024_0090_portal_sessions.py"))
    current = runpy.run_path(str(migration_dir / "20261024_0091_portal_totp_storage.py"))
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            previous["upgrade"]()
        connection.execute(
            Principal.__table__.insert().values(
                principal_id="migration",
                email="migration@example.test",
                status="active",
                session_version=1,
            )
        )
        old = Table("portal_sessions", MetaData(), autoload_with=connection)
        connection.execute(
            old.insert().values(
                session_id="preserved",
                principal_id="migration",
                session_version=1,
                created_at=NOW,
                absolute_expires_at=NOW + timedelta(hours=1),
                auth_method="email_code",
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            current["upgrade"]()
        row = connection.execute(select(PortalSession.__table__)).one()
        assert row.factor_version is None and row.primary_authenticated_at is None
        assert row.second_factor_method is None and row.session_id == "preserved"
        connection.execute(PortalSession.__table__.update().values(primary_authenticated_at=NOW))
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="unused session evidence"):
                current["downgrade"]()
        connection.execute(PortalSession.__table__.update().values(primary_authenticated_at=None))
        connection.execute(
            PortalTotpFactor.__table__.insert().values(
                principal_id="migration",
                factor_version=1,
                state="disabled",
                recovery_generation=0,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="empty dormant storage"):
                current["downgrade"]()
        connection.execute(PortalTotpFactor.__table__.delete())
        with Operations.context(MigrationContext.configure(connection)):
            current["downgrade"]()
        restored = Table("portal_sessions", MetaData(), autoload_with=connection)
        assert "factor_version" not in restored.c
        assert connection.execute(select(restored.c.session_id)).scalar_one() == "preserved"
        assert "portal_totp_factors" not in inspect(connection).get_table_names()
    engine.dispose()
