from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select

from app.adapters.providers.base import (
    ProviderCatalogSnapshot,
    ProviderExecutionError,
    ProviderExecutionResult,
)
from app.api.routes import admin_model_tests
from app.core.db import get_engine, get_session
from app.core.models import (
    CatalogInstance,
    CatalogModel,
    CatalogProvider,
    ProviderBudgetClaim,
    ProviderBudgetCounter,
    ProviderConnection,
    RunRecord,
    ServiceAuditEvent,
    ServiceSetting,
)
from app.domain.provider_connections import model_tests
from app.domain.provider_connections.service import ProviderConnectionAdminService
from app.domain.runtime.provider_budget import (
    SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
    ProviderBudgetService,
)
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def setup_model(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Any, ...]:
    database_url, client = _build_client(tmp_path)
    requests: list[Any] = []

    class Adapter:
        def execute(self, request: Any) -> ProviderExecutionResult:
            requests.append(request)
            return ProviderExecutionResult(
                output={"output_text": "private-output"},
                latency_ms=123,
                tokens_in=12,
                tokens_out=8,
                cost=0,
            )

    monkeypatch.setattr(model_tests, "build_provider_adapter_from_connection", lambda *_: Adapter())
    with get_session(database_url) as session:
        session.add(
            CatalogProvider(
                provider_id="local",
                display_name="Local",
                adapter_type="openai_compatible",
                status="active",
            )
        )
        session.add(
            ProviderConnection(
                connection_id="local",
                provider_type="openai_compatible",
                display_name="Local",
                enabled=True,
                source_role="execution_source",
                base_url="http://localhost:11434/v1",
                config_json={
                    "provider_id": "local",
                    "kind": "openai_compatible",
                    "secretless": True,
                    "model_ids": ["model"],
                    "model_namespace_prefix": "local",
                },
            )
        )
        session.add(
            CatalogModel(
                model_id="local/model",
                provider_id="local",
                family="text",
                feature="text",
                status="available",
                revision="test",
                is_deprecated=False,
            )
        )
        session.add(
            CatalogInstance(
                instance_id="local-instance",
                provider_id="local",
                model_id="local/model",
                endpoint_variant="chat_completions",
                region="local",
                health_status="healthy",
            )
        )
        session.commit()
    return database_url, client, requests


def post(client: Any, key: str = "test-model", **overrides: Any) -> Any:
    return client.post(
        "/internal/service/admin/provider-connections/local/model-tests",
        headers=build_internal_headers(idempotency_key=key),
        json={"model_id": "model", "prompt": "private-input", **overrides},
    )


def test_exact_model_dispatch_audit_and_duplicate_guard(tmp_path: Path, monkeypatch: Any) -> None:
    database_url, client, requests = setup_model(tmp_path, monkeypatch)
    response = post(client)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["model_id"] == "local/model"
    assert data["provider_id"] == "local"
    assert data["output_text"] == "private-output"
    assert data["fallback_count"] == 0
    assert data["test_id"].startswith("model_test_")
    assert len(requests) == 1
    assert requests[0].policy["allow_fallback"] is False
    assert requests[0].instance_id == "local-instance"
    assert post(client).status_code == 409
    assert len(requests) == 1
    with get_session(database_url) as session:
        audit = session.scalar(
            select(ServiceAuditEvent).where(
                ServiceAuditEvent.event_kind == "provider_connection.model_test",
            )
        )
        assert audit is not None
        serialized = json.dumps(audit.payload_json)
        assert "private-input" not in serialized and "private-output" not in serialized
        assert data["test_id"] in serialized
        assert session.scalar(select(RunRecord)) is None


@pytest.mark.parametrize(
    "mode,expected",
    [("unpriced", 0.05), ("partial_rates", 0.05), ("", 0.05), ("standard_rates", 0)],
)
def test_model_test_checkpoints_claim_and_preserves_unknown_cost(
    tmp_path: Path,
    monkeypatch: Any,
    mode: str,
    expected: float,
) -> None:
    database_url, client, requests = setup_model(tmp_path, monkeypatch)
    with get_session(database_url) as session:
        session.add(
            ServiceSetting(
                setting_id=SERVICE_SETTING_PROVIDER_ACCOUNT_SPEND_BUDGET,
                setting_kind="runtime",
                enabled=True,
                status="ready",
                config_json={
                    "conservative_unpriced_cost_usd": 0.05,
                    "providers": {
                        "local": {"account_class": "paid", "daily_usd": 0.05, "monthly_usd": 0.05},
                    },
                },
            )
        )
        session.commit()

    class InspectingAdapter:
        def execute(self, request: Any) -> ProviderExecutionResult:
            assert get_engine(database_url).pool.checkedout() == 0
            with get_session(database_url) as session:
                claims = list(session.scalars(select(ProviderBudgetClaim)))
                assert len(claims) == 2
                assert all(claim.status == "claimed" for claim in claims)
            requests.append(request)
            assert (
                request.policy["max_output_tokens"]
                == request.input_payload["params"]["max_tokens"]
                == 2048
            )
            return ProviderExecutionResult(
                output={"reported_model_id": "different-upstream"},
                latency_ms=12,
                tokens_in=10,
                tokens_out=2048,
                reasoning_tokens=2048,
                cost=0,
                cost_estimate_mode=mode,
                finish_reason="length",
            )

    monkeypatch.setattr(
        model_tests, "build_provider_adapter_from_connection", lambda *_: InspectingAdapter()
    )
    response = post(client)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["requested_model_id"] == "local/model"
    assert data["reported_model_id"] == "different-upstream"
    assert data["output_text"] == "" and data["reasoning_tokens"] == 2048
    with get_session(database_url) as session:
        assert all(
            row.reserved_cost_usd == pytest.approx(expected)
            for row in session.scalars(select(ProviderBudgetCounter))
        )
    if expected:
        assert post(client, "another-call").json()["error_code"] == "provider.budget_exceeded"
        assert len(requests) == 1


