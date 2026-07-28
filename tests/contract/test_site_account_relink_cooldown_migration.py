from __future__ import annotations

import importlib.util
from datetime import datetime
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT
    / "migrations/versions/20260726_0069_site_account_relink_cooldown.py"
)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "site_account_relink_cooldown_0069",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_legacy_schema(engine: sa.Engine) -> None:
    metadata = sa.MetaData()
    sa.Table(
        "sites",
        metadata,
        sa.Column("site_id", sa.String(191), primary_key=True),
        sa.Column("account_id", sa.String(191), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("provisioned_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    sa.Table(
        "service_settings",
        metadata,
        sa.Column("setting_id", sa.String(191), primary_key=True),
        sa.Column("setting_kind", sa.String(64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("config_json", sa.JSON()),
        sa.Column("secret_ciphertext_json", sa.JSON()),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("metadata_json", sa.JSON()),
    )
    metadata.create_all(engine)


def test_0069_upgrade_backfills_release_snapshot_and_binding_history() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    _create_legacy_schema(engine)
    migration = _load()
    removed_at = datetime.fromisoformat("2026-07-01T08:30:00+00:00")

    with engine.begin() as connection:
        sites = sa.Table("sites", sa.MetaData(), autoload_with=connection)
        connection.execute(
            sites.insert(),
            [
                {
                    "site_id": "site_active",
                    "account_id": "acct_active",
                    "status": "active",
                    "metadata_json": {},
                    "provisioned_at": datetime.fromisoformat(
                        "2026-06-01T08:30:00+00:00"
                    ),
                    "created_at": datetime.fromisoformat(
                        "2026-06-01T08:30:00+00:00"
                    ),
                    "updated_at": datetime.fromisoformat(
                        "2026-07-02T08:30:00+00:00"
                    ),
                },
                {
                    "site_id": "site_archived",
                    "account_id": "acct_archived",
                    "status": "archived",
                    "metadata_json": {
                        "portal_lifecycle": {
                            "removed_at": removed_at.isoformat(),
                        }
                    },
                    "provisioned_at": datetime.fromisoformat(
                        "2026-05-01T08:30:00+00:00"
                    ),
                    "created_at": datetime.fromisoformat(
                        "2026-05-01T08:30:00+00:00"
                    ),
                    "updated_at": datetime.fromisoformat(
                        "2026-07-03T08:30:00+00:00"
                    ),
                },
            ],
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        refreshed_sites = sa.Table("sites", sa.MetaData(), autoload_with=connection)
        bindings = sa.Table(
            "site_account_bindings",
            sa.MetaData(),
            autoload_with=connection,
        )
        settings = sa.Table(
            "service_settings",
            sa.MetaData(),
            autoload_with=connection,
        )
        archived = connection.execute(
            sa.select(refreshed_sites).where(
                refreshed_sites.c.site_id == "site_archived"
            )
        ).mappings().one()
        active = connection.execute(
            sa.select(refreshed_sites).where(
                refreshed_sites.c.site_id == "site_active"
            )
        ).mappings().one()
        history = {
            str(row["site_id"]): row
            for row in connection.execute(sa.select(bindings)).mappings()
        }
        setting = connection.execute(
            sa.select(settings).where(settings.c.setting_id == "site_relink_policy")
        ).mappings().one()
        current_binding_index = next(
            item
            for item in sa.inspect(connection).get_indexes("site_account_bindings")
            if item["name"] == "uq_site_account_bindings_current_site"
        )

        assert active["ownership_released_at"] is None
        assert active["relink_cooldown_until"] is None
        assert archived["ownership_released_at"] == removed_at.replace(tzinfo=None)
        assert (
            archived["relink_cooldown_until"] - archived["ownership_released_at"]
        ).days == 90
        assert history["site_active"]["status"] == "active"
        assert history["site_active"]["released_at"] is None
        assert history["site_archived"]["status"] == "released"
        assert history["site_archived"]["release_reason"] == "legacy_archived_site"
        assert current_binding_index["unique"] == 1
        assert setting["setting_kind"] == "commercial"
        assert setting["enabled"] is True
        assert setting["config_json"] == {"cooldown_days": 90}

    engine.dispose()


def test_0069_downgrade_removes_only_the_new_contract_surface() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    _create_legacy_schema(engine)
    migration = _load()

    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.downgrade()

        inspector = sa.inspect(connection)
        assert "site_account_bindings" not in inspector.get_table_names()
        assert {
            column["name"] for column in inspector.get_columns("sites")
        }.isdisjoint({"ownership_released_at", "relink_cooldown_until"})
        settings = sa.Table(
            "service_settings",
            sa.MetaData(),
            autoload_with=connection,
        )
        assert (
            connection.scalar(
                sa.select(sa.func.count())
                .select_from(settings)
                .where(settings.c.setting_id == "site_relink_policy")
            )
            == 0
        )

    engine.dispose()
