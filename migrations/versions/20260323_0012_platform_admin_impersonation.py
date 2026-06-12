"""platform admin identities

Revision ID: 20260323_0012
Revises: 20260321_0010
Create Date: 2026-03-23 15:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260323_0012"
down_revision = "20260321_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_admin_identities",
        sa.Column("admin_id", sa.String(length=191), primary_key=True),
        sa.Column("admin_ref", sa.String(length=191), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("external_subject", sa.String(length=191), nullable=True),
        sa.Column("email", sa.String(length=191), nullable=True),
        sa.Column(
            "role",
            sa.String(length=64),
            nullable=False,
            server_default="platform_admin",
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("admin_ref", name="uq_platform_admin_identities_admin_ref"),
    )
    op.create_index(
        "ix_platform_admin_identities_admin_ref",
        "platform_admin_identities",
        ["admin_ref"],
    )
    op.create_index(
        "ix_platform_admin_identities_provider",
        "platform_admin_identities",
        ["provider"],
    )
    op.create_index(
        "ix_platform_admin_identities_external_subject",
        "platform_admin_identities",
        ["external_subject"],
    )
    op.create_index(
        "ix_platform_admin_identities_email",
        "platform_admin_identities",
        ["email"],
    )
    op.create_index(
        "ix_platform_admin_identities_role",
        "platform_admin_identities",
        ["role"],
    )
    op.create_index(
        "ix_platform_admin_identities_status",
        "platform_admin_identities",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_platform_admin_identities_status", table_name="platform_admin_identities")
    op.drop_index("ix_platform_admin_identities_role", table_name="platform_admin_identities")
    op.drop_index("ix_platform_admin_identities_email", table_name="platform_admin_identities")
    op.drop_index(
        "ix_platform_admin_identities_external_subject", table_name="platform_admin_identities"
    )
    op.drop_index("ix_platform_admin_identities_provider", table_name="platform_admin_identities")
    op.drop_index("ix_platform_admin_identities_admin_ref", table_name="platform_admin_identities")
    op.drop_table("platform_admin_identities")
