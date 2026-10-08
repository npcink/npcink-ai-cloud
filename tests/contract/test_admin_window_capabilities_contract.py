from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('admin_windows', ROOT / 'scripts/check-admin-window-capabilities.py')
assert SPEC and SPEC.loader
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


def registry() -> dict:
    return json.loads(CHECK.REGISTRY.read_text())


def test_windows_match_actual_api_and_runtime_limits() -> None:
    CHECK.validate(registry())


@pytest.mark.parametrize('key', ['plugin', 'media', 'vector', 'quality', 'feedback'])
def test_rejects_ui_windows_that_runtime_silently_narrows(key: str) -> None:
    capabilities = registry()
    capabilities[key]['hours'].append(2160)
    with pytest.raises(ValueError, match='ceiling|silently narrowed'):
        CHECK.validate(capabilities)


def test_rejects_backend_limit_change_without_frontend_reconciliation() -> None:
    capabilities = registry()
    path = capabilities['media']['runtimeSource']
    source = (ROOT / path).read_text().replace('min(720, max(1, int(window_hours or 24)))', 'min(336, max(1, int(window_hours or 24)))')
    with pytest.raises(ValueError, match='runtime limit changed'):
        CHECK.validate(capabilities, overrides={path: source})


def test_rejects_api_ceiling_change_even_when_domain_is_unchanged() -> None:
    source = (ROOT / CHECK.API_SOURCE).read_text().replace('le=129600', 'le=43200')
    with pytest.raises(ValueError, match='API query ceiling'):
        CHECK.validate(registry(), overrides={CHECK.API_SOURCE: source})


def test_rejects_unrecognized_clamp_in_previously_unbounded_history() -> None:
    capabilities = registry()
    path = capabilities['pluginHistory']['runtimeSource']
    source = (ROOT / path).read_text().replace('start = end - timedelta(hours=window_hours)', 'start = end - timedelta(hours=min(720, window_hours))')
    with pytest.raises(ValueError, match='runtime limit changed'):
        CHECK.validate(capabilities, overrides={path: source})


def test_rejects_default_outside_supported_choices() -> None:
    capabilities = copy.deepcopy(registry())
    capabilities['quality']['defaultHours'] = 2160
    with pytest.raises(ValueError, match='default'):
        CHECK.validate(capabilities)


def test_rejects_api_minimum_above_advertised_choices() -> None:
    source = (ROOT / CHECK.API_SOURCE).read_text().replace('ge=1, le=129600', 'ge=43200, le=129600')
    with pytest.raises(ValueError, match='minimum'):
        CHECK.validate(registry(), overrides={CHECK.API_SOURCE: source})
