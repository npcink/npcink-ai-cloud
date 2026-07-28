from __future__ import annotations

import importlib.util
from datetime import datetime
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT
    / "migrations/versions/20260727_0072_principal_site_ownership.py"
)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "principal_site_ownership_0072",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_legacy_schema(engine: sa.Engine) -> None:
    metadata = sa.MetaData()
    sa.Table(
        "accounts",
        metadata,
        sa.Column("account_id", sa.String(191), primary_key=True),
    )
    sa.Table(
        "principals",
        metadata,
        sa.Column("principal_id", sa.String(191), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False),
    )
    sa.Table(
        "sites",
        metadata,
        sa.Column("site_id", sa.String(191), primary_key=True),
        sa.Column("account_id", sa.String(191)),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("ownership_released_at", sa.DateTime(timezone=True)),
        sa.Column("provisioned_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    sa.Table(
        "account_user_memberships",
        metadata,
        sa.Column("membership_id", sa.String(191), primary_key=True),
        sa.Column(
            "principal_id",
            sa.String(191),
            sa.ForeignKey("principals.principal_id"),
            nullable=False,
        ),
        sa.Column("account_id", sa.String(191), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
    )
    sa.Table(
        "platform_admin_grants",
        metadata,
        sa.Column("grant_id", sa.String(191), primary_key=True),
        sa.Column(
            "principal_id",
            sa.String(191),
            sa.ForeignKey("principals.principal_id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(64), nullable=False),
    )
    metadata.create_all(engine)


def test_0072_leaves_all_existing_sites_unbound() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    _create_legacy_schema(engine)
    migration = _load()
    created_at = datetime.fromisoformat("2026-07-01T08:30:00+00:00")

    with engine.begin() as connection:
        metadata = sa.MetaData()
        accounts = sa.Table("accounts", metadata, autoload_with=connection)
        principals = sa.Table("principals", metadata, autoload_with=connection)
        sites = sa.Table("sites", metadata, autoload_with=connection)
        memberships = sa.Table(
            "account_user_memberships",
            metadata,
            autoload_with=connection,
        )
        admin_grants = sa.Table(
            "platform_admin_grants",
            metadata,
            autoload_with=connection,
        )
        connection.execute(
            accounts.insert(),
            [
                {"account_id": "acct_single"},
                {"account_id": "acct_multi"},
            ],
        )
        connection.execute(
            principals.insert(),
            [
                {"principal_id": "prn_single", "status": "active"},
                {"principal_id": "prn_multi_a", "status": "active"},
                {"principal_id": "prn_multi_b", "status": "active"},
                {"principal_id": "prn_admin", "status": "active"},
            ],
        )
        connection.execute(
            memberships.insert(),
            [
                {
                    "membership_id": "aum_single",
                    "principal_id": "prn_single",
                    "account_id": "acct_single",
                    "status": "active",
                },
                {
                    "membership_id": "aum_multi_a",
                    "principal_id": "prn_multi_a",
                    "account_id": "acct_multi",
                    "status": "active",
                },
                {
                    "membership_id": "aum_multi_b",
                    "principal_id": "prn_multi_b",
                    "account_id": "acct_multi",
                    "status": "active",
                },
            ],
        )
        connection.execute(
            sites.insert(),
            [
                {
                    "site_id": "site_single",
                    "account_id": "acct_single",
                    "status": "active",
                    "created_at": created_at,
                },
                {
                    "site_id": "site_multi",
                    "account_id": "acct_multi",
                    "status": "active",
                    "created_at": created_at,
                },
            ],
        )
        connection.execute(
            admin_grants.insert(),
            {
                "grant_id": "pad_admin",
                "principal_id": "prn_admin",
                "role": "platform_admin",
            },
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        bindings = sa.Table(
            "principal_site_bindings",
            sa.MetaData(),
            autoload_with=connection,
        )
        rows = connection.execute(sa.select(bindings)).mappings().all()
        assert rows == []

        connection.execute(
            bindings.insert(),
            {
                "binding_id": "psb_verified",
                "principal_id": "prn_single",
                "site_id": "site_single",
                "account_id": "acct_single",
                "status": "active",
                "bound_at": created_at,
                "metadata_json": {"source": "verified_addon_exchange"},
            },
        )
        with (
            connection.begin_nested(),
            pytest.raises(sa.exc.IntegrityError),
        ):
            connection.execute(
                bindings.insert(),
                {
                    "binding_id": "psb_duplicate",
                    "principal_id": "prn_single",
                    "site_id": "site_single",
                    "account_id": "acct_single",
                    "status": "active",
                    "bound_at": created_at,
                },
            )
        with (
            connection.begin_nested(),
            pytest.raises(sa.exc.IntegrityError),
        ):
            connection.execute(
                bindings.insert(),
                {
                    "binding_id": "psb_invalid_lifecycle",
                    "principal_id": "prn_multi_a",
                    "site_id": "site_multi",
                    "account_id": "acct_multi",
                    "status": "released",
                    "bound_at": created_at,
                },
            )
        with (
            connection.begin_nested(),
            pytest.raises(sa.exc.IntegrityError),
        ):
            connection.execute(
                admin_grants.insert(),
                {
                    "grant_id": "pad_invalid",
                    "principal_id": "prn_admin",
                    "role": "operator",
                },
            )

    engine.dispose()


def test_0072_downgrade_removes_only_principal_site_contract() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    _create_legacy_schema(engine)
    migration = _load()

    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.downgrade()

        inspector = sa.inspect(connection)
        assert "principal_site_bindings" not in inspector.get_table_names()
        assert "ck_platform_admin_grants_role" not in {
            str(item.get("name") or "")
            for item in inspector.get_check_constraints("platform_admin_grants")
        }

    engine.dispose()


def test_0072_refuses_noncanonical_existing_platform_admin_roles() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    _create_legacy_schema(engine)
    migration = _load()

    with engine.begin() as connection:
        principals = sa.Table(
            "principals",
            sa.MetaData(),
            autoload_with=connection,
        )
        admin_grants = sa.Table(
            "platform_admin_grants",
            sa.MetaData(),
            autoload_with=connection,
        )
        connection.execute(
            principals.insert(),
            {"principal_id": "prn_invalid_admin", "status": "active"},
        )
        connection.execute(
            admin_grants.insert(),
            {
                "grant_id": "pad_invalid_existing",
                "principal_id": "prn_invalid_admin",
                "role": "operator",
            },
        )
        migration.op = Operations(MigrationContext.configure(connection))

        with pytest.raises(
            RuntimeError,
            match="contains non-canonical roles",
        ):
            migration.upgrade()

        assert "principal_site_bindings" not in sa.inspect(connection).get_table_names()

    engine.dispose()
