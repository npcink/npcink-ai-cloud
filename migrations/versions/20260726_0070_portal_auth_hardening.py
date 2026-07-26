"""harden Portal one-time authentication records and QQ identity bindings"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260726_0070"
down_revision = "20260726_0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("portal_login_codes") as batch:
        batch.add_column(
            sa.Column(
                "purpose",
                sa.String(length=64),
                nullable=False,
                server_default="portal_login",
            )
        )
        batch.create_index("ix_portal_login_codes_purpose", ["purpose"], unique=False)

    bind = op.get_bind()
    metadata = sa.MetaData()
    codes = sa.Table("portal_login_codes", metadata, autoload_with=bind)
    for row in bind.execute(sa.select(codes.c.code_id, codes.c.metadata_json)).mappings():
        metadata_json = row.get("metadata_json")
        purpose = (
            str(metadata_json.get("purpose") or "").strip()
            if isinstance(metadata_json, dict)
            else ""
        )
        if purpose not in {"portal_login", "portal_email_change", "portal_registration"}:
            purpose = "portal_login"
        bind.execute(
            sa.update(codes)
            .where(codes.c.code_id == row["code_id"])
            .values(purpose=purpose)
        )

    op.create_index(
        "uq_portal_login_codes_pending_email_purpose",
        "portal_login_codes",
        ["email", "purpose"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )

    bindings = sa.Table("identity_provider_bindings", metadata, autoload_with=bind)
    duplicate = bind.execute(
        sa.select(bindings.c.provider, bindings.c.unionid_hash)
        .where(bindings.c.unionid_hash.is_not(None))
        .group_by(bindings.c.provider, bindings.c.unionid_hash)
        .having(sa.func.count(bindings.c.binding_id) > 1)
        .limit(1)
    ).first()
    if duplicate is not None:
        raise RuntimeError("duplicate provider UnionID bindings require operator remediation")
    with op.batch_alter_table("identity_provider_bindings") as batch:
        batch.create_unique_constraint(
            "uq_identity_provider_bindings_provider_unionid",
            ["provider", "unionid_hash"],
        )


def downgrade() -> None:
    with op.batch_alter_table("identity_provider_bindings") as batch:
        batch.drop_constraint(
            "uq_identity_provider_bindings_provider_unionid",
            type_="unique",
        )
    op.drop_index(
        "uq_portal_login_codes_pending_email_purpose",
        table_name="portal_login_codes",
    )
    with op.batch_alter_table("portal_login_codes") as batch:
        batch.drop_index("ix_portal_login_codes_purpose")
        batch.drop_column("purpose")
