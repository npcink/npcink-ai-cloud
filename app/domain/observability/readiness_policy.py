from __future__ import annotations

from collections.abc import Mapping


def accepts_degraded_provider_refresh(envelope: object) -> bool:
    """Return whether operational readiness may tolerate stale provider data."""

    if not isinstance(envelope, Mapping):
        return False
    data = envelope.get("data")
    if not isinstance(data, Mapping):
        return False
    checks = data.get("checks")
    if not isinstance(checks, Mapping):
        return False
    summary = data.get("summary")
    if not isinstance(summary, Mapping):
        return False
    providers = summary.get("providers")
    if not isinstance(providers, Mapping):
        return False
    scope = providers.get("operational_scope") or providers
    if not isinstance(scope, Mapping):
        return False

    freshness = scope.get("freshness")
    instances_total = scope.get("instances_total")
    status_counts = scope.get("status_counts")
    if not isinstance(status_counts, Mapping):
        return False
    if not isinstance(instances_total, int) or isinstance(instances_total, bool):
        return False

    worker_keys = [str(key) for key in checks if str(key).startswith("worker.")]
    cadence_keys = [str(key) for key in checks if str(key).startswith("cadence.")]
    other_checks_ok = all(
        value is True for key, value in checks.items() if key != "providers.fresh"
    )
    return (
        checks.get("providers.fresh") is False
        and checks.get("providers.operational") is True
        and checks.get("dependencies.ready") is True
        and other_checks_ok
        and bool(worker_keys)
        and bool(cadence_keys)
        and all(checks[key] is True for key in worker_keys)
        and all(checks[key] is True for key in cadence_keys)
        and freshness in {"stale", "attention"}
        and instances_total > 0
        and status_counts.get("unhealthy") == 0
        and status_counts.get("unknown") == 0
    )
