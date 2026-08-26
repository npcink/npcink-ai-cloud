from datetime import UTC, datetime

import pytest

from app.domain.model_capabilities.contracts import (
    CapabilityEvidence,
    build_route_fingerprint,
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
