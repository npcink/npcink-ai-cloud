from __future__ import annotations

import importlib

import pytest

from app.ops.baseline_status import (
    evaluate_remote_baseline_status,
    load_remote_baseline_status,
)
from app.ops.baseline_status import main as baseline_status_main
from app.ops.bootstrap_portal_site import bootstrap_portal_site
from app.ops.bootstrap_portal_site import main as bootstrap_portal_site_main
from app.ops.editor_assist_quality_status import (
    build_payload as build_editor_assist_quality_payload,
)
from app.ops.editor_assist_quality_status import (
    main as editor_assist_quality_status_main,
)
from app.ops.feedback_status import build_payload as build_feedback_status_payload
from app.ops.feedback_status import main as feedback_status_main
from app.ops.seed_runtime import main as seed_runtime_main
from app.ops.seed_runtime import seed_site_auth

OPS_KEEPSET_WAVE_B_MODULES = (
    "live_site_addon_install",
    "live_site_addon_package",
    "live_site_addon_rollback",
    "live_site_env",
    "live_site_identity_provision",
    "live_site_preflight",
    "live_site_runtime_execute_execute_packet",
    "live_site_runtime_execute_smoke",
    "live_site_runtime_resolve_execute_packet",
    "live_site_runtime_smoke",
    "live_site_save_verify_handoff",
    "live_site_stage1",
    "live_site_stage1_acceptance",
    "live_site_stage1_execute_packet",
    "live_site_stage1_readiness",
    "live_site_trial_status",
    "production_wordpress_ai_connector_smoke",
)

# Every wave B module except the live_site_env secret/approval library is a
# CLI with a ``main`` entrypoint consumed by scripts/live-site-*.py wrappers.
OPS_KEEPSET_WAVE_B_CLI_MODULES = tuple(
    name for name in OPS_KEEPSET_WAVE_B_MODULES if name != "live_site_env"
)


def test_baseline_status_cli_public_entries() -> None:
    assert callable(baseline_status_main)
    assert callable(evaluate_remote_baseline_status)
    assert callable(load_remote_baseline_status)


def test_feedback_status_cli_public_entries() -> None:
    assert callable(feedback_status_main)
    assert callable(build_feedback_status_payload)


def test_bootstrap_portal_site_cli_public_entries() -> None:
    assert callable(bootstrap_portal_site_main)
    assert callable(bootstrap_portal_site)


def test_seed_runtime_cli_public_entries() -> None:
    assert callable(seed_runtime_main)
    assert callable(seed_site_auth)


def test_editor_assist_quality_status_cli_public_entries() -> None:
    assert callable(editor_assist_quality_status_main)
    assert callable(build_editor_assist_quality_payload)


@pytest.mark.parametrize("module_name", OPS_KEEPSET_WAVE_B_CLI_MODULES)
def test_ops_keepset_wave_b_cli_exposes_main(module_name: str) -> None:
    module = importlib.import_module(f"app.ops.{module_name}")
    assert callable(module.main)


def test_ops_keepset_live_site_env_library_public_entries() -> None:
    module = importlib.import_module("app.ops.live_site_env")
    assert callable(module.parse_env_file)
    assert callable(module.resolve_env_secret)
    assert callable(module.default_env_files)
    assert callable(module.resolve_approval_text)
    assert module.SecretResolution is not None
