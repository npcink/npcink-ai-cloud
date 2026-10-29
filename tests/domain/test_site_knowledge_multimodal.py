from __future__ import annotations

import base64
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Account, ProviderConnection, Site
from app.domain.site_knowledge.backends import SiteKnowledgeBackendError
from app.domain.site_knowledge.media_embedding import load_media_embedding_image
from app.domain.site_knowledge.service import SiteKnowledgeService
from app.domain.site_knowledge.vector_profile import SiteKnowledgeVectorProfileAdminService
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID,
    SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
)
from scripts.configure_m4_ollama_preview import embedding_config


def test_image_input_is_site_scoped_bounded_and_metadata_free(monkeypatch):
    image = BytesIO()
    Image.new("RGB", (1000, 1000), "red").save(image, format="PNG")
    seen = {}

    def load(session, store, **kwargs):
        seen.update(kwargs)
        return SimpleNamespace(content_bytes=image.getvalue())

    monkeypatch.setattr("app.domain.site_knowledge.media_embedding.load_artifact_input", load)
    monkeypatch.setattr(
        "app.domain.site_knowledge.media_embedding.build_artifact_store", lambda s: None,
    )
    encoded = load_media_embedding_image(
        {"source_artifact_id": "art_test"}, session=None, settings=Settings(_env_file=None),
        site_id="site-owned",
    )
    assert seen["site_id"] == "site-owned"
    with Image.open(BytesIO(base64.b64decode(encoded))) as result:
        assert result.size == (768, 768)
        assert result.format == "JPEG"
        assert not result.getexif()


@pytest.mark.parametrize("url", ["http://127.0.0.1/image.jpg", "https://127.0.0.1/image.jpg"])
def test_image_embedding_does_not_fetch_private_or_plain_http_urls(url):
    with pytest.raises(SiteKnowledgeBackendError) as error:
        load_media_embedding_image(
            {"url": url}, session=None, settings=Settings(_env_file=None), site_id="site",
        )
    assert error.value.error_code == "site_knowledge.image_embedding_source_unavailable"


@pytest.mark.parametrize("vector", [
    [0.0] * 4096, [float("nan")] * 4096, [float("inf")] * 4096,
    ["invalid"] * 4096, [1.0] * 1024,
])
def test_new_space_rejects_invalid_provider_vectors(vector):
    class Provider:
        def execute(self, request):
            return SimpleNamespace(output={"embedding": vector})
    settings = Settings(_env_file=None, environment="test")
    settings.site_knowledge_embedding_provider = SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID
    settings.site_knowledge_embedding_model = SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID
    settings.site_knowledge_embedding_dimensions = 4096
    service = SiteKnowledgeService(None, settings=settings,
        providers={SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID: Provider()})
    with pytest.raises(SiteKnowledgeBackendError):
        service._embed_text("test", site_id="site", run_id="test", ability_name="test")


def test_media_space_change_reembeds_pixels_and_failure_preserves_index(tmp_path, monkeypatch):
    database = f"sqlite:///{tmp_path / 'multimodal.sqlite'}"
    init_schema(database)
    media = {"attachment_id": 7, "mime_type": "image/jpeg", "title": "red car",
             "url": "https://example.test/car.jpg", "media_fingerprint": "same-revision"}
    payload = {"media_items": [media], "sync_mode": "refresh"}
    requests = []

    class Provider:
        def execute(self, request):
            requests.append(request)
            return SimpleNamespace(output={"embedding": [1.0] + [0.0] * 4095})

    try:
        with get_session(database) as session:
            session.add(Account(account_id="account", name="Account"))
            session.add(Site(site_id="site", account_id="account", name="Site"))
            session.commit()
            settings = Settings(_env_file=None, environment="test", database_url=database)
            old = SiteKnowledgeService(session, settings=settings)
            old.sync(site_id="site", input_payload=payload, run_id="old")
            session.commit()
            settings.site_knowledge_embedding_provider = SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID
            settings.site_knowledge_embedding_model = SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID
            settings.site_knowledge_embedding_dimensions = SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS
            service = SiteKnowledgeService(session, settings=settings,
                providers={SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID: Provider()})
            monkeypatch.setattr(
                "app.domain.site_knowledge.media_embedding.load_media_embedding_image",
                lambda *args, **kwargs: "pixels",
            )
            result = service.sync(site_id="site", input_payload=payload, run_id="new")
            assert result["sync"]["indexed_documents"] == 1
            assert requests[0].endpoint_variant == "ollama_embeddings"
            assert requests[0].input_payload == {"image_base64": "pixels"}
            session.commit()
            unchanged = service.sync(site_id="site", input_payload=payload, run_id="unchanged")
            assert unchanged["sync"]["unchanged_documents"] == 1
            assert len(requests) == 1
            spaces = service.repository.list_embedding_models("site")
            assert spaces == [service.embedding_space_id]

            def fail(*args, **kwargs):
                raise SiteKnowledgeBackendError("image_unavailable", "Unavailable")

            monkeypatch.setattr(
                "app.domain.site_knowledge.media_embedding.load_media_embedding_image", fail,
            )
            with pytest.raises(SiteKnowledgeBackendError):
                service.sync(site_id="site", input_payload={
                    "media_items": [{**media, "title": "changed"}], "sync_mode": "refresh",
                }, run_id="fail")
            assert service.repository.list_embedding_models("site") == spaces
            assert service.repository.count_chunks("site") == 1

            session.add(ProviderConnection(
                connection_id="ollama_m4_embedding", provider_type="openai_compatible",
                display_name="Ollama", enabled=True, status="ready",
                base_url="http://host.docker.internal:11434/v1",
                config_json=embedding_config({
                    "provider_id": SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID,
                    "secretless": True, "capability_ids": ["embedding"],
                    "runtime_profile_ids": ["embed.default"],
                }),
            ))
            session.commit()
            profile = SiteKnowledgeVectorProfileAdminService(database, settings).get_profile()
            assert profile["runtime"]["model_id"] == SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID
            assert profile["runtime"]["dimensions"] == 4096
            assert profile["runtime"]["index_status"] == "ready"
            assert profile["model_id"] == "BAAI/bge-m3"  # production contract retained
    finally:
        dispose_engine(database)
