from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.db import get_session
from app.core.models import PluginObservabilityEvent
from tests.api.test_plugin_observability_admin import _build_client
from tests.conftest import build_internal_headers

PATH = "/internal/service/admin/plugin-observability/history"
HEADERS = build_internal_headers(trace_id="tracepluginhistory00000000000000")


def seed(database_url: str, count: int = 65) -> None:
    with get_session(database_url) as session:
        stamp = datetime.now(UTC) - timedelta(days=10)
        for i in range(count):
            session.add(
                PluginObservabilityEvent(
                    dedupe_key=f"history-{i}",
                    site_id="site-001",
                    plugin_slug="npcink-cloud-addon",
                    event_kind=f"kind-{i % 25:02d}",
                    event_id=f"event-{i}",
                    status="failed" if i % 3 == 0 else "ok",
                    received_at=stamp,
                    payload_json={"prompt": "MUST_NOT_LEAK"},
                    correlation_id="cross-site-run",
                )
            )
        session.commit()


def test_all_retained_history_is_paginated_and_new_ingest_does_not_shift_pages(
    tmp_path: Path,
) -> None:
    db, client = _build_client(tmp_path)
    seed(db)
    query = {"window_hours": 720, "view": "events", "page_size": 20}
    first = client.get(PATH, params=query, headers=HEADERS).json()["data"]
    assert first["total"] == 65
    assert first["pages"] == 4
    assert len(first["items"]) == 20
    assert "MUST_NOT_LEAK" not in str(first)
    with get_session(db) as session:
        session.add(
            PluginObservabilityEvent(
                dedupe_key="late",
                site_id="site-001",
                plugin_slug="npcink-cloud-addon",
                event_kind="late",
                received_at=datetime.now(UTC) - timedelta(days=10),
            )
        )
        session.commit()
    query.update(snapshot_at=first["snapshot"]["at"], snapshot_id=first["snapshot"]["id"])
    ids = [item["id"] for item in first["items"]]
    for page in (2, 3, 4):
        data = client.get(PATH, params={**query, "page": page}, headers=HEADERS).json()["data"]
        assert data["total"] == 65
        ids.extend(item["id"] for item in data["items"])
    assert len(ids) == len(set(ids)) == 65
    assert (
        client.get(PATH, params={"window_hours": 720, "view": "events"}, headers=HEADERS).json()[
            "data"
        ]["total"]
        == 66
    )
    empty = client.get(PATH, params={"window_hours": 24}, headers=HEADERS).json()["data"]
    assert empty["total"] == 0 and empty["items"] == []


def test_group_counts_filters_sort_and_clamping_cover_full_window(tmp_path: Path) -> None:
    db, client = _build_client(tmp_path)
    seed(db)
    groups = client.get(PATH, params={"window_hours": 336}, headers=HEADERS).json()["data"]
    assert groups["total"] == 25 and groups["totals"]["events"] == 65
    assert len(groups["items"]) == 20
    group = groups["items"][0]
    detail = client.get(
        PATH,
        params={
            "window_hours": 336,
            "view": "events",
            "site_id": group["site_id"],
            "plugin_slug": group["plugin_slug"],
            "event_kind": group["event_kind"],
        },
        headers=HEADERS,
    ).json()["data"]
    assert detail["total"] == group["events"]
    failed = client.get(
        PATH,
        params={"window_hours": 720, "status": "failed", "view": "events", "page": 999},
        headers=HEADERS,
    ).json()["data"]
    assert failed["total"] == 22 and failed["page"] == 2
    assert all(item["status"] == "failed" for item in failed["items"])
    sorted_rows = client.get(
        PATH, params={"window_hours": 720, "sort": "failures"}, headers=HEADERS
    ).json()["data"]["items"]
    assert [item["failed"] for item in sorted_rows] == sorted(
        [item["failed"] for item in sorted_rows], reverse=True
    )
    assert (
        client.get(
            PATH, params={"window_hours": 720, "site_id": "site-002"}, headers=HEADERS
        ).json()["data"]["total"]
        == 0
    )


def test_history_rejects_invalid_queries_and_unauthorized_reads(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path)
    assert client.get(PATH).status_code in (401, 403)
    for query in (
        {"window_hours": 2161},
        {"page_size": 101},
        {"page": 0},
        {"status": "bad"},
        {"snapshot_id": 1},
        {"snapshot_id": 1, "snapshot_at": "2099-01-01T00:00:00Z"},
    ):
        assert client.get(PATH, params=query, headers=HEADERS).status_code == 422


