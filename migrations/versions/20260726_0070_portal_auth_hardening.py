"""harden Portal one-time authentication records"""

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
            sa.update(codes).where(codes.c.code_id == row["code_id"]).values(purpose=purpose)
        )

    bind.execute(
        sa.update(codes)
        .where(
            codes.c.status == "pending",
            codes.c.expires_at <= sa.func.now(),
        )
        .values(status="expired", consumed_at=sa.func.now())
    )
    pending_rows = list(
        bind.execute(
            sa.select(codes.c.code_id, codes.c.email, codes.c.purpose)
            .where(codes.c.status == "pending")
            .order_by(
                codes.c.email.asc(),
                codes.c.purpose.asc(),
                codes.c.created_at.desc(),
                codes.c.code_id.desc(),
            )
        ).mappings()
    )
    retained_scopes: set[tuple[str, str]] = set()
    for row in pending_rows:
        scope = (str(row["email"]).lower(), str(row["purpose"]))
        if scope not in retained_scopes:
            retained_scopes.add(scope)
            continue
        bind.execute(
            sa.update(codes)
            .where(codes.c.code_id == row["code_id"])
            .values(status="expired", consumed_at=sa.func.now())
        )

    op.create_index(
        "uq_portal_login_codes_pending_email_purpose",
        "portal_login_codes",
        ["email", "purpose"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_portal_login_codes_pending_email_purpose",
        table_name="portal_login_codes",
    )
    with op.batch_alter_table("portal_login_codes") as batch:
        batch.drop_index("ix_portal_login_codes_purpose")
        batch.drop_column("purpose")
