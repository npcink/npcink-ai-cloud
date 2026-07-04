from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select

from app.core.db import get_session
from app.core.models import ProviderConnection


@dataclass(frozen=True, slots=True)
class ProviderModelAllowlist:
    allowed_model_ids_by_provider: dict[str, set[str]]

    def allows(self, *, provider_id: str, model_id: str) -> bool:
        provider_models = self.allowed_model_ids_by_provider.get(provider_id)
        return bool(provider_models and model_id in provider_models)


def build_provider_model_allowlist(database_url: str) -> ProviderModelAllowlist:
    if not database_url:
        return ProviderModelAllowlist(allowed_model_ids_by_provider={})

    with get_session(database_url) as session:
        rows = list(
            session.scalars(
                select(ProviderConnection).where(ProviderConnection.enabled.is_(True))
            )
        )

    allowed_model_ids_by_provider: dict[str, set[str]] = {}
    for row in rows:
        config = _dict(row.config_json)
        metadata = _dict(row.metadata_json)
        provider_id = str(config.get("provider_id") or row.connection_id or "").strip()
        if not provider_id or not _connection_configured(row, config):
            continue
        model_ids = _normalize_id_list(config.get("model_ids"))
        if not model_ids:
            model_ids = _normalize_id_list(metadata.get("model_ids"))
        if not model_ids:
            continue
        allowed_model_ids_by_provider.setdefault(provider_id, set()).update(model_ids)

    return ProviderModelAllowlist(
        allowed_model_ids_by_provider=allowed_model_ids_by_provider,
    )


def _connection_configured(row: ProviderConnection, config: dict[str, Any]) -> bool:
    provider_id = str(config.get("provider_id") or row.connection_id or "").strip()
    return (
        bool(str(row.secret_ciphertext or "").strip())
        or bool(config.get("secretless"))
        or provider_id == "jina_reader"
    )


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_id_list(value: object) -> list[str]:
    if isinstance(value, str):
        raw_items: tuple[object, ...] = tuple(value.split(","))
    elif isinstance(value, list):
        raw_items = tuple(value)
    else:
        raw_items = ()
    normalized: list[str] = []
    for item in raw_items:
        text = str(item or "").strip()
        if text and text not in normalized:
            normalized.append(text)
    return normalized
