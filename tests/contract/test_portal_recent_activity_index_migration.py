from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.engine import Engine


def assert_activity_index_round_trip(engine: Engine) -> None:
    path = Path(__file__).resolve().parents[2] / (
        "migrations/versions/20261008_0085_portal_recent_activity_index.py"
    )
    spec = importlib.util.spec_from_file_location("portal_activity_index_0085", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    cleanup_path = path.with_name("20261008_0086_portal_activity_redundant_index.py")
    cleanup_spec = importlib.util.spec_from_file_location("portal_activity_index_0086", cleanup_path)
    assert cleanup_spec is not None and cleanup_spec.loader is not None
    cleanup = importlib.util.module_from_spec(cleanup_spec)
    cleanup_spec.loader.exec_module(cleanup)
    subject_path = path.with_name("20261008_0087_portal_activity_subject_indexes.py")
    subject_spec = importlib.util.spec_from_file_location("portal_activity_index_0087", subject_path)
    assert subject_spec is not None and subject_spec.loader is not None
    subjects = importlib.util.module_from_spec(subject_spec)
    subject_spec.loader.exec_module(subjects)
    metadata = sa.MetaData()
    events = sa.Table(
        "service_audit_events", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("account_id", sa.String(191)),
        sa.Column("site_id", sa.String(191)),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    with engine.connect() as connection:
        metadata.create_all(connection)
        connection.execute(events.insert(), {"id": 1})
        connection.commit()
        migration.op = Operations(MigrationContext.configure(connection))
        cleanup.op = migration.op
        subjects.op = migration.op
        migration.upgrade()
        cleanup.upgrade()
        subjects.upgrade()
        indexes = sa.inspect(connection).get_indexes("service_audit_events")
        assert "ix_service_audit_events_created_at" not in {item["name"] for item in indexes}
        assert any(
            item["name"] == "ix_service_audit_events_recent"
            and item["column_names"] == ["created_at", "id"] for item in indexes
        )
        assert {item["name"] for item in indexes} == {
            "ix_service_audit_events_recent", "ix_service_audit_events_site_recent",
            "ix_service_audit_events_account_recent",
        }
        connection.commit()
        subjects.downgrade()
        cleanup.downgrade()
        migration.downgrade()
        assert "ix_service_audit_events_recent" not in {
            item["name"] for item in sa.inspect(connection).get_indexes("service_audit_events")
        }
        assert "ix_service_audit_events_created_at" in {
            item["name"] for item in sa.inspect(connection).get_indexes("service_audit_events")
        }
        assert connection.scalar(sa.select(sa.func.count()).select_from(events)) == 1


def test_activity_index_sqlite_round_trip() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    try:
        assert_activity_index_round_trip(engine)
    finally:
        engine.dispose()
