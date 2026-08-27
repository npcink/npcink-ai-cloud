from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.adapters.providers.base import (
    CatalogInstanceSeed,
    CatalogModelSeed,
    ProviderCatalogSnapshot,
    ProviderExecutionError,
    ProviderExecutionRequest,
    ProviderExecutionResult,
)
from app.adapters.providers.minimax import MiniMaxProviderAdapter
from app.adapters.repositories.catalog_repository import CatalogRepository
from app.core.db import dispose_engine, get_session
from app.core.models import (
    SITE_STATUS_ARCHIVED,
)
from app.domain.catalog.service import CatalogService
from app.domain.hosted_model_defaults import (
    AUDIO_NARRATION_MODEL_ID,
    AUDIO_NARRATION_PROFILE_ID,
    TEXT_AI_PROFILE_ID,
)
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.wordpress_ai_connector.routing_profiles import (
    WP_AI_CONNECTOR_AUDIO_GENERATION_PROFILE_ID,
    WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
)
from tests.api.service_routes_test_support import (
    _build_client,
    _seed_openai_text_model_allowlist,
)
from tests.conftest import (
    build_internal_headers,
    seed_provider_model_allowlist,
    seed_site_auth,
    seed_verified_capability_evidence_for_catalog,
)


class FixedAudioSummaryScriptProvider:
    provider_id = "openai"
    display_name = "Fixed Text Provider"
    adapter_type = "openai"

    def __init__(self) -> None:
        self.requests: list[ProviderExecutionRequest] = []

    def fetch_catalog(self) -> ProviderCatalogSnapshot:
        return ProviderCatalogSnapshot(
            provider_id=self.provider_id,
            display_name=self.display_name,
            adapter_type=self.adapter_type,
            models=[
                CatalogModelSeed(
                    model_id="gpt-hosted-free-next",
                    family="gpt-hosted-free",
                    feature="text",
                    status="available",
                    context_window=256000,
                    price_input=0.0,
                    price_output=0.0,
                    raw_json={"tier": "quality", "surface": "hosted_free_tools"},
                    instances=[
                        CatalogInstanceSeed(
                            instance_id="openai-global-hosted-free-next",
                            endpoint_variant="responses",
                            region="global",
                            capability_tags=["text", "quality", "hosted-free"],
                            is_default=True,
                            weight=140,
                        )
                    ],
                )
            ],
        )

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.requests.append(request)
        output_text = json.dumps(
            {
                "opening": "这是一段适合收听的长文摘要。",
                "key_points": [
                    "第一，文章先交代背景。",
                    "第二，文章说明关键问题。",
                    "第三，文章给出解决方案。",
                ],
                "closing": "如果你需要完整细节，再回到原文继续阅读。",
                "assumptions_to_verify": [],
            },
            ensure_ascii=False,
        )
        return ProviderExecutionResult(
            output={
                "output_text": output_text,
                "messages": [{"role": "assistant", "content": output_text}],
                "model_id": request.model_id,
            },
            latency_ms=25,
            tokens_in=80,
            tokens_out=60,
            cost=0.0,
        )


def _bind_audio_summary_script_profile(database_url: str, *, revision: str) -> None:
    with get_session(database_url) as session:
        CatalogRepository(session).upsert_routing_binding(
            profile_id=WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID,
            candidate_instance_ids=["openai-global-hosted-free-next"],
            selection_policy_json={
                "strategy": "ordered",
                "test_override": revision,
            },
            revision=revision,
        )
        session.commit()


def _seed_minimax_audio_model_allowlist(database_url: str) -> None:
    seed_provider_model_allowlist(
        database_url,
        provider_id="minimax",
        kind="minimax",
        model_ids=[AUDIO_NARRATION_MODEL_ID],
        capability_ids=["audio_generation"],
        runtime_profile_ids=[
            AUDIO_NARRATION_PROFILE_ID,
            WP_AI_CONNECTOR_AUDIO_GENERATION_PROFILE_ID,
        ],
        base_url="https://api.minimaxi.com",
    )


class FlakyAudioSummaryScriptProvider(FixedAudioSummaryScriptProvider):
    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.requests.append(request)
        if len(self.requests) == 1:
            raise ProviderExecutionError(
                "provider.upstream_error",
                "upstream error: temporary text provider failure",
                retryable=True,
            )
        output_text = json.dumps(
            {
                "opening": "重试后生成的长文音频摘要。",
                "key_points": ["模型第二次调用成功。"],
                "closing": "可以继续生成音频候选。",
                "assumptions_to_verify": [],
            },
            ensure_ascii=False,
        )
        return ProviderExecutionResult(
            output={
                "output_text": output_text,
                "messages": [{"role": "assistant", "content": output_text}],
                "model_id": request.model_id,
            },
            latency_ms=30,
            tokens_in=80,
            tokens_out=30,
            cost=0.0,
        )


