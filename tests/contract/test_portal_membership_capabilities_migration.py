from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = (
    ROOT
    / "migrations/versions/20260727_0071_portal_membership_capabilities.py"
)
LEGACY_FULL_ACTIONS = [
    "view_sites",
    "view_usage",
    "view_billing",
    "view_audit",
    "provision_sites",
    "remove_sites",
]


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "portal_membership_capabilities_migration",
        MIGRATION_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_0071_backfills_only_legacy_full_access_memberships() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    metadata = sa.MetaData()
    memberships = sa.Table(
        "account_user_memberships",
        metadata,
        sa.Column("membership_id", sa.String(length=191), primary_key=True),
        sa.Column("allowed_actions_json", sa.JSON(), nullable=False),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            memberships.insert(),
            [
                {
                    "membership_id": "aum_full",
                    "allowed_actions_json": LEGACY_FULL_ACTIONS,
                },
                {
                    "membership_id": "aum_full_custom",
                    "allowed_actions_json": [*LEGACY_FULL_ACTIONS, "custom_action"],
                },
                {
                    "membership_id": "aum_billing_read_only",
                    "allowed_actions_json": ["view_billing"],
                },
                {
                    "membership_id": "aum_site_only",
                    "allowed_actions_json": ["view_sites", "remove_sites"],
                },
            ],
        )
        migration = _load_migration()
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.upgrade()

        rows = {
            str(row["membership_id"]): list(row["allowed_actions_json"])
            for row in connection.execute(sa.select(memberships)).mappings()
        }
        assert rows["aum_full"].count("manage_billing") == 1
        assert rows["aum_full_custom"].count("manage_billing") == 1
        assert rows["aum_billing_read_only"] == ["view_billing"]
        assert rows["aum_site_only"] == ["view_sites", "remove_sites"]

        migration.downgrade()
        downgraded = {
            str(row["membership_id"]): list(row["allowed_actions_json"])
            for row in connection.execute(sa.select(memberships)).mappings()
        }
        assert downgraded["aum_full"] == LEGACY_FULL_ACTIONS
        assert downgraded["aum_full_custom"] == [
            *LEGACY_FULL_ACTIONS,
            "custom_action",
        ]

    engine.dispose()
