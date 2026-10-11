from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

MODEL_CAPABILITIES = (
    "text",
    "vision",
    "embedding",
    "image_generation",
    "audio_generation",
    "video_generation",
)
Capability = Literal[
    "text",
    "vision",
    "embedding",
    "image_generation",
    "audio_generation",
    "video_generation",
]

CAPABILITY_EVIDENCE_STATES = (
    "unverified",
    "verified",
    "unsupported",
    "verification_failed",
)
CapabilityEvidenceState = Literal[
    "unverified",
    "verified",
    "unsupported",
    "verification_failed",
]


@dataclass(frozen=True, slots=True)
class RouteFingerprint:
    """Stable identity for one Provider/model/capability request route."""

    provider_connection_id: str
    model_id: str
    capability: Capability
    endpoint_variant: str
    request_format: str

    @property
    def value(self) -> str:
        payload = {
            "provider_connection_id": self.provider_connection_id.strip(),
            "model_id": self.model_id.strip(),
            "capability": self.capability,
            "endpoint_variant": self.endpoint_variant.strip(),
            "request_format": self.request_format.strip(),
        }
        encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class CapabilityEvidence:
    """Metadata-only result of checking one exact Provider route."""

    capability: Capability
    state: CapabilityEvidenceState
    route_fingerprint: str
    source: str
    revision: str
    checked_at: datetime | None = None
    error_code: str | None = None

    def __post_init__(self) -> None:
        if self.state == "verified" and self.error_code:
            raise ValueError("verified capability evidence must not contain an error")
        if self.state in {"unsupported", "verification_failed"} and not self.error_code:
            raise ValueError(f"{self.state} evidence requires an error code")
        if not self.route_fingerprint.strip():
            raise ValueError("capability evidence requires a route fingerprint")
        if not self.source.strip():
            raise ValueError("capability evidence requires a source")
        if not self.revision.strip():
            raise ValueError("capability evidence requires a revision")

    @property
    def routing_eligible(self) -> bool:
        return self.state == "verified"


def build_route_fingerprint(
    *,
    provider_connection_id: str,
    model_id: str,
    capability: Capability,
    endpoint_variant: str,
    request_format: str,
) -> RouteFingerprint:
    """Build the cache key used for capability evidence."""

    return RouteFingerprint(
        provider_connection_id=provider_connection_id,
        model_id=model_id,
        capability=capability,
        endpoint_variant=endpoint_variant,
        request_format=request_format,
    )


def build_provider_connection_route_identity(
    *,
    connection_id: str,
    base_url: str = "",
    config: dict[str, object] | None = None,
) -> str:
    """Return a stable, non-secret identity for one configured Provider route."""

    def sanitize(value: object) -> object:
        if isinstance(value, dict):
            return {
                str(key): sanitize(item)
                for key, item in sorted(value.items(), key=lambda item: str(item[0]))
                if not any(
                    token in str(key).lower()
                    for token in ("secret", "token", "password", "credential", "api_key")
                )
            }
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        return value

    payload = {
        "connection_id": connection_id.strip(),
        "base_url": base_url.strip(),
        "config": sanitize(config or {}),
    }
    encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
