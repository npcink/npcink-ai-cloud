"""Keep frontend fault tests grounded in the current read-only serializers."""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, RunRecord, ServiceAuditEvent
from app.domain.commercial.service import CommercialService
from app.domain.runtime.service import RuntimeService


class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 11, 2, 6, tzinfo=UTC)


def serializer_examples(tmp_path):
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
    actual = serializer_examples(tmp_path)
    fixture = (
        Path(__file__).parents[2]
        / "frontend/tests/fixtures/admin-diagnostic-serializers.json"
    )
    assert json.loads(fixture.read_text()) == actual
