from __future__ import annotations

import base64
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.providers.base import ProviderAdapter
from app.api.main import create_app
from app.core.config import Settings
from app.core.db import init_schema
from app.core.services import CloudServices
from app.domain.catalog.service import CatalogService
from app.domain.hosted_model_defaults import TEXT_AI_PROFILE_ID
from app.domain.wordpress_ai_connector.routing_profiles import (
    WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
)
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    seed_provider_model_allowlist,
)

SERVICE_SETTINGS_ROOT = base64.urlsafe_b64encode(b"S" * 32).decode("ascii")
SERVICE_SETTINGS_KEY_ID = "test-service-settings-key"


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'service-routes.sqlite3'}"


def _build_client(
    tmp_path: Path,
    *,
    settings_overrides: dict[str, object] | None = None,
    providers: dict[str, ProviderAdapter] | None = None,
) -> tuple[str, TestClient]:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url, providers=providers).refresh_catalog()

    settings_kwargs = {
        "_env_file": None,
        "project_name": "Npcink AI Cloud Test",
        "environment": "test",
        "database_url": database_url,
        "redis_url": "redis://localhost:6379/0",
        "artifact_store_root": str(tmp_path / "artifacts"),
        "internal_auth_token": TEST_INTERNAL_AUTH_TOKEN,
        "admin_session_secret": TEST_ADMIN_SESSION_SECRET,
        "service_settings_secret": SERVICE_SETTINGS_ROOT,
        "service_settings_encryption_key_id": SERVICE_SETTINGS_KEY_ID,
        "portal_jwt_secret": TEST_PORTAL_JWT_SECRET,
        "openai_api_key": "",
        "anthropic_api_key": "",
        "litellm_provider_enabled": False,
        "litellm_api_key": "",
        "vllm_provider_enabled": False,
        "vllm_api_key": "",
        "tei_provider_enabled": False,
        "tei_api_key": "",
        "openrouter_provider_enabled": False,
        "openrouter_api_key": "",
        "siliconflow_provider_enabled": False,
        "siliconflow_api_key": "",
        "minimax_provider_enabled": False,
        "minimax_api_key": "",
        "minimax_group_id": "",
        "web_search_provider": "disabled",
        "web_search_tavily_api_key": "",
        "web_search_bocha_api_key": "",
        "web_search_jina_reader_api_key": "",
        "web_search_apify_api_token": "",
        "image_source_provider": "disabled",
        "image_source_auto_strategy": "first_available",
        "image_source_unsplash_access_key": "",
        "image_source_pixabay_api_key": "",
        "image_source_pexels_api_key": "",
        "site_knowledge_embedding_provider": "deterministic",
    }
    settings_kwargs.update(settings_overrides or {})
    settings = Settings(**settings_kwargs)
    services = CloudServices(settings=settings, providers=providers or {})
    return database_url, TestClient(create_app(services))


def _runtime_service_settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        artifact_store_root=str(
            Path(database_url.removeprefix("sqlite+pysqlite:///")).parent / "artifacts"
        ),
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        service_settings_secret=SERVICE_SETTINGS_ROOT,
        service_settings_encryption_key_id=SERVICE_SETTINGS_KEY_ID,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        openai_api_key="",
        anthropic_api_key="",
        litellm_provider_enabled=False,
        litellm_api_key="",
        vllm_provider_enabled=False,
        vllm_api_key="",
        tei_provider_enabled=False,
        tei_api_key="",
        openrouter_provider_enabled=False,
        openrouter_api_key="",
        siliconflow_provider_enabled=False,
        siliconflow_api_key="",
        site_knowledge_embedding_provider="deterministic",
    )


def _seed_openai_text_model_allowlist(
    database_url: str,
    *,
    model_ids: list[str] | None = None,
) -> None:
    seed_provider_model_allowlist(
        database_url,
        provider_id="openai",
        kind="openai_compatible",
        model_ids=model_ids or ["gpt-4.1-mini", "gpt-hosted-free-next", "gpt-5.5"],
        capability_ids=["text_generation"],
        runtime_profile_ids=[TEXT_AI_PROFILE_ID, WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID],
        base_url="https://api.openai.test/v1",
    )
