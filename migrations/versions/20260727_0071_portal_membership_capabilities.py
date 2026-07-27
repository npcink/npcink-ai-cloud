"""separate Portal billing read and manage capabilities"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260727_0071"
down_revision = "20260726_0070"
branch_labels = None
depends_on = None

_LEGACY_FULL_USER_ACTIONS = {
    "view_sites",
    "view_usage",
    "view_billing",
    "view_audit",
    "provision_sites",
    "remove_sites",
}
_MANAGE_BILLING = "manage_billing"


def _action_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(action).strip() for action in value if str(action).strip()]


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    memberships = sa.Table(
        "account_user_memberships",
        metadata,
        autoload_with=bind,
    )
    rows = bind.execute(
        sa.select(
            memberships.c.membership_id,
            memberships.c.allowed_actions_json,
        )
    ).mappings()
    for row in rows:
        actions = _action_list(row.get("allowed_actions_json"))
        action_set = set(actions)
        if (
            _MANAGE_BILLING in action_set
            or not _LEGACY_FULL_USER_ACTIONS.issubset(action_set)
        ):
            continue
        insert_at = actions.index("view_billing") + 1
        updated_actions = [
            *actions[:insert_at],
            _MANAGE_BILLING,
            *actions[insert_at:],
        ]
        bind.execute(
            sa.update(memberships)
            .where(memberships.c.membership_id == row["membership_id"])
            .values(allowed_actions_json=updated_actions)
        )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    memberships = sa.Table(
        "account_user_memberships",
        metadata,
        autoload_with=bind,
    )
    rows = bind.execute(
        sa.select(
            memberships.c.membership_id,
            memberships.c.allowed_actions_json,
        )
    ).mappings()
    for row in rows:
        actions = _action_list(row.get("allowed_actions_json"))
        if _MANAGE_BILLING not in actions:
            continue
        bind.execute(
            sa.update(memberships)
            .where(memberships.c.membership_id == row["membership_id"])
            .values(
                allowed_actions_json=[
                    action for action in actions if action != _MANAGE_BILLING
                ]
            )
        )
