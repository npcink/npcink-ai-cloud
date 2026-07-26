from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.models import RoutingProfile
from scripts.configure_m4_ollama_preview import (
    BASE_URL,
    CLASSIFICATION_TIMEOUT_MS,
    MODEL_ID,
    PROFILE_IDS,
    _apply_classification_timeout,
    _connection_payload,
    _validate_environment,
)


def test_m4_ollama_preview_connection_is_secretless_and_non_reasoning() -> None:
    payload = _connection_payload()

    assert payload["base_url"] == BASE_URL == "http://host.docker.internal:11434/v1"
    assert payload["provider_id"] == "ollama-m4"
    assert payload["secretless"] is True
    assert payload["runtime_profile_ids"] == list(PROFILE_IDS)
    assert payload["config"] == {
        "model_ids": [MODEL_ID],
        "timeout_seconds": 60,
        "default_reasoning_effort": "none",
    }
    assert "credential" not in payload
    assert "secret" not in payload


def test_m4_ollama_preview_configuration_rejects_production() -> None:
    with pytest.raises(RuntimeError, match="development-only"):
        _validate_environment(SimpleNamespace(environment="production"))  # type: ignore[arg-type]


def test_m4_ollama_preview_classification_uses_provider_timeout_budget() -> None:
    profile = RoutingProfile(
        profile_id="wp-ai.classification",
        execution_kind="text",
        default_policy_json={
            "timeout_ms": 25_000,
            "allow_fallback": True,
            "max_retries": 0,
            "managed_surface": "hosted_runtime_profiles",
        },
    )

    _apply_classification_timeout(profile)

    assert profile.default_policy_json == {
        "timeout_ms": CLASSIFICATION_TIMEOUT_MS,
        "allow_fallback": True,
        "max_retries": 0,
        "managed_surface": "hosted_runtime_profiles",
    }
    assert CLASSIFICATION_TIMEOUT_MS == 60_000


@pytest.mark.parametrize("environment", ["development", "dev", "test"])
def test_m4_ollama_preview_configuration_accepts_development_environments(
    environment: str,
) -> None:
    _validate_environment(SimpleNamespace(environment=environment))  # type: ignore[arg-type]
