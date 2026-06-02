from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.core.config import Settings
from app.core.db import init_schema
from app.dev.seed_runtime import seed_site_auth
from app.domain.observability.plugin_events import PluginObservabilityService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed demo plugin observability metadata for local UI smoke tests."
    )
    parser.add_argument("--site-id", default="site_magick_ai_demo")
    parser.add_argument("--key-id", default="key_plugin_observability_demo")
    parser.add_argument(
        "--secret",
        default="magick-plugin-observability-demo-secret-32b",
    )
    parser.add_argument(
        "--scenario",
        choices=("healthy", "warning", "error"),
        default="warning",
    )
    parser.add_argument(
        "--init-schema",
        action="store_true",
        help="Create missing local tables before seeding. Use only for local fixtures.",
    )
    return parser.parse_args()


def _event(
    *,
    site_id: str,
    plugin_slug: str,
    event_kind: str,
    status: str,
    minutes_ago: int,
    latency_ms: int,
    error_code: str = "",
    route: str = "",
) -> dict[str, object]:
    event_time = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    event_id = f"demo_{site_id}_{uuid4().hex}"
    payload: dict[str, object] = {
        "schema_version": "2026-06-01",
        "plugin_slug": plugin_slug,
        "plugin_version": "0.1.0-demo",
        "source": "local",
        "event_kind": event_kind,
        "event_id": event_id,
        "status": status,
        "latency_ms": latency_ms,
        "captured_at": event_time.isoformat().replace("+00:00", "Z"),
        "emitted_at": event_time.isoformat().replace("+00:00", "Z"),
    }
    if error_code:
        payload["error_code"] = error_code
    if route:
        payload["route"] = route
    return payload


def build_events(site_id: str, scenario: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for index in range(36):
        events.append(
            _event(
                site_id=site_id,
                plugin_slug="magick-ai-abilities",
                event_kind="abilities.callback.completed",
                status="ok",
                minutes_ago=90 - index,
                latency_ms=12 + (index % 8),
            )
        )
    for index in range(18):
        events.append(
            _event(
                site_id=site_id,
                plugin_slug="magick-ai-core",
                event_kind="core.preflight.completed",
                status="ok",
                minutes_ago=54 - index,
                latency_ms=18 + (index % 6),
            )
        )
    for index in range(12):
        events.append(
            _event(
                site_id=site_id,
                plugin_slug="magick-ai-adapter",
                event_kind="adapter.openclaw.dispatch.completed",
                status="ok",
                minutes_ago=36 - index,
                latency_ms=30 + (index % 10),
                route="/openclaw/demo",
            )
        )

    if scenario in {"warning", "error"}:
        events.append(
            _event(
                site_id=site_id,
                plugin_slug="magick-ai-adapter",
                event_kind="adapter.openclaw.dispatch.failed",
                status="error",
                minutes_ago=8,
                latency_ms=650,
                error_code="adapter.dispatch_failed",
                route="/openclaw/demo",
            )
        )
    if scenario == "error":
        for index in range(5):
            events.append(
                _event(
                    site_id=site_id,
                    plugin_slug="magick-ai-abilities",
                    event_kind="abilities.callback.failed",
                    status="error",
                    minutes_ago=7 - index,
                    latency_ms=5000,
                    error_code="abilities.callback_timeout",
                )
            )
    return events


def main() -> None:
    args = parse_args()
    settings = Settings()
    if args.init_schema:
        init_schema(settings.database_url)
    seed_site_auth(
        settings=settings,
        site_id=args.site_id,
        key_id=args.key_id,
        secret=args.secret,
        site_name=f"{args.site_id} demo",
        scopes=["stats:read"],
    )
    result = PluginObservabilityService(settings.database_url).ingest_events(
        site_id=args.site_id,
        key_id=args.key_id,
        events=build_events(args.site_id, args.scenario),
    )
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))


if __name__ == "__main__":
    main()
