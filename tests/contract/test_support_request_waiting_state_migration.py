from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "migrations/versions/20260801_0078_support_request_waiting_state.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "support_request_waiting_state_0078",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_0078_backfills_waiting_state_from_public_activity_and_round_trips() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    migration = _load()
    metadata = sa.MetaData()
    requests = sa.Table(
        "support_requests",
        metadata,
        sa.Column("request_id", sa.String(191), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    messages = sa.Table(
        "support_request_messages",
        metadata,
        sa.Column("message_id", sa.String(191), primary_key=True),
        sa.Column("request_id", sa.String(191), nullable=False),
        sa.Column("author_kind", sa.String(32), nullable=False),
        sa.Column("visibility", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    attachments = sa.Table(
        "support_request_attachments",
        metadata,
        sa.Column("attachment_id", sa.String(191), primary_key=True),
        sa.Column("request_id", sa.String(191), nullable=False),
        sa.Column("uploader_kind", sa.String(32), nullable=False),
        sa.Column("visibility", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    now = datetime(2026, 8, 1, 8, 0, tzinfo=UTC)

    with engine.begin() as connection:
        metadata.create_all(connection)
        connection.execute(
            requests.insert(),
            [
                {
                    "request_id": "sr_wait_customer",
                    "status": "in_progress",
                    "created_at": now - timedelta(days=2),
                    "updated_at": now,
                },
                {
                    "request_id": "sr_wait_operator",
                    "status": "in_progress",
                    "created_at": now - timedelta(days=3),
                    "updated_at": now,
                },
                {
                    "request_id": "sr_complete",
                    "status": "resolved",
                    "created_at": now - timedelta(days=4),
                    "updated_at": now,
                },
            ],
        )
        connection.execute(
            messages.insert(),
            [
                {
                    "message_id": "m_customer_1",
                    "request_id": "sr_wait_customer",
                    "author_kind": "customer",
                    "visibility": "public",
                    "created_at": now - timedelta(hours=8),
                },
                {
                    "message_id": "m_operator_1",
                    "request_id": "sr_wait_customer",
                    "author_kind": "operator",
                    "visibility": "public",
                    "created_at": now - timedelta(hours=4),
                },
                {
                    "message_id": "m_operator_2",
                    "request_id": "sr_wait_operator",
                    "author_kind": "operator",
                    "visibility": "public",
                    "created_at": now - timedelta(hours=9),
                },
                {
                    "message_id": "m_customer_2",
                    "request_id": "sr_wait_operator",
                    "author_kind": "customer",
                    "visibility": "public",
                    "created_at": now - timedelta(hours=2),
                },
                {
                    "message_id": "m_internal",
                    "request_id": "sr_wait_operator",
                    "author_kind": "operator",
                    "visibility": "internal",
                    "created_at": now - timedelta(hours=1),
                },
            ],
        )
        connection.execute(
            attachments.insert(),
            [
                {
                    "attachment_id": "a_customer_latest",
                    "request_id": "sr_wait_customer",
                    "uploader_kind": "customer",
                    "visibility": "public",
                    "created_at": now - timedelta(hours=1),
                },
                {
                    "attachment_id": "a_internal_ignored",
                    "request_id": "sr_wait_operator",
                    "uploader_kind": "operator",
                    "visibility": "internal",
                    "created_at": now,
                },
            ],
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        migrated = sa.Table("support_requests", sa.MetaData(), autoload_with=connection)
        rows = {
            row["request_id"]: row for row in connection.execute(sa.select(migrated)).mappings()
        }
        assert rows["sr_wait_customer"]["waiting_on"] == "operator"
        assert rows["sr_wait_customer"]["first_operator_response_at"].replace(
            tzinfo=UTC
        ) == now - timedelta(hours=4)
        assert rows["sr_wait_customer"]["waiting_since"].replace(tzinfo=UTC) == now - timedelta(
            hours=1
        )
        assert rows["sr_wait_operator"]["waiting_on"] == "operator"
        assert rows["sr_wait_operator"]["waiting_since"].replace(tzinfo=UTC) == now - timedelta(
            hours=2
        )
        assert rows["sr_complete"]["waiting_on"] == "none"
        assert rows["sr_complete"]["waiting_since"] is None

        check_constraints = {
            constraint["name"]
            for constraint in sa.inspect(connection).get_check_constraints("support_requests")
        }
        assert "ck_support_requests_waiting_on" in check_constraints

        migration.downgrade()
        remaining_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("support_requests")
        }
        assert "waiting_on" not in remaining_columns
        assert "waiting_since" not in remaining_columns
