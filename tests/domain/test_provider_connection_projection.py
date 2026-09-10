from app.domain.provider_connections.projection import public_config, public_image_evidence


def test_public_config_masks_nested_provider_credentials_and_keeps_labels() -> None:
    value = public_config(
        {
            "provider_id": "hidden",
            "kind": "openai",
            "api_key": "secret",
            "api_key_label": "primary",
            "nested": {"password": "secret", "region": "global"},
            "models": [{"token": "secret", "name": "x"}],
        },
        ("secret", "token", "password", "api_key"),
    )
    assert value == {
        "api_key_label": "primary",
        "nested": {"region": "global"},
        "models": [{"name": "x"}],
    }


def test_public_image_evidence_returns_allowlisted_status_fields_only() -> None:
    value = public_image_evidence(
        {"image_delivery_probe": {"status": "ready", "probe_id": "p1", "secret": "x"}},
        "image_delivery_probe",
        ("status", "probe_id"),
    )
    assert value == {"status": "ready", "probe_id": "p1"}
