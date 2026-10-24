"""Dormant Portal session registry.

Revision ID: 20261024_0090
Revises: 20261023_0089
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261024_0090"
down_revision = "20261023_0089"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portal_sessions",
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("principal_id", sa.String(191), nullable=False),
        sa.Column("session_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(64), nullable=True),
        sa.Column("auth_method", sa.String(32), nullable=False),
        sa.Column("client_hint", sa.String(120), nullable=True),
        sa.PrimaryKeyConstraint("session_id"),
        sa.ForeignKeyConstraint(
            ["principal_id"], ["principals.principal_id"], name="fk_portal_sessions_principal"
        ),
        sa.CheckConstraint("length(session_id) BETWEEN 1 AND 64", name="ck_portal_sessions_id"),
        sa.CheckConstraint("session_version > 0", name="ck_portal_sessions_version"),
        sa.CheckConstraint(
            "absolute_expires_at > created_at", name="ck_portal_sessions_expiry"
        ),
        sa.CheckConstraint(
            "auth_method IN ('email_code', 'registration', 'qq')",
            name="ck_portal_sessions_auth_method",
        ),
        sa.CheckConstraint(
            "(revoked_at IS NULL AND revoke_reason IS NULL) OR "
            "(revoked_at IS NOT NULL AND revoke_reason IS NOT NULL "
            "AND length(revoke_reason) BETWEEN 1 AND 64 AND revoked_at >= created_at)",
            name="ck_portal_sessions_revocation",
        ),
        sa.CheckConstraint(
            "client_hint IS NULL OR length(client_hint) BETWEEN 1 AND 120",
            name="ck_portal_sessions_client_hint",
        ),
    )
    op.create_index(
        "ix_portal_sessions_principal_created", "portal_sessions",
        ["principal_id", "created_at", "session_id"],
    )
    op.create_index("ix_portal_sessions_expiry", "portal_sessions", ["absolute_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_portal_sessions_expiry", table_name="portal_sessions")
    op.drop_index("ix_portal_sessions_principal_created", table_name="portal_sessions")
    op.drop_table("portal_sessions")
