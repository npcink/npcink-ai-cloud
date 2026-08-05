from __future__ import annotations

from pathlib import Path

from app.core.db import dispose_engine, init_schema
from app.domain.commercial.service import CommercialService


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'admin-coverage-queue.sqlite3'}"


def test_coverage_queue_routes_missing_customer_identity_to_customer_access(
    tmp_path: Path,
) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = CommercialService(database_url)
    service.upsert_account(
        account_id="acct_missing_owner",
        name="Missing Owner",
        status="active",
    )
    service.upsert_account(
        account_id="acct_healthy_owner",
        name="Healthy Owner",
        primary_email="healthy-owner@example.com",
        status="active",
    )

    result = service.get_admin_coverage_work_queue(limit=10)
    assert result["items"][0]["account"]["account_id"] == "acct_missing_owner"
    items_by_account = {
        item["account"]["account_id"]: item for item in result["items"]
    }

    missing_owner = items_by_account["acct_missing_owner"]
    assert missing_owner["severity"] == "error"
    assert missing_owner["priority"] == 0
    assert missing_owner["reason_code"] == "customer_identity_missing"
    assert missing_owner["recommended_action"] == "repair_customer_access"
    assert (
        missing_owner["action_href"]
        == "/admin/accounts/acct_missing_owner#customer-access"
    )
    assert missing_owner["primary_identity"] is None
    assert missing_owner["identity_relationship_state"] == "missing"
    assert missing_owner["evidence"]["identity_relationship_state"] == "missing"

    healthy_owner = items_by_account["acct_healthy_owner"]
    assert healthy_owner["severity"] == "inactive"
    assert healthy_owner["reason_code"] == "no_site_footprint"
    assert healthy_owner["identity_relationship_state"] == "healthy"
    assert healthy_owner["primary_identity"]["email"] == "healthy-owner@example.com"
    assert result["summary"]["needs_action"] == 1

    dispose_engine(database_url)
