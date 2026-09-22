from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.domain.feedback_status.service import FeedbackOperationalStatusService


def _positive_bounded_hours(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 720:
        raise argparse.ArgumentTypeError("window hours must be between 1 and 720")
    return parsed


def _release_identity(root_dir: Path) -> dict[str, str]:
    release_name = os.getenv("NPCINK_CLOUD_DIAGNOSTIC_RELEASE_NAME", "").strip()
    source_revision = os.getenv(
        "NPCINK_CLOUD_DIAGNOSTIC_SOURCE_REVISION",
        "",
    ).strip()
    manifest_path = root_dir / "release-bundle-manifest.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            manifest = {}
        source = manifest.get("source")
        if not source_revision and isinstance(source, dict):
            source_revision = str(source.get("revision") or "").strip()
    return {
        "release_name": release_name or root_dir.name,
        "source_revision": source_revision or "unknown",
    }


def build_payload(
    settings: Settings,
    *,
    window_hours: int,
    root_dir: Path | None = None,
) -> dict[str, Any]:
    payload = FeedbackOperationalStatusService(settings.database_url).get_status(
        window_hours=window_hours
    )
    payload["deployment"] = {
        "environment": settings.environment,
        **_release_identity(root_dir or Path(__file__).resolve().parents[2]),
    }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print aggregate, read-only feedback data coverage status."
    )
    parser.add_argument(
        "--window-hours",
        type=_positive_bounded_hours,
        default=168,
        help="Coverage window in hours (1-720, default: 168).",
    )
    args = parser.parse_args()
    payload = build_payload(Settings(), window_hours=args.window_hours)
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
