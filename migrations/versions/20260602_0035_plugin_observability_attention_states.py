"""plugin_observability_attention_states

Revision ID: 20260602_0035
Revises: 20260602_0034
Create Date: 2026-06-02

"""

import sqlalchemy as sa
from alembic import op

revision = "20260602_0035"
down_revision = "20260602_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("plugin_observability_attention_states"):
        return

    op.create_table(
        "plugin_observability_attention_states",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("attention_key", sa.String(length=64), nullable=False),
        sa.Column("attention_code", sa.String(length=128), nullable=False),
        sa.Column("site_id", sa.String(length=191), nullable=True),
        sa.Column("plugin_slug", sa.String(length=64), nullable=True),
        sa.Column("event_kind", sa.String(length=96), nullable=True),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column(
            "workflow_status",
            sa.String(length=32),
            nullable=False,
            server_default="acknowledged",
        ),
        sa.Column("muted_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_note", sa.Text(), nullable=True),
        sa.Column("actor_ref", sa.String(length=191), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attention_key",
            name="uq_plugin_observability_attention_states_key",
        ),
    )
    for index_name, columns in (
        ("ix_plugin_obs_attention_states_attention_key", ["attention_key"]),
        ("ix_plugin_obs_attention_states_attention_code", ["attention_code"]),
        ("ix_plugin_obs_attention_states_site_id", ["site_id"]),
        ("ix_plugin_obs_attention_states_plugin_slug", ["plugin_slug"]),
        ("ix_plugin_obs_attention_states_event_kind", ["event_kind"]),
        ("ix_plugin_obs_attention_states_error_code", ["error_code"]),
        ("ix_plugin_obs_attention_states_workflow_status", ["workflow_status"]),
        ("ix_plugin_obs_attention_states_muted_until", ["muted_until"]),
        ("ix_plugin_obs_attention_states_actor_ref", ["actor_ref"]),
        ("ix_plugin_obs_attention_states_updated_at", ["updated_at"]),
    ):
        op.create_index(index_name, "plugin_observability_attention_states", columns)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("plugin_observability_attention_states"):
        op.drop_table("plugin_observability_attention_states")
