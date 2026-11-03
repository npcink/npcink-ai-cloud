from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.core.models import CustomerNotificationDispatch


def test_manual_notice_migration_roundtrip_retains_existing_inboxes():
    path = (
        Path(__file__).resolve().parents[2]
        / "migrations/versions/20261103_0092_customer_notifications.py"
    )
    spec = importlib.util.spec_from_file_location("manual_notices_0092", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "20261024_0091"
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE portal_notifications (notification_id TEXT)")
        connection.exec_driver_sql("INSERT INTO portal_notifications VALUES ('retained')")
        module.op = Operations(MigrationContext.configure(connection))
        module.upgrade()
        assert {
            column["name"]
            for column in sa.inspect(connection).get_columns("customer_notification_dispatches")
        } == set(CustomerNotificationDispatch.__table__.columns.keys())
        module.downgrade()
        assert (
            connection.exec_driver_sql("SELECT notification_id FROM portal_notifications").scalar()
            == "retained"
        )
        assert "customer_notification_dispatches" not in sa.inspect(connection).get_table_names()
    engine.dispose()
