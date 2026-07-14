from __future__ import annotations

import ast
from collections.abc import Iterator
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderCallRecord, RunRecord, Site
from app.domain.runtime.provider_execution import (
    ProviderCallEvidenceCommand,
    RuntimeProviderExecutionService,
)


class RecordingUsageRecorder:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def record_provider_call_usage(
        self,
        *,
        session: Session,
        run: RunRecord,
        provider_call: ProviderCallRecord,
        usage_context: dict[str, object] | None = None,
    ) -> None:
        self.calls.append(
            {
                "session": session,
                "run": run,
                "provider_call": provider_call,
                "usage_context": usage_context,
            }
        )


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    url = f"sqlite+pysqlite:///{tmp_path / 'runtime-provider-execution.sqlite3'}"
    init_schema(url)
    with get_session(url) as session:
        session.add(Site(site_id="site_alpha", name="Site Alpha", status="active"))
        session.commit()
    yield url
    dispose_engine(url)


def create_run(repository: RuntimeRepository, *, run_id: str) -> RunRecord:
    return repository.create_run(
        run_id=run_id,
        site_id="site_alpha",
        account_id=None,
        subscription_id=None,
        plan_version_id=None,
        ability_name="npcink/test-provider-evidence",
        ability_family="text",
        skill_id="",
        workflow_id="",
        contract_version="v1",
        channel="openapi",
        execution_kind="text",
        execution_tier="cloud",
        execution_pattern="inline",
        data_classification="internal",
        profile_id="text.balanced",
        canonical_run_id=None,
        status="running",
        idempotency_key=f"idem-{run_id}",
        request_fingerprint=f"fingerprint-{run_id}",
        trace_id=f"trace-{run_id}",
        input_json={"messages": []},
        execution_input_ciphertext=None,
        policy_json={},
    )


def test_records_success_evidence_before_usage_with_all_fields(database_url: str) -> None:
    usage_recorder = RecordingUsageRecorder()
    service = RuntimeProviderExecutionService(usage_recorder=usage_recorder)
    command = ProviderCallEvidenceCommand(
        provider_id="provider_primary",
        model_id="model_primary",
        instance_id="instance_primary",
        region="test-region",
        latency_ms=73,
        tokens_in=11,
        tokens_out=7,
        cost=0.42,
        retry_count=1,
        fallback_used=True,
    )

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = create_run(repository, run_id="run_success")
        provider_call = service.record_provider_call(
            repository=repository,
            run=run,
            command=command,
        )

        assert provider_call.id is not None
        assert (
            provider_call.run_id,
            provider_call.provider_id,
            provider_call.model_id,
            provider_call.instance_id,
            provider_call.region,
            provider_call.latency_ms,
            provider_call.tokens_in,
            provider_call.tokens_out,
            provider_call.cost,
            provider_call.retry_count,
            provider_call.fallback_used,
            provider_call.error_code,
        ) == (
            "run_success",
            "provider_primary",
            "model_primary",
            "instance_primary",
            "test-region",
            73,
            11,
            7,
            0.42,
            1,
            True,
            None,
        )
        assert usage_recorder.calls == [
            {
                "session": session,
                "run": run,
                "provider_call": provider_call,
                "usage_context": None,
            }
        ]
        assert repository.list_provider_calls(run.run_id) == [provider_call]


def test_records_error_evidence_and_passes_usage_context_unchanged(database_url: str) -> None:
    usage_recorder = RecordingUsageRecorder()
    service = RuntimeProviderExecutionService(usage_recorder=usage_recorder)
    usage_context = {
        "provider": "managed_search",
        "managed_source": "web_search",
        "intent": "research",
    }

    with get_session(database_url) as session:
        repository = RuntimeRepository(session)
        run = create_run(repository, run_id="run_error")
        provider_call = service.record_provider_call(
            repository=repository,
            run=run,
            command=ProviderCallEvidenceCommand(
                provider_id="provider_search",
                model_id="model_search",
                instance_id="instance_search",
                region="search-region",
                latency_ms=901,
                tokens_in=3,
                tokens_out=0,
                cost=0.17,
                retry_count=2,
                fallback_used=False,
                error_code="provider.upstream_unavailable",
            ),
            usage_context=usage_context,
        )

        assert provider_call.error_code == "provider.upstream_unavailable"
        assert provider_call.latency_ms == 901
        assert provider_call.tokens_in == 3
        assert provider_call.tokens_out == 0
        assert provider_call.cost == 0.17
        assert provider_call.retry_count == 2
        assert provider_call.fallback_used is False
        assert usage_recorder.calls[0]["session"] is session
        assert usage_recorder.calls[0]["run"] is run
        assert usage_recorder.calls[0]["provider_call"] is provider_call
        assert usage_recorder.calls[0]["usage_context"] is usage_context


def test_provider_evidence_command_is_frozen() -> None:
    command = ProviderCallEvidenceCommand(
        provider_id="provider",
        model_id="model",
        instance_id="instance",
        region="region",
        latency_ms=1,
        tokens_in=2,
        tokens_out=3,
        cost=0.1,
        retry_count=0,
        fallback_used=False,
    )

    with pytest.raises(FrozenInstanceError):
        command.retry_count = 1  # type: ignore[misc]


def test_provider_execution_module_and_service_keep_the_extraction_boundary() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    module_path = repository_root / "app/domain/runtime/provider_execution.py"
    service_path = repository_root / "app/domain/runtime/service.py"
    module_tree = ast.parse(module_path.read_text(encoding="utf-8"))
    service_tree = ast.parse(service_path.read_text(encoding="utf-8"))

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
        "app.domain.commercial",
        "app.domain.routing",
        "app.domain.wordpress",
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

    direct_repository_calls = 0
    direct_commercial_calls = 0
    extracted_calls = 0
    service_function_names: set[str] = set()
    provider_execute_calls = 0
    for node in ast.walk(service_tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            service_function_names.add(node.name)
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if (
            isinstance(node.func.value, ast.Name)
            and node.func.value.id == "repository"
            and node.func.attr == "record_provider_call"
        ):
            direct_repository_calls += 1
        if (
            isinstance(node.func.value, ast.Attribute)
            and isinstance(node.func.value.value, ast.Name)
            and node.func.value.value.id == "self"
            and node.func.value.attr == "commercial_service"
            and node.func.attr == "record_provider_call_usage"
        ):
            direct_commercial_calls += 1
        if (
            isinstance(node.func.value, ast.Attribute)
            and isinstance(node.func.value.value, ast.Name)
            and node.func.value.value.id == "self"
            and node.func.value.attr == "provider_execution_service"
            and node.func.attr == "record_provider_call"
        ):
            extracted_calls += 1
        if (
            isinstance(node.func.value, ast.Name)
            and node.func.value.id == "provider"
            and node.func.attr == "execute"
        ):
            provider_execute_calls += 1

    assert direct_repository_calls == 0
    assert direct_commercial_calls == 0
    assert extracted_calls == 15
    assert {"_execute_existing_run", "_execute_candidate_chain"} <= service_function_names
    assert provider_execute_calls > 0
