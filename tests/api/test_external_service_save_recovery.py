from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.domain.provider_connections.runtime_settings import (
    apply_provider_connection_runtime_settings,
)
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


def _payload(provider_id: str, **updates: Any) -> dict[str, Any]:
    return {
        "connection_id": f"external_{provider_id}",
        "provider_id": provider_id,
        "provider_type": "web_search_provider",
        "kind": "web_search_provider",
        "display_name": provider_id,
        "enabled": True,
        "base_url": "https://example.test",
        "source_role": "execution_source",
        "capability_ids": ["web_search"],
        "runtime_profile_ids": ["web-search.managed"],
        "metadata": {"ui_source": "external_services", "service_role": "primary"},
        **updates,
    }


def test_reader_ui_save_contract_enables_and_disables_without_replacing_primary(
    tmp_path: Path,
) -> None:
    _, client = _build_client(tmp_path, providers={})
    path = "/internal/service/admin/provider-connections"
    primary = client.post(path, headers=build_internal_headers(idempotency_key="reader-primary"),
                          json=_payload("tavily", credential="test-primary-key"))
    assert primary.status_code == 200
    reader = _payload(
        "jina_reader", base_url="https://r.jina.ai", secretless=True,
        runtime_profile_ids=["web-search.reader"], config={"secretless": True},
        metadata={"ui_source": "external_services", "service_role": "enhancer"},
    )
    response = client.post(
        path, headers=build_internal_headers(idempotency_key="reader-enable"), json=reader,
    )
    assert response.status_code == 200
    assert response.json()["data"]["configured"] is True
    assert response.json()["data"]["runtime_profile_ids"] == ["web-search.reader"]
    assert response.json()["data"]["metadata"]["service_role"] == "enhancer"
    disabled = client.patch(f"{path}/external_jina_reader",
                            headers=build_internal_headers(idempotency_key="reader-disable"),
                            json={**reader, "enabled": False})
    assert disabled.status_code == 200
    directory = client.get(path, headers=build_internal_headers()).json()["data"]["connections"]
    by_id = {item["connection_id"]: item for item in directory}
    assert by_id["external_tavily"]["enabled"] is True
    assert by_id["external_jina_reader"]["enabled"] is False


@pytest.mark.parametrize("blank", ["   ", "\t\n", "\u3000"])
@pytest.mark.parametrize("field", ["credential", "secret"])
def test_blank_replacement_never_stores_or_disables_the_primary(
    tmp_path: Path, blank: str, field: str,
) -> None:
    _, client = _build_client(tmp_path, providers={})
    path = "/internal/service/admin/provider-connections"
    assert client.post(
        path, headers=build_internal_headers(idempotency_key="primary-create"),
        json=_payload("tavily", credential="  test-primary-key  "),
    ).status_code == 200
    for index, (method, target, payload) in enumerate([
        (client.post, path, _payload("bocha", **{field: blank})),
        (client.patch, f"{path}/external_tavily", _payload("tavily", **{field: blank})),
    ]):
        response = method(
            target, headers=build_internal_headers(idempotency_key=f"blank-{index}"), json=payload,
        )
        assert response.status_code == 400
        assert response.json()["error_code"] == "provider_connection.credential_blank"
    connections = client.get(path, headers=build_internal_headers()).json()["data"]["connections"]
    assert len(connections) == 1
    assert connections[0]["provider_id"] == "tavily"
    assert connections[0]["enabled"] is True
    settings = client.app.state.services.settings.model_copy(deep=True)
    apply_provider_connection_runtime_settings(settings)
    assert settings.web_search_provider == "auto"
    assert settings.web_search_tavily_api_key == "test-primary-key"
    assert not settings.web_search_bocha_api_key


def test_absent_null_and_explicit_empty_credential_keep_distinct_meanings(tmp_path: Path) -> None:
    _, client = _build_client(tmp_path, providers={})
    path = "/internal/service/admin/provider-connections"
    payload = _payload("tavily")
    assert client.post(path, headers=build_internal_headers(idempotency_key="keep-create"),
                       json={**payload, "credential": "test-saved-key"}).status_code == 200
    for index, fields in enumerate([{}, {"credential": None}]):
        response = client.patch(f"{path}/external_tavily",
                                headers=build_internal_headers(idempotency_key=f"keep-{index}"),
                                json={**payload, **fields})
        assert response.status_code == 200
        assert response.json()["data"]["configured"] is True
    response = client.patch(f"{path}/external_tavily",
                            headers=build_internal_headers(idempotency_key="clear-key"),
                            json={**payload, "credential": "", "enabled": False})
    assert response.status_code == 200
    assert response.json()["data"]["configured"] is False
    assert response.json()["data"]["enabled"] is False
