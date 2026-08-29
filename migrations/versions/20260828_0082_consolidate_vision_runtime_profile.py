"""consolidate the WordPress vision runtime profile

Revision ID: 20260828_0082
Revises: 20260827_0081
Create Date: 2026-08-28 00:00:00.000000
"""

from __future__ import annotations

from typing import Any

import sqlalchemy as sa
from alembic import op

revision = "20260828_0082"
down_revision = "20260827_0081"
branch_labels = None
depends_on = None

CANONICAL_PROFILE_ID = "vision.ai"
LEGACY_PROFILE_ID = "wp-ai.alt-text-vision"

routing_profiles = sa.table(
    "routing_profiles",
    sa.column("profile_id", sa.String),
    sa.column("execution_kind", sa.String),
    sa.column("default_policy_json", sa.JSON),
)
routing_bindings = sa.table(
    "routing_bindings",
    sa.column("profile_id", sa.String),
    sa.column("candidate_instance_ids", sa.JSON),
    sa.column("selection_policy_json", sa.JSON),
    sa.column("revision", sa.String),
)
provider_connections = sa.table(
    "provider_connections",
    sa.column("connection_id", sa.String),
    sa.column("config_json", sa.JSON),
)


def _dict(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list(value: object) -> list[str]:
    return [str(item) for item in value if str(item)] if isinstance(value, list) else []


def upgrade() -> None:
    connection = op.get_bind()
    legacy_profile = connection.execute(
        sa.select(routing_profiles).where(
            routing_profiles.c.profile_id == LEGACY_PROFILE_ID
        )
    ).mappings().first()
    legacy_binding = connection.execute(
        sa.select(routing_bindings).where(
            routing_bindings.c.profile_id == LEGACY_PROFILE_ID
        )
    ).mappings().first()
    canonical_profile = connection.execute(
        sa.select(routing_profiles).where(
            routing_profiles.c.profile_id == CANONICAL_PROFILE_ID
        )
    ).mappings().first()
    canonical_binding = connection.execute(
        sa.select(routing_bindings).where(
            routing_bindings.c.profile_id == CANONICAL_PROFILE_ID
        )
    ).mappings().first()

    canonical_is_admin_managed = (
        str(canonical_binding.get("revision") or "").startswith("runtime-profiles-admin-")
        if canonical_binding
        else False
    ) or bool(
        _list(
            canonical_binding.get("candidate_instance_ids")
            if canonical_binding
            else None
        )
    )
    legacy_candidates = _list(
        legacy_binding.get("candidate_instance_ids") if legacy_binding else None
    )

    if legacy_profile and legacy_binding and legacy_candidates and not canonical_is_admin_managed:
        migrated_policy = {
            **_dict(legacy_profile.get("default_policy_json")),
            "managed_surface": "hosted_runtime_profiles",
            "platform_kind": "wordpress",
            "connector_id": "wordpress_ai_connector",
            "operation_contract_version": "wordpress_operation.v1",
            "task_group": "alt_text_vision",
            "routing_intent": "media.alt_text_vision",
            "tasks": ["alt_text_suggest"],
        }
        migrated_selection = {
            **_dict(legacy_binding.get("selection_policy_json")),
            "managed_surface": "hosted_runtime_profiles",
            "platform_kind": "wordpress",
            "connector_id": "wordpress_ai_connector",
            "operation_contract_version": "wordpress_operation.v1",
            "task_group": "alt_text_vision",
            "routing_intent": "media.alt_text_vision",
        }
        profile_values = {
            "execution_kind": "vision",
            "default_policy_json": migrated_policy,
        }
        binding_values = {
            "candidate_instance_ids": legacy_candidates,
            "selection_policy_json": migrated_selection,
            "revision": str(legacy_binding.get("revision") or "vision-profile-migration"),
        }
        if canonical_profile:
            connection.execute(
                sa.update(routing_profiles)
                .where(routing_profiles.c.profile_id == CANONICAL_PROFILE_ID)
                .values(**profile_values)
            )
        else:
            connection.execute(
                sa.insert(routing_profiles).values(
                    profile_id=CANONICAL_PROFILE_ID,
                    **profile_values,
                )
            )
        if canonical_binding:
            connection.execute(
                sa.update(routing_bindings)
                .where(routing_bindings.c.profile_id == CANONICAL_PROFILE_ID)
                .values(**binding_values)
            )
        else:
            connection.execute(
                sa.insert(routing_bindings).values(
                    profile_id=CANONICAL_PROFILE_ID,
                    **binding_values,
                )
            )

    connection.execute(
        sa.delete(routing_bindings).where(
            routing_bindings.c.profile_id == LEGACY_PROFILE_ID
        )
    )
    connection.execute(
        sa.delete(routing_profiles).where(
            routing_profiles.c.profile_id == LEGACY_PROFILE_ID
        )
    )

    for row in connection.execute(sa.select(provider_connections)).mappings():
        config = _dict(row.get("config_json"))
        profile_ids = _list(config.get("runtime_profile_ids"))
        if LEGACY_PROFILE_ID not in profile_ids:
            continue
        normalized_ids: list[str] = []
        for profile_id in profile_ids:
            normalized_id = (
                CANONICAL_PROFILE_ID if profile_id == LEGACY_PROFILE_ID else profile_id
            )
            if normalized_id not in normalized_ids:
                normalized_ids.append(normalized_id)
        connection.execute(
            sa.update(provider_connections)
            .where(provider_connections.c.connection_id == row["connection_id"])
            .values(config_json={**config, "runtime_profile_ids": normalized_ids})
        )


def downgrade() -> None:
    # Development-only ID consolidation is intentionally irreversible.
    pass
