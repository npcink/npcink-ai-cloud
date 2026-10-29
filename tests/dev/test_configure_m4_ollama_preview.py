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
    VISION_MODEL_ID,
    _apply_classification_timeout,
    _connection_payload,
    _embedding_connection_payload,
    _probe_embedding,
    _validate_environment,
    configure,
    configure_embedding_only,
    embedding_config,
)


def test_m4_ollama_preview_connection_is_secretless_and_non_reasoning() -> None:
    payload = _connection_payload()

    assert payload["base_url"] == BASE_URL == "http://host.docker.internal:11434/v1"
    assert payload["provider_id"] == "ollama-m4"
    assert payload["secretless"] is True
    assert payload["runtime_profile_ids"] == list(PROFILE_IDS)
    # Since #1037 the same secretless route also serves the bounded vision model.
    assert payload["capability_ids"] == ["text_generation", "vision"]
    assert VISION_MODEL_ID == "qwen3-vl:2b"
    assert payload["config"] == {
        "model_ids": [MODEL_ID, VISION_MODEL_ID],
        "model_metadata_overrides": {
            MODEL_ID: {
                "endpoint_variant": "ollama_chat",
                "source": "m4_preview_operator_config",
                "revision": "ollama-native-chat-v1",
            },
            VISION_MODEL_ID: {
                "feature": "vision",
                "endpoint_variant": "ollama_chat",
                "context_window": 262144,
                "source": "m4_preview_operator_config",
                "revision": "qwen3-vl-2b-context-v1",
            }
        },
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
        "model_ids": ["npcink-qwen3-vl-embedding:8b-q4_k_m-mmproj-q8"],
        "site_knowledge_model_id": "npcink-qwen3-vl-embedding:8b-q4_k_m-mmproj-q8",
        "local_preview_profile_id": "site-knowledge.local-preview.v1",
        "local_preview_probe_revision": "site-knowledge-local-preview-probe.v2",
        "dimensions": 4096,
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
                output={"embedding": [0.1] * 4096},
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
    assert request.model_id == "npcink-qwen3-vl-embedding:8b-q4_k_m-mmproj-q8"
    assert request.input_payload == {"text": "猫咪媒体语义搜索"}
    assert request.policy == {"storage_mode": "no_store"}


def test_m4_ollama_preview_configuration_rejects_production() -> None:
    with pytest.raises(RuntimeError, match="development-only"):
        _validate_environment(SimpleNamespace(environment="production"))  # type: ignore[arg-type]


def test_embedding_replacement_preserves_other_models_and_settings() -> None:
    original = {
        "model_ids": ["qwen3.5:9b", "qwen3-vl:2b", "qwen3-embedding:0.6b"],
        "site_knowledge_model_id": "qwen3-embedding:0.6b",
        "model_metadata_overrides": {"qwen3.5:9b": {"endpoint_variant": "ollama_chat"}},
        "capability_ids": ["text_generation", "vision", "embedding"],
        "runtime_profile_ids": ["embed.default"], "secretless": True,
    }
    updated = embedding_config(original)
    assert updated["model_ids"] == [
        "qwen3.5:9b", "qwen3-vl:2b", "npcink-qwen3-vl-embedding:8b-q4_k_m-mmproj-q8",
    ]
    for key in ("model_metadata_overrides", "capability_ids", "runtime_profile_ids", "secretless"):
        assert updated[key] == original[key]
    assert original["site_knowledge_model_id"] == "qwen3-embedding:0.6b"
    assert updated["dimensions"] == 4096


def test_embedding_only_rejects_production_before_probe(monkeypatch) -> None:
    def unexpected(settings):
        pytest.fail("production must not probe or mutate")
    monkeypatch.setattr("scripts.configure_m4_ollama_preview._probe_embedding", unexpected)
    with pytest.raises(RuntimeError, match="development-only"):
        configure_embedding_only(SimpleNamespace(environment="production"))


def test_m4_ollama_preview_embedding_probe_failure_does_not_block_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Since #1037 a failed optional embedding probe must not abort provider setup.

    The embedding connection is saved disabled while probing, then re-saved with
    its normal (enabled) payload so the failure stays observable; configuration
    continues to the embedding catalog check instead of re-raising the probe error.
    """
    saved_payloads: list[tuple[dict[str, object], str | None]] = []
    tested_connections: list[str] = []

    class Session:
        def __enter__(self) -> Session:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def get(self, _model: object, _connection_id: str) -> object | None:
            return None  # no legacy connection to disable

    class Service:
        def save_connection(
            self,
            payload: dict[str, object],
            *,
            connection_id: str | None = None,
        ) -> None:
            saved_payloads.append((payload, connection_id))

        def test_connection(self, connection_id: str) -> dict[str, str]:
            tested_connections.append(connection_id)
            # Stop right after the embedding catalog check so the test stays a unit test.
            return {"status": "ready" if len(tested_connections) == 1 else "not_ready"}

    monkeypatch.setattr(
        "scripts.configure_m4_ollama_preview.get_session",
        lambda _database_url: Session(),
    )
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

    with pytest.raises(RuntimeError, match="embedding catalog test did not become ready"):
        configure(
            SimpleNamespace(
                environment="development",
                database_url="sqlite://",
            )  # type: ignore[arg-type]
        )

    embedding_saves = [
        payload
        for payload, _connection_id in saved_payloads
        if payload["connection_id"] == "ollama_m4_embedding"
    ]
    assert [payload["enabled"] for payload in embedding_saves] == [False, True]
    assert all(connection_id is None for _payload, connection_id in saved_payloads)
    assert tested_connections[-1] == "ollama_m4_embedding"


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
