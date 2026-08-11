from __future__ import annotations

from app.core.config import Settings
from app.core.deployment_identity import DeploymentIdentity


def test_deployment_identity_exposes_short_public_and_full_internal_revision() -> None:
    revision = "a" * 40
    identity = DeploymentIdentity.from_settings(
        Settings(
            environment="test",
            deployment_release="release-20260811-01",
            deployment_source_revision=revision,
            deployment_source_dirty=True,
            deployment_created_at="2026-08-11T01:02:03+00:00",
        )
    )

    assert identity.public_payload() == {
        "release": "release-20260811-01",
        "source_revision": revision[:12],
        "source_dirty": True,
    }
    assert identity.internal_payload() == {
        "release": "release-20260811-01",
        "source_revision": revision,
        "source_dirty": True,
        "created_at": "2026-08-11T01:02:03Z",
        "environment": "test",
    }


def test_deployment_identity_fails_closed_for_invalid_injected_values() -> None:
    identity = DeploymentIdentity.from_settings(
        Settings(
            deployment_release="../../release",
            deployment_source_revision="not-a-revision",
            deployment_created_at="not-a-time",
        )
    )

    assert identity.public_payload() == {
        "release": "unknown",
        "source_revision": "unknown",
        "source_dirty": False,
    }
    assert identity.internal_payload()["created_at"] == "unknown"
