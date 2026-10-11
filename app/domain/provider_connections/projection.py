"""Pure admin-safe provider connection projections."""

from __future__ import annotations

from typing import Any


def _string(value: object) -> str:
    return str(value or "").strip()


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def is_secret_key(key: str, secret_parts: tuple[str, ...]) -> bool:
    normalized = key.lower().replace("-", "_")
    if normalized in {"api_key_label", "api_key_labels", "key_label", "key_labels"}:
        return False
    return any(part in normalized for part in secret_parts)


def sanitize_config(config: dict[str, Any], secret_parts: tuple[str, ...]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in config.items():
        normalized_key = str(key)
        if is_secret_key(normalized_key, secret_parts):
            continue
        if isinstance(value, dict):
            sanitized[normalized_key] = sanitize_config(value, secret_parts)
        elif isinstance(value, list):
            sanitized[normalized_key] = [
                sanitize_config(item, secret_parts) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[normalized_key] = value
    return sanitized


def public_config(config: dict[str, Any], secret_parts: tuple[str, ...]) -> dict[str, Any]:
    hidden = {
        "provider_id",
        "kind",
        "capability_ids",
        "runtime_profile_ids",
        "group_id",
        "secretless",
    }
    return {
        key: value
        for key, value in sanitize_config(config, secret_parts).items()
        if key not in hidden
    }


def public_image_evidence(
    metadata: dict[str, Any], key: str, fields: tuple[str, ...]
) -> dict[str, Any]:
    evidence = _dict(metadata.get(key))
    return {field: _string(evidence.get(field)) for field in fields} if evidence else {}