@pytest.mark.parametrize("endpoint", ["chat_completions", "ollama_chat"])
def test_vision_default_image_and_no_remote_fetch(
    tmp_path: Path,
    monkeypatch: Any,
    endpoint: str,
) -> None:
    database_url, client, requests = setup_model(tmp_path, monkeypatch)
    with get_session(database_url) as session:
        session.get(CatalogInstance, "local-instance").endpoint_variant = endpoint
        session.commit()
    assert post(client, capability="vision").status_code == 200
    assert requests[0].endpoint_variant == endpoint
    content = requests[0].input_payload["messages"][0]["content"]
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    response = post(client, "invalid-image", capability="vision", image_data_url="http://internal/")
    assert response.status_code == 422
    assert len(requests) == 1


@pytest.mark.parametrize(
    "field,value", [("enabled", False), ("model_ids", []), ("model_ids", ["different-model"])]
)
def test_unsaved_or_disabled_models_never_dispatch(
    tmp_path: Path,
    monkeypatch: Any,
    field: str,
    value: Any,
) -> None:
    database_url, client, requests = setup_model(tmp_path, monkeypatch)
    with get_session(database_url) as session:
        row = session.get(ProviderConnection, "local")
        if field == "enabled":
            row.enabled = value
        else:
            row.config_json = {**row.config_json, field: value}
        session.commit()
    assert post(client).status_code == 409
    assert requests == []


def test_auth_validation_budget_and_safe_failure(tmp_path: Path, monkeypatch: Any) -> None:
    _, client, requests = setup_model(tmp_path, monkeypatch)
    url = "/internal/service/admin/provider-connections/local/model-tests"
    assert client.post(url, json={"model_id": "model", "prompt": "hello"}).status_code == 401
    assert post(client, prompt="  ").status_code == 422
    assert post(client, capability="embedding").status_code == 422

    def denied(*_: Any, **__: Any) -> None:
        raise ProviderExecutionError("provider.budget_exceeded", "secret upstream request")

    monkeypatch.setattr(ProviderBudgetService, "claim_before_dispatch", denied)
    response = post(client, "budget-denied")
    assert response.status_code == 502
    assert response.json()["error_code"] == "provider.budget_exceeded"
    assert "secret upstream" not in response.text
    assert requests == []

    def broken(*_: Any) -> None:
        raise RuntimeError("secret key and private prompt")

    monkeypatch.setattr(admin_model_tests, "execute_model_test", broken)
    response = post(client, "broken-provider")
    assert response.status_code == 502
    assert "secret key" not in response.text


