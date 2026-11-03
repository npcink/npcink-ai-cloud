from datetime import UTC, datetime

import pytest
from sqlalchemy import delete

from app.core.db import dispose_engine, get_session
from app.core.models import Account, Site, SiteKnowledgeDocument
from app.domain.site_knowledge.metrics import SiteKnowledgeObservabilityService
from tests.api.test_portal_routes import (
    _build_client,
    _grant_account_member_access,
    _portal_headers_for_access,
)


@pytest.fixture
def usage_account(tmp_path):
    database_url, client = _build_client(tmp_path)
    with get_session(database_url) as session:
        session.add_all(
            [Account(account_id="usage", name="Usage"), Account(account_id="other", name="Other")]
        )
        session.add_all(
            [
                Site(site_id="mixed", account_id="usage", name="Mixed"),
                Site(site_id="images", account_id="usage", name="Images"),
                Site(site_id="empty", account_id="usage", name="Empty"),
                Site(site_id="foreign", account_id="other", name="Foreign"),
            ]
        )
        for i, (site_id, source_type) in enumerate(
            [
                ("mixed", "post"),
                ("mixed", "comment"),
                ("mixed", "media"),
                ("images", "media"),
                ("images", "media"),
                ("foreign", "media"),
                ("foreign", "post"),
            ],
            1,
        ):
            session.add(
                SiteKnowledgeDocument(
                    site_id=site_id,
                    post_id=i,
                    source_id=i,
                    source_type=source_type,
                    post_type="attachment" if source_type == "media" else "post",
                    post_status="publish",
                    title="Indexed",
                    url=f"https://example.test/{i}",
                    modified_gmt="2026-10-23 00:00:00",
                    content_hash=f"hash-{i}",
                    last_sync_run_id=f"run-{i}",
                    metadata_json={},
                    last_indexed_at=datetime.now(UTC),
                )
            )
        session.commit()
    grant = _grant_account_member_access(client, site_id="mixed", email="usage@example.com")
    for site_id in ("images", "empty"):
        _grant_account_member_access(
            client, site_id=site_id, email="usage@example.com", idempotency_key=f"access-{site_id}"
        )
    headers = _portal_headers_for_access(grant, site_id="")
    try:
        yield database_url, client, headers
    finally:
        client.close()
        dispose_engine(database_url)


def test_text_default_and_media_are_scoped_and_compatible(usage_account):
    _, client, headers = usage_account
    path = "/portal/v1/account/site-knowledge-usage"
    default = client.get(path, headers=headers)
    text = client.get(path, params={"source_type": "text"}, headers=headers)
    assert default.status_code == text.status_code == 200
    before, data = default.json()["data"], text.json()["data"]
    before.pop("generated_at")
    data.pop("generated_at")
    assert before == data
    assert data["metering_unit"] == "document"
    assert data["items"] == data["sites"]
    assert data["total_used"] == data["total_indexed_document_count"] == 2
    assert {row["site_id"]: row["used"] for row in data["items"]} == {
        "empty": 0,
        "images": 0,
        "mixed": 2,
    }
    assert all(row["used"] == row["indexed_document_count"] for row in data["items"])
    assert "indexed_document_limit" in data
    media = client.get(path, params={"source_type": "media"}, headers=headers)
    assert media.status_code == 200, media.text
    data = media.json()["data"]
    assert data["source_type"] == "media"
    assert data["metering_unit"] == "image"
    assert data["total_used"] == 3
    assert {row["site_id"]: row["used"] for row in data["items"]} == {
        "images": 2,
        "mixed": 1,
    }
    assert "indexed_document_limit" not in data


@pytest.mark.parametrize("source_type", ["unknown", "", "text,media"])
def test_invalid_type_is_not_silently_text(usage_account, source_type):
    _, client, headers = usage_account
    response = client.get(
        "/portal/v1/account/site-knowledge-usage",
        params={"source_type": source_type},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "portal.site_knowledge_usage.source_type_invalid"


@pytest.mark.parametrize("source_type", ["text", "media", "video", "pdf"])
def test_empty_sites_and_reserved_buckets(usage_account, source_type):
    database_url, client, headers = usage_account
    service = SiteKnowledgeObservabilityService(database_url)
    assert (
        service.get_account_document_breakdown(site_ids=[], source_type=source_type)["items"] == []
    )
    empty = service.get_account_document_breakdown(site_ids=["empty"], source_type=source_type)
    assert empty["total_used"] == 0
    if source_type != "text":
        assert empty["items"] == []
    if source_type in ("video", "pdf"):
        response = client.get(
            "/portal/v1/account/site-knowledge-usage",
            params={"source_type": source_type},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["items"] == []


def test_usage_requires_auth_and_publishes_openapi(usage_account):
    _, client, _ = usage_account
    path = "/portal/v1/account/site-knowledge-usage"
    assert client.get(path, params={"source_type": "media"}).status_code == 401
    schema = client.app.openapi()
    operation = schema["paths"][path]["get"]
    parameter = next(p for p in operation["parameters"] if p["name"] == "source_type")
    assert parameter["schema"]["default"] == "text"
    assert parameter["schema"]["enum"] == ["text", "media", "video", "pdf"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PortalSiteKnowledgeUsageResponse",
    }
    assert "items" in schema["components"]["schemas"]["PortalSiteKnowledgeUsageData"]["required"]


def test_media_without_documents_returns_empty_items(usage_account):
    database_url, client, headers = usage_account
    with get_session(database_url) as session:
        session.execute(
            delete(SiteKnowledgeDocument).where(SiteKnowledgeDocument.source_type == "media")
        )
        session.commit()
    response = client.get(
        "/portal/v1/account/site-knowledge-usage", params={"source_type": "media"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["items"] == []
    assert response.json()["data"]["total_used"] == 0
