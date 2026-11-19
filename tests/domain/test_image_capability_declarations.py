import pytest

from app.adapters.providers.base import ProviderCatalogSnapshot
from app.adapters.providers.openai import OpenAIProviderAdapter
from app.core.models import ProviderConnection
from app.domain.provider_connections.service import (
    _catalog_preview_model,
    _merge_configured_catalog_candidates,
)

MODEL = "gpt-image-2.5-flare"


def test_model_name_does_not_import_a_third_party_edit_declaration() -> None:
    seed = OpenAIProviderAdapter()._build_catalog_model_seed({"id": MODEL})
    assert seed is not None
    assert [item.endpoint_variant for item in seed.instances] == ["image_generations"]
    preview = _catalog_preview_model(seed)
    assert preview["verified"] is False
    assert preview["image_capability_declarations"] == {
        "image_generation": {"supported": True}, "image_editing": {"supported": False},
    }


def test_provider_endpoint_metadata_prefills_both_operations() -> None:
    seed = OpenAIProviderAdapter()._build_catalog_model_seed({
        "id": MODEL, "supported_endpoints": ["/v1/images/generations", "/v1/images/edits"],
    })
    assert seed is not None
    assert [item.endpoint_variant for item in seed.instances] == [
        "image_generations", "image_edits",
    ]


def test_broad_openai_compatibility_does_not_infer_image_editing() -> None:
    seed = OpenAIProviderAdapter()._build_catalog_model_seed(
        {
            "id": "gpt-image-custom",
            "supported_endpoint_types": ["openai"],
            "input_modalities": ["image"],
        }
    )
    assert seed is not None
    assert [item.endpoint_variant for item in seed.instances] == ["image_generations"]


def test_saved_flags_override_later_metadata_and_preserve_route_identity() -> None:
    adapter = OpenAIProviderAdapter(model_metadata_overrides={MODEL: {
        "image_capabilities": {"image_generation": True, "image_editing": True},
    }})
    original = adapter._build_catalog_model_seed({"id": MODEL})
    assert original is not None
    adapter.model_metadata_overrides[MODEL]["image_capabilities"] = {
        "image_generation": False, "image_editing": True,
    }
    seed = adapter._build_catalog_model_seed({
        "id": MODEL, "supported_endpoints": ["/v1/images/generations"],
    })
    assert seed is not None
    assert [item.endpoint_variant for item in seed.instances] == ["image_edits"]
    assert seed.instances[0].instance_id == original.instances[1].instance_id
    assert seed.raw_json["image_capability_declarations"] == {
        "image_generation": {"supported": False}, "image_editing": {"supported": True},
    }


def test_manual_both_disabled_creates_no_image_route() -> None:
    seed = OpenAIProviderAdapter(
        model_metadata_overrides={
            MODEL: {
                "image_capabilities": {
                    "image_generation": False,
                    "image_editing": False,
                },
                "source": "operator_admin",
                "revision": "v1",
            }
        }
    )._build_catalog_model_seed({"id": MODEL})
    assert seed is not None
    assert seed.instances == []


def test_manual_positive_can_classify_an_unknown_gateway_model() -> None:
    seed = OpenAIProviderAdapter(
        model_metadata_overrides={
            "private-image-alias": {
                "image_capabilities": {"image_generation": False, "image_editing": True},
                "source": "operator_admin",
                "revision": "v1",
            }
        }
    )._build_catalog_model_seed({"id": "private-image-alias"})
    assert seed is not None
    assert seed.feature == "image_generation"
    assert [item.endpoint_variant for item in seed.instances] == ["image_edits"]


def test_legacy_endpoint_declaration_without_provenance_is_ignored() -> None:
    seed = OpenAIProviderAdapter(model_metadata_overrides={MODEL: {
        "endpoint_variants": ["image_generations", "image_edits"],
    }})._build_catalog_model_seed({"id": MODEL})
    assert seed is not None
    assert [item.endpoint_variant for item in seed.instances] == ["image_generations"]


def test_partial_catalog_retains_manual_endpoints_without_verification() -> None:
    overrides = {
        MODEL: {
            "image_capabilities": {"image_generation": False, "image_editing": True},
            "source": "operator_admin",
            "revision": "v1",
        }
    }
    adapter = OpenAIProviderAdapter(model_metadata_overrides=overrides)
    adapter.provider_id = "gateway"
    connection = ProviderConnection(
        connection_id="gateway",
        provider_type="openai_compatible",
        display_name="Gateway",
        config_json={
            "provider_id": "gateway",
            "model_ids": [MODEL],
            "model_metadata_overrides": overrides,
        },
        metadata_json={},
    )
    snapshot = ProviderCatalogSnapshot(
        provider_id="gateway",
        display_name="Gateway",
        adapter_type="openai",
        models=[],
    )
    first = _merge_configured_catalog_candidates(connection, snapshot, adapter=adapter)
    second = _merge_configured_catalog_candidates(connection, snapshot, adapter=adapter)
    assert first == second
    assert connection.config_json["model_metadata_overrides"] == overrides
    seed = first.models[0]
    assert seed.raw_json["upstream_status"] == "missing_from_latest_catalog"
    assert [item.endpoint_variant for item in seed.instances] == ["image_edits"]
    assert seed.instances[0].health_status == "unknown"
    assert _catalog_preview_model(seed)["verified"] is False


def test_disabled_capability_rejects_stale_binding_before_upstream_dispatch() -> None:
    import httpx
    import pytest

    from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest

    attempts = []

    def dispatch(request: httpx.Request) -> httpx.Response:
        attempts.append(request)
        return httpx.Response(500)

    adapter = OpenAIProviderAdapter(
        api_key="test-only-key",
        transport=httpx.MockTransport(dispatch),
        model_namespace_prefix="gateway",
        model_metadata_overrides={
            MODEL: {
                "image_capabilities": {"image_generation": True, "image_editing": False},
                "source": "operator_admin",
                "revision": "v1",
            }
        },
    )
    with pytest.raises(ProviderExecutionError, match="disabled by operator") as caught:
        adapter.execute(
            ProviderExecutionRequest(
                run_id="stale-binding",
                site_id="test",
                ability_name="test",
                profile_id="test",
                execution_kind="image_generation",
                model_id=f"gateway/{MODEL}",
                instance_id="old-edit",
                endpoint_variant="image_edits",
                trace_id="test",
                input_payload={},
                policy={},
                timeout_ms=1000,
            )
        )
    assert caught.value.retryable is False
    assert attempts == []


@pytest.mark.parametrize(("feature", "endpoint"), [
    ("text", "chat_completions"), ("vision", "responses"), ("embedding", "embeddings"),
])
def test_unified_feature_correction_replaces_conflicting_catalog_capabilities(
    feature: str, endpoint: str,
) -> None:
    seed = OpenAIProviderAdapter(model_metadata_overrides={"custom": {
        "feature": feature, "source": "operator_admin", "revision": "model-capabilities-v1",
        "image_capabilities": {"image_generation": False, "image_editing": False},
        "endpoint_variant": "image_edits",
    }})._build_catalog_model_seed({
        "id": "custom", "feature": "image_generation",
        "capability_tags": ["image_generation", "vision"],
        "supported_endpoints": ["/v1/images/generations", "/v1/images/edits"],
    })
    assert seed is not None
    assert seed.feature == feature
    assert [instance.endpoint_variant for instance in seed.instances] == [endpoint]
    assert set(seed.instances[0].capability_tags) & {
        "text", "vision", "embedding", "image_generation",
    } == {feature}
    assert _catalog_preview_model(seed)["verified"] is False
