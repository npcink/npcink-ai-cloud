from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.adapters.providers.base import ProviderExecutionRequest
from app.core.models import RoutingProfile
from scripts.configure_m4_ollama_preview import (
    BASE_URL,
    CLASSIFICATION_TIMEOUT_MS,
    MODEL_ID,
    PROFILE_IDS,
    _apply_classification_timeout,
    _connection_payload,
    _embedding_connection_payload,
    _probe_embedding,
    _validate_environment,
    configure,
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


def test_m4_ollama_preview_embedding_connection_is_secretless_and_bounded() -> None:
    payload = _embedding_connection_payload()

    assert payload["connection_id"] == "ollama_m4_embedding"
    assert payload["provider_id"] == "ollama-m4-embedding"
    assert payload["base_url"] == "http://host.docker.internal:11434/v1"
    assert payload["capability_ids"] == ["embedding"]
    assert payload["runtime_profile_ids"] == ["embed.default"]
    assert payload["secretless"] is True
    assert payload["config"] == {
        "model_ids": ["qwen3-embedding:0.6b"],
        "site_knowledge_model_id": "qwen3-embedding:0.6b",
        "local_preview_profile_id": "site-knowledge.local-preview.v1",
        "local_preview_probe_revision": "site-knowledge-local-preview-probe.v1",
        "dimensions": 1024,
        "metric": "COSINE",
        "timeout_seconds": 30,
    }
    assert "credential" not in payload
    assert "secret" not in payload


def test_m4_ollama_preview_embedding_probe_requires_expected_dimensions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = SimpleNamespace(connection_id="ollama_m4_embedding")
    request_seen: dict[str, object] = {}

    class Session:
        def __enter__(self) -> Session:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def get(self, _model: object, connection_id: str) -> object | None:
            assert connection_id == "ollama_m4_embedding"
            return connection

    class Adapter:
        def execute(self, request: object) -> object:
            request_seen["request"] = request
            return SimpleNamespace(
                output={"embedding": [0.0] * 1024},
                latency_ms=27,
            )

    monkeypatch.setattr(
        "scripts.configure_m4_ollama_preview.get_session",
        lambda _database_url: Session(),
    )
    monkeypatch.setattr(
        "scripts.configure_m4_ollama_preview.build_provider_adapter_from_connection",
        lambda _settings, received_connection: (
            Adapter() if received_connection is connection else None
        ),
    )

    latency_ms = _probe_embedding(SimpleNamespace(database_url="sqlite://"))  # type: ignore[arg-type]

    assert latency_ms == 27
    request = request_seen["request"]
    assert isinstance(request, ProviderExecutionRequest)
    assert request.execution_kind == "embedding"
    assert request.model_id == "qwen3-embedding:0.6b"
    assert request.input_payload == {"text": "猫咪媒体语义搜索"}
    assert request.policy == {"storage_mode": "no_store"}


def test_m4_ollama_preview_configuration_rejects_production() -> None:
    with pytest.raises(RuntimeError, match="development-only"):
        _validate_environment(SimpleNamespace(environment="production"))  # type: ignore[arg-type]


def test_m4_ollama_preview_disables_embedding_connection_when_probe_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    saved_payloads: list[tuple[dict[str, object], str | None]] = []

    class Service:
        def save_connection(
            self,
            payload: dict[str, object],
            *,
            connection_id: str | None = None,
        ) -> None:
            saved_payloads.append((payload, connection_id))

        def test_connection(self, _connection_id: str) -> dict[str, str]:
            return {"status": "ready"}

    monkeypatch.setattr(
        "scripts.configure_m4_ollama_preview.ProviderConnectionAdminService",
        lambda _database_url, _settings: Service(),
    )

    def fail_probe(_settings: object) -> int:
        raise RuntimeError("probe failed")

    monkeypatch.setattr(
        "scripts.configure_m4_ollama_preview._probe_embedding",
        fail_probe,
    )

    with pytest.raises(RuntimeError, match="probe failed"):
        configure(
            SimpleNamespace(
                environment="development",
                database_url="sqlite://",
            )  # type: ignore[arg-type]
        )

    disabled_payload, connection_id = saved_payloads[-1]
    assert connection_id is None
    assert disabled_payload["connection_id"] == "ollama_m4_embedding"
    assert disabled_payload["enabled"] is False


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
