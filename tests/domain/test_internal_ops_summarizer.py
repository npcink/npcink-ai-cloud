from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.adapters.providers.base import (
    ProviderCatalogSnapshot,
    ProviderExecutionRequest,
    ProviderExecutionResult,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import RuntimeGuardEvent
from app.domain.advisor.service import InternalAIAdvisorService
from app.domain.catalog.service import CatalogService
from tests.conftest import seed_site_auth


class _DraftProvider:
    provider_id = "fake_llm"
    display_name = "Fake LLM"
    adapter_type = "fake"

    def __init__(self) -> None:
        self.requests: list[ProviderExecutionRequest] = []

    def fetch_catalog(self) -> ProviderCatalogSnapshot:
        raise NotImplementedError

    def execute(self, request: ProviderExecutionRequest) -> ProviderExecutionResult:
        self.requests.append(request)
        return ProviderExecutionResult(
            output={
                "output_text": json.dumps(
                    {
                        "operator_summary": "LLM summarized runtime guard pressure.",
                        "support_draft": (
                            "We are reviewing a cloud service signal and will "
                            "follow up after checking diagnostics."
                        ),
                        "operator_next_step": "inspect_commercial_entitlement_and_runtime_guard",
                        "safety_note": "Internal ops draft only.",
                    }
                )
            },
            latency_ms=10,
            tokens_in=20,
            tokens_out=16,
            cost=0.001,
        )


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'internal-ops-summarizer.sqlite3'}"


def test_ops_summary_llm_prompt_uses_redacted_advisor_context(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    CatalogService(database_url).refresh_catalog()
    seed_site_auth(
        database_url,
        site_id="site_ops_summary",
        scopes=["runtime:execute", "runtime:read", "runtime:resolve", "stats:read"],
    )
    with get_session(database_url) as session:
        session.add(
            RuntimeGuardEvent(
                auth_surface="public",
                scope_kind="site",
                scope_id="site_ops_summary",
                site_id="site_ops_summary",
                key_id="key_default",
                client_ref="127.0.0.1",
                event_code="auth.rate_limit_exceeded",
                status_code=429,
                method="POST",
                path="/v1/runtime/execute",
                trace_id="ops-summary-trace",
                payload_json={"raw": "must stay out of llm prompt"},
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    provider = _DraftProvider()
    result = InternalAIAdvisorService(
        database_url,
        providers={provider.provider_id: provider},
    ).get_ops_summary(
        scope="runtime",
        site_id="site_ops_summary",
        provider_id=provider.provider_id,
        model_id="ops-model",
    )

    assert result["generation"]["mode"] == "llm"
    assert result["operator_summary"] == "LLM summarized runtime guard pressure."
    assert provider.requests
    prompt_context = _extract_prompt_context(provider.requests[0].input_payload)
    assert "source" not in prompt_context["redacted_context"]["advisor"]
    assert "payload_json" not in json.dumps(prompt_context)
    assert "must stay out" not in json.dumps(prompt_context)
    assert "do_not_generate_customer_article_or_marketing_content" in (
        prompt_context["redacted_context"]["forbidden"]
    )

    dispose_engine(database_url)


def _extract_prompt_context(input_payload: dict[str, Any]) -> dict[str, Any]:
    messages = input_payload["messages"]
    user_message = messages[1]
    return json.loads(user_message["content"])