class EmptyAudioSummaryScriptProvider(FixedAudioSummaryScriptProvider):
    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.requests.append(request)
        return ProviderExecutionResult(
            output={
                "output_text": "",
                "messages": [{"role": "assistant", "content": ""}],
                "model_id": request.model_id,
            },
            latency_ms=20,
            tokens_in=80,
            tokens_out=0,
            cost=0.0,
        )


def test_admin_ai_resources_reads_injected_runtime_provider_adapters(
    tmp_path: Path,
) -> None:
    script_provider = FixedAudioSummaryScriptProvider()
    audio_provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    _, client = _build_client(
        tmp_path,
        providers={"openai": script_provider, "minimax": audio_provider},
        settings_overrides={
            "openai_api_key": "",
            "minimax_provider_enabled": False,
            "minimax_api_key": "",
        },
    )

    response = client.get(
        "/internal/service/admin/ai-resources",
        headers=build_internal_headers(),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    profiles = {item["profile_id"]: item for item in data["runtime_profiles"]}
    assert profiles[TEXT_AI_PROFILE_ID]["status"] == "ready"
    assert profiles["audio.narration.default"]["status"] == "ready"
    assert profiles["audio.summary.default"]["status"] == "ready"
    assert profiles["grok-imagine-image-quality"]["status"] == "ready"


def test_admin_audio_workbench_creates_narration_job_and_exposes_result(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-narration"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于生成旁白音频。",
            "format": "mp3",
            "preview_instance_id": "minimax-global-speech-28-turbo",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "queued"
    assert data["instance_id"] == "minimax-global-speech-28-turbo"
    assert data["script"]["source"] == "full_article"
    assert data["boundary"]["direct_wordpress_write"] is False

    status_response = client.get(
        f"/internal/service/admin/audio-jobs/{data['run_id']}",
        headers=build_internal_headers(),
    )

    assert status_response.status_code == 200, status_response.text
    status_data = status_response.json()["data"]
    assert status_data["status"] == "succeeded"
    assert status_data["result_ready"] is True
    assert status_data["result"]["artifact_type"] == "audio_generation_candidates"
    assert status_data["result"]["direct_wordpress_write"] is False
    assert status_data["result"]["audios"][0]["mime_type"] == "audio/mpeg"

    dispose_engine(database_url)


def test_admin_audio_workbench_uses_saved_minimax_execution_connection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url, client = _build_client(tmp_path)
    CatalogService(
        database_url,
        providers={"minimax": MiniMaxProviderAdapter(allow_sample_catalog=True)},
    ).refresh_catalog()
    seed_verified_capability_evidence_for_catalog(database_url)
    services = client.app.state.services
    ProviderConnectionAdminService(database_url, services.settings).save_connection(
        {
            "connection_id": "minimax",
            "provider_id": "minimax",
            "provider_type": "minimax",
            "kind": "minimax",
            "display_name": "MiniMax",
            "enabled": True,
            "base_url": "https://api.minimaxi.com",
            "capability_ids": ["audio_generation"],
            "runtime_profile_ids": [
                AUDIO_NARRATION_PROFILE_ID,
                WP_AI_CONNECTOR_AUDIO_GENERATION_PROFILE_ID,
            ],
            "config": {"model_ids": [AUDIO_NARRATION_MODEL_ID]},
            "credential": "saved-minimax-secret",
        }
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    def fake_execute_http(
        self: MiniMaxProviderAdapter,
        request: ProviderExecutionRequest,
    ) -> ProviderExecutionResult:
        return self._execute_sample(request)

    monkeypatch.setattr(MiniMaxProviderAdapter, "_execute_http", fake_execute_http)

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-saved-minimax-connection"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于验证已保存的 MiniMax 凭据连接会进入运行时。",
            "format": "mp3",
            "preview_instance_id": "minimax-global-speech-28-turbo",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "queued"
    assert data["provider_id"] == "minimax"
    assert data["instance_id"] == "minimax-global-speech-28-turbo"

    status_response = client.get(
        f"/internal/service/admin/audio-jobs/{data['run_id']}",
        headers=build_internal_headers(),
    )
    assert status_response.status_code == 200, status_response.text
    status_data = status_response.json()["data"]
    assert status_data["status"] == "succeeded"
    assert status_data["error_code"] in ("", None)

    dispose_engine(database_url)


def test_admin_audio_workbench_rejects_minimax_route_without_execution_connection(
    tmp_path: Path,
) -> None:
    database_url, client = _build_client(tmp_path)
    CatalogService(
        database_url,
        providers={"minimax": MiniMaxProviderAdapter(allow_sample_catalog=True)},
    ).refresh_catalog()
    seed_verified_capability_evidence_for_catalog(database_url)
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-minimax-not-executable"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于验证不可执行连接不会进入试听候选。",
            "format": "mp3",
            "preview_instance_id": "minimax-global-speech-28-turbo",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error_code"] == "audio_workbench.preview_route_unavailable"

    dispose_engine(database_url)


def test_admin_audio_workbench_without_site_uses_active_preview_site(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_smoke",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
        site_status=SITE_STATUS_ARCHIVED,
    )
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-default-site"),
        json={
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于验证管理员试听自动选择可用站点。",
            "format": "mp3",
            "preview_instance_id": "minimax-global-speech-28-turbo",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["site_id"] == "site_audio_admin"
    assert data["status"] == "queued"

    dispose_engine(database_url)


def test_admin_audio_workbench_without_active_site_returns_friendly_error(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    seed_site_auth(
        database_url,
        site_id="site_smoke",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
        site_status=SITE_STATUS_ARCHIVED,
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-no-active-site"),
        json={
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于验证没有可用站点时的错误提示。",
            "format": "mp3",
            "preview_instance_id": "minimax-global-speech-28-turbo",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error_code"] == "audio_workbench.preview_site_unavailable"
    assert payload["data"]["site_status"] == "none_active"
    assert payload["data"]["action"] == "connect_or_activate_site"

    dispose_engine(database_url)


def test_admin_audio_workbench_rejects_unknown_preview_instance(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-preview-invalid"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Audio test",
            "body": "这是一段文章正文，用于生成旁白音频。",
            "format": "mp3",
            "preview_instance_id": "not-an-audio-candidate",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error_code"] == "audio_workbench.preview_instance_invalid"

    dispose_engine(database_url)


def test_admin_audio_workbench_recent_runs_are_lightweight_runtime_evidence(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    create_response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-recent-create"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Recent audio test",
            "body": "这是一段文章正文，用于验证最近音频任务摘要。",
            "format": "mp3",
        },
    )

    assert create_response.status_code == 200, create_response.text
    run_id = create_response.json()["data"]["run_id"]

    recent_response = client.get(
        "/internal/service/admin/audio-jobs/recent?limit=5",
        headers=build_internal_headers(),
    )

    assert recent_response.status_code == 200, recent_response.text
    data = recent_response.json()["data"]
    assert data["contract_version"] == "admin_audio_workbench_recent_runs.v1"
    assert data["boundary"]["direct_wordpress_write"] is False
    assert data["items"][0]["run_id"] == run_id
    assert data["items"][0]["intent"] in {"article_narration", "audio_generation"}
    assert data["items"][0]["audio_ready"] is True
    assert data["items"][0]["mime_type"] == "audio/mpeg"
    serialized = json.dumps(data, ensure_ascii=False)
    assert "audios" not in serialized
    assert "url" not in serialized
    assert "transcript" not in serialized
    assert "这是一段文章正文" not in serialized

    dispose_engine(database_url)


def test_admin_audio_workbench_builds_summary_script_before_audio_job(
    tmp_path: Path,
) -> None:
    audio_provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    script_provider = FixedAudioSummaryScriptProvider()
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": audio_provider, "openai": script_provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    _seed_openai_text_model_allowlist(database_url, model_ids=["gpt-hosted-free-next"])
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    _bind_audio_summary_script_profile(
        database_url,
        revision="audio-summary-script-test",
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-summary"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_audio_summary",
            "title": "长文主题",
            "body": "第一段介绍背景。第二段说明关键问题。第三段给出解决方案。第四段补充风险。",
            "format": "mp3",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["script"]["source"] == "audio_summary_script"
    assert data["script"]["intent"] == "audio_summary_script"
    assert data["script"]["generation"]["mode"] == "hosted_ai_content_support"
    assert data["script"]["generation"]["ability_name"] == "npcink-toolbox/ai-content-support"
    assert data["script"]["generation"]["contract_version"] == "hosted_ai_content_support.v1"
    assert data["script"]["generation"]["profile_id"] == (WP_AI_CONNECTOR_SHORT_TEXT_PROFILE_ID)
    assert data["script"]["output_json"]["opening"] == "这是一段适合收听的长文摘要。"
    assert "适合收听的长文摘要" in data["script"]["text"]
    assert data["script"]["characters"] <= 4800
    assert len(script_provider.requests) == 1
    assert script_provider.requests[0].input_payload["intent"] == "audio_summary_script"

    status_response = client.get(
        f"/internal/service/admin/audio-jobs/{data['run_id']}",
        headers=build_internal_headers(),
    )

    assert status_response.status_code == 200, status_response.text
    status_data = status_response.json()["data"]
    assert status_data["status"] == "succeeded"
    assert status_data["result"]["audios"][0]["duration_seconds"] > 0

    dispose_engine(database_url)


def test_admin_audio_workbench_retries_transient_summary_script_failure(
    tmp_path: Path,
) -> None:
    audio_provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    script_provider = FlakyAudioSummaryScriptProvider()
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": audio_provider, "openai": script_provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    _seed_openai_text_model_allowlist(database_url, model_ids=["gpt-hosted-free-next"])
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    _bind_audio_summary_script_profile(
        database_url,
        revision="audio-summary-script-retry-test",
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-summary-retry"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_audio_summary",
            "title": "重试主题",
            "body": "第一段介绍背景。第二段说明关键问题。",
            "format": "mp3",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert len(script_provider.requests) == 2
    assert script_provider.requests[0].input_payload["workbench_retry"]["attempt"] == 1
    assert script_provider.requests[1].input_payload["workbench_retry"]["attempt"] == 2
    assert data["script"]["generation"]["attempts"] == 2
    assert data["script"]["generation"]["retry_attempted"] is True
    assert "重试后生成的长文音频摘要" in data["script"]["text"]

    dispose_engine(database_url)


def test_admin_audio_workbench_returns_friendly_empty_summary_script_error(
    tmp_path: Path,
) -> None:
    audio_provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    script_provider = EmptyAudioSummaryScriptProvider()
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": audio_provider, "openai": script_provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    _seed_openai_text_model_allowlist(database_url, model_ids=["gpt-hosted-free-next"])
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )
    _bind_audio_summary_script_profile(
        database_url,
        revision="audio-summary-script-empty-test",
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-empty-summary"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_audio_summary",
            "title": "空脚本主题",
            "body": "第一段介绍背景。第二段说明关键问题。",
            "format": "mp3",
        },
    )

    assert response.status_code == 400, response.text
    payload = response.json()
    assert payload["error_code"] == "audio_workbench.summary_script_empty"
    assert "returned an empty audio summary script" in payload["message"]
    assert "audio summary script generation returned no usable script" not in payload["message"]
    assert payload["data"]["retryable"] is True
    assert payload["data"]["retry_attempted"] is True
    assert payload["data"]["action"] == "retry_or_use_narration"
    assert payload["data"]["stage"] == "audio_summary_script"
    assert len(script_provider.requests) == 2

    dispose_engine(database_url)


def test_admin_audio_workbench_uses_wordpress_audio_routing_profile(
    tmp_path: Path,
) -> None:
    provider = MiniMaxProviderAdapter(
        allow_sample_catalog=True,
        allow_sample_execution=True,
    )
    database_url, client = _build_client(
        tmp_path,
        providers={"minimax": provider},
        settings_overrides={
            "minimax_provider_enabled": True,
            "minimax_api_key": "minimax-test-secret",
        },
    )
    _seed_minimax_audio_model_allowlist(database_url)
    seed_site_auth(
        database_url,
        site_id="site_audio_admin",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve"],
    )

    response = client.post(
        "/internal/service/admin/audio-jobs",
        headers=build_internal_headers(idempotency_key="audio-workbench-quality-profile"),
        json={
            "site_id": "site_audio_admin",
            "intent": "article_narration",
            "title": "Audio quality test",
            "body": "这是一段文章正文，用于验证音频模型路由。",
            "format": "mp3",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["profile_id"] == WP_AI_CONNECTOR_AUDIO_GENERATION_PROFILE_ID
    assert data["script"]["generation"]["audio_profile_id"] == (
        WP_AI_CONNECTOR_AUDIO_GENERATION_PROFILE_ID
    )

    dispose_engine(database_url)
