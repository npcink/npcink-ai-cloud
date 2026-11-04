"""Keep frontend fault tests grounded in the current read-only serializers."""
import json
import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, RunRecord, ServiceAuditEvent, Site
from app.domain.commercial.service import CommercialService
from app.domain.runtime.service import RuntimeService


class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 11, 2, 6, tzinfo=UTC)


def serializer_examples(tmp_path):
    # SQLite drops tzinfo; the real run serializer treats naive values as local.
    # Fix only this synthetic generation environment and restore libc TZ even
    # when serialization raises. patch.dict restores an absent TZ as absent.
    try:
        with patch.dict(os.environ, {"TZ": "UTC"}):
            time.tzset()
            return _serializer_examples(tmp_path)
    finally:
        time.tzset()


def _serializer_examples(tmp_path):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'diagnostic-contract.sqlite3'}"
    init_schema(database_url)
    settings = Settings(environment="test")
    commercial = CommercialService(database_url, settings=settings)
    now = FixedDateTime.now()
    commercial.now_factory = lambda: now
    commercial.upsert_account(account_id="acct_contract", name="Contract Customer", status="active")
    with get_session(database_url) as session:
        account = session.get(Account, "acct_contract")
        account.created_at = now
        account.updated_at = now
        session.add(ServiceAuditEvent(
            account_id="acct_contract", site_id="site_contract", event_kind="contract.saved",
            outcome="succeeded", actor_kind="platform_admin", actor_ref="operator",
            scope_kind="account", scope_id="acct_contract", idempotency_key="contract-key",
            created_at=now, payload_json={"request": "must not reach browser"},
        ))
        session.commit()
    runtime = RuntimeService(database_url, settings=settings)
    with patch("app.domain.runtime.service.datetime", FixedDateTime):
        empty = runtime.get_runtime_telemetry_diagnostics(recent_minutes=1440, limit=25)
        with get_session(database_url) as session:
            session.add(RunRecord(
                run_id="run_contract", site_id="site_contract", ability_name="contract/rewrite",
                ability_family="text", profile_id="text.contract", channel="wordpress",
                execution_kind="provider_hosted", status="failed", trace_id="trace-contract",
                error_code="runtime.rejected", started_at=now - timedelta(minutes=5),
                finished_at=now - timedelta(minutes=4),
            ))
            session.commit()
        result = {
            "coverage": commercial.get_admin_coverage_work_queue(status="all", limit=10),
            "audit": commercial.list_service_audit_events(limit=10, include_payload=False),
            "telemetryEmpty": empty,
            "telemetry": runtime.get_runtime_telemetry_diagnostics(recent_minutes=1440, limit=25),
            "runs": runtime.get_runtime_run_evidence(site_id="site_contract", recent_minutes=1440),
        }
    # Wall-clock query duration is observational, not part of deterministic evidence.
    result["audit"]["diagnostics"]["query_duration_ms"] = 0
    dispose_engine(database_url)
    return result


def test_frontend_diagnostic_fixture_matches_actual_serializers(tmp_path):
    original_tz = os.environ.get("TZ")
    original_localtime = time.localtime(0)
    actual = serializer_examples(tmp_path)
    assert os.environ.get("TZ") == original_tz
    assert time.localtime(0) == original_localtime
    fixture = (
        Path(__file__).parents[2]
        / "frontend/tests/fixtures/admin-diagnostic-serializers.json"
    )
    assert json.loads(fixture.read_text()) == actual


@pytest.mark.parametrize("original_tz", [None, "UTC", "Asia/Shanghai"])
def test_serializer_timezone_restores_on_error(tmp_path, original_tz):
    def broken_serializer(_tmp_path):
        assert os.environ["TZ"] == "UTC"
        assert time.localtime(0).tm_hour == 0
        raise RuntimeError("synthetic serializer failure")

    try:
        with patch.dict(os.environ):
            if original_tz is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = original_tz
            time.tzset()
            original_localtime = time.localtime(0)
            with patch(f"{__name__}._serializer_examples", broken_serializer):
                with pytest.raises(RuntimeError, match="synthetic serializer failure"):
                    serializer_examples(tmp_path)
            assert os.environ.get("TZ") == original_tz
            assert time.localtime(0) == original_localtime
    finally:
        time.tzset()


def test_runtime_site_display_is_bounded_and_does_not_invent_missing_names(tmp_path):
    serializer_examples(tmp_path)
    database_url = f"sqlite+pysqlite:///{tmp_path / 'diagnostic-contract.sqlite3'}"
    with get_session(database_url) as session:
        session.add_all([
            Site(site_id="site_contract", name="Editorial site", site_url="https://example.test"),
            Site(site_id="site_outside", name="Outside cohort", site_url="https://outside.test"),
        ])
        session.commit()
    runtime = RuntimeService(database_url, settings=Settings(environment="test"))
    with patch("app.domain.runtime.service.datetime", FixedDateTime):
        data = runtime.get_runtime_telemetry_diagnostics(recent_minutes=1440)
        assert data["site_display"] == {
            "site_contract": {"name": "Editorial site", "url": "https://example.test"},
        }
        assert "account_id" not in data["site_display"]["site_contract"]
        missing = runtime.get_runtime_telemetry_diagnostics(site_id="site_missing")
        assert "site_display" not in missing
        # Explicit scope may show the existing site even without new runs.
        scoped = runtime.get_runtime_telemetry_diagnostics(site_id="site_outside")
        assert list(scoped["site_display"]) == ["site_outside"]
        assert scoped["totals"]["runs"] == 0
    dispose_engine(database_url)
