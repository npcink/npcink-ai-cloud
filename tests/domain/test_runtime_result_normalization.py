from __future__ import annotations

import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.models import RunRecord
from app.domain.connector_runtime.contracts import (
    build_connector_result_usage,
    sum_provider_call_usage_tokens,
)
from app.domain.runtime.models import (
    RUNTIME_STORAGE_MODE_FULL_STORE_WITH_TTL,
    RUNTIME_STORAGE_MODE_NO_STORE,
    RUNTIME_STORAGE_MODE_RESULT_ONLY,
)
from app.domain.runtime.result_normalization import (
    RuntimeNormalizedResult,
    RuntimeResultNormalizationCommand,
    RuntimeResultNormalizationService,
    get_transient_runtime_result,
    set_transient_runtime_result,
)


def normalize(
    *,
    provider_output: dict[str, object],
    storage_mode: str = RUNTIME_STORAGE_MODE_RESULT_ONLY,
    ability_family: str = "text",
    ability_name: str = "npcink/test-analysis",
    input_payload: dict[str, object] | None = None,
    connector_envelope: dict[str, object] | None = None,
    automatic_web_search: dict[str, object] | None = None,
    usage: dict[str, object] | None = None,
) -> RuntimeNormalizedResult:
    return RuntimeResultNormalizationService().normalize(
        RuntimeResultNormalizationCommand(
            site_id="site_alpha",
            provider_output=provider_output,
            storage_mode=storage_mode,
            ability_family=ability_family,
            ability_name=ability_name,
            input_payload=input_payload or {},
            connector_envelope=connector_envelope,
            automatic_web_search=automatic_web_search,
            usage=usage,
        )
    )


def connector_envelope() -> dict[str, object]:
    return {
        "site_url": "https://example.com",
        "platform_kind": "wordpress",
        "connector_id": "npcink-cloud-addon",
        "connector_version": "1.0.0",
        "suggestion_only": True,
        "operation_contract": {
            "contract_version": "wordpress_operation.v1",
            "task": "summarize_content",
        },
        "object_ref": {
            "object_type": "post",
            "object_id": "42",
            "object_revision": "7",
        },
    }


@pytest.mark.parametrize(
    "storage_mode",
    [RUNTIME_STORAGE_MODE_RESULT_ONLY, RUNTIME_STORAGE_MODE_FULL_STORE_WITH_TTL],
)
def test_generic_stored_modes_preserve_provider_output_as_durable_result(
    storage_mode: str,
) -> None:
    provider_output = {
        "output_text": "generic suggestion",
        "messages": [{"role": "assistant", "content": "generic suggestion"}],
        "provider_metadata": {"finish_reason": "stop"},
    }

    result = normalize(
        provider_output=provider_output,
        storage_mode=storage_mode,
    )

    assert result.durable_result == provider_output
    assert result.transient_result is None


def test_no_store_returns_full_transient_and_omitted_durable_result() -> None:
    provider_output = {
        "output_text": "sensitive suggestion",
        "messages": [{"role": "assistant", "content": "sensitive suggestion"}],
    }

    result = normalize(
        provider_output=provider_output,
        storage_mode=RUNTIME_STORAGE_MODE_NO_STORE,
    )

    assert result.transient_result == provider_output
    assert result.durable_result == {"stored": False, "status": "omitted"}


def test_connector_envelope_contains_automatic_search_before_durable_wrapping() -> None:
    search_evidence = {"status": "ready", "result_count": 2}

    result = normalize(
        provider_output={"output_text": "connector suggestion"},
        connector_envelope=connector_envelope(),
        automatic_web_search=search_evidence,
    )

    assert result.transient_result is None
    assert result.durable_result == {
        "contract_version": "cloud_connector_result.v1",
        "site_id": "site_alpha",
        "site_url": "https://example.com",
        "platform_kind": "wordpress",
        "connector_id": "npcink-cloud-addon",
        "connector_version": "1.0.0",
        "suggestion_only": True,
        "operation_contract": {
            "contract_version": "wordpress_operation.v1",
            "task": "summarize_content",
        },
        "output": {
            "output_text": "connector suggestion",
            "automatic_web_search": search_evidence,
        },
        "object_ref": {
            "object_type": "post",
            "object_id": "42",
            "object_revision": "7",
        },
    }


def test_nonconnector_search_evidence_only_augments_durable_no_store_result() -> None:
    provider_output = {"output_text": "transient provider output"}
    search_evidence = {"status": "would_search", "trigger": "dry_run"}

    result = normalize(
        provider_output=provider_output,
        storage_mode=RUNTIME_STORAGE_MODE_NO_STORE,
        automatic_web_search=search_evidence,
    )

    assert result.transient_result == provider_output
    assert "automatic_web_search" not in result.transient_result
    assert result.durable_result == {
        "stored": False,
        "status": "omitted",
        "automatic_web_search": search_evidence,
    }


