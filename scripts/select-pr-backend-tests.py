#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from collections.abc import Iterable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ALL_API_PATHS = {
    "app/api/__init__.py",
    "app/api/envelope.py",
    "app/api/main.py",
    "app/api/routes/__init__.py",
}

FULL_BACKEND_API_PATHS = {"app/api/auth.py"}

API_IMPACT_SPECS: dict[str, tuple[str, ...]] = {
    "app/api/admin_ops.py": ("tests/api/test_service_routes.py",),
    "app/api/browser_security.py": (
        "tests/api/test_auth.py",
        "tests/api/test_web_routes.py",
    ),
    "app/api/media_ingress.py": ("tests/api/test_media_ingress.py",),
    "app/api/portal_idempotency_middleware.py": (
        "tests/api/test_portal_idempotency.py",
        "tests/api/test_portal_routes.py",
    ),
    "app/api/portal_locale.py": ("tests/api/test_portal_routes.py",),
    "app/api/portal_session.py": (
        "tests/api/test_portal_idempotency.py",
        "tests/api/test_portal_routes.py",
    ),
    "app/api/routes/agent_feedback.py": ("tests/api/test_agent_feedback_routes.py",),
    "app/api/routes/auth.py": (
        "tests/api/test_auth.py",
        "tests/api/test_internal_auth_replay.py",
        "tests/api/test_web_routes.py",
    ),
    "app/api/routes/catalog.py": ("tests/api/test_catalog_routes.py",),
    "app/api/routes/customer_journey.py": (
        "tests/api/test_customer_journey_routes.py",
    ),
    "app/api/routes/entitlements.py": ("tests/api/test_entitlement_routes.py",),
    "app/api/routes/health.py": ("tests/api/test_health.py",),
    "app/api/routes/internal.py": (
        "tests/api/test_internal_alpha_onboarding_flow.py",
        "tests/api/test_internal_auth_replay.py",
    ),
    "app/api/routes/media_derivatives.py": (
        "tests/api/test_media_runtime_resources.py",
    ),
    "app/api/routes/observability.py": (
        "tests/api/test_observability_routes.py",
        "tests/api/test_*observability_*.py",
    ),
    "app/api/routes/open.py": (
        "tests/api/test_removed_surfaces.py",
        "tests/api/test_web_routes.py",
    ),
    "app/api/routes/portal.py": (
        "tests/api/test_portal_idempotency.py",
        "tests/api/test_portal_routes.py",
    ),
    "app/api/routes/runs.py": (
        "tests/api/test_runtime_execute.py",
        "tests/api/test_runtime_payload_bounds.py",
    ),
    "app/api/routes/runtime.py": (
        "tests/api/test_runtime_*.py",
        "tests/api/test_cloud_batch_runtime.py",
        "tests/api/test_image_*_runtime.py",
        "tests/api/test_media_*_runtime.py",
        "tests/api/test_site_*_runtime.py",
        "tests/api/test_web_search_runtime.py",
        "tests/api/test_wordpress_ai_connector_runtime.py",
    ),
    "app/api/routes/service.py": (
        "tests/api/test_service*_routes.py",
        "tests/api/test_admin_plan_management.py",
        "tests/api/test_internal_alpha_onboarding_flow.py",
        "tests/api/test_payment_routes.py",
    ),
    "app/api/routes/setup.py": ("tests/api/test_setup_routes.py",),
    "app/api/routes/stats.py": ("tests/api/test_stats_routes.py",),
}


def _expand_specs(specs: Iterable[str]) -> set[Path]:
    selected: set[Path] = set()
    for spec in specs:
        if any(marker in spec for marker in "*?["):
            selected.update(path for path in ROOT.glob(spec) if path.is_file())
            continue
        candidate = ROOT / spec
        if candidate.is_file():
            selected.add(candidate)
    return selected


def _all_api_tests() -> set[Path]:
    return set((ROOT / "tests" / "api").glob("test_*.py"))


def select_impacted_tests(changed_paths: Iterable[str]) -> tuple[list[Path], list[str]]:
    selected: set[Path] = set()
    fallback_paths: list[str] = []

    for raw_path in changed_paths:
        path = str(raw_path or "").strip().replace("\\", "/")
        if not path:
            continue
        candidate = ROOT / path
        if path.startswith(
            (
                "tests/api/test_",
                "tests/domain/test_",
                "tests/core/test_",
                "tests/dev/test_",
            )
        ):
            if candidate.is_file():
                selected.add(candidate)
            continue
        if path.startswith("tests/contract/test_"):
            continue
        if path in ALL_API_PATHS | FULL_BACKEND_API_PATHS:
            selected.update(_all_api_tests())
            continue
        if path in API_IMPACT_SPECS:
            selected.update(_expand_specs(API_IMPACT_SPECS[path]))
            continue
        if path.startswith("app/api/") and path.endswith(".py"):
            fallback_paths.append(path)
            selected.update(_all_api_tests())
            continue
        if path.startswith("app/domain/commercial/mixins/") and path.endswith(".py"):
            selected.update(_expand_specs((
                "tests/domain/test_commercial_*.py",
                "tests/api/test_portal_routes.py",
                "tests/api/test_service_routes.py",
            )))
            continue
        if path.startswith("app/domain/commercial/") and path.endswith(".py"):
            selected.update(_expand_specs(("tests/domain/test_commercial_*.py",)))
            continue
        if path.startswith("app/domain/runtime/") and path.endswith(".py"):
            selected.update(_expand_specs(("tests/domain/test_runtime_*.py",)))
            continue
        if path.startswith("app/domain/wordpress_ai_connector/") and path.endswith(".py"):
            selected.update(
                _expand_specs(
                    (
                        "tests/api/test_wordpress_ai_connector_runtime.py",
                        "tests/domain/test_wordpress_*.py",
                    )
                )
            )
            continue
        if path.startswith("app/domain/") and path.count("/") == 2 and path.endswith(".py"):
            selected.update(_expand_specs(("tests/domain/test_*.py",)))

    return sorted(selected), fallback_paths


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Select fail-closed impacted backend tests for a targeted pull request."
    )
    parser.add_argument("paths", nargs="*", help="Changed repository-relative paths")
    args = parser.parse_args()

    selected, fallback_paths = select_impacted_tests(args.paths)
    for fallback_path in fallback_paths:
        print(
            f"[warning] no targeted API mapping for {fallback_path}; selecting all tests/api",
            file=sys.stderr,
        )
    for path in selected:
        print(path.relative_to(ROOT).as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
