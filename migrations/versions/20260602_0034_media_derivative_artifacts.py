"""media_derivative_artifacts

Revision ID: 20260602_0034
Revises: 20260601_0033
Create Date: 2026-06-02

"""

import sqlalchemy as sa
from alembic import op

revision = "20260602_0034"
down_revision = "20260601_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("media_derivative_artifacts"):
        return

    op.create_table(
        "media_derivative_artifacts",
        sa.Column("artifact_id", sa.String(191), nullable=False),
        sa.Column("run_id", sa.String(191), nullable=False),
        sa.Column("site_id", sa.String(191), nullable=False),
        sa.Column("storage_ref", sa.String(512), nullable=False),
        sa.Column("blob_data", sa.LargeBinary, nullable=False),
        sa.Column("mime_type", sa.String(64), nullable=False),
        sa.Column("format", sa.String(16), nullable=False),
        sa.Column("width", sa.Integer, nullable=False, server_default="0"),
        sa.Column("height", sa.Integer, nullable=False, server_default="0"),
        sa.Column("filesize_bytes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("checksum", sa.String(128), nullable=False),
        sa.Column("source_media_type", sa.String(16), nullable=False, server_default="image"),
        sa.Column("processing_warnings_json", sa.JSON, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["run_id"], ["run_records.run_id"]),
        sa.PrimaryKeyConstraint("artifact_id"),
    )
    for index_name, columns in (
        ("ix_mda_run_id", ["run_id"]),
        ("ix_mda_site_id", ["site_id"]),
    ):
        op.create_index(index_name, "media_derivative_artifacts", columns)
    op.create_index(
        "ix_mda_expires_at",
        "media_derivative_artifacts",
        ["expires_at"],
        postgresql_where=sa.text("purged_at IS NULL"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("media_derivative_artifacts"):
        op.drop_table("media_derivative_artifacts")
