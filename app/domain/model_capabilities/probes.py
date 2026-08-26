from __future__ import annotations

import base64
import math
import re
from dataclasses import dataclass

from app.adapters.providers.base import (
    ProviderAdapter,
    ProviderExecutionError,
    ProviderExecutionRequest,
)
from app.domain.model_capabilities.contracts import (
    CapabilityEvidenceState,
    build_route_fingerprint,
)

# A deterministic, non-sensitive fixture. Probe requests must never persist it.
_PROBE_IMAGE = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c02"
    "0000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082"
)
_UNSUPPORTED_VISION_ERROR = re.compile(
    r"(?:unsupported|not supported|does not support|cannot process).*(?:image|vision|modalit)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class CapabilityProbeResult:
    state: CapabilityEvidenceState
    error_code: str | None = None
    detail: str = ""


def probe_vision(
    *,
    provider: ProviderAdapter,
    run_id: str,
    site_id: str,
    model_id: str,
    instance_id: str,
    endpoint_variant: str,
    trace_id: str,
    timeout_ms: int = 30_000,
) -> CapabilityProbeResult:
    """Check image input on one exact route without writing any product data."""

    encoded = base64.b64encode(_PROBE_IMAGE).decode("ascii")
    image_url = f"data:image/png;base64,{encoded}"
    content = (
        [{"type": "input_text", "text": "Reply with the word OK."},
         {"type": "input_image", "image_url": image_url}]
        if endpoint_variant == "responses"
        else [{"type": "text", "text": "Reply with the word OK."},
              {"type": "image_url", "image_url": {"url": image_url}}]
    )
    request = ProviderExecutionRequest(
        run_id=run_id,
        site_id=site_id,
        ability_name="npcink-cloud/capability-probe",
        profile_id="vision.probe",
        execution_kind="vision",
        model_id=model_id,
        instance_id=instance_id,
        endpoint_variant=endpoint_variant,
        trace_id=trace_id,
        input_payload=(
            {"input": [{"role": "user", "content": content}], "params": {"max_tokens": 8}}
            if endpoint_variant == "responses"
            else {"messages": [{"role": "user", "content": content}], "params": {"max_tokens": 8}}
        ),
        policy={"capability_probe": True},
        timeout_ms=timeout_ms,
    )
    try:
        result = provider.execute(request)
    except ProviderExecutionError as error:
        error_text = f"{error.error_code} {error.message}"
        state: CapabilityEvidenceState = (
            "unsupported"
            if error.error_code == "provider.unsupported_operation"
            or _UNSUPPORTED_VISION_ERROR.search(error_text)
            else "verification_failed"
        )
        return CapabilityProbeResult(state=state, error_code=error.error_code, detail=error.message)

    output_text = str(result.output.get("output_text") or result.output.get("text") or "").strip()
    if not output_text:
        return CapabilityProbeResult(
            state="verification_failed",
            error_code="capability_probe.empty_output",
            detail="Provider accepted the request but returned no text output",
        )
    return CapabilityProbeResult(state="verified")


def vision_probe_fingerprint(*, provider_connection_id: str, model_id: str, endpoint_variant: str) -> str:
    return build_route_fingerprint(
        provider_connection_id=provider_connection_id,
        model_id=model_id,
        capability="vision",
        endpoint_variant=endpoint_variant,
        request_format="image_url:data_uri",
    ).value


def probe_embedding(
    *,
    provider: ProviderAdapter,
    run_id: str,
    site_id: str,
    model_id: str,
    instance_id: str,
    endpoint_variant: str,
    trace_id: str,
    timeout_ms: int = 30_000,
) -> CapabilityProbeResult:
    """Check that an embeddings route returns a finite, stable-dimension vector."""

    request = ProviderExecutionRequest(
        run_id=run_id,
        site_id=site_id,
        ability_name="npcink-cloud/capability-probe",
        profile_id="embedding.probe",
        execution_kind="embedding",
        model_id=model_id,
        instance_id=instance_id,
        endpoint_variant=endpoint_variant,
        trace_id=trace_id,
        input_payload={"input": "Capability probe text.", "params": {"encoding_format": "float"}},
        policy={"capability_probe": True},
        timeout_ms=timeout_ms,
    )
    try:
        result = provider.execute(request)
    except ProviderExecutionError as error:
        return CapabilityProbeResult(
            state="verification_failed",
            error_code=error.error_code,
            detail=error.message,
        )

    vector = result.output.get("embedding")
    if not isinstance(vector, list) or not vector:
        return CapabilityProbeResult(
            state="verification_failed",
            error_code="capability_probe.embedding_invalid",
            detail="Provider returned no embedding vector",
        )
    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        for value in vector
    ):
        return CapabilityProbeResult(
            state="verification_failed",
            error_code="capability_probe.embedding_invalid",
            detail="Provider returned a non-numeric or non-finite embedding value",
        )
    return CapabilityProbeResult(state="verified")


def embedding_probe_fingerprint(*, provider_connection_id: str, model_id: str, endpoint_variant: str) -> str:
    return build_route_fingerprint(
        provider_connection_id=provider_connection_id,
        model_id=model_id,
        capability="embedding",
        endpoint_variant=endpoint_variant,
        request_format="text",
    ).value
