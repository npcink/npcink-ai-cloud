from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = ROOT / "migrations/versions/20260726_0070_portal_auth_hardening.py"


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("portal_auth_hardening_migration", MIGRATION_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_0070_reconciles_legacy_pending_codes_before_creating_unique_scope() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    metadata = sa.MetaData()
    codes = sa.Table(
        "portal_login_codes",
        metadata,
        sa.Column("code_id", sa.String(length=191), primary_key=True),
        sa.Column("email", sa.String(length=191), nullable=False),
        sa.Column("principal_id", sa.String(length=191), nullable=False),
        sa.Column("code_hash", sa.String(length=191), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    metadata.create_all(engine)
    now = datetime.now(UTC)
    with engine.begin() as connection:
        connection.execute(
            codes.insert(),
            [
                {
                    "code_id": "plc_old",
                    "email": "duplicate@example.com",
                    "principal_id": "prn_old",
                    "code_hash": "old",
                    "status": "pending",
                    "expires_at": now + timedelta(minutes=5),
                    "consumed_at": None,
                    "attempt_count": 0,
                    "metadata_json": {"purpose": "portal_registration"},
                    "created_at": now - timedelta(minutes=1),
                    "updated_at": now - timedelta(minutes=1),
                },
                {
                    "code_id": "plc_new",
                    "email": "duplicate@example.com",
                    "principal_id": "prn_new",
                    "code_hash": "new",
                    "status": "pending",
                    "expires_at": now + timedelta(minutes=5),
                    "consumed_at": None,
                    "attempt_count": 0,
                    "metadata_json": {"purpose": "portal_registration"},
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "code_id": "plc_expired",
                    "email": "expired@example.com",
                    "principal_id": "prn_expired",
                    "code_hash": "expired",
                    "status": "pending",
                    "expires_at": now - timedelta(minutes=1),
                    "consumed_at": None,
                    "attempt_count": 0,
                    "metadata_json": {"purpose": "portal_login"},
                    "created_at": now,
                    "updated_at": now,
                },
            ],
        )
        migration = _load_migration()
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        reflected = sa.Table("portal_login_codes", sa.MetaData(), autoload_with=connection)
        rows = {
            str(row.code_id): row for row in connection.execute(sa.select(reflected)).mappings()
        }
        assert rows["plc_old"].status == "expired"
        assert rows["plc_old"].consumed_at is not None
        assert rows["plc_new"].status == "pending"
        assert rows["plc_expired"].status == "expired"
        assert rows["plc_expired"].consumed_at is not None

        nested = connection.begin_nested()
        try:
            with pytest.raises(IntegrityError):
                connection.execute(
                    reflected.insert().values(
                        code_id="plc_conflict",
                        email="duplicate@example.com",
                        principal_id="prn_conflict",
                        code_hash="conflict",
                        purpose="portal_registration",
                        status="pending",
                        expires_at=now + timedelta(minutes=5),
                        consumed_at=None,
                        attempt_count=0,
                        metadata_json={},
                        created_at=now,
                        updated_at=now,
                    )
                )
        finally:
            nested.rollback()

        migration.downgrade()
        downgraded_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("portal_login_codes")
        }
        assert "purpose" not in downgraded_columns
