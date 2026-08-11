from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "select-pr-contract-tests.py"
SPEC = importlib.util.spec_from_file_location("select_pr_contract_tests", MODULE_PATH)
assert SPEC is not None
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["select_pr_contract_tests"] = module
SPEC.loader.exec_module(module)

GLOBAL_APP_SCAN_CONTRACTS = module.GLOBAL_APP_SCAN_CONTRACTS
all_contract_tests = module.all_contract_tests
select_contract_tests = module.select_contract_tests


def test_selector_fails_closed_for_empty_or_non_ordinary_paths() -> None:
    all_tests = all_contract_tests()

    empty = select_contract_tests([])
    script = select_contract_tests(["scripts/report-release-timing.py"])
    contract = select_contract_tests(["tests/contract/test_runtime_contract.py"])

    assert empty.mode == "full" and empty.tests == all_tests
    assert script.mode == "full" and script.tests == all_tests
    assert contract.mode == "full" and contract.tests == all_tests
    assert "tests/contract/test_runtime_data_encryption_cutover_contract.py" in all_tests


def test_selector_fails_closed_for_missing_or_deleted_application_source() -> None:
    selection = select_contract_tests(["app/domain/deleted_module.py"])

    assert selection.mode == "full"
    assert selection.tests == all_contract_tests()
    assert selection.reason == "changed application source is missing or deleted"


def test_selector_fails_closed_when_dependency_source_cannot_be_parsed(
    tmp_path: Path,
) -> None:
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "__init__.py").write_text("", encoding="utf-8")
    (tmp_path / "app" / "broken.py").write_text("def broken(:\n", encoding="utf-8")
    (tmp_path / "tests" / "contract").mkdir(parents=True)
    contract = tmp_path / "tests" / "contract" / "test_boundary.py"
    contract.write_text("def test_boundary():\n    assert True\n", encoding="utf-8")

    selection = select_contract_tests(["app/broken.py"], root=tmp_path)

    assert selection.mode == "full"
    assert selection.tests == ("tests/contract/test_boundary.py",)
    assert "cannot parse Python dependency source" in selection.reason


def test_selector_skips_contracts_for_focused_backend_test_only_change() -> None:
    selection = select_contract_tests(["tests/api/test_portal_routes.py"])

    assert selection.mode == "none"
    assert selection.tests == ()


def test_selector_keeps_global_and_commercial_contracts_for_site_mixin() -> None:
    selection = select_contract_tests(
        [
            "app/domain/commercial/mixins/_site_mixin.py",
            "tests/api/test_portal_routes.py",
            "tests/domain/test_commercial_runtime_defaults.py",
        ]
    )

    assert selection.mode == "targeted"
    assert GLOBAL_APP_SCAN_CONTRACTS.issubset(selection.tests)
    assert "tests/contract/test_site_platform_contract.py" in selection.tests
    assert "tests/contract/test_commercial_repository_retirement_contract.py" in selection.tests
    assert "tests/contract/test_runtime_data_encryption_cutover_contract.py" not in selection.tests
    assert "tests/contract/test_atomic_production_cutover_contract.py" not in selection.tests


def test_selector_traces_portal_session_through_api_import_graph() -> None:
    selection = select_contract_tests(
        ["app/api/portal_session.py", "tests/api/test_portal_routes.py"]
    )

    assert selection.mode == "targeted"
    assert "tests/contract/test_runtime_contract.py" in selection.tests
    assert "tests/contract/test_health_contract.py" in selection.tests
    assert "tests/contract/test_commercial_repository_retirement_contract.py" in selection.tests
    assert "tests/contract/test_runtime_data_encryption_cutover_contract.py" not in selection.tests


def test_selector_treats_package_initializers_as_submodule_dependencies() -> None:
    selection = select_contract_tests(["app/domain/runtime/__init__.py"])

    assert selection.mode == "targeted"
    assert "tests/contract/test_runtime_contract.py" in selection.tests
    assert "tests/contract/test_stats_contract.py" in selection.tests


def test_selector_keeps_exact_source_literal_contract() -> None:
    selection = select_contract_tests(
        ["app/domain/agent_feedback/service.py"]
    )

    assert selection.mode == "targeted"
    assert "tests/contract/test_ai_task_contract.py" in selection.tests
    assert "tests/contract/test_check_changed_contract.py" in selection.tests


def test_selector_output_is_existing_contract_files() -> None:
    selection = select_contract_tests(["app/domain/runtime/service.py"])

    assert selection.mode == "targeted"
    assert selection.tests
    assert all((module.ROOT / path).is_file() for path in selection.tests)
