from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.core.db import get_session, init_schema
from app.core.models import (
    PluginObservabilityEvent,
    RunRecord,
    Site,
    SiteApiKey,
    UsageMeterEvent,
)
from app.domain.agent_feedback.contracts import (
    AGENT_FEEDBACK_CONTRACT_VERSION,
    AGENT_FEEDBACK_EVENT_KIND,
)
from app.domain.feedback_status.service import FeedbackOperationalStatusService
from app.domain.observability.editor_assist_quality import (
    ADDON_PLUGIN_SLUG,
    GENERATION_EVENT,
)
from app.domain.observability.editor_assist_quality import (
    CONTRACT_VERSION as EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
)
from app.domain.observability.plugin_events import (
    MONITORING_STATE_CONTRACT_VERSION,
    MONITORING_STATE_EVENT_KIND,
)

FIXTURE_CONTRACT_VERSION = "feedback_flywheel_local_fixture.v1"
FIXTURE_SCOPE = "deterministic_synthetic_metadata_only"
FIXTURE_SITE_IDS = (
    "site_feedback_fixture_enabled_active",
    "site_feedback_fixture_enabled_silent",
    "site_feedback_fixture_disabled",
    "site_feedback_fixture_unknown",
)
FIXTURE_KEY_IDS = tuple(site_id.replace("site_", "key_", 1) for site_id in FIXTURE_SITE_IDS)


def _validate_local_environment(settings: Settings) -> None:
    environment = settings.environment.strip().lower()
    if environment not in {"development", "dev", "test"}:
        raise RuntimeError(
            "feedback flywheel fixtures are development-only; "
            f"refusing environment {environment or 'unknown'}"
        )
    database = make_url(settings.database_url)
    if database.get_backend_name() != "sqlite":
        host = str(database.host or "").strip().lower()
        if host not in {"", "localhost", "127.0.0.1", "::1", "postgres"}:
            raise RuntimeError(
                "feedback flywheel fixtures require a local database; "
                f"refusing host {host or 'unknown'}"
            )


def _run_record(*, site_id: str, now: datetime) -> RunRecord:
    run_id = f"run_{site_id}"
    started_at = now - timedelta(hours=2)
    return RunRecord(
        run_id=run_id,
        site_id=site_id,
        account_id=None,
        subscription_id=None,
        plan_version_id=None,
        ability_name="npcink-abilities-toolkit/feedback-fixture",
        ability_family="text",
        skill_id=None,
        workflow_id=None,
        contract_version=FIXTURE_CONTRACT_VERSION,
        channel="wordpress",
        execution_kind="text",
        execution_tier="cloud",
        execution_pattern="step_offload",
        data_classification="internal",
        profile_id="fixture",
        canonical_run_id=None,
        status="succeeded",
        idempotency_key=f"idem_{run_id}",
        request_fingerprint=f"fingerprint_{run_id}",
        trace_id=f"trace_{site_id}",
        input_json={},
        execution_input_ciphertext=None,
        policy_json={},
        selected_provider_id="fixture",
        selected_model_id="fixture-model",
        selected_instance_id="fixture-instance",
        fallback_used=False,
        started_at=started_at,
        processing_started_at=started_at,
        finished_at=started_at + timedelta(seconds=1),
    )


def _plugin_event(
    *,
    dedupe_key: str,
    site_id: str,
    event_kind: str,
    received_at: datetime,
    payload: dict[str, object],
    latency_ms: int | None = None,
) -> PluginObservabilityEvent:
    return PluginObservabilityEvent(
        dedupe_key=dedupe_key,
        site_id=site_id,
        key_id=site_id.replace("site_", "key_", 1),
        schema_version="1",
        plugin_slug=ADDON_PLUGIN_SLUG,
        plugin_version="fixture",
        source="local",
        event_kind=event_kind,
        event_id=f"event_{dedupe_key}",
        status="ok",
        latency_ms=latency_ms,
        payload_json=payload,
        emitted_at=received_at,
        captured_at=received_at,
        received_at=received_at,
    )


def _monitoring_event(
    *,
    site_id: str,
    enabled: bool,
    received_at: datetime,
) -> PluginObservabilityEvent:
    state = "enabled" if enabled else "disabled"
    return _plugin_event(
        dedupe_key=f"feedback_fixture_monitoring_{state}_{site_id}",
        site_id=site_id,
        event_kind=MONITORING_STATE_EVENT_KIND,
        received_at=received_at,
        payload={
            "monitoring_state_contract": MONITORING_STATE_CONTRACT_VERSION,
            "monitoring_enabled": enabled,
            "content_storage": "omitted_metadata_only",
        },
    )


def cleanup_fixture(settings: Settings) -> dict[str, int]:
    _validate_local_environment(settings)
    deleted: dict[str, int] = {}
    with get_session(settings.database_url) as session:
        for name, model in (
            ("plugin_observability_events", PluginObservabilityEvent),
            ("usage_meter_events", UsageMeterEvent),
            ("run_records", RunRecord),
            ("site_api_keys", SiteApiKey),
            ("sites", Site),
        ):
            conditions = model.site_id.in_(FIXTURE_SITE_IDS)
            deleted[name] = int(
                session.scalar(select(func.count()).select_from(model).where(conditions)) or 0
            )
            session.execute(delete(model).where(conditions))
        session.commit()
    return deleted


