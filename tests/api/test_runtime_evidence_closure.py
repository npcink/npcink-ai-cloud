from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.db import get_session
from app.core.models import ProviderCallRecord, RunRecord
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers, seed_site_auth


@pytest.mark.parametrize("call_overflow", [False, True])
def test_gap_counts_records_and_review_share_the_same_cohort(
    tmp_path: Path, call_overflow: bool,
) -> None:
    database_url, client = _build_client(tmp_path)
    now = datetime.now(UTC)
    for site in ("closure", "other"):
        seed_site_auth(database_url, site_id=site, scopes=["runtime:read"])
    with get_session(database_url) as session:
        for run_id, status, kind, minutes, site in [
            ("gap-success", "succeeded", "text", 5, "closure"),
            ("gap-failed", "failed", "text", 5, "closure"),
            ("gap-canceled", "canceled", "text", 5, "closure"),
            ("processing", "running", "text", 1, "closure"),
            ("queued", "queued", "text", 1, "closure"),
            ("recorded-a", "succeeded", "text", 4, "closure"),
            ("recorded-b", "succeeded", "text", 4, "closure"),
            ("upload", "succeeded", "media_upload", 1, "closure"),
            ("old-gap", "succeeded", "text", 50, "closure"),
            ("foreign-gap", "succeeded", "text", 1, "other"),
        ]:
            session.add(RunRecord(
                run_id=run_id, site_id=site, ability_name="test/closure",
                ability_family="text", channel="openapi", execution_kind=kind,
                profile_id="text.ai", status=status, trace_id=run_id,
                started_at=now - timedelta(minutes=minutes),
                finished_at=None if status in {"queued", "running"} else now - timedelta(seconds=30),
                error_code="runtime.rejected" if status == "failed" else None,
            ))
        session.flush()
        for run_id in ("recorded-a", "recorded-b"):
            session.add(ProviderCallRecord(
                run_id=run_id, provider_id="fixture", model_id="fixture",
                instance_id="fixture", region="fixture", latency_ms=10,
                created_at=now - timedelta(minutes=3),
            ))
        if call_overflow:
            session.add_all([
                ProviderCallRecord(
                    run_id="recorded-a", provider_id="fixture", model_id="fixture",
                    instance_id="fixture", region="fixture", latency_ms=10,
                    created_at=now - timedelta(minutes=1),
                ) for _ in range(10001)
            ])
        session.commit()

    def read(path: str = "", **extra: str | int) -> dict:
        response = client.get(
            f"/internal/service/admin/runtime-telemetry{path}",
            params={"site_id": "closure", "recent_minutes": 60, **extra},
            headers=build_internal_headers(),
        )
        assert response.status_code == 200
        return response.json()["data"]

    summary = read()
    assert summary["totals"]["runs"] == 9
    assert summary["totals"]["provider_evidence_pending_runs"] == 2
    assert summary["totals"]["provider_evidence_required_runs"] == 6
    assert summary["totals"]["provider_call_run_coverage_rate"] == 0.3333
    assert summary["governance_gaps"]["runs_without_provider_call_count"] == 4
    issue = "hosted_model.provider_call_gap"
    alert = next(a for a in summary["alert_summary"]["alerts"] if a["code"] == issue)
    assert alert["count"] == sum(p["count"] for p in alert["daily_counts"]) == 4
    assert summary["capability_groups"][0]["provider_call_gap_runs"] == 4
    affected = read("/runs", issue_code=issue)["items"]
    assert {r["run_id"] for r in affected} == {"gap-success", "gap-failed", "gap-canceled", "old-gap"}
    assert all(r["provider_call_count"] == 0 for r in affected)
    states = {r["run_id"]: r["provider_evidence_state"] for r in affected}
    assert states["gap-failed"] == "failed_without_call"
    assert states["gap-canceled"] == "canceled_without_call"
    assert states["gap-success"] == "missing"
    context = read("/runs", issue_code=issue, evidence_scope="context")["items"]
    assert {r["run_id"] for r in context} == {"recorded-a", "recorded-b"}
    assert all(r["provider_call_count"] > 0 for r in context)
    bounded = read("/runs", issue_code=issue, limit=1)
    assert len(bounded["items"]) == 1 and bounded["truncated"]
    assert read("/runs", issue_code=issue, site_id="other")["items"][0]["run_id"] == "foreign-gap"
    assert read("/runs", issue_code=issue, capability="unknown")["items"] == []

    since = (now - timedelta(minutes=10)).isoformat()
    review = read(since=since)
    review_rows = read("/runs", since=since, issue_code=issue)["items"]
    assert review["totals"]["runs"] == 8
    assert review["governance_gaps"]["runs_without_provider_call_count"] == len(review_rows) == 3
    assert "old-gap" not in {r["run_id"] for r in review_rows}
    empty = read(since=now.isoformat())
    assert empty["totals"]["runs"] == 0
    assert empty["provider_failures"] == []
    assert empty["alert_summary"]["alerts"] == []
    assert read("/runs", since=now.isoformat(), issue_code=issue)["items"] == []
    assert client.get("/internal/service/admin/runtime-telemetry/runs").status_code == 401
    assert client.get(
        "/internal/service/admin/runtime-telemetry/runs?evidence_scope=invalid",
        headers=build_internal_headers(),
    ).status_code == 422
    assert client.get(
        "/internal/service/admin/runtime-telemetry?since=invalid",
        headers=build_internal_headers(),
    ).status_code == 422
