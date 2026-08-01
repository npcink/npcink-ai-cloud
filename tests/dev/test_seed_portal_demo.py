from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, SupportRequest
from app.dev.bootstrap_portal_site import bootstrap_portal_site
from app.dev.seed_portal_demo import FIXTURE_EMAIL, FIXTURE_SITE_ID, seed_portal_demo
from app.dev.seed_runtime import seed_site_auth
from app.domain.commercial.service import CommercialService

PORTAL_SECRET = "npcink-cloud-portal-demo-secret"


def _settings(tmp_path: Path) -> Settings:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'portal-demo.sqlite3'}"
    init_schema(database_url)
    return Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        portal_jwt_secret="dev-portal-jwt-secret-with-at-least-thirty-two-bytes",
    )


def _provision_portal_identity(settings: Settings) -> None:
    with get_session(settings.database_url) as session:
        session.add(
            Account(
                account_id="acct_portal_demo",
                name="Portal demo account",
                status="active",
                metadata_json={"source": "test"},
            )
        )
        session.commit()
    CommercialService(settings.database_url, settings=settings).upsert_account_member_access(
        account_id="acct_portal_demo",
        email=FIXTURE_EMAIL,
        metadata_json={"source": "test"},
    )


def _provision_unowned_fixture_site(settings: Settings) -> None:
    seed_site_auth(
        settings=settings,
        site_id=FIXTURE_SITE_ID,
        key_id="key_default",
        secret=PORTAL_SECRET,
        site_name="Smoke fixture",
        scopes=["runtime:read", "stats:read"],
    )


