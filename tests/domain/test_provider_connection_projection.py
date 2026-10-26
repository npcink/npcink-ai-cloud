from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderConnection
from app.domain.provider_connections.model_allowlist import build_provider_model_allowlist
from app.domain.provider_connections.projection import public_config, public_image_evidence
from app.domain.provider_connections.service import ProviderConnectionAdminService


def test_public_config_masks_nested_provider_credentials_and_keeps_labels() -> None:
    value = public_config(
        {
            "provider_id": "hidden",
            "kind": "openai",
            "api_key": "secret",
            "api_key_label": "primary",
            "nested": {"password": "secret", "region": "global"},
            "models": [{"token": "secret", "name": "x"}],
        },
        ("secret", "token", "password", "api_key"),
    )
    assert value == {
        "api_key_label": "primary",
        "nested": {"region": "global"},
        "models": [{"name": "x"}],
    }


def test_public_image_evidence_returns_allowlisted_status_fields_only() -> None:
    value = public_image_evidence(
        {"image_delivery_probe": {"status": "ready", "probe_id": "p1", "secret": "x"}},
        "image_delivery_probe",
        ("status", "probe_id"),
    )
    assert value == {"status": "ready", "probe_id": "p1"}


@pytest.mark.parametrize(
    ("config", "metadata", "expected", "projected"),
    [
        (
            {"model_ids": [" model-a ", "model-a", "model-b"]},
            {},
            ["model-a", "model-b"],
            ["model-a", "model-b"],
        ),
        (
            {},
            {"model_ids": " model-a,model-a,model-b "},
            ["model-a", "model-b"],
            ["model-a", "model-b"],
        ),
        ({"model_ids": ["model-a"]}, {"model_ids": ["legacy-model"]}, ["model-a"], ["model-a"]),
        (
            {"model_ids": [" ", None]},
            {"model_ids": ["legacy-model"]},
            [],
            [],
        ),
        (
            {"model_ids": ["x" * 129, "x" * 130]},
            {},
            ["x" * 129, "x" * 130],
            ["x" * 128, "x" * 128],
        ),
    ],
    ids=["config-only", "metadata-only", "config-wins", "empty-config-clears", "long-ids"],
)
def test_connection_model_ids_projection_and_allowlist(
    tmp_path: Path,
    config: dict[str, Any],
    metadata: dict[str, Any],
    expected: list[str],
    projected: list[str],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'connection-model-ids.sqlite3'}"
    init_schema(database_url)
    settings = Settings(_env_file=None, environment="test", database_url=database_url)
    service = ProviderConnectionAdminService(database_url, settings)
    try:
        # Seed storage directly to cover legacy metadata-only rows as well as new config rows.
        with get_session(database_url) as session:
            row = ProviderConnection(
                connection_id="openai",
                provider_type="openai",
                display_name="OpenAI",
                enabled=True,
                source_role="execution_source",
                config_json={
                    "provider_id": "openai",
                    "kind": "openai",
                    "secretless": True,
                    **config,
                },
                metadata_json=metadata,
            )
            session.add(row)
            session.commit()
            assert service._serialize(row)["model_ids"] == projected

        allowlist = build_provider_model_allowlist(database_url, settings=settings)
        assert allowlist.enforced is True
        assert allowlist.allowed_model_ids_by_provider == {"openai": set(expected)}
    finally:
        dispose_engine(database_url)


def test_model_identity_only_removes_configured_namespace() -> None:
    from app.domain.provider_connections.service import _provider_model_identity_keys

    first = _provider_model_identity_keys("gateway/vendorA/foo", "gateway")
    second = _provider_model_identity_keys("gateway/vendorB/foo", "gateway")
    assert not first.intersection(second)
    assert _provider_model_identity_keys("Qwen/Qwen3", "") == {"Qwen/Qwen3"}
    assert _provider_model_identity_keys("gateway/Qwen/Qwen3", "gateway") == {"Qwen/Qwen3", "gateway/Qwen/Qwen3"}
    assert not _provider_model_identity_keys("Foo", "gateway").intersection(_provider_model_identity_keys("foo", "gateway"))


def test_account_preview_excludes_sample_and_configured_model_seeds(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.adapters.providers.base import CatalogModelSeed, ProviderCatalogSnapshot

    database_url = f"sqlite+pysqlite:///{tmp_path / 'account-preview.sqlite3'}"
    init_schema(database_url)
    settings = Settings(_env_file=None, environment="test", database_url=database_url)

    class Adapter:
        def fetch_catalog(self) -> ProviderCatalogSnapshot:
            return ProviderCatalogSnapshot(
                provider_id="openai", display_name="OpenAI", adapter_type="openai",
                models=[CatalogModelSeed(
                    model_id=source, family="text", feature="text", status="available",
                    raw_json={"catalog_source": source},
                ) for source in ["provider_api", "sample", "configured_selection", "tei_config"]],
            )

    monkeypatch.setattr(
        "app.domain.provider_connections.service.build_provider_adapter_from_connection",
        lambda *_: Adapter(),
    )
    try:
        service = ProviderConnectionAdminService(database_url, settings)
        preview = service.preview_catalog({
            "connection_id": "openai", "provider_id": "openai", "kind": "openai",
            "credential": "fixture-key", "config": {"model_ids": ["configured_selection"]},
        })
        assert preview["model_ids"] == ["provider_api"]
        assert preview["model_count"] == 1
    finally:
        dispose_engine(database_url)
