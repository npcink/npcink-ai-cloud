from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING
from uuid import uuid4

from app.adapters.repositories.runtime_repository import RuntimeRepository
from app.core.db import get_session
from app.domain.content_formatting.engine import MAX_CONTENT_BYTES, format_candidate
from app.domain.content_formatting.structure import format_structure
from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.runtime.models import RuntimeExecutionResponse, RuntimeRequest
from app.domain.runtime.result_normalization import set_transient_runtime_result
from app.domain.runtime.run_lifecycle import RuntimeRunCreationCommand

if TYPE_CHECKING:
    from app.domain.runtime.service import RuntimeService

ABILITY = "npcink-toolbox/format-content"
REQUEST_CONTRACT = "content_format_request.v1"
PROFILE = "content-format.managed"
EXECUTION_KIND = "content_format"


def _validate(request: RuntimeRequest) -> tuple[str, str]:
    payload = request.input_payload
    if (
        request.contract_version not in {REQUEST_CONTRACT, "content_format_request.v2"}
        or request.execution_kind != EXECUTION_KIND
        or request.profile_id != PROFILE
        or request.ability_family != "text"
        or request.execution_pattern != "inline"
        or request.storage_mode != "no_store"
        or request.callback_url
        or request.task_backend
        or request.retry_max
        or request.retention_ttl
        or not 0 <= request.timeout_seconds <= 30
    ):
        raise RuntimeExecutionContractError(
            "content_format.invalid_contract",
            "formatting requires its inline no_store contract without callbacks or retries",
        )
    if set(payload) != {"content", "format", "source_sha256"}:
        raise RuntimeExecutionContractError(
            "content_format.invalid_input", "only content, format and source_sha256 are accepted"
        )
    source = payload["content"]
    source_format = payload["format"]
    if not isinstance(source, str) or not source or not isinstance(source_format, str):
        raise RuntimeExecutionContractError("content_format.invalid_input", "content is required")
    try:
        encoded = source.encode("utf-8")
    except UnicodeEncodeError as error:
        raise RuntimeExecutionContractError(
            "content_format.invalid_input", "content must be valid UTF-8"
        ) from error
    if len(encoded) > MAX_CONTENT_BYTES or source_format not in {"html", "markdown"}:
        raise RuntimeExecutionContractError(
            "content_format.invalid_input", "content exceeds bounds or format is unsupported"
        )
    if request.contract_version == "content_format_request.v2" and source_format != "html":
        raise RuntimeExecutionContractError("content_format.invalid_input", "v2 requires html")
    if payload["source_sha256"] != hashlib.sha256(encoded).hexdigest():
        raise RuntimeExecutionContractError(
            "content_format.source_mismatch", "source_sha256 does not match content"
        )
    return source, source_format


def execute_formatting(
    service: RuntimeService, request: RuntimeRequest
) -> RuntimeExecutionResponse:
    source, source_format = _validate(request)
    model_id = (
        "deterministic-structure-v2"
        if request.contract_version == "content_format_request.v2"
        else "deterministic-spacing-v1"
    )
    trace_id = request.trace_id or uuid4().hex
    run_id = f"run_{uuid4().hex}"
    policy = service._apply_runtime_controls({"allow_fallback": False}, request)
    policy["execution_contract"] = {
        "ability_name": ABILITY,
        "contract_version": request.contract_version,
        "storage_mode": "no_store",
        "execution_pattern": "inline",
        "direct_wordpress_write": False,
    }
    fingerprint = service.run_lifecycle_service.build_request_fingerprint(request, policy)
    with get_session(service.database_url) as session:
        repository = RuntimeRepository(session)
        service._require_active_site(repository, request.site_id)
        existing = service.run_lifecycle_service.get_idempotent_replay(
            repository=repository,
            site_id=request.site_id,
            idempotency_key=request.idempotency_key,
            request_fingerprint=fingerprint,
        )
        if existing is not None:
            session.commit()
            # no_store replay returns run evidence only, never retained article text.
            return service._build_execution_response(
                existing, repository=repository, idempotent_replay=True
            )
        decision = service.commercial_service.authorize_runtime_request(
            session=session,
            site_id=request.site_id,
            ability_family=request.ability_family,
            channel=request.channel,
            execution_kind=request.execution_kind,
            execution_tier=request.execution_tier,
            execution_pattern=request.execution_pattern,
            data_classification=request.data_classification,
            trace_id=trace_id,
            idempotency_key=request.idempotency_key,
            request_kind="execute",
            run_id=run_id,
            estimated_ai_credits=0.0,
        )
        service._enforce_batch_limits(request=request, commercial_decision=decision)
        policy = service._apply_commercial_policy_overrides(policy, commercial_decision=decision)
        run = service.run_lifecycle_service.create_durable_run(
            repository=repository,
            command=RuntimeRunCreationCommand(
                run_id=run_id,
                site_id=request.site_id,
                account_id=str(decision.get("account_id") or "") or None,
                subscription_id=str(decision.get("subscription_id") or "") or None,
                plan_version_id=str(decision.get("plan_version_id") or "") or None,
                ability_name=request.ability_name,
                ability_family=request.ability_family,
                skill_id=request.skill_id,
                workflow_id=request.workflow_id,
                contract_version=request.contract_version,
                channel=request.channel,
                execution_kind=request.execution_kind,
                execution_tier=request.execution_tier,
                execution_pattern=request.execution_pattern,
                data_classification=request.data_classification,
                profile_id=PROFILE,
                canonical_run_id=request.canonical_run_id or None,
                status="running",
                idempotency_key=request.idempotency_key,
                request_fingerprint=fingerprint,
                trace_id=trace_id,
                input_json={},
                execution_input_ciphertext=None,
                policy_json=policy,
                selected_provider_id="content_format",
                selected_model_id=model_id,
                selected_instance_id="cloud-runtime",
            ),
        )
        service.commercial_service.record_run_acceptance(session=session, run=run)
        result = (
            format_structure(source)
            if request.contract_version == "content_format_request.v2"
            else format_candidate(source, source_format)
        )
        service.run_lifecycle_service.succeed_run(
            repository,
            run,
            result_json={},
            provider_id="content_format",
            model_id=model_id,
            instance_id="cloud-runtime",
            fallback_used=False,
        )
        set_transient_runtime_result(run, result)
        session.commit()
        return service._build_execution_response(
            run, repository=repository, idempotent_replay=False
        )
