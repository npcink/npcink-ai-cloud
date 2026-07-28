"""add principal-owned site authorization"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260727_0072"
down_revision = "20260727_0071"
branch_labels = None
depends_on = None


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