def test_openclaw_result_keeps_analysis_and_local_approval_semantics() -> None:
    result = normalize(
        provider_output={
            "output_text": "Changes applied to the requested post.",
            "messages": [{"role": "assistant", "content": "Changes applied."}],
            "provider_metadata": {"finish_reason": "stop"},
        },
        ability_family="openclaw",
        ability_name="openclaw.update_content",
        input_payload={"correlation_id": "correlation-001"},
    )

    assert result.transient_result is None
    assert result.durable_result == {
        "analysis_type": "proposal_input",
        "summary": (
            "Provider output contained write-completion language; local approval required."
        ),
        "findings": [],
        "recommendations": [],
        "requires_local_approval": True,
        "proposal_handoff": {"correlation_id": "correlation-001"},
        "_cloud_raw_result": {"provider_metadata": {"finish_reason": "stop"}},
    }


def test_transient_result_helpers_store_only_runtime_memory_projection() -> None:
    run = RunRecord(run_id="run_transient")

    assert get_transient_runtime_result(run) is None
    transient_result = {"output_text": "return once without durable storage"}
    set_transient_runtime_result(run, transient_result)

    assert get_transient_runtime_result(run) is transient_result


def test_sum_provider_call_usage_tokens_sums_all_calls_and_omits_when_empty() -> None:
    assert sum_provider_call_usage_tokens([]) is None
    assert sum_provider_call_usage_tokens(
        [
            SimpleNamespace(tokens_in=10, tokens_out=2),
            SimpleNamespace(tokens_in=5, tokens_out=3),
            SimpleNamespace(tokens_in=None, tokens_out=-1),
        ]
    ) == {"tokens_in": 15, "tokens_out": 5, "total_tokens": 20}
    assert build_connector_result_usage(tokens_in=0, tokens_out=0) == {
        "tokens_in": 0,
        "tokens_out": 0,
        "total_tokens": 0,
    }
    assert sum_provider_call_usage_tokens(
        [SimpleNamespace(tokens_in=0, tokens_out=0)]
    ) == {"tokens_in": 0, "tokens_out": 0, "total_tokens": 0}


def test_connector_envelope_projects_usage_sibling_of_output() -> None:
    usage = {"tokens_in": 24, "tokens_out": 8, "total_tokens": 32}

    result = normalize(
        provider_output={"output_text": "connector suggestion", "usage": {"prompt_tokens": 99}},
        connector_envelope=connector_envelope(),
        usage=usage,
    )

    assert result.durable_result["usage"] == usage
    # Raw provider usage may still sit under output for text tasks; envelope
    # usage is the Addon-facing source of truth and must not copy that blob.
    assert result.durable_result["output"]["usage"] == {"prompt_tokens": 99}
    assert result.durable_result["usage"] != result.durable_result["output"]["usage"]


def test_connector_no_store_keeps_usage_when_output_is_omitted() -> None:
    usage = {"tokens_in": 42, "tokens_out": 7, "total_tokens": 49}

    result = normalize(
        provider_output={"output_text": "sensitive suggestion"},
        storage_mode=RUNTIME_STORAGE_MODE_NO_STORE,
        connector_envelope=connector_envelope(),
        usage=usage,
    )

    assert result.transient_result is not None
    assert result.transient_result["usage"] == usage
    assert result.transient_result["output"]["output_text"] == "sensitive suggestion"
    assert result.durable_result["usage"] == usage
    assert result.durable_result["output"] == {"stored": False, "status": "omitted"}


def test_connector_omits_usage_when_no_provider_call_evidence() -> None:
    result = normalize(
        provider_output={"output_text": "connector suggestion"},
        connector_envelope=connector_envelope(),
        usage=None,
    )

    assert "usage" not in result.durable_result


def test_result_normalization_module_and_runtime_service_keep_boundaries() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    module_path = repository_root / "app/domain/runtime/result_normalization.py"
    service_path = repository_root / "app/domain/runtime/service.py"
    provider_execution_path = repository_root / "app/domain/runtime/provider_execution.py"
    module_tree = ast.parse(module_path.read_text(encoding="utf-8"))
    service_source = service_path.read_text(encoding="utf-8")
    provider_execution_source = provider_execution_path.read_text(encoding="utf-8")

    imported_modules = {
        node.module or "" for node in ast.walk(module_tree) if isinstance(node, ast.ImportFrom)
    }
    imported_modules.update(
        alias.name
        for node in ast.walk(module_tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    )
    forbidden_prefixes = (
        "app.domain.runtime.service",
        "app.domain.wordpress",
        "app.adapters.providers",
        "app.domain.commercial",
        "app.domain.routing",
        "app.domain.audio_generation",
        "app.domain.image_",
        "app.domain.media_",
        "app.domain.runtime.callback_delivery",
        "app.core.config",
        "fastapi",
    )
    assert not {
        module
        for module in imported_modules
        if any(module.startswith(prefix) for prefix in forbidden_prefixes)
    }

    assert "def _prepare_result_for_storage(" not in service_source
    assert "_TRANSIENT_RESULT_JSON_ATTR" not in service_source
    assert "def _set_transient_result_json(" not in service_source
    assert "def _get_transient_result_json(" not in service_source
    assert "self.result_normalization_service.normalize(" in service_source
    assert "self.wordpress_operation_runtime.prepare_provider_output(" in service_source
    assert "self._materialize_image_generation_output(" in service_source
    assert "self._materialize_audio_generation_output(" in service_source
    assert "provider.execute(" not in service_source
    assert "provider.execute(" in provider_execution_source
    assert "def _execute_candidate_chain(" in service_source