def test_secretless_saved_connection_survives_redacted_preview_and_edit(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    database_url, client, _ = setup_model(tmp_path, monkeypatch)
    settings = client.app.state.services.settings
    service = ProviderConnectionAdminService(database_url, settings=settings)
    saved = next(
        row for row in service.list_connections()["connections"] if row["connection_id"] == "local"
    )
    assert "secretless" not in saved["config"]

    class PreviewAdapter:
        def fetch_catalog(self) -> ProviderCatalogSnapshot:
            return ProviderCatalogSnapshot(
                provider_id="local",
                display_name="Local",
                adapter_type="openai_compatible",
                models=[],
            )

    monkeypatch.setattr(
        "app.domain.provider_connections.service.build_provider_adapter_from_connection",
        lambda *_: PreviewAdapter(),
    )
    payload = {
        key: saved[key]
        for key in (
            "connection_id",
            "provider_id",
            "display_name",
            "kind",
            "enabled",
            "base_url",
            "capability_ids",
            "runtime_profile_ids",
            "config",
            "metadata",
            "source_role",
        )
    }
    payload.update(provider_type="openai_compatible", credential="")
    response = client.post(
        "/internal/service/admin/provider-connections/preview-catalog",
        headers=build_internal_headers(idempotency_key="secretless-preview"),
        json=payload,
    )
    assert response.status_code == 200, response.text
    service.save_connection(payload, connection_id="local", operation="update")
    with get_session(database_url) as session:
        assert session.get(ProviderConnection, "local").config_json["secretless"] is True
    disabled = service.save_connection(
        {**payload, "secretless": False},
        connection_id="local",
        operation="update",
    )
    assert disabled["configured"] is False


@pytest.mark.parametrize(
    "rates,usage,reported,expected,basis,conservative",
    [
        ({"input": 2, "output": 4}, {}, "", 0.000056, "catalog", False),
        (
            {"input": 2, "output": 4, "cache_read": 0.2},
            {"cache_read_tokens": 10},
            "",
            0.000038,
            "catalog",
            False,
        ),
        ({"input": 2, "output": 4}, {"cache_read_tokens": 10}, "", 0.000056, "catalog", True),
        ({"input": 2, "output": None}, {}, "", None, "unavailable", False),
        ({"input": None, "output": None}, {}, "", None, "unavailable", False),
        ({"input": 0, "output": 0}, {}, "", 0, "catalog", False),
        ({"input": 0.000001, "output": 0.000001}, {}, "", 0.00000000002, "catalog", False),
        ({"input": -2, "output": 4}, {}, "", None, "unavailable", False),
        ({"input": 2, "output": float("nan")}, {}, "", None, "unavailable", False),
        (
            {"input": None, "output": None},
            {},
            "provider_reported",
            0.003,
            "provider_reported",
            False,
        ),
        (
            {"input": 2, "output": 4},
            {"tokens_in": 0, "tokens_out": 0},
            "",
            None,
            "unavailable",
            False,
        ),
    ],
)
def test_model_test_cost_is_truthful(
    tmp_path: Path,
    monkeypatch: Any,
    rates: Any,
    usage: Any,
    reported: str,
    expected: float | None,
    basis: str,
    conservative: bool,
) -> None:
    database_url, client, _ = setup_model(tmp_path, monkeypatch)
    with get_session(database_url) as session:
        model = session.get(CatalogModel, "local/model")
        model.price_input, model.price_output = rates["input"], rates["output"]
        model.raw_json = {"runtime_pricing": {"cache_read": rates.get("cache_read")}}
        session.commit()

    class Adapter:
        def execute(self, _: Any) -> ProviderExecutionResult:
            return ProviderExecutionResult(
                output={"output_text": "answer"},
                latency_ms=1,
                cost=0.003 if reported else 0,
                cost_estimate_mode=reported,
                **{"tokens_in": 12, "tokens_out": 8, **usage},
            )

    monkeypatch.setattr(model_tests, "build_provider_adapter_from_connection", lambda *_: Adapter())
    response = post(client)
    assert response.status_code == 200, response.text
    cost = response.json()["data"]["cost"]
    assert cost["basis"] == basis
    if expected is None:
        assert cost["amount_usd"] is None
    else:
        assert cost["amount_usd"] == pytest.approx(expected)
    assert cost.get("conservative_cache_rate", False) is conservative


@pytest.mark.parametrize(
    "case", ["current", "expired", "superseded", "failed", "future", "alias", "other-provider"]
)
def test_test_cost_reference_freshness_and_exact_identity(
    tmp_path: Path,
    monkeypatch: Any,
    case: str,
) -> None:
    from datetime import UTC, datetime, timedelta

    from app.core.models import ModelReferenceModel, ModelReferenceSource

    database_url, client, _ = setup_model(tmp_path, monkeypatch)
    now = datetime.now(UTC)
    checked = now - timedelta(hours=25) if case == "expired" else now
    recorded = checked - timedelta(seconds=1) if case == "superseded" else checked
    if case == "future":
        recorded = checked = now + timedelta(hours=1)
    with get_session(database_url) as session:
        session.add(
            ModelReferenceSource(
                source_id="models.dev",
                display_name="models.dev",
                status="failed" if case == "failed" else "active",
                last_synced_at=checked,
            )
        )
        session.add(
            ModelReferenceModel(
                source_id="models.dev",
                provider_id="other" if case == "other-provider" else "local",
                model_id="similar-model" if case == "alias" else "model",
                synced_at=recorded,
                price_input=2,
                price_output=4,
                price_unit="usd_per_1m_tokens",
            )
        )
        session.commit()
    response = post(client)
    assert response.status_code == 200, response.text
    cost = response.json()["data"]["cost"]
    assert cost["basis"] == ("reference" if case == "current" else "unavailable")
    assert cost["amount_usd"] == (pytest.approx(0.000056) if case == "current" else None)
