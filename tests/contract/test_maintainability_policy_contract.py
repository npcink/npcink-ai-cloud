from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check-maintainability-policy.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("maintainability_policy", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_current_maintainability_policy_passes() -> None:
    module = _load_script()
    assert module.check(ROOT, "origin/master") == []


def test_service_route_family_extractor_uses_top_level_path_segment(tmp_path: Path) -> None:
    module = _load_script()
    assert module._route_family("/admin/accounts/{account_id}") == "admin"
    assert module._route_family("/sites/{site_id}/keys") == "sites"
    assert module._route_family("/") is None
    service = tmp_path / "service.py"
    service.write_text(
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "@router.get(path='/runtime/health')\n"
        "def health(): pass\n",
        encoding="utf-8",
    )
    assert module._service_route_families(service) == {"runtime"}


def test_behavior_test_change_is_distinct_from_source_contract_change() -> None:
    module = _load_script()
    assert module._has_behavior_test_change([("M", "tests/api/test_example.py")])
    assert module._has_behavior_test_change([("M", "frontend/tests/vitest/example.test.ts")])
    assert not module._has_behavior_test_change([("M", "tests/contract/test_example.py")])
    assert not module._has_behavior_test_change([("D", "tests/api/test_example.py")])
