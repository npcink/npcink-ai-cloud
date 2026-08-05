from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.db import init_schema
from app.dev.feedback_status import _positive_bounded_hours, build_payload


def test_build_payload_includes_manifest_revision_without_exposing_database(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'feedback-status-cli.sqlite3'}"
    init_schema(database_url)
    release_root = tmp_path / "release-test"
    release_root.mkdir()
    (release_root / "release-bundle-manifest.json").write_text(
        json.dumps({"source": {"revision": "abc123"}}),
        encoding="utf-8",
    )
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token="i" * 32,
    )

    report = build_payload(settings, window_hours=24, root_dir=release_root)

    assert report["deployment"] == {
        "environment": "test",
        "release_name": "release-test",
        "source_revision": "abc123",
    }
    serialized = json.dumps(report, sort_keys=True)
    assert database_url not in serialized
    assert "internal_auth_token" not in serialized


@pytest.mark.parametrize("value", ["0", "721", "-1"])
def test_window_hours_rejects_out_of_range_values(value: str) -> None:
    with pytest.raises(argparse.ArgumentTypeError, match="between 1 and 720"):
        _positive_bounded_hours(value)
