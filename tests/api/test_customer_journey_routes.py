from __future__ import annotations

import json
from contextlib import contextmanager, nullcontext
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import CustomerJourneyEvent, RunRecord
from app.core.services import CloudServices
from app.domain.commercial.service import CommercialService
from app.domain.customer_journey import service as customer_journey_service_module
from app.domain.customer_journey.service import CustomerJourneyService
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_auth_headers,
    build_portal_headers,
    merge_json_headers,
    seed_site_auth,
)

_PORTAL_GRANT: dict[str, object] = {}


def _build_client(tmp_path: Path) -> tuple[str, TestClient]:
    _PORTAL_GRANT.clear()
    database_url = f"sqlite+pysqlite:///{tmp_path / 'customer-journey.sqlite3'}"
    init_schema(database_url)
    seed_site_auth(database_url, site_id="site_journey", scopes=["stats:read"])
    seed_site_auth(
        database_url,
        site_id="site_other",
        key_id="key_other",
        secret="other-site-test-secret",
        scopes=["stats:read"],
    )
    _PORTAL_GRANT.update(
        CommercialService(database_url).upsert_account_member_access(
            account_id="acct_site_journey",
            email="journey-portal@example.com",
            site_id="site_journey",
            metadata_json={"source": "test"},
        )
    )
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
    )
    return database_url, TestClient(create_app(CloudServices(settings=settings)))


def _event(
    *,
    event_id: str,
    session_id: str = "opaque-session-00000001",
    journey: str = "title_generation",
    step: str = "started",
    occurred_at: datetime | None = None,
    **overrides: object,
) -> dict[str, object]:
    value: dict[str, object] = {
        "event_id": event_id,
        "cohort_id": "validation-2026-08",
        "anonymous_session_id": session_id,
        "surface": "wordpress_editor",
        "journey": journey,
        "step": step,
        "browser_family": "chromium",
        "viewport_class": "desktop",
        "occurred_at": (occurred_at or datetime.now(UTC)).isoformat().replace("+00:00", "Z"),
    }
    value.update(overrides)
    return value


def _post_events(
    client: TestClient,
    events: list[dict[str, object]],
    *,
    site_id: str = "site_journey",
    idempotency_key: str = "journey-batch-1",
):
    payload = {"contract_version": "customer_journey_event.v1", "events": events}
    body = json.dumps(payload, separators=(",", ":")).encode()
    return client.post(
        "/v1/customer-journey/events",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/customer-journey/events",
                site_id=site_id,
                body=body,
                idempotency_key=idempotency_key,
                nonce=f"nonce-{idempotency_key}",
                trace_id="tracecustomerjourney0000000001",
            )
        ),
    )


def _post_portal_events(
    client: TestClient,
    events: list[dict[str, object]],
    *,
    site_id: str = "site_journey",
    idempotency_key: str = "portal-journey-batch-1",
):
    return client.post(
        f"/portal/v1/sites/{site_id}/customer-journey/events",
        json={"contract_version": "customer_journey_event.v1", "events": events},
        headers=build_portal_headers(
            principal_id=str(_PORTAL_GRANT["principal_id"]),
            session_version=int(_PORTAL_GRANT.get("session_version") or 1),
            idempotency_key=idempotency_key,
        ),
    )


