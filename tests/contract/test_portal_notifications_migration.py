from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.core.models import PortalNotification

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "migrations/versions/20261023_0089_portal_notifications.py"
TABLE_NAME = "portal_notifications"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "portal_notifications_0089",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_0089_portal_notifications_round_trip_is_idempotent_and_account_scoped() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    migration = _load()
    parent_metadata = sa.MetaData()
    accounts = sa.Table(
        "accounts",
        parent_metadata,
        sa.Column("account_id", sa.String(191), primary_key=True),
    )
    principals = sa.Table(
        "principals",
        parent_metadata,
        sa.Column("principal_id", sa.String(191), primary_key=True),
    )

    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        parent_metadata.create_all(connection)
        connection.execute(accounts.insert(), {"account_id": "acc_alpha"})
        connection.execute(principals.insert(), {"principal_id": "prn_alpha"})
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        inspector = sa.inspect(connection)
        assert TABLE_NAME in inspector.get_table_names()
        assert {
            "notification_id",
            "account_id",
            "principal_id",
            "event_type",
            "title",
            "body",
            "link_href",
            "is_read",
            "created_at",
            "read_at",
        } == {column["name"] for column in inspector.get_columns(TABLE_NAME)}

        foreign_keys = {
            str(key["referred_table"]): tuple(key["referred_columns"])
            for key in inspector.get_foreign_keys(TABLE_NAME)
        }
        assert foreign_keys == {
            "accounts": ("account_id",),
            "principals": ("principal_id",),
        }

        indexes = {
            str(index["name"]): list(index["column_names"])
            for index in inspector.get_indexes(TABLE_NAME)
        }
        assert set(indexes) == {index.name for index in PortalNotification.__table__.indexes}
        assert indexes["ix_portal_notifications_account_created"] == [
            "account_id",
            "created_at",
        ]
        assert indexes["ix_portal_notifications_account_unread"] == [
            "account_id",
            "is_read",
            "created_at",
        ]

        notifications = sa.Table(TABLE_NAME, sa.MetaData(), autoload_with=connection)
        connection.execute(
            notifications.insert(),
            {
                "notification_id": "pnotif_alpha",
                "account_id": "acc_alpha",
                "principal_id": "prn_alpha",
                "event_type": "support_request_replied",
                "title": "Ticket reply",
                "body": None,
                "link_href": None,
                "is_read": False,
            },
        )

        with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
            connection.execute(
                notifications.insert(),
                {
                    "notification_id": "pnotif_unknown_account",
                    "account_id": "acc_missing",
                    "principal_id": None,
                    "event_type": "support_request_replied",
                    "title": "Ticket reply",
                    "body": None,
                    "link_href": None,
                    "is_read": False,
                },
            )

        # A second upgrade must be a no-op instead of failing on the existing table.
        migration.upgrade()
        assert TABLE_NAME in sa.inspect(connection).get_table_names()

        migration.downgrade()
        assert TABLE_NAME not in sa.inspect(connection).get_table_names()

    engine.dispose()
