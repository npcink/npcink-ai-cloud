"""site admin access grants"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260612_0040"
down_revision = "20260603_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_admin_identities",
        sa.Column("site_admin_id", sa.String(length=191), nullable=False),
        sa.Column("site_admin_ref", sa.String(length=191), nullable=False),
        sa.Column("email", sa.String(length=191), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("site_admin_id"),
        sa.UniqueConstraint("email", name="uq_site_admin_identities_email"),
        sa.UniqueConstraint("site_admin_ref", name="uq_site_admin_identities_ref"),
    )
    op.create_index("ix_site_admin_identities_email", "site_admin_identities", ["email"])
    op.create_index("ix_site_admin_identities_ref", "site_admin_identities", ["site_admin_ref"])
    op.create_index("ix_site_admin_identities_status", "site_admin_identities", ["status"])
    op.create_index(
        "ix_site_admin_identities_last_login_at",
        "site_admin_identities",
        ["last_login_at"],
    )

    op.create_table(
        "site_admin_site_grants",
        sa.Column("grant_id", sa.String(length=191), nullable=False),
        sa.Column("site_admin_id", sa.String(length=191), nullable=False),
        sa.Column("site_id", sa.String(length=191), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
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
        sa.ForeignKeyConstraint(["site_admin_id"], ["site_admin_identities.site_admin_id"]),
        sa.ForeignKeyConstraint(["site_id"], ["sites.site_id"]),
        sa.PrimaryKeyConstraint("grant_id"),
        sa.UniqueConstraint(
            "site_admin_id",
            "site_id",
            name="uq_site_admin_site_grants_admin_site",
        ),
    )
    op.create_index(
        "ix_site_admin_site_grants_site_admin_id",
        "site_admin_site_grants",
        ["site_admin_id"],
    )
    op.create_index("ix_site_admin_site_grants_site_id", "site_admin_site_grants", ["site_id"])
    op.create_index("ix_site_admin_site_grants_status", "site_admin_site_grants", ["status"])


def downgrade() -> None:
    op.drop_index("ix_site_admin_site_grants_status", table_name="site_admin_site_grants")
    op.drop_index("ix_site_admin_site_grants_site_id", table_name="site_admin_site_grants")
    op.drop_index(
        "ix_site_admin_site_grants_site_admin_id",
        table_name="site_admin_site_grants",
    )
    op.drop_table("site_admin_site_grants")
    op.drop_index("ix_site_admin_identities_last_login_at", table_name="site_admin_identities")
    op.drop_index("ix_site_admin_identities_status", table_name="site_admin_identities")
    op.drop_index("ix_site_admin_identities_ref", table_name="site_admin_identities")
    op.drop_index("ix_site_admin_identities_email", table_name="site_admin_identities")
    op.drop_table("site_admin_identities")