def test_history_scope_and_cross_site_links_never_leak_run_evidence(tmp_path: Path) -> None:
    from app.core.models import RunRecord

    db, client = _build_client(tmp_path)
    stamp = datetime.now(UTC) - timedelta(minutes=1)
    with get_session(db) as session:
        session.add(
            RunRecord(
                run_id="other-site-run",
                site_id="site-002",
                ability_name="test",
                channel="test",
                execution_kind="hosted",
                profile_id="text",
                status="succeeded",
                trace_id="history-test",
                started_at=stamp,
                input_json={"prompt": "MUST_NOT_LEAK"},
                result_json={"secret": "MUST_NOT_LEAK"},
            )
        )
        for index, (site, kind, status) in enumerate(
            [
                ("site-001", "unknown.event", "warning"),
                ("site-002", "unknown.event", "succeeded"),
                ("site-001", "validation.technical_monitoring_only", "ok"),
            ]
        ):
            session.add(
                PluginObservabilityEvent(
                    dedupe_key=f"scope-history-{index}",
                    site_id=site,
                    plugin_slug="unknown-plugin",
                    event_kind=kind,
                    status=status,
                    received_at=stamp,
                    correlation_id="other-site-run",
                    payload_json={"private": "MUST_NOT_LEAK"},
                )
            )
        session.commit()

    def read(**params):
        return client.get(PATH, params={"view": "events", **params}, headers=HEADERS).json()["data"]

    assert read(record_scope="all")["total"] == 3
    assert read(record_scope="test")["total"] == 1
    data = read()
    assert data["total"] == 2 and data["totals"]["succeeded"] == 1
    by_site = {item["site_id"]: item for item in data["items"]}
    assert by_site["site-001"]["run_id"] is None
    assert by_site["site-002"]["run_id"] == "other-site-run"
    assert "MUST_NOT_LEAK" not in str(data)
    assert read(status="other")["total"] == 1
    assert read(status="ok")["total"] == 1


def test_exact_problem_filter_keeps_older_records_and_missing_codes(tmp_path: Path) -> None:
    from sqlalchemy import update

    db, client = _build_client(tmp_path)
    seed(db)
    with get_session(db) as session:
        session.execute(update(PluginObservabilityEvent).values(
            event_kind="same.kind", error_code="other.reason"
        ))
        for i, code in [(0, "target.reason"), (1, "target.reason"), (3, None), (6, "")]:
            session.execute(update(PluginObservabilityEvent).where(
                PluginObservabilityEvent.event_id == f"event-{i}"
            ).values(error_code=code))
        session.commit()
    query = {"window_hours": 720, "view": "events", "status": "failed",
             "site_id": "site-001", "plugin_slug": "npcink-cloud-addon",
             "event_kind": "same.kind", "error_code": "target.reason"}
    data = client.get(PATH, params=query, headers=HEADERS).json()["data"]
    assert data["total"] == 1 and data["items"][0]["event_id"] == "event-0"
    assert data["items"][0]["error_code"] == "target.reason"
    missing = client.get(PATH, params={**query, "error_code": ""}, headers=HEADERS).json()["data"]
    assert missing["total"] == 2
    assert {item["event_id"] for item in missing["items"]} == {"event-3", "event-6"}
    summary = client.get(
        "/internal/service/admin/plugin-observability", params={"window_hours": 720},
        headers=HEADERS,
    ).json()["data"]
    missing_groups = [item for item in summary["errors"] if not item["error_code"]]
    assert len(missing_groups) == 1 and missing_groups[0]["count"] == 2
    assert client.get(PATH, params={**query, "site_id": "other-site"}, headers=HEADERS).json()[
        "data"
    ]["items"] == []
    assert client.get(PATH, params={**query, "unassigned_site": True}, headers=HEADERS).json()[
        "data"
    ]["items"] == []


def test_event_category_filters_before_limits_and_preserves_totals(tmp_path: Path) -> None:
    db, client = _build_client(tmp_path)
    seed(db, 1)  # Old activity must not be pushed out by newer status reports.
    now = datetime.now(UTC)
    with get_session(db) as session:
        for i in range(60):
            session.add(PluginObservabilityEvent(
                dedupe_key=f"state-{i}", site_id="site-001", plugin_slug="npcink-cloud-addon",
                event_kind="addon.monitoring.state_projected", event_id=f"state-{i}",
                status="ok", received_at=now,
            ))
        session.commit()
    path = "/internal/service/admin/plugin-observability"
    all_data = client.get(path, params={"window_hours": 720}, headers=HEADERS).json()["data"]
    activity = client.get(path, params={"window_hours": 720, "activity_category": "activity"},
                          headers=HEADERS).json()["data"]
    assert len(all_data["recent_activity"]) == 50
    assert len(activity["recent_activity"]) == 1
    assert activity["recent_activity"][0]["event_id"] == "event-0"
    assert activity["totals"] == all_data["totals"]
    history = client.get(PATH, params={"window_hours": 720, "event_category": "status"},
                         headers=HEADERS).json()["data"]
    assert history["totals"]["events"] == 60
    assert client.get(
        PATH, params={"event_category": "invalid"}, headers=HEADERS
    ).status_code == 422
