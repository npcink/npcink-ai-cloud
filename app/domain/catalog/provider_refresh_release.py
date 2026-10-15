from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from app.adapters.providers.base import ProviderCatalogRefreshError


class ProviderRefreshService(Protocol):
    def refresh_catalog(self, provider_ids: list[str] | None = None) -> dict[str, Any]: ...

    def scan_provider_health(self) -> dict[str, Any]: ...


def refresh_provider_catalogs(
    *,
    mode: str,
    service: ProviderRefreshService,
    providers: Mapping[str, object],
    historical_catalog_available: bool,
    historical_revision: str,
) -> dict[str, Any]:
    """Refresh provider projections for a governed release operation.

    ``best-effort`` only suppresses the dedicated upstream catalog failure type.
    Database, routing, transaction, and health persistence errors remain visible
    to the caller and therefore fail the release.
    """

    if mode not in {"strict", "best-effort"}:
        raise ValueError("provider refresh mode must be strict or best-effort")

    provider_ids = sorted(str(provider_id) for provider_id in providers)
    result: dict[str, Any] = {
        "schema": "npcink.provider_refresh_result.v1",
        "mode": mode,
        "status": "fresh",
        "historical_catalog_available": historical_catalog_available,
        "historical_revision": historical_revision,
        "refreshed_provider_ids": [],
        "failed_provider_ids": [],
        "failed_provider_count": 0,
        "catalog_revision": "",
        "failure_types": [],
    }

    if mode == "best-effort" and not historical_catalog_available:
        result.update(
            {
                "status": "failed",
                "failed_provider_ids": provider_ids,
                "failed_provider_count": len(provider_ids),
                "failure_types": ["historical_catalog_unavailable"],
            }
        )
        return result

    if mode == "strict":
        catalog = service.refresh_catalog()
        result["catalog_revision"] = str(catalog.get("revision") or "")
        result["refreshed_provider_ids"] = sorted(
            str(provider_id) for provider_id in catalog.get("providers", [])
        )
    else:
        for provider_id in provider_ids:
            try:
                catalog = service.refresh_catalog(provider_ids=[provider_id])
            except ProviderCatalogRefreshError as error:
                result["failed_provider_ids"].append(provider_id)
                result["failure_types"].append(error.failure_type)
                continue
            result["refreshed_provider_ids"].extend(
                str(item) for item in catalog.get("providers", [])
            )
            result["catalog_revision"] = str(catalog.get("revision") or "")

        result["refreshed_provider_ids"] = sorted(set(result["refreshed_provider_ids"]))
        result["failed_provider_ids"] = sorted(set(result["failed_provider_ids"]))
        result["failure_types"] = sorted(set(result["failure_types"]))
        result["failed_provider_count"] = len(result["failed_provider_ids"])
        if result["failed_provider_ids"]:
            result["status"] = "degraded"

    if result["status"] in {"fresh", "degraded"}:
        service.scan_provider_health()

    return result
