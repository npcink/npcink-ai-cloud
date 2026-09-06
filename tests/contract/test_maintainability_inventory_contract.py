from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "report-maintainability-inventory.py"
CONFIG = ROOT / "config" / "maintainability-inventory-v1.json"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("maintainability_inventory", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_maintainability_inventory_reports_advisory_evidence() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(result.stdout)

    assert report["mode"] == "advisory_read_only"
    assert report["revision"] == "maintainability-inventory.v1"
    assert report["large_files"]["threshold_lines"] == 2000
    assert any(
        item["path"] == "app/api/routes/service.py"
        for item in report["large_files"]["watched_file_trends"]
    )
    assert report["test_evidence"]["python_source_text_contract_tests"] > 0
    assert report["test_evidence"]["python_api_domain_behavior_tests"] > 0
    assert report["test_evidence"]["frontend_source_text_contract_files"] > 0
    assert report["test_evidence"]["frontend_vitest_playwright_behavior_declarations"] > 0
    assert report["documents"]["active_documents"] >= report["documents"][
        "dated_active_documents"
    ]


def test_source_text_contract_detection_distinguishes_behavior_assertions() -> None:
    module = _load_script()
    source_test = module._python_test_functions(
        ROOT / "tests" / "contract" / "test_frontend_lock_contract.py"
    )
    behavior_test = module._python_test_functions(
        ROOT / "tests" / "domain" / "test_site_compliance.py"
    )

    assert any(module._is_source_text_contract(node) for node in source_test)
    assert not any(module._is_source_text_contract(node) for node in behavior_test)

    temporary_file_test = module._python_test_functions_from_source(
        "def test_generated_output(tmp_path):\n"
        "    assert (tmp_path / 'result.json').read_text() == '{}'\n"
    )
    repository_source_test = module._python_test_functions_from_source(
        "def test_source_contract():\n"
        "    assert 'marker' in (ROOT / 'script.py').read_text()\n"
    )
    assert not module._is_source_text_contract(temporary_file_test[0])
    assert module._is_source_text_contract(repository_source_test[0])


def test_inventory_baseline_is_current_and_watched_paths_exist() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))

    assert len(config["baseline_revision"]) == 40
    assert all(character in "0123456789abcdef" for character in config["baseline_revision"])
    assert all((ROOT / item["path"]).is_file() for item in config["watched_files"])

    module = _load_script()
    assert module._git_line_count(ROOT, "0" * 40, "app/api/routes/service.py") is None
