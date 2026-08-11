from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

_RELEASE_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_SOURCE_REVISION_PATTERN = re.compile(r"[0-9a-f]{40}")


def _normalized_release(value: str) -> str:
    candidate = str(value or "").strip()
    return candidate if _RELEASE_PATTERN.fullmatch(candidate) is not None else "unknown"


def _normalized_source_revision(value: str) -> str:
    candidate = str(value or "").strip().lower()
    return candidate if _SOURCE_REVISION_PATTERN.fullmatch(candidate) is not None else "unknown"


def _normalized_created_at(value: str) -> str:
    candidate = str(value or "").strip()
    if not candidate:
        return "unknown"
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return "unknown"
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return "unknown"
    return parsed.isoformat().replace("+00:00", "Z")


@dataclass(frozen=True, slots=True)
class DeploymentIdentity:
    release: str
    source_revision: str
    source_dirty: bool
    created_at: str
    environment: str

    @classmethod
    def from_settings(cls, settings: Settings) -> DeploymentIdentity:
        return cls(
            release=_normalized_release(settings.deployment_release),
            source_revision=_normalized_source_revision(settings.deployment_source_revision),
            source_dirty=bool(settings.deployment_source_dirty),
            created_at=_normalized_created_at(settings.deployment_created_at),
            environment=str(settings.environment or "unknown").strip() or "unknown",
        )

    @property
    def short_revision(self) -> str:
        if self.source_revision == "unknown":
            return "unknown"
        return self.source_revision[:12]

    def public_payload(self) -> dict[str, str | bool]:
        return {
            "release": self.release,
            "source_revision": self.short_revision,
            "source_dirty": self.source_dirty,
        }

    def internal_payload(self) -> dict[str, str | bool]:
        return {
            "release": self.release,
            "source_revision": self.source_revision,
            "source_dirty": self.source_dirty,
            "created_at": self.created_at,
            "environment": self.environment,
        }
