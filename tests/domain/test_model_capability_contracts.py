from datetime import UTC, datetime

import pytest

from app.domain.model_capabilities.contracts import (
    CapabilityEvidence,
    build_route_fingerprint,
)
from app.domain.model_capabilities.probes import probe_vision
from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionResult


class _ProbeProvider:
    def __init__(self, *, error: ProviderExecutionError | None = None) -> None:
        self.error = error
        self.request = None

    def execute(self, request):
        self.request = request
        if self.error:
            raise self.error
        return ProviderExecutionResult(
            output={"output_text": "OK"},
            latency_ms=1,
            tokens_in=1,
            tokens_out=1,
            cost=0.0,
        )


def test_route_fingerprint_is_stable_and_route_specific() -> None:
    first = build_route_fingerprint(
        provider_connection_id="mqzj",
        model_id="gpt-5.4",
        capability="vision",
        endpoint_variant="responses",
        request_format="image_url",
    )
    same = build_route_fingerprint(
        provider_connection_id="mqzj",
        model_id="gpt-5.4",
        capability="vision",
        endpoint_variant="responses",
        request_format="image_url",
    )
    different_capability = build_route_fingerprint(
        provider_connection_id="mqzj",
        model_id="gpt-5.4",
        capability="text",
        endpoint_variant="responses",
        request_format="text",
    )

    assert first.value == same.value
    assert first.value != different_capability.value
    assert len(first.value) == 64


def test_only_verified_evidence_is_routing_eligible() -> None:
    evidence = CapabilityEvidence(
        capability="vision",
        state="verified",
        route_fingerprint="abc123",
        source="provider_probe",
        revision="2026-08-26",
        checked_at=datetime.now(UTC),
    )

    assert evidence.routing_eligible is True


def test_vision_probe_uses_image_input_and_marks_success() -> None:
    provider = _ProbeProvider()

    result = probe_vision(
        provider=provider,
        run_id="run_probe",
        site_id="site_probe",
        model_id="gpt-5.4",
        instance_id="mqzj-gpt-5-4",
        endpoint_variant="responses",
        trace_id="trace_probe",
    )

    assert result.state == "verified"
    assert provider.request is not None
    content = provider.request.input_payload["input"][0]["content"]
    assert content[1]["type"] == "input_image"
    assert content[1]["image_url"].startswith("data:image/png;base64,")


def test_vision_probe_keeps_transient_provider_failures_retryable() -> None:
    provider = _ProbeProvider(
        error=ProviderExecutionError("provider.timeout", "timed out")
    )

    result = probe_vision(
        provider=provider,
        run_id="run_probe",
        site_id="site_probe",
        model_id="gpt-5.4",
        instance_id="mqzj-gpt-5-4",
        endpoint_variant="responses",
        trace_id="trace_probe",
    )

    assert result.state == "verification_failed"
    assert result.error_code == "provider.timeout"


def test_vision_probe_only_marks_explicit_image_rejection_unsupported() -> None:
    provider = _ProbeProvider(
        error=ProviderExecutionError("provider.invalid_request", "invalid image_url shape")
    )

    result = probe_vision(
        provider=provider,
        run_id="run_probe",
        site_id="site_probe",
        model_id="gpt-5.4",
        instance_id="mqzj-gpt-5-4",
        endpoint_variant="responses",
        trace_id="trace_probe",
    )

    assert result.state == "verification_failed"


@pytest.mark.parametrize("state", ["unsupported", "verification_failed"])
def test_negative_evidence_requires_error_code(state: str) -> None:
    with pytest.raises(ValueError, match="requires an error code"):
        CapabilityEvidence(
            capability="vision",
            state=state,  # type: ignore[arg-type]
            route_fingerprint="abc123",
            source="provider_probe",
            revision="2026-08-26",
        )
