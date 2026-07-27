"""add principal-owned site authorization"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op

revision = "20260727_0072"
down_revision = "20260727_0071"
branch_labels = None
depends_on = None


def _binding_id(site_id: str, principal_id: str) -> str:
    return f"psb_{uuid5(NAMESPACE_URL, f'{site_id}:{principal_id}').hex}"


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    platform_admin_grants = sa.Table(
        "platform_admin_grants",
        metadata,
        autoload_with=bind,
    )
    invalid_admin_roles = int(
        bind.scalar(
            sa.select(sa.func.count())
            .select_from(platform_admin_grants)
            .where(platform_admin_grants.c.role != "platform_admin")
        )
        or 0
    )
    if invalid_admin_roles:
        raise RuntimeError(
            "platform_admin_grants contains non-canonical roles; "
            "repair them before principal-site ownership migration"
        )

    with op.batch_alter_table("platform_admin_grants") as batch:
        batch.create_check_constraint(
            "ck_platform_admin_grants_role",
            "role IN ('platform_admin')",
        )

    op.create_table(
        "principal_site_bindings",
        sa.Column("binding_id", sa.String(length=191), primary_key=True),
        sa.Column(
            "principal_id",
            sa.String(length=191),
            sa.ForeignKey("principals.principal_id"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            sa.String(length=191),
            sa.ForeignKey("sites.site_id"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            sa.String(length=191),
            sa.ForeignKey("accounts.account_id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("bound_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("release_reason", sa.String(length=128)),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "(status = 'active' AND released_at IS NULL) OR "
            "(status = 'released' AND released_at IS NOT NULL)",
            name="ck_principal_site_bindings_lifecycle",
        ),
    )
    for column_name in (
        "principal_id",
        "site_id",
        "account_id",
        "status",
        "bound_at",
        "released_at",
    ):
        op.create_index(
            f"ix_principal_site_bindings_{column_name}",
            "principal_site_bindings",
            [column_name],
            unique=False,
        )
    op.create_index(
        "ix_principal_site_bindings_principal_status",
        "principal_site_bindings",
        ["principal_id", "status"],
        unique=False,
    )
    op.create_index(
        "uq_principal_site_bindings_current_site",
        "principal_site_bindings",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("released_at IS NULL"),
        sqlite_where=sa.text("released_at IS NULL"),
    )

    metadata = sa.MetaData()
    sites = sa.Table("sites", metadata, autoload_with=bind)
    principals = sa.Table("principals", metadata, autoload_with=bind)
    memberships = sa.Table(
        "account_user_memberships",
        metadata,
        autoload_with=bind,
    )
    bindings = sa.Table(
        "principal_site_bindings",
        metadata,
        autoload_with=bind,
    )
    active_membership_rows = bind.execute(
        sa.select(
            memberships.c.account_id,
            memberships.c.principal_id,
        )
        .join(
            principals,
            principals.c.principal_id == memberships.c.principal_id,
        )
        .where(
            memberships.c.status == "active",
            principals.c.status == "active",
        )
        .order_by(
            memberships.c.account_id,
            memberships.c.principal_id,
        )
    ).mappings()
    principals_by_account: dict[str, list[str]] = {}
    for row in active_membership_rows:
        account_id = str(row.get("account_id") or "").strip()
        principal_id = str(row.get("principal_id") or "").strip()
        if account_id and principal_id:
            principals_by_account.setdefault(account_id, []).append(principal_id)

    site_rows = bind.execute(
        sa.select(
            sites.c.site_id,
            sites.c.account_id,
            sites.c.provisioned_at,
            sites.c.created_at,
        ).where(
            sites.c.account_id.is_not(None),
            sites.c.ownership_released_at.is_(None),
            sites.c.status != "archived",
        )
    ).mappings()
    for row in site_rows:
        site_id = str(row.get("site_id") or "").strip()
        account_id = str(row.get("account_id") or "").strip()
        account_principals = principals_by_account.get(account_id, [])
        if not site_id or len(account_principals) != 1:
            continue
        principal_id = account_principals[0]
        bound_at = row.get("provisioned_at") or row.get("created_at") or datetime.now(UTC)
        bind.execute(
            sa.insert(bindings).values(
                binding_id=_binding_id(site_id, principal_id),
                principal_id=principal_id,
                site_id=site_id,
                account_id=account_id,
                status="active",
                bound_at=bound_at,
                metadata_json={"source": "migration_0072_single_member_backfill"},
            )
        )


def downgrade() -> None:
    op.drop_index(
        "uq_principal_site_bindings_current_site",
        table_name="principal_site_bindings",
    )
    op.drop_index(
        "ix_principal_site_bindings_principal_status",
        table_name="principal_site_bindings",
    )
    for column_name in (
        "released_at",
        "bound_at",
        "status",
        "account_id",
        "site_id",
        "principal_id",
    ):
        op.drop_index(
            f"ix_principal_site_bindings_{column_name}",
            table_name="principal_site_bindings",
        )
    op.drop_table("principal_site_bindings")

    with op.batch_alter_table("platform_admin_grants") as batch:
        batch.drop_constraint(
            "ck_platform_admin_grants_role",
            type_="check",
        )
