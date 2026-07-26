"""add durable site account relink cooldown and ownership history"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op

revision = "20260726_0069"
down_revision = "20260717_0068"
branch_labels = None
depends_on = None

_DEFAULT_COOLDOWN_DAYS = 90
_SETTING_ID = "site_relink_policy"


def _as_utc_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _removed_at(row: sa.RowMapping) -> datetime | None:
    metadata = row.get("metadata_json")
    if isinstance(metadata, dict):
        lifecycle = metadata.get("portal_lifecycle")
        if isinstance(lifecycle, dict):
            parsed = _as_utc_datetime(lifecycle.get("removed_at"))
            if parsed is not None:
                return parsed
    return _as_utc_datetime(row.get("updated_at")) or _as_utc_datetime(row.get("created_at"))


def _binding_id(site_id: str, account_id: str, bound_at: datetime) -> str:
    value = f"{site_id}:{account_id}:{bound_at.isoformat()}"
    return f"sab_{uuid5(NAMESPACE_URL, value).hex}"


def upgrade() -> None:
    with op.batch_alter_table("sites") as batch:
        batch.add_column(sa.Column("ownership_released_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("relink_cooldown_until", sa.DateTime(timezone=True)))
        batch.create_index(
            "ix_sites_ownership_released_at",
            ["ownership_released_at"],
            unique=False,
        )
        batch.create_index(
            "ix_sites_relink_cooldown_until",
            ["relink_cooldown_until"],
            unique=False,
        )

    op.create_table(
        "site_account_bindings",
        sa.Column("binding_id", sa.String(length=191), primary_key=True),
        sa.Column(
            "site_id",
            sa.String(length=191),
            sa.ForeignKey("sites.site_id"),
            nullable=False,
        ),
        sa.Column("account_id", sa.String(length=191), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("bound_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("cooldown_until", sa.DateTime(timezone=True)),
        sa.Column("release_reason", sa.String(length=128)),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for column_name in (
        "site_id",
        "account_id",
        "status",
        "bound_at",
        "released_at",
        "cooldown_until",
    ):
        op.create_index(
            f"ix_site_account_bindings_{column_name}",
            "site_account_bindings",
            [column_name],
            unique=False,
        )
    op.create_index(
        "uq_site_account_bindings_current_site",
        "site_account_bindings",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("released_at IS NULL"),
        sqlite_where=sa.text("released_at IS NULL"),
    )

    bind = op.get_bind()
    metadata = sa.MetaData()
    sites = sa.Table("sites", metadata, autoload_with=bind)
    bindings = sa.Table("site_account_bindings", metadata, autoload_with=bind)
    service_settings = sa.Table("service_settings", metadata, autoload_with=bind)

    rows = bind.execute(
        sa.select(
            sites.c.site_id,
            sites.c.account_id,
            sites.c.status,
            sites.c.metadata_json,
            sites.c.provisioned_at,
            sites.c.created_at,
            sites.c.updated_at,
        )
    ).mappings()
    for row in rows:
        site_id = str(row.get("site_id") or "").strip()
        account_id = str(row.get("account_id") or "").strip()
        if not site_id or not account_id:
            continue
        bound_at = (
            _as_utc_datetime(row.get("provisioned_at"))
            or _as_utc_datetime(row.get("created_at"))
            or datetime.now(UTC)
        )
        released_at = _removed_at(row) if str(row.get("status") or "") == "archived" else None
        cooldown_until = (
            released_at + timedelta(days=_DEFAULT_COOLDOWN_DAYS)
            if released_at is not None
            else None
        )
        if released_at is not None:
            bind.execute(
                sa.update(sites)
                .where(sites.c.site_id == site_id)
                .values(
                    ownership_released_at=released_at,
                    relink_cooldown_until=cooldown_until,
                )
            )
        bind.execute(
            sa.insert(bindings).values(
                binding_id=_binding_id(site_id, account_id, bound_at),
                site_id=site_id,
                account_id=account_id,
                status="released" if released_at is not None else "active",
                bound_at=bound_at,
                released_at=released_at,
                cooldown_until=cooldown_until,
                release_reason="legacy_archived_site" if released_at is not None else None,
                metadata_json={"source": "migration_0069_backfill"},
            )
        )

    setting_exists = bind.scalar(
        sa.select(service_settings.c.setting_id).where(service_settings.c.setting_id == _SETTING_ID)
    )
    if setting_exists is None:
        bind.execute(
            sa.insert(service_settings).values(
                setting_id=_SETTING_ID,
                setting_kind="commercial",
                enabled=True,
                config_json={"cooldown_days": _DEFAULT_COOLDOWN_DAYS},
                secret_ciphertext_json={},
                status="ready",
                metadata_json={"source": "migration_0069_default"},
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    service_settings = sa.Table("service_settings", metadata, autoload_with=bind)
    bind.execute(sa.delete(service_settings).where(service_settings.c.setting_id == _SETTING_ID))

    op.drop_index(
        "uq_site_account_bindings_current_site",
        table_name="site_account_bindings",
    )
    for column_name in (
        "cooldown_until",
        "released_at",
        "bound_at",
        "status",
        "account_id",
        "site_id",
    ):
        op.drop_index(
            f"ix_site_account_bindings_{column_name}",
            table_name="site_account_bindings",
        )
    op.drop_table("site_account_bindings")

    with op.batch_alter_table("sites") as batch:
        batch.drop_index("ix_sites_relink_cooldown_until")
        batch.drop_index("ix_sites_ownership_released_at")
        batch.drop_column("relink_cooldown_until")
        batch.drop_column("ownership_released_at")