def test_portal_customer_journey_is_authenticated_site_scoped_and_idempotent(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    event = _event(
        event_id="portal-login-succeeded-0001",
        surface="portal",
        journey="login",
        step="succeeded",
    )

    unauthenticated = client.post(
        "/portal/v1/sites/site_journey/customer-journey/events",
        json={"contract_version": "customer_journey_event.v1", "events": [event]},
        headers={
            "Idempotency-Key": "portal-journey-unauthenticated",
            "Origin": "http://testserver",
            "Referer": "http://testserver/portal",
        },
    )
    first = _post_portal_events(client, [event])
    replay = _post_portal_events(client, [event])

    assert unauthenticated.status_code == 401
    assert first.status_code == 200
    assert first.json()["data"]["stored_count"] == 1
    assert replay.status_code == 200
    assert replay.json() == first.json()
    with get_session(database_url) as session:
        stored = list(session.scalars(select(CustomerJourneyEvent)))
    assert len(stored) == 1
    assert stored[0].site_id == "site_journey"
    assert stored[0].key_id == "portal"
    assert stored[0].surface == "portal"


def test_portal_customer_journey_rejects_foreign_site_surface_and_content(
    tmp_path: Path,
) -> None:
    _database_url, client = _build_client(tmp_path)
    portal_event = _event(
        event_id="portal-site-connect-0001",
        surface="portal",
        journey="site_connect",
        step="succeeded",
    )

    foreign = _post_portal_events(
        client,
        [portal_event],
        site_id="site_other",
        idempotency_key="portal-journey-foreign",
    )
    wrong_surface = _post_portal_events(
        client,
        [{**portal_event, "event_id": "portal-wrong-surface-0001", "surface": "wordpress_editor"}],
        idempotency_key="portal-journey-wrong-surface",
    )
    content = _post_portal_events(
        client,
        [{**portal_event, "event_id": "portal-content-0001", "prompt": "private"}],
        idempotency_key="portal-journey-content",
    )
    wrong_journey = _post_portal_events(
        client,
        [{**portal_event, "event_id": "portal-wrong-journey-0001", "journey": "rewrite"}],
        idempotency_key="portal-journey-wrong-journey",
    )

    assert foreign.status_code == 403
    assert wrong_surface.status_code == 400
    assert wrong_surface.json()["error_code"] == "customer_journey.portal_surface_required"
    assert content.status_code == 422
    assert wrong_journey.status_code == 400
    assert wrong_journey.json()["error_code"] == "customer_journey.portal_journey_required"


def test_customer_journey_ingestion_hashes_session_and_dedupes(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    events = [
        _event(event_id="journey-event-0001", duration_ms=1200),
        _event(
            event_id="journey-event-0002",
            step="failed",
            error_category="provider",
            error_code="provider.timeout",
            duration_ms=6500,
        ),
    ]

    first = _post_events(client, events)
    replay = _post_events(client, events, idempotency_key="journey-batch-2")

    assert first.status_code == 200
    assert first.json()["data"] == {
        "contract_version": "customer_journey_event.v1",
        "accepted_count": 2,
        "stored_count": 2,
        "duplicate_count": 0,
        "content_storage": "omitted_metadata_only",
        "received_at": first.json()["data"]["received_at"],
    }
    assert replay.status_code == 200
    assert replay.json()["data"]["stored_count"] == 0
    assert replay.json()["data"]["duplicate_count"] == 2

    with get_session(database_url) as session:
        stored = list(
            session.scalars(
                select(CustomerJourneyEvent).order_by(CustomerJourneyEvent.event_id.asc())
            )
        )
    assert len(stored) == 2
    assert stored[0].site_id == "site_journey"
    assert all(item.event_id not in {"journey-event-0001", "journey-event-0002"} for item in stored)
    assert all(len(item.event_id) == 64 for item in stored)
    assert stored[0].session_hash != "opaque-session-00000001"
    assert len(stored[0].session_hash) == 64
    assert stored[0].__dict__.get("anonymous_session_id") is None
    assert any(item.error_code == "provider.timeout" for item in stored)


def test_customer_journey_dedupes_stable_event_across_api_key_rotation(
    tmp_path: Path,
) -> None:
    database_url, _client = _build_client(tmp_path)
    service = CustomerJourneyService(database_url)
    event = _event(event_id="journey-key-rotation-0001")

    first = service.ingest_events(
        site_id="site_journey",
        key_id="key_before_rotation",
        events=[event],
    )
    rotated_replay = service.ingest_events(
        site_id="site_journey",
        key_id="key_after_rotation",
        events=[event],
    )

    assert first["stored_count"] == 1
    assert rotated_replay["stored_count"] == 0
    assert rotated_replay["duplicate_count"] == 1
    with get_session(database_url) as session:
        stored = list(session.scalars(select(CustomerJourneyEvent)))
    assert len(stored) == 1
    assert stored[0].key_id == "key_before_rotation"


def test_customer_journey_reconciles_only_confirmed_concurrent_duplicate_insert(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event = _event(event_id="journey-concurrent-duplicate-0001")
    normalized = CustomerJourneyService("unused")._normalize_event(
        site_id="site_journey",
        event=event,
        current_time=datetime.now(UTC),
    )
    dedupe_key = str(normalized["dedupe_key"])

    class ConcurrentDuplicateSession:
        def __init__(self, *, duplicate_exists: bool) -> None:
            self.duplicate_exists = duplicate_exists

        def scalars(self, _statement: object) -> list[str]:
            return []

        def scalar(self, _statement: object) -> str | None:
            return dedupe_key if self.duplicate_exists else None

        def begin_nested(self) -> Any:
            return nullcontext()

        def add(self, _event_model: CustomerJourneyEvent) -> None:
            return None

        def flush(self) -> None:
            raise IntegrityError("concurrent duplicate", {}, Exception("unique conflict"))

        def commit(self) -> None:
            return None

    session = ConcurrentDuplicateSession(duplicate_exists=True)

    @contextmanager
    def fake_get_session(_database_url: str) -> Any:
        yield session

    monkeypatch.setattr(customer_journey_service_module, "get_session", fake_get_session)

    result = CustomerJourneyService("unused").ingest_events(
        site_id="site_journey",
        key_id="key_concurrent",
        events=[event],
    )

    assert result["stored_count"] == 0
    assert result["duplicate_count"] == 1

    session = ConcurrentDuplicateSession(duplicate_exists=False)
    with pytest.raises(IntegrityError, match="concurrent duplicate"):
        CustomerJourneyService("unused").ingest_events(
            site_id="site_journey",
            key_id="key_concurrent",
            events=[event],
        )


def test_customer_journey_rejects_content_and_arbitrary_error_message(tmp_path: Path) -> None:
    _database_url, client = _build_client(tmp_path)
    event = _event(event_id="journey-event-secret", prompt="private prompt")
    response = _post_events(client, [event])
    assert response.status_code == 422

    error_event = _event(
        event_id="journey-event-error-message",
        error_message="request failed with token secret-value",
    )
    error_response = _post_events(
        client,
        [error_event],
        idempotency_key="journey-batch-error-message",
    )
    assert error_response.status_code == 422


def test_customer_journey_requires_explicit_contract_version(tmp_path: Path) -> None:
    _database_url, client = _build_client(tmp_path)
    payload = {"events": [_event(event_id="journey-version-required")]}
    body = json.dumps(payload, separators=(",", ":")).encode()
    response = client.post(
        "/v1/customer-journey/events",
        content=body,
        headers=merge_json_headers(
            build_auth_headers(
                "POST",
                "/v1/customer-journey/events",
                site_id="site_journey",
                body=body,
                idempotency_key="journey-version-required",
                nonce="nonce-journey-version-required",
                trace_id="tracejourneyversionrequired00001",
            )
        ),
    )
    assert response.status_code == 422


def test_customer_journey_summary_builds_bounded_candidates(tmp_path: Path) -> None:
    _database_url, client = _build_client(tmp_path)
    now = datetime.now(UTC) - timedelta(hours=1)
    events = [
        _event(event_id="evt-start-1", session_id="opaque-session-00000001", occurred_at=now),
        _event(
            event_id="evt-failed-1",
            session_id="opaque-session-00000001",
            step="failed",
            occurred_at=now + timedelta(seconds=1),
            error_category="provider",
            error_code="provider.timeout",
            duration_ms=6001,
        ),
        _event(event_id="evt-retry-1", session_id="opaque-session-00000001", step="retried"),
        _event(event_id="evt-retry-2", session_id="opaque-session-00000001", step="retried"),
        _event(event_id="evt-retry-3", session_id="opaque-session-00000001", step="retried"),
        _event(event_id="evt-start-2", session_id="opaque-session-00000002"),
        _event(
            event_id="evt-failed-2",
            session_id="opaque-session-00000002",
            step="abandoned",
            error_category="provider",
            error_code="provider.timeout",
        ),
        _event(event_id="evt-start-3", session_id="opaque-session-00000003"),
        _event(
            event_id="evt-failed-3",
            session_id="opaque-session-00000003",
            step="failed",
            error_category="provider",
            error_code="provider.timeout",
        ),
        _event(
            event_id="evt-accepted-4",
            session_id="opaque-session-00000004",
            step="accepted",
        ),
    ]
    for index, event in enumerate(events):
        event["occurred_at"] = (now + timedelta(seconds=index)).isoformat().replace("+00:00", "Z")
    assert _post_events(client, events).status_code == 200

    response = client.get(
        "/v1/customer-journey/summary?window_hours=24&cohort_id=validation-2026-08",
        headers=build_auth_headers(
            "GET",
            "/v1/customer-journey/summary?window_hours=24&cohort_id=validation-2026-08",
            site_id="site_journey",
            trace_id="tracecustomerjourneysummary00001",
        ),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["totals"] == {
        "events_total": 10,
        "sessions_total": 4,
        "anomalous_sessions_total": 4,
        "sample_truncated": False,
        "sample_event_limit": 20_000,
    }
    title_funnel = next(item for item in data["funnels"] if item["journey"] == "title_generation")
    assert title_funnel["started_total"] == 3
    assert title_funnel["success_rate"] == 0.0
    candidate_codes = {item["code"] for item in data["defect_candidates"]}
    assert {
        "customer_journey.main_path_failure_pressure",
        "customer_journey.repeated_error",
        "customer_journey.accepted_without_save",
        "customer_journey.repeated_retry",
        "customer_journey.slow_interaction",
    }.issubset(candidate_codes)
    assert data["diagnostic_only"] is True
    assert data["production_mutation"] is False
    assert all(len(item["session_ref"]) == 16 for item in data["anomalous_sessions"])


def test_customer_journey_waits_for_session_settlement_before_abandonment_candidate(
    tmp_path: Path,
) -> None:
    _database_url, client = _build_client(tmp_path)
    response = _post_events(
        client,
        [_event(event_id="journey-accepted-active", step="accepted")],
    )
    assert response.status_code == 200

    summary = client.get(
        "/v1/customer-journey/summary",
        headers=build_auth_headers(
            "GET",
            "/v1/customer-journey/summary",
            site_id="site_journey",
            trace_id="tracejourneysettlement000000001",
        ),
    )
    assert summary.status_code == 200
    data = summary.json()["data"]
    assert data["totals"]["anomalous_sessions_total"] == 0
    assert "customer_journey.accepted_without_save" not in {
        item["code"] for item in data["defect_candidates"]
    }


def test_customer_journey_rejects_event_too_far_in_future(tmp_path: Path) -> None:
    _database_url, client = _build_client(tmp_path)
    response = _post_events(
        client,
        [
            _event(
                event_id="journey-future-event",
                occurred_at=datetime.now(UTC) + timedelta(minutes=6),
            )
        ],
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "customer_journey.occurred_at_out_of_range"


def test_customer_journey_rejects_cross_site_run_reference(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    with get_session(database_url) as session:
        session.add(
            RunRecord(
                run_id="run-other-site",
                site_id="site_other",
                ability_name="test/ability",
                channel="test",
                execution_kind="sync",
                profile_id="text.balanced",
                status="succeeded",
                trace_id="trace-other-site-run",
            )
        )
        session.commit()

    response = _post_events(
        client,
        [_event(event_id="journey-run-cross-site", run_id="run-other-site")],
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "customer_journey.run_reference_invalid"


def test_customer_journey_cleanup_uses_thirty_day_default(tmp_path: Path) -> None:
    database_url, _client = _build_client(tmp_path)
    now = datetime.now(UTC)
    with get_session(database_url) as session:
        for event_id, age_days in (("old-event", 31), ("kept-event", 29)):
            session.add(
                CustomerJourneyEvent(
                    dedupe_key=f"dedupe-{event_id}",
                    site_id="site_journey",
                    event_id=event_id,
                    session_hash=f"hash-{event_id}",
                    surface="portal",
                    journey="login",
                    step="succeeded",
                    occurred_at=now - timedelta(days=age_days),
                    received_at=now - timedelta(days=age_days),
                )
            )
        session.commit()

    result = CustomerJourneyService(database_url).cleanup_expired_events(now=now)
    assert result["retention_days"] == 30
    assert result["purged_events"] == 1
    with get_session(database_url) as session:
        event_ids = set(session.scalars(select(CustomerJourneyEvent.event_id)))
    assert event_ids == {"kept-event"}
