"""remove unreleased USD package-budget and top-up inputs

Revision ID: 20260728_0076
Revises: 20260728_0075
Create Date: 2026-07-28 12:30:00.000000
"""

from __future__ import annotations

from collections.abc import Callable

import sqlalchemy as sa
from alembic import op

revision = "20260728_0076"
down_revision = "20260728_0075"
branch_labels = None
depends_on = None


def _without_legacy_budget(value: object) -> object:
    if not isinstance(value, dict):
        return value
    budget = dict(value)
    budget.pop("max_cost_per_period", None)
    return budget


def _without_legacy_topup_metadata(value: object) -> object:
    if not isinstance(value, dict):
        return value
    metadata = dict(value)
    totals = metadata.get("current_period_topup_totals")
    if isinstance(totals, dict):
        cleaned_totals = dict(totals)
        cleaned_totals.pop("cost", None)
        metadata["current_period_topup_totals"] = cleaned_totals

    topups = metadata.get("operator_managed_topups")
    if isinstance(topups, list):
        cleaned_topups: list[object] = []
        for item in topups:
            if not isinstance(item, dict):
                cleaned_topups.append(item)
                continue
            cleaned_item = dict(item)
            increments = cleaned_item.get("increments")
            if isinstance(increments, dict):
                cleaned_increments = dict(increments)
                cleaned_increments.pop("cost", None)
                cleaned_increments.pop("legacy_cost_usd", None)
                cleaned_increments.pop("accounting_fx", None)
                cleaned_item["increments"] = cleaned_increments
            cleaned_topups.append(cleaned_item)
        metadata["operator_managed_topups"] = cleaned_topups
    return metadata


def _clean_json_column(
    table: sa.Table,
    *,
    primary_key: str,
    column_name: str,
    cleaner: Callable[[object], object],
) -> None:
    bind = op.get_bind()
    column = table.c[column_name]
    for row in bind.execute(sa.select(table.c[primary_key], column)).mappings():
        current = row.get(column_name)
        cleaned = cleaner(current)
        if cleaned == current:
            continue
        bind.execute(
            sa.update(table)
            .where(table.c[primary_key] == row[primary_key])
            .values({column_name: cleaned})
        )


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    plan_versions = sa.Table("plan_versions", metadata, autoload_with=bind)
    entitlement_snapshots = sa.Table(
        "account_entitlement_snapshots",
        metadata,
        autoload_with=bind,
    )
    subscriptions = sa.Table("account_subscriptions", metadata, autoload_with=bind)

    _clean_json_column(
        plan_versions,
        primary_key="plan_version_id",
        column_name="budgets_json",
        cleaner=_without_legacy_budget,
    )
    _clean_json_column(
        entitlement_snapshots,
        primary_key="id",
        column_name="budgets_json",
        cleaner=_without_legacy_budget,
    )
    _clean_json_column(
        subscriptions,
        primary_key="subscription_id",
        column_name="metadata_json",
        cleaner=_without_legacy_topup_metadata,
    )


def downgrade() -> None:
    # The removed inputs were unreleased and their denomination is ambiguous.
    # Recreating them would fabricate USD values, so rollback leaves the
    # canonical CNY data unchanged.
    pass
