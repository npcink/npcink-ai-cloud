"""Dormant Portal TOTP storage; no authentication activation.

Revision ID: 20261024_0091
Revises: 20261024_0090
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261024_0091"
down_revision = "20261024_0090"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portal_totp_factors",
        sa.Column("principal_id", sa.String(191), nullable=False),
        sa.Column("factor_version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("active_seed_ciphertext", sa.Text(), nullable=True),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_accepted_counter", sa.BigInteger(), nullable=True),
        sa.Column("recovery_generation", sa.Integer(), nullable=False),
        sa.Column("pending_setup_id", sa.String(64), nullable=True),
        sa.Column("pending_seed_ciphertext", sa.Text(), nullable=True),
        sa.Column("pending_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pending_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("principal_id"),
        sa.ForeignKeyConstraint(
            ["principal_id"], ["principals.principal_id"], name="fk_portal_totp_factors_principal"
        ),
        sa.UniqueConstraint("pending_setup_id", name="uq_portal_totp_factors_pending_setup"),
        sa.CheckConstraint(
            "(state = 'disabled' AND active_seed_ciphertext IS NULL AND enabled_at IS "
            "NULL AND last_accepted_counter IS NULL) OR (state = 'enabled' AND "
            "active_seed_ciphertext IS NOT NULL AND length(active_seed_ciphertext) > 0"
            " AND enabled_at IS NOT NULL AND recovery_generation > 0)",
            name="ck_portal_totp_active",
        ),
        sa.CheckConstraint(
            "last_accepted_counter IS NULL OR last_accepted_counter >= 0",
            name="ck_portal_totp_counter",
        ),
        sa.CheckConstraint("factor_version > 0", name="ck_portal_totp_factor_version"),
        sa.CheckConstraint("recovery_generation >= 0", name="ck_portal_totp_generation"),
        sa.CheckConstraint(
            "(pending_setup_id IS NULL AND pending_seed_ciphertext IS NULL AND "
            "pending_created_at IS NULL AND pending_expires_at IS NULL) OR "
            "(pending_setup_id IS NOT NULL AND length(pending_setup_id) BETWEEN 1 AND "
            "64 AND pending_seed_ciphertext IS NOT NULL AND "
            "length(pending_seed_ciphertext) > 0 AND pending_created_at IS NOT NULL "
            "AND pending_expires_at IS NOT NULL AND pending_expires_at > "
            "pending_created_at)",
            name="ck_portal_totp_pending",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="ck_portal_totp_timestamps"),
    )
    op.create_index("ix_portal_totp_pending_expiry", "portal_totp_factors", ["pending_expires_at"])
    op.create_table(
        "portal_recovery_codes",
        sa.Column("code_id", sa.String(64), nullable=False),
        sa.Column("principal_id", sa.String(191), nullable=False),
        sa.Column("factor_version", sa.Integer(), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("code_id"),
        sa.ForeignKeyConstraint(
            ["principal_id"], ["principals.principal_id"], name="fk_portal_recovery_codes_principal"
        ),
        sa.CheckConstraint(
            "consumed_at IS NULL OR consumed_at >= created_at", name="ck_portal_recovery_consumed"
        ),
        sa.CheckConstraint("length(code_hash) > 0", name="ck_portal_recovery_hash"),
        sa.CheckConstraint("length(code_id) BETWEEN 1 AND 64", name="ck_portal_recovery_id"),
        sa.CheckConstraint(
            "factor_version > 0 AND generation > 0", name="ck_portal_recovery_version"
        ),
    )
    op.create_index(
        "ix_portal_recovery_generation",
        "portal_recovery_codes",
        ["principal_id", "factor_version", "generation"],
    )
    op.create_table(
        "portal_auth_challenges",
        sa.Column("challenge_id", sa.String(64), nullable=False),
        sa.Column("principal_id", sa.String(191), nullable=False),
        sa.Column("credential_hash", sa.Text(), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("primary_method", sa.String(32), nullable=False),
        sa.Column("primary_authenticated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bound_session_version", sa.Integer(), nullable=False),
        sa.Column("bound_factor_version", sa.Integer(), nullable=False),
        sa.Column("bound_recovery_generation", sa.Integer(), nullable=False),
        sa.Column("bound_session_id", sa.String(64), nullable=True),
        sa.Column("bound_session_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("attempt_limit", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("challenge_id"),
        sa.ForeignKeyConstraint(
            ["principal_id"],
            ["principals.principal_id"],
            name="fk_portal_auth_challenges_principal",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND attempt_limit > 0 AND attempt_count <= attempt_limit",
            name="ck_portal_challenge_attempts",
        ),
        sa.CheckConstraint(
            "consumed_at IS NULL OR consumed_at >= created_at", name="ck_portal_challenge_consumed"
        ),
        sa.CheckConstraint("expires_at > created_at", name="ck_portal_challenge_expiry"),
        sa.CheckConstraint("length(credential_hash) > 0", name="ck_portal_challenge_hash"),
        sa.CheckConstraint("length(challenge_id) BETWEEN 1 AND 64", name="ck_portal_challenge_id"),
        sa.CheckConstraint(
            "primary_method IN ('email_code', 'registration', 'qq')",
            name="ck_portal_challenge_primary_method",
        ),
        sa.CheckConstraint(
            "purpose IN ('login', 'setup', 'disable', 'recovery_reset')",
            name="ck_portal_challenge_purpose",
        ),
        sa.CheckConstraint(
            "(purpose = 'login' AND bound_session_id IS NULL AND "
            "bound_session_expires_at IS NULL) OR (purpose <> 'login' AND "
            "bound_session_id IS NOT NULL AND length(bound_session_id) BETWEEN 1 AND "
            "64 AND bound_session_expires_at IS NOT NULL)",
            name="ck_portal_challenge_session_binding",
        ),
        sa.CheckConstraint(
            "bound_session_version > 0 AND bound_factor_version >= 0 AND "
            "bound_recovery_generation >= 0",
            name="ck_portal_challenge_versions",
        ),
    )
    op.create_index(
        "ix_portal_challenge_principal_expiry",
        "portal_auth_challenges",
        ["principal_id", "expires_at"],
    )
    with op.batch_alter_table("portal_sessions") as batch:
        batch.add_column(sa.Column("factor_version", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column("primary_authenticated_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch.add_column(
            sa.Column("second_factor_verified_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch.add_column(sa.Column("second_factor_method", sa.String(32), nullable=True))
        batch.create_check_constraint(
            "ck_portal_sessions_factor_evidence",
            "(factor_version IS NULL AND second_factor_verified_at IS NULL AND "
            "second_factor_method IS NULL) OR (factor_version IS NOT NULL AND "
            "factor_version > 0 AND primary_authenticated_at IS NOT NULL AND "
            "second_factor_verified_at IS NOT NULL AND second_factor_verified_at >= "
            "primary_authenticated_at AND second_factor_method IS NOT NULL AND "
            "second_factor_method IN ('totp', 'recovery_code'))",
        )


def downgrade() -> None:
    # A dormant-only downgrade must never discard enabled/pending/history data.
    connection = op.get_bind()
    for table in ("portal_auth_challenges", "portal_recovery_codes", "portal_totp_factors"):
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table}")):
            raise RuntimeError("TOTP downgrade requires empty dormant storage")
    if connection.scalar(
        sa.text(
            "SELECT count(*) FROM portal_sessions WHERE factor_version IS NOT NULL "
            "OR primary_authenticated_at IS NOT NULL OR second_factor_verified_at IS NOT NULL "
            "OR second_factor_method IS NOT NULL"
        )
    ):
        raise RuntimeError("TOTP downgrade requires unused session evidence")
    with op.batch_alter_table("portal_sessions") as batch:
        batch.drop_constraint("ck_portal_sessions_factor_evidence", type_="check")
        batch.drop_column("second_factor_method")
        batch.drop_column("second_factor_verified_at")
        batch.drop_column("primary_authenticated_at")
        batch.drop_column("factor_version")
    op.drop_index("ix_portal_challenge_principal_expiry", table_name="portal_auth_challenges")
    op.drop_table("portal_auth_challenges")
    op.drop_index("ix_portal_recovery_generation", table_name="portal_recovery_codes")
    op.drop_table("portal_recovery_codes")
    op.drop_index("ix_portal_totp_pending_expiry", table_name="portal_totp_factors")
    op.drop_table("portal_totp_factors")
