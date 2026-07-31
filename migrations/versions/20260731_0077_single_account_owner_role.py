"""adopt the validation-stage owner membership role

Revision ID: 20260731_0077
Revises: 20260728_0076
Create Date: 2026-07-31 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260731_0077"
down_revision = "20260728_0076"
branch_labels = None
depends_on = None

_TABLE = "account_user_memberships"
_CONSTRAINT = "ck_account_user_memberships_role"


def _replace_role_constraint(expression: str) -> None:
    with op.batch_alter_table(_TABLE, recreate="always") as batch:
        batch.drop_constraint(_CONSTRAINT, type_="check")
        batch.create_check_constraint(_CONSTRAINT, expression)


def upgrade() -> None:
    _replace_role_constraint("role IN ('user', 'owner')")
    op.execute(
        sa.text(
            "UPDATE account_user_memberships "
            "SET role = 'owner' WHERE role = 'user'"
        )
    )
    _replace_role_constraint("role IN ('owner')")


def downgrade() -> None:
    _replace_role_constraint("role IN ('owner', 'user')")
    op.execute(
        sa.text(
            "UPDATE account_user_memberships "
            "SET role = 'user' WHERE role = 'owner'"
        )
    )
    _replace_role_constraint("role IN ('user')")