def test_seed_portal_demo_is_idempotent_and_visible_to_portal_principal(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _provision_portal_identity(settings)
    _provision_unowned_fixture_site(settings)

    first = seed_portal_demo(settings, secret=PORTAL_SECRET)
    second = seed_portal_demo(settings, secret=PORTAL_SECRET)

    expected_counts = {
        "runs": 8,
        "meter_events": 24,
        "credit_ledger_entries": 8,
        "support_requests": 5,
        "audit_events": 6,
        "billing_snapshots": 1,
    }
    assert {key: first[key] for key in expected_counts} == expected_counts
    assert {key: second[key] for key in expected_counts} == expected_counts
    assert first["account_id"] == "acct_portal_demo"
    assert first["principal_id"] == second["principal_id"]

    service = CommercialService(settings.database_url, settings=settings)
    sites = service.list_portal_sites(principal_id=str(first["principal_id"]))
    site_items = sites["items"]
    assert isinstance(site_items, list)
    smoke_site = next(
        item["site"]
        for item in site_items
        if isinstance(item, dict) and item.get("site", {}).get("site_id") == FIXTURE_SITE_ID
    )
    assert smoke_site["account_id"] == "acct_portal_demo"
    assert smoke_site["name"] == "Npcink AI 演示站点"

    usage = service.inspect_usage_meter(FIXTURE_SITE_ID)
    assert usage["totals"]["runs"] == pytest.approx(8.0)
    assert usage["totals"]["tokens_total"] == pytest.approx(7_340.0)
    assert usage["totals"]["ai_credits"] == pytest.approx(96.0)

    support = service.list_portal_support_requests(
        principal_id=str(first["principal_id"]),
        account_id="acct_portal_demo",
    )
    assert support["pagination"]["total"] == 5
    assert support["summary"]["open"] == 2

    dispose_engine(settings.database_url)


def test_seed_portal_demo_refuses_to_take_over_site_with_active_member(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _provision_portal_identity(settings)
    _provision_unowned_fixture_site(settings)
    bootstrap_portal_site(
        settings=settings,
        site_id=FIXTURE_SITE_ID,
        principal_email="other@example.com",
        public_base_url="http://127.0.0.1:8010",
        rebuild_billing_snapshot=False,
        issue_key=False,
        key_id="",
        secret="",
        key_label="",
        scopes=[],
    )

    with pytest.raises(RuntimeError, match="non-demo activity"):
        seed_portal_demo(settings, secret=PORTAL_SECRET)

    dispose_engine(settings.database_url)


def test_seed_portal_demo_refuses_same_account_site_without_fixture_marker(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _provision_portal_identity(settings)
    seed_site_auth(
        settings=settings,
        site_id=FIXTURE_SITE_ID,
        key_id="key_same_account",
        secret=PORTAL_SECRET,
        site_name="Existing same-account site",
        scopes=["runtime:read", "stats:read"],
        account_id="acct_portal_demo",
        subscription_id="sub_existing_demo",
    )

    with pytest.raises(RuntimeError, match="not managed by the portal demo fixture"):
        seed_portal_demo(settings, secret=PORTAL_SECRET)

    dispose_engine(settings.database_url)


def test_seed_portal_demo_refuses_non_fixture_activity_after_first_seed(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _provision_portal_identity(settings)
    _provision_unowned_fixture_site(settings)
    report = seed_portal_demo(settings, secret=PORTAL_SECRET)
    with get_session(settings.database_url) as session:
        session.add(
            SupportRequest(
                request_id="sr_non_fixture",
                account_id="acct_portal_demo",
                site_id=FIXTURE_SITE_ID,
                principal_id=str(report["principal_id"]),
                email=FIXTURE_EMAIL,
                topic="technical",
                title="Non-fixture request",
                description="Must not be deleted by the demo seed.",
                status="open",
                priority="normal",
                source_path="/portal/support",
                context_json={"source": "test"},
            )
        )
        session.commit()

    with pytest.raises(RuntimeError, match="non-demo activity"):
        seed_portal_demo(settings, secret=PORTAL_SECRET)

    dispose_engine(settings.database_url)


def test_seed_portal_demo_reuses_existing_active_account_subscription(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    seed_site_auth(
        settings=settings,
        site_id="site_identity_anchor",
        key_id="key_identity_anchor",
        secret=PORTAL_SECRET,
        site_name="Identity anchor",
        scopes=["runtime:read", "stats:read"],
        account_id="acct_portal_demo",
        subscription_id="sub_existing_demo",
    )
    bootstrap_portal_site(
        settings=settings,
        site_id="site_identity_anchor",
        principal_email=FIXTURE_EMAIL,
        public_base_url="http://127.0.0.1:8010",
        rebuild_billing_snapshot=False,
        issue_key=False,
        key_id="",
        secret="",
        key_label="",
        scopes=[],
    )
    _provision_unowned_fixture_site(settings)

    report = seed_portal_demo(settings, secret=PORTAL_SECRET)

    assert report["subscription_id"] == "sub_existing_demo"
    assert report["runs"] == 8
    assert report["meter_events"] == 24
    assert report["credit_ledger_entries"] == 8

    dispose_engine(settings.database_url)


def test_seed_portal_demo_completes_single_owner_account_site_access(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _provision_portal_identity(settings)
    seed_site_auth(
        settings=settings,
        site_id="site_existing_unbound",
        key_id="key_existing_unbound",
        secret=PORTAL_SECRET,
        site_name="Existing account site",
        scopes=["runtime:read", "stats:read"],
        account_id="acct_portal_demo",
        subscription_id="sub_existing_demo",
    )
    _provision_unowned_fixture_site(settings)

    report = seed_portal_demo(settings, secret=PORTAL_SECRET)

    service = CommercialService(settings.database_url, settings=settings)
    scope = service.resolve_portal_account_principal_scope(
        account_id="acct_portal_demo",
        principal_id=str(report["principal_id"]),
    )
    sites = service.list_portal_sites(principal_id=str(report["principal_id"]))
    assert scope["is_exclusive"] is True
    assert scope["active_site_count"] == 2
    assert scope["principal_bound_site_count"] == 2
    assert {item["site"]["site_id"] for item in sites["items"]} == {
        "site_existing_unbound",
        FIXTURE_SITE_ID,
    }

    dispose_engine(settings.database_url)


def test_seed_portal_demo_refuses_non_development_environment(tmp_path: Path) -> None:
    settings = _settings(tmp_path).model_copy(update={"environment": "production"})

    with pytest.raises(RuntimeError, match="development-only"):
        seed_portal_demo(settings, secret=PORTAL_SECRET)

    dispose_engine(settings.database_url)
