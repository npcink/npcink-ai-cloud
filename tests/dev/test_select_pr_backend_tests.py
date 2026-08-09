from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "select-pr-backend-tests.py"


def _load_selector():
    spec = importlib.util.spec_from_file_location("select_pr_backend_tests", SCRIPT_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


selector = _load_selector()


def _relative(paths: list[Path]) -> list[str]:
    return [path.relative_to(ROOT).as_posix() for path in paths]


def test_portal_api_changes_select_only_portal_api_tests() -> None:
    selected, fallback = selector.select_impacted_tests(
        ["app/api/routes/portal.py", "app/api/portal_session.py"]
    )

    assert fallback == []
    assert _relative(selected) == [
        "tests/api/test_portal_idempotency.py",
        "tests/api/test_portal_routes.py",
    ]


def test_service_route_changes_select_the_bounded_service_family() -> None:
    selected, fallback = selector.select_impacted_tests(["app/api/routes/service.py"])
    selected_paths = _relative(selected)

    assert fallback == []
    assert "tests/api/test_service_routes.py" in selected_paths
    assert "tests/api/test_service_provider_routes.py" in selected_paths
    assert "tests/api/test_service_site_knowledge_routes.py" in selected_paths
    assert "tests/api/test_payment_routes.py" in selected_paths
    assert "tests/api/test_runtime_execute.py" not in selected_paths


def test_auth_route_changes_include_admin_login_and_session_coverage() -> None:
    selected, fallback = selector.select_impacted_tests(["app/api/routes/auth.py"])

    assert fallback == []
    assert _relative(selected) == [
        "tests/api/test_auth.py",
        "tests/api/test_internal_auth_replay.py",
        "tests/api/test_web_routes.py",
    ]


def test_unknown_api_changes_fail_closed_to_all_api_tests() -> None:
    selected, fallback = selector.select_impacted_tests(["app/api/future_route.py"])

    assert fallback == ["app/api/future_route.py"]
    assert _relative(selected) == sorted(
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "tests" / "api").glob("test_*.py")
    )


def test_central_api_changes_select_all_api_tests() -> None:
    selected, fallback = selector.select_impacted_tests(
        ["app/api/auth.py", "app/api/main.py"]
    )

    assert fallback == []
    assert _relative(selected) == sorted(
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "tests" / "api").glob("test_*.py")
    )


def test_contract_changes_are_not_repeated_in_the_impacted_lane() -> None:
    selected, fallback = selector.select_impacted_tests(
        ["tests/contract/test_ci_efficiency_contract.py"]
    )

    assert selected == []
    assert fallback == []


def test_commercial_mixins_keep_domain_and_portal_service_protection() -> None:
    selected, fallback = selector.select_impacted_tests(
        ["app/domain/commercial/mixins/_site_mixin.py"]
    )
    selected_paths = _relative(selected)

    assert fallback == []
    assert "tests/domain/test_commercial_runtime_defaults.py" in selected_paths
    assert "tests/api/test_portal_routes.py" in selected_paths
    assert "tests/api/test_service_routes.py" in selected_paths


def test_every_current_api_module_has_an_explicit_impact_policy() -> None:
    api_modules = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "app" / "api").rglob("*.py")
    }

    assert api_modules == (
        selector.ALL_API_PATHS
        | selector.FULL_BACKEND_API_PATHS
        | set(selector.API_IMPACT_SPECS)
    )
