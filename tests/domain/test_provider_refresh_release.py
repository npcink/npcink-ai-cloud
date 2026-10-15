from __future__ import annotations

import pytest

from app.adapters.providers.base import ProviderCatalogRefreshError
from app.domain.catalog.provider_refresh_release import refresh_provider_catalogs


class FakeProviderRefreshService:
    def __init__(self, *, failures: dict[str, Exception] | None = None) -> None:
        self.failures = failures or {}
        self.refresh_calls: list[list[str] | None] = []
        self.health_scan_calls = 0

    def refresh_catalog(self, provider_ids: list[str] | None = None) -> dict[str, object]:
        self.refresh_calls.append(provider_ids)
        if provider_ids is None and self.failures:
            raise next(iter(self.failures.values()))
        if provider_ids:
            failure = self.failures.get(provider_ids[0])
            if failure is not None:
                raise failure
            return {"revision": f"catalog-{provider_ids[0]}", "providers": provider_ids}
        return {"revision": "catalog-all", "providers": ["openai", "qwen"]}

    def scan_provider_health(self) -> dict[str, object]:
        self.health_scan_calls += 1
        return {"scanned_count": 1}


def test_strict_mode_propagates_provider_catalog_failure() -> None:
    failure = ProviderCatalogRefreshError("openai", "http_401", "expired credential")
    service = FakeProviderRefreshService(failures={"openai": failure})

    with pytest.raises(ProviderCatalogRefreshError):
        refresh_provider_catalogs(
            mode="strict",
            service=service,
            providers={"openai": object()},
            historical_catalog_available=True,
            historical_revision="catalog-old",
        )

    assert service.refresh_calls == [None]
    assert service.health_scan_calls == 0


def test_best_effort_keeps_historical_catalog_and_counts_failed_provider() -> None:
    failure = ProviderCatalogRefreshError("qwen", "http_401", "expired credential")
    service = FakeProviderRefreshService(failures={"qwen": failure})

    result = refresh_provider_catalogs(
        mode="best-effort",
        service=service,
        providers={"openai": object(), "qwen": object()},
        historical_catalog_available=True,
        historical_revision="catalog-old",
    )

    assert result["status"] == "degraded"
    assert result["refreshed_provider_ids"] == ["openai"]
    assert result["failed_provider_ids"] == ["qwen"]
    assert result["failed_provider_count"] == 1
    assert result["failure_types"] == ["http_401"]
    assert "expired credential" not in str(result)
    assert service.health_scan_calls == 1


def test_best_effort_bootstrap_fails_before_provider_calls() -> None:
    service = FakeProviderRefreshService()

    result = refresh_provider_catalogs(
        mode="best-effort",
        service=service,
        providers={"openai": object(), "qwen": object()},
        historical_catalog_available=False,
        historical_revision="bootstrap",
    )

    assert result["status"] == "failed"
    assert result["failed_provider_ids"] == ["openai", "qwen"]
    assert result["failed_provider_count"] == 2
    assert service.refresh_calls == []
    assert service.health_scan_calls == 0


def test_best_effort_does_not_suppress_database_or_internal_errors() -> None:
    service = FakeProviderRefreshService(failures={"openai": RuntimeError("database failed")})

    with pytest.raises(RuntimeError, match="database failed"):
        refresh_provider_catalogs(
            mode="best-effort",
            service=service,
            providers={"openai": object()},
            historical_catalog_available=True,
            historical_revision="catalog-old",
        )

    assert service.health_scan_calls == 0
