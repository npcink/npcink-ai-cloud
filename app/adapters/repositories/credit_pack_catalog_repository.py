"""Atomic catalog replacement; audit shares the caller's transaction.

See docs/admin-commercial-consistency-contract-v1.md for revision/legacy semantics.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.models import ServiceSetting

CATALOG_SETTING_ID = "commercial_credit_pack_catalog"
UNCONFIGURED_REVISION = "unconfigured"


def catalog_revision(row: ServiceSetting | None) -> str:
    if row is None:
        return UNCONFIGURED_REVISION
    config = row.config_json or {}
    revision = config.get("revision")
    if isinstance(revision, str) and revision:
        return revision
    # Legacy rows get a stable token without a GET-side write or migration.
    return f"legacy:{row.updated_at.isoformat()}"


def replace_catalog(session: Session, *, expected_revision: str, values: dict[str, Any]) -> bool:
    if expected_revision == UNCONFIGURED_REVISION:
        dialect = session.get_bind().dialect.name
        insert = postgres_insert if dialect == "postgresql" else sqlite_insert
        result = session.execute(
            insert(ServiceSetting)
            .values(setting_id=CATALOG_SETTING_ID, **values)
            .on_conflict_do_nothing(index_elements=[ServiceSetting.setting_id])
            .returning(ServiceSetting.setting_id)
        )
        return result.scalar_one_or_none() is not None

    revision = ServiceSetting.config_json["revision"].as_string()
    condition = revision == expected_revision
    if expected_revision.startswith("legacy:"):
        try:
            timestamp = datetime.fromisoformat(expected_revision.removeprefix("legacy:"))
        except ValueError:
            return False
        condition = (revision.is_(None) | (revision == "")) & (
            ServiceSetting.updated_at == timestamp
        )
    result = session.execute(
        update(ServiceSetting)
        .where(ServiceSetting.setting_id == CATALOG_SETTING_ID, condition)
        .values(**values)
        .execution_options(synchronize_session=False)
        .returning(ServiceSetting.setting_id)
    )
    return result.scalar_one_or_none() is not None