def seed_fixture(
    settings: Settings,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    _validate_local_environment(settings)
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    cleanup_fixture(settings)

    enabled_active, enabled_silent, disabled, _unknown = FIXTURE_SITE_IDS
    with get_session(settings.database_url) as session:
        for site_id, key_id in zip(FIXTURE_SITE_IDS, FIXTURE_KEY_IDS, strict=True):
            session.add(
                Site(
                    site_id=site_id,
                    name="Feedback flywheel local fixture",
                    status="active",
                    site_url="",
                    metadata_json={
                        "fixture_contract": FIXTURE_CONTRACT_VERSION,
                        "fixture_scope": FIXTURE_SCOPE,
                    },
                )
            )
            session.add(
                SiteApiKey(
                    key_id=key_id,
                    site_id=site_id,
                    secret_hash="fixture-no-credential",
                    label="Feedback flywheel local fixture",
                    scopes_json=["stats:read"],
                    metadata_json={
                        "fixture_contract": FIXTURE_CONTRACT_VERSION,
                        "fixture_scope": FIXTURE_SCOPE,
                    },
                    status="active",
                    expires_at=current_time + timedelta(days=7),
                )
            )

        session.add(_run_record(site_id=enabled_active, now=current_time))
        session.add(_run_record(site_id=enabled_silent, now=current_time))
        session.add(
            _monitoring_event(
                site_id=enabled_active,
                enabled=True,
                received_at=current_time - timedelta(minutes=20),
            )
        )
        session.add(
            _monitoring_event(
                site_id=enabled_silent,
                enabled=True,
                received_at=current_time - timedelta(minutes=19),
            )
        )
        session.add(
            _monitoring_event(
                site_id=disabled,
                enabled=False,
                received_at=current_time - timedelta(minutes=18),
            )
        )
        session.add(
            _plugin_event(
                dedupe_key="feedback_fixture_ordinary_observability",
                site_id=enabled_active,
                event_kind="addon.runtime.ready",
                received_at=current_time - timedelta(minutes=17),
                payload={
                    "fixture_contract": FIXTURE_CONTRACT_VERSION,
                    "content_storage": "omitted_metadata_only",
                },
                latency_ms=25,
            )
        )

        for index in range(4):
            session.add(
                UsageMeterEvent(
                    site_id=enabled_active,
                    event_kind=AGENT_FEEDBACK_EVENT_KIND,
                    meter_key="agent_feedback.editor",
                    quantity=1,
                    ability_family="text",
                    channel="wordpress",
                    execution_kind="agent_feedback",
                    execution_tier="cloud",
                    data_classification="metadata_only",
                    dedupe_key=f"feedback_fixture_agent_feedback_{index}",
                    payload_json={
                        "contract_version": AGENT_FEEDBACK_CONTRACT_VERSION,
                        "fixture_contract": FIXTURE_CONTRACT_VERSION,
                        "outcome": "accepted" if index < 2 else "ignored",
                        "feedback_labels": (
                            ["evidence_useful"] if index < 2 else ["too_generic"]
                        ),
                        "content_storage": "none",
                    },
                    created_at=current_time - timedelta(minutes=16 - index),
                )
            )

        for index in range(5):
            session.add(
                _plugin_event(
                    dedupe_key=f"feedback_fixture_quality_{index}",
                    site_id=enabled_active,
                    event_kind=GENERATION_EVENT,
                    received_at=current_time - timedelta(minutes=10 - index),
                    payload={
                        "quality_contract": EDITOR_ASSIST_QUALITY_CONTRACT_VERSION,
                        "quality_session_id": f"feedback_fixture_session_{index}",
                        "task_key": "content_summary",
                        "generation_sequence": 1,
                        "fixture_contract": FIXTURE_CONTRACT_VERSION,
                        "content_storage": "omitted_metadata_only",
                    },
                    latency_ms=400 + index,
                )
            )
        session.commit()

    report = FeedbackOperationalStatusService(settings.database_url).get_status(
        window_hours=168,
        now=current_time,
    )
    return {
        "action": "seed",
        "fixture_contract": FIXTURE_CONTRACT_VERSION,
        "fixture_scope": FIXTURE_SCOPE,
        "fixture_site_count": len(FIXTURE_SITE_IDS),
        "report": report,
    }


def build_fixture_report(
    settings: Settings,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    _validate_local_environment(settings)
    return {
        "action": "report",
        "fixture_contract": FIXTURE_CONTRACT_VERSION,
        "fixture_scope": FIXTURE_SCOPE,
        "report": FeedbackOperationalStatusService(settings.database_url).get_status(
            window_hours=168,
            now=now,
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed, inspect, or clean deterministic local feedback-flywheel metadata."
    )
    parser.add_argument("action", choices=("seed", "report", "cleanup"))
    parser.add_argument(
        "--init-schema",
        action="store_true",
        help="Create tables only for a disposable local SQLite fixture.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = Settings()
    _validate_local_environment(settings)
    if args.init_schema:
        if not settings.database_url.startswith("sqlite"):
            raise RuntimeError("--init-schema is restricted to disposable SQLite fixtures")
        init_schema(settings.database_url)

    if args.action == "seed":
        payload: dict[str, Any] = seed_fixture(settings)
    elif args.action == "report":
        payload = build_fixture_report(settings)
    else:
        payload = {
            "action": "cleanup",
            "fixture_contract": FIXTURE_CONTRACT_VERSION,
            "fixture_scope": FIXTURE_SCOPE,
            "deleted": cleanup_fixture(settings),
        }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
