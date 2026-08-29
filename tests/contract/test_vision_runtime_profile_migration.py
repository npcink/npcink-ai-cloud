from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT
    / "migrations/versions/20260828_0082_consolidate_vision_runtime_profile.py"
)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "consolidate_vision_runtime_profile_0082",
        MIGRATION,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _tables(engine: sa.Engine) -> tuple[sa.Table, sa.Table, sa.Table]:
    metadata = sa.MetaData()
    profiles = sa.Table(
        "routing_profiles",
        metadata,
        sa.Column("profile_id", sa.String(64), primary_key=True),
        sa.Column("execution_kind", sa.String(32), nullable=False),
        sa.Column("default_policy_json", sa.JSON),
    )
    bindings = sa.Table(
        "routing_bindings",
        metadata,
        sa.Column("profile_id", sa.String(64), primary_key=True),
        sa.Column("candidate_instance_ids", sa.JSON),
        sa.Column("selection_policy_json", sa.JSON),
        sa.Column("revision", sa.String(64), nullable=False),
    )
    connections = sa.Table(
        "provider_connections",
        metadata,
        sa.Column("connection_id", sa.String(64), primary_key=True),
        sa.Column("config_json", sa.JSON),
    )
    metadata.create_all(engine)
    return profiles, bindings, connections


def test_0082_moves_legacy_vision_configuration_to_canonical_profile() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    profiles, bindings, connections = _tables(engine)
    migration = _load()

    with engine.begin() as connection:
        connection.execute(
            profiles.insert(),
            [
                {
                    "profile_id": "vision.ai",
                    "execution_kind": "vision",
                    "default_policy_json": {"timeout_ms": 30000},
                },
                {
                    "profile_id": "wp-ai.alt-text-vision",
                    "execution_kind": "vision",
                    "default_policy_json": {
                        "timeout_ms": 45000,
                        "allow_fallback": True,
                        "max_retries": 1,
                    },
                },
            ],
        )
        connection.execute(
            bindings.insert(),
            [
                {
                    "profile_id": "vision.ai",
                    "candidate_instance_ids": [],
                    "selection_policy_json": {"strategy": "ordered"},
                    "revision": "catalog-seed",
                },
                {
                    "profile_id": "wp-ai.alt-text-vision",
                    "candidate_instance_ids": ["vision.primary", "vision.fallback"],
                    "selection_policy_json": {
                        "strategy": "ordered",
                        "operator_note": "keep this note",
                    },
                    "revision": "runtime-profiles-admin-legacy",
                },
            ],
        )
        connection.execute(
            connections.insert(),
            {
                "connection_id": "provider_one",
                "config_json": {
                    "runtime_profile_ids": [
                        "vision.ai",
                        "wp-ai.alt-text-vision",
                        "text.ai",
                    ]
                },
            },
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        profile_rows = connection.execute(sa.select(profiles)).mappings().all()
        binding_rows = connection.execute(sa.select(bindings)).mappings().all()
        canonical_profile = next(
            row for row in profile_rows if row["profile_id"] == "vision.ai"
        )
        canonical_binding = next(
            row for row in binding_rows if row["profile_id"] == "vision.ai"
        )
        provider = connection.execute(sa.select(connections)).mappings().one()

    assert [row["profile_id"] for row in profile_rows] == ["vision.ai"]
    assert [row["profile_id"] for row in binding_rows] == ["vision.ai"]
    assert canonical_profile["default_policy_json"]["timeout_ms"] == 45000
    assert canonical_profile["default_policy_json"]["max_retries"] == 1
    assert canonical_binding["candidate_instance_ids"] == [
        "vision.primary",
        "vision.fallback",
    ]
    assert canonical_binding["selection_policy_json"]["operator_note"] == "keep this note"
    assert provider["config_json"]["runtime_profile_ids"] == ["vision.ai", "text.ai"]


def test_0082_keeps_existing_admin_managed_canonical_profile() -> None:
    engine = sa.create_engine("sqlite+pysqlite:///:memory:")
    profiles, bindings, _connections = _tables(engine)
    migration = _load()

    with engine.begin() as connection:
        connection.execute(
            profiles.insert(),
            [
                {
                    "profile_id": "vision.ai",
                    "execution_kind": "vision",
                    "default_policy_json": {"timeout_ms": 55000},
                },
                {
                    "profile_id": "wp-ai.alt-text-vision",
                    "execution_kind": "vision",
                    "default_policy_json": {"timeout_ms": 45000},
                },
            ],
        )
        connection.execute(
            bindings.insert(),
            [
                {
                    "profile_id": "vision.ai",
                    "candidate_instance_ids": ["canonical.primary"],
                    "selection_policy_json": {"strategy": "ordered"},
                    "revision": "runtime-profiles-admin-canonical",
                },
                {
                    "profile_id": "wp-ai.alt-text-vision",
                    "candidate_instance_ids": ["legacy.primary"],
                    "selection_policy_json": {"strategy": "ordered"},
                    "revision": "runtime-profiles-admin-legacy",
                },
            ],
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        canonical_profile = connection.execute(
            sa.select(profiles).where(profiles.c.profile_id == "vision.ai")
        ).mappings().one()
        canonical_binding = connection.execute(
            sa.select(bindings).where(bindings.c.profile_id == "vision.ai")
        ).mappings().one()
        legacy_count = connection.scalar(
            sa.select(sa.func.count())
            .select_from(profiles)
            .where(profiles.c.profile_id == "wp-ai.alt-text-vision")
        )

    assert canonical_profile["default_policy_json"]["timeout_ms"] == 55000
    assert canonical_binding["candidate_instance_ids"] == ["canonical.primary"]
    assert legacy_count == 0
