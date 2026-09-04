from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import cast

from app import __version__
from app.api.main import _create_setup_app, create_app
from app.core.config import Settings
from app.core.services import CloudServices
from app.setup.service import SetupService

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_VERSION = "0.2.0"


def test_cloud_release_version_is_consistent_across_runtime_and_packages(tmp_path: Path) -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    uv_lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
    frontend_package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    settings = Settings(
        project_name="Npcink AI Cloud Test",
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'version-contract.sqlite3'}",
        redis_url="redis://localhost:6379/0",
    )

    assert __version__ == EXPECTED_VERSION
    assert pyproject["project"]["version"] == EXPECTED_VERSION
    assert next(
        package["version"]
        for package in uv_lock["package"]
        if package["name"] == "npcink-ai-cloud"
    ) == EXPECTED_VERSION
    assert frontend_package["version"] == EXPECTED_VERSION
    assert create_app(CloudServices(settings=settings)).version == EXPECTED_VERSION
    assert _create_setup_app(cast(SetupService, object())).version == EXPECTED_VERSION
