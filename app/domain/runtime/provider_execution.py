from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlalchemy.orm import Session

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.models import ProviderCallRecord, RunRecord


@dataclass(frozen=True, slots=True)
class ProviderCallEvidenceCommand:
    provider_id: str
    model_id: str
    instance_id: str
    region: str
    latency_ms: int
    tokens_in: int
    tokens_out: int
    cost: float
    retry_count: int
    fallback_used: bool
    error_code: str | None = None


class ProviderUsageRecorder(Protocol):
    def record_provider_call_usage(
        self,
        *,
        session: Session,
        run: RunRecord,
        provider_call: ProviderCallRecord,
        usage_context: dict[str, object] | None = None,
    ) -> None: ...


class RuntimeProviderExecutionService:
    def __init__(self, *, usage_recorder: ProviderUsageRecorder) -> None:
        self.usage_recorder = usage_recorder

    def record_provider_call(
        self,
        *,
        repository: RuntimeRepository,
        run: RunRecord,
        command: ProviderCallEvidenceCommand,
        usage_context: dict[str, object] | None = None,
    ) -> ProviderCallRecord:
        provider_call = repository.record_provider_call(
            run_id=run.run_id,
            provider_id=command.provider_id,
            model_id=command.model_id,
            instance_id=command.instance_id,
            region=command.region,
            latency_ms=command.latency_ms,
            tokens_in=command.tokens_in,
            tokens_out=command.tokens_out,
            cost=command.cost,
            retry_count=command.retry_count,
            fallback_used=command.fallback_used,
            error_code=command.error_code,
        )
        self.usage_recorder.record_provider_call_usage(
            session=repository.session,
            run=run,
            provider_call=provider_call,
            usage_context=usage_context,
        )
        return provider_call
