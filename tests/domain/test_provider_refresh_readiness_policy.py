from __future__ import annotations

from app.domain.observability.readiness_policy import accepts_degraded_provider_refresh


def _envelope(*, freshness: str = "stale", instances_total: int = 1) -> dict[str, object]:
    checks: dict[str, object] = {
        "dependencies.ready": True,
        "providers.fresh": False,
        "providers.operational": True,
        "worker.runtime_queue.fresh": True,
        "worker.callback_dispatch.fresh": True,
        "worker.ops_cadence.fresh": True,
        "cadence.provider_health_scan.fresh": True,
    }
    return {
        "data": {
            "checks": checks,
            "summary": {
                "providers": {
                    "freshness": freshness,
                    "instances_total": instances_total,
                    "status_counts": {"healthy": 1, "degraded": 0, "unhealthy": 0, "unknown": 0},
                }
            },
        }
    }


def test_stale_provider_catalog_is_accepted_only_with_operational_runtime() -> None:
    assert accepts_degraded_provider_refresh(_envelope()) is True


def test_missing_worker_or_cadence_evidence_is_rejected() -> None:
    envelope = _envelope()
    checks = envelope["data"]["checks"]  # type: ignore[index]
    del checks["worker.ops_cadence.fresh"]  # type: ignore[index]
    del checks["cadence.provider_health_scan.fresh"]  # type: ignore[index]

    assert accepts_degraded_provider_refresh(envelope) is False


def test_unhealthy_or_zero_provider_instances_are_rejected() -> None:
    unhealthy = _envelope()
    unhealthy["data"]["summary"]["providers"]["status_counts"]["unhealthy"] = 1  # type: ignore[index]
    assert accepts_degraded_provider_refresh(unhealthy) is False
    assert accepts_degraded_provider_refresh(_envelope(instances_total=0)) is False
