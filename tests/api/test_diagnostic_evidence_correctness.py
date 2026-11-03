from datetime import UTC, datetime
from pathlib import Path

from app.core.db import get_session
from app.core.models import ProviderCallRecord, UsageMeterEvent
from tests.api import test_agent_feedback_routes as feedback
from tests.api import test_media_observability_admin as media
from tests.conftest import build_internal_headers

BASE = "/internal/service/admin/runtime-telemetry"


def test_status_reads_do_not_create_call_or_meter_gaps(tmp_path: Path) -> None:
    db, client = media._build_client(tmp_path)
    with get_session(db) as session:
        status = media._run_record(
            "status", "site-media-001", status="succeeded", now=datetime.now(UTC)
        )
        status.ability_family = "knowledge"
        status.ability_name = "npcink-cloud/site-knowledge-status"
        status.execution_kind = "site_knowledge"
        sync = media._run_record(
            "sync", "site-media-001", status="succeeded", now=datetime.now(UTC)
        )
        sync.ability_name = "npcink-cloud/site-knowledge-sync"
        sync.ability_family = "knowledge"
        session.add_all([status, sync])
        session.commit()
    headers = build_internal_headers()
    data = client.get(BASE, headers=headers).json()["data"]
    assert data["totals"]["ai_evidence_required_runs"] == 1
    assert data["governance_gaps"]["runs_without_provider_call_count"] == 1
    assert (
        sum(p["count"] for p in data["issue_daily_counts"]["hosted_model.provider_call_gap"]) == 1
    )
    for issue in ("provider_call_gap", "unmetered_runs"):
        rows = client.get(f"{BASE}/runs?issue_code=hosted_model.{issue}", headers=headers).json()[
            "data"
        ]["items"]
        assert [r["run_id"] for r in rows] == ["sync"]
    rows = client.get(f"{BASE}/runs", headers=headers).json()["data"]["items"]
    assert (
        next(r for r in rows if r["run_id"] == "status")["provider_evidence_state"]
        == "not_required"
    )


def test_feedback_association_does_not_reclassify_or_add_runtime_runs(tmp_path: Path) -> None:
    db, client = media._build_client(tmp_path)
    with get_session(db) as session:
        run = media._run_record(
            "linked", "site-media-001", status="succeeded", now=datetime.now(UTC)
        )
        run.ability_family = "text"
        session.add(run)
        session.flush()
        session.add(
            UsageMeterEvent(
                account_id=run.account_id,
                site_id=run.site_id,
                subscription_id=run.subscription_id,
                plan_version_id=run.plan_version_id,
                run_id=run.run_id,
                event_kind="agent.feedback",
                meter_key="feedback.accepted",
                quantity=1,
                ability_family="agent_feedback",
                channel="openapi",
                execution_kind="agent_feedback",
                dedupe_key="feedback-association",
                payload_json={},
            )
        )
        session.commit()
    data = client.get(BASE, headers=build_internal_headers()).json()["data"]
    assert data["totals"]["runs"] == 1
    assert sum(g["runs_total"] for g in data["capability_groups"]) == 1
    assert [g["group_id"] for g in data["capability_groups"]] == ["text"]


def test_low_volume_errors_survive_default_group_limit(tmp_path: Path) -> None:
    db, client = media._build_client(tmp_path)
    now = datetime.now(UTC)
    with get_session(db) as session:
        for family in range(25):
            for i in range(2):
                run = media._run_record(
                    f"busy-{family}-{i}", "site-media-001", status="succeeded", now=now
                )
                run.ability_family = f"busy-{family}"
                session.add(run)
        failed = media._run_record("quiet-failure", "site-media-001", status="failed", now=now)
        failed.ability_family = "quiet"
        session.add(failed)
        session.flush()
        session.add(
            ProviderCallRecord(
                run_id=failed.run_id,
                provider_id="fixture",
                model_id="fixture",
                instance_id="fixture",
                region="fixture",
                latency_ms=1,
                tokens_in=0,
                tokens_out=0,
                cost=0,
                retry_count=0,
                fallback_used=False,
                error_code="provider.timeout",
                created_at=now,
            )
        )
        session.commit()
    headers = build_internal_headers()
    for limit in (1, 25, 100):
        data = client.get(f"{BASE}?limit={limit}", headers=headers).json()["data"]
        alerts = {a["code"]: a for a in data["alert_summary"]["alerts"]}
        for issue in ("failed_runs", "provider_errors"):
            assert alerts[f"hosted_model.{issue}"]["count"] == 1
            assert alerts[f"hosted_model.{issue}"]["capabilities"] == ["quiet"]
        assert data["evidence_limits"]["capability_groups_truncated"] == (limit < 26)
    rows = client.get(f"{BASE}/runs?issue_code=hosted_model.failed_runs", headers=headers).json()[
        "data"
    ]["items"]
    assert [r["run_id"] for r in rows] == ["quiet-failure"]


def test_impressions_are_not_quality_outcomes_and_ignored_is_not_rejected(tmp_path: Path) -> None:
    _, client = feedback._build_client(tmp_path)
    actions = [
        ("internal_link_impression", "ignored", ["evidence_weak"]),
        ("internal_link_applied_to_editor", "accepted", []),
        ("ordinary", "ignored", []),
        ("ordinary", "expired", []),
        ("ordinary", "blocked_by_policy", []),
        ("ordinary", "rejected", []),
    ]
    for i, (action, outcome, labels) in enumerate(actions):
        response = feedback._post_feedback(
            client,
            feedback._feedback_payload(
                source_action_id=action,
                source_object_type="recommendation_session",
                source_object_id="session",
                local_outcome=outcome,
                feedback_labels=labels,
                operator_note="",
                evidence_ref_ids=[],
            ),
            idempotency_key=f"quality-basis-{i}",
        )
        assert response.status_code == 200
    data = feedback._get_feedback_summary(client).json()["data"]
    assert data["events_total"] == 6
    assert data["quality_events_total"] == 5
    assert data["outcomes"]["ignored"] == 2
    assert data["quality_outcomes"]["ignored"] == 1
    assert data["rates"]["accepted_rate"] == 0.2
    assert data["rates"]["evidence_weak_rate"] == 0
    assert data["low_quality_labels"] == []
    assert data["scenarios"][0]["events_total"] == 5
    point = data["quality_trend"][0]
    assert [point[k] for k in ("accepted", "rejected", "ignored", "expired", "blocked")] == [
        1,
        1,
        1,
        1,
        1,
    ]
    assert data["recommendation_quality"]["internal_links"]["apply_rate"] == 1
