"""Negative guard for the retired ``app.dev`` demo and migration tools.

The 2026-09 app.dev retirement wave removed the local demo seeders, the
local-alpha failure drills, and the one-time environment import helpers from
``app/dev``. They must stay retired: restoring any of them would reintroduce
demo data paths and environment-backed provider configuration that the
active retirement guards (docs/ai-provider-env-config-retirement-2026-06-26.md
and docs/feedback-data-operations-v1.md) prohibit.
"""

from __future__ import annotations

import importlib.util

import pytest

RETIRED_DEV_TOOL_MODULES = (
    "app.dev.auth_failure_drill",
    "app.dev.callback_failure_drill",
    "app.dev.provider_failure_drill",
    "app.dev.seed_feedback_flywheel_demo",
    "app.dev.seed_plugin_observability_demo",
    "app.dev.seed_portal_demo",
    "app.dev.import_provider_connections_from_env",
    "app.dev.import_service_settings_from_env",
)


@pytest.mark.parametrize("module_name", RETIRED_DEV_TOOL_MODULES)
def test_retired_dev_tool_module_is_absent(module_name: str) -> None:
    assert importlib.util.find_spec(module_name) is None, (
        f"{module_name} was retired with the app.dev delete wave "
        "and must not be restored"
    )
