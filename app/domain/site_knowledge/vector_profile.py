from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.adapters.providers.siliconflow import SiliconFlowProviderAdapter
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import ProviderConnection
from app.core.secrets import decrypt_provider_connection_secret, encrypt_provider_connection_secret
from app.domain.provider_connections.runtime_settings import (
    apply_provider_connection_runtime_settings,
)
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_BASE_URL,
    SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
    SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
    SITE_KNOWLEDGE_VECTOR_LOCAL_TEST_BACKEND,
    SITE_KNOWLEDGE_VECTOR_METRIC,
    SITE_KNOWLEDGE_VECTOR_MODEL_ID,
    SITE_KNOWLEDGE_VECTOR_PROBE_REVISION,
    SITE_KNOWLEDGE_VECTOR_PRODUCTION_BACKEND,
    SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
    SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
    SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME,
)


class SiteKnowledgeVectorProfileAdminError(ValueError):
    def __init__(self, error_code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code


@dataclass(slots=True)
class SiteKnowledgeVectorProfileAdminService:
    database_url: str
    settings: Settings

    def get_profile(self) -> dict[str, Any]:
        with get_session(self.database_url) as session:
            connection = session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID)
            vector_store_rows = list(
                session.scalars(
                    select(ProviderConnection)
                    .where(ProviderConnection.enabled.is_(True))
                    .order_by(ProviderConnection.connection_id.asc())
                )
            )

        provider = self._provider_state(connection)
        vector_store = self._vector_store_state(vector_store_rows)
        environment = str(self.settings.environment or "development").strip().lower()
        local_or_test = environment in {"development", "dev", "test"}
        active_backend = (
            SITE_KNOWLEDGE_VECTOR_LOCAL_TEST_BACKEND
            if local_or_test
            else SITE_KNOWLEDGE_VECTOR_PRODUCTION_BACKEND
        )
        if not provider["configured"]:
            status = "not_configured"
        elif not provider["verified"]:
            status = "probe_required"
        elif not local_or_test and not vector_store["configured"]:
            status = "vector_store_pending"
        else:
            status = "ready"

        return {
            "surface": "admin_site_knowledge_vector_profile",
            "profile_id": SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
            "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            "dimensions": SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
            "metric": SITE_KNOWLEDGE_VECTOR_METRIC,
            "production_backend": SITE_KNOWLEDGE_VECTOR_PRODUCTION_BACKEND,
            "local_test_backend": SITE_KNOWLEDGE_VECTOR_LOCAL_TEST_BACKEND,
            "active_backend": active_backend,
            "status": status,
            "provider": provider,
            "vector_store": vector_store,
            "editable_fields": ["credential"],
            "reindex_policy": "profile_change_requires_reindex",
            "boundary": {
                "owner": "cloud_runtime",
                "credential_value_exposure": "presence_only",
                "direct_wordpress_write": False,
                "suggestion_only": True,
                "not_a_control_plane": True,
            },
        }

    def save_and_verify(self, credential: str | None) -> dict[str, Any]:
        current = self._load_connection()
        resolved_credential = str(credential or "").strip()
        if not resolved_credential and current is not None:
            resolved_credential = self._decrypt_credential(current)
        if not resolved_credential:
            raise SiteKnowledgeVectorProfileAdminError(
                "site_knowledge_vector_profile.credential_required",
                "SiliconFlow API key is required",
            )

        probe = self._probe_embedding(resolved_credential)
        now = datetime.now(UTC)
        fixed_config = {
            "provider_id": SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
            "kind": SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
            "capability_ids": ["embedding"],
            "runtime_profile_ids": ["embed.default"],
            "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            "model_ids": [SITE_KNOWLEDGE_VECTOR_MODEL_ID],
            "site_knowledge_model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            "dimensions": SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
            "metric": SITE_KNOWLEDGE_VECTOR_METRIC,
            "site_knowledge_profile_id": SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
            "site_knowledge_probe_revision": SITE_KNOWLEDGE_VECTOR_PROBE_REVISION,
            "site_knowledge_probe_dimensions": SITE_KNOWLEDGE_VECTOR_DIMENSIONS,
            "site_knowledge_probe_metric": SITE_KNOWLEDGE_VECTOR_METRIC,
        }
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID)
            if row is None:
                row = ProviderConnection(
                    connection_id=SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
                    provider_type=SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
                    display_name=f"{SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME} Site Knowledge",
                    enabled=True,
                    base_url=SITE_KNOWLEDGE_VECTOR_BASE_URL,
                    config_json=fixed_config,
                    secret_ciphertext=None,
                    status="ready",
                    source_role="execution_source",
                    metadata_json={"managed_surface": "site_knowledge_vector_profile"},
                    last_tested_at=now,
                    last_sync_at=now,
                    last_error_code=None,
                    last_error_message=None,
                )
                session.add(row)
            else:
                row.provider_type = SITE_KNOWLEDGE_VECTOR_PROVIDER_ID
                row.display_name = f"{SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME} Site Knowledge"
                row.enabled = True
                row.base_url = SITE_KNOWLEDGE_VECTOR_BASE_URL
                row.config_json = fixed_config
                row.status = "ready"
                row.source_role = "execution_source"
                row.metadata_json = {"managed_surface": "site_knowledge_vector_profile"}
                row.last_tested_at = now
                row.last_sync_at = now
                row.last_error_code = None
                row.last_error_message = None
                row.updated_at = now
            if credential is not None and str(credential).strip():
                row.secret_ciphertext = encrypt_provider_connection_secret(
                    resolved_credential,
                    settings=self.settings,
                )
            elif not row.secret_ciphertext:
                row.secret_ciphertext = encrypt_provider_connection_secret(
                    resolved_credential,
                    settings=self.settings,
                )

            self._disable_legacy_embedding_slots(session)
            session.commit()

        apply_provider_connection_runtime_settings(self.settings)
        result = self.get_profile()
        result["probe"] = probe
        return result

    def _load_connection(self) -> ProviderConnection | None:
        with get_session(self.database_url) as session:
            return session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_CONNECTION_ID)

    def _probe_embedding(self, credential: str) -> dict[str, Any]:
        adapter = SiliconFlowProviderAdapter(
            base_url=SITE_KNOWLEDGE_VECTOR_BASE_URL,
            api_key=credential,
            timeout_seconds=float(self.settings.siliconflow_timeout_seconds),
            app_name=self.settings.project_name,
        )
        request = ProviderExecutionRequest(
            run_id="site-knowledge-vector-profile-probe",
            site_id="admin_site_knowledge_vector_profile",
            ability_name="npcink-cloud/site-knowledge-vector-profile-probe",
            profile_id=SITE_KNOWLEDGE_VECTOR_PROFILE_ID,
            execution_kind="embedding",
            model_id=SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            instance_id="siliconflow-site-knowledge-vector-profile",
            endpoint_variant="embeddings",
            trace_id="site-knowledge-vector-profile-probe",
            input_payload={"text": "站点知识向量配置验证"},
            policy={"storage_mode": "no_store"},
            timeout_ms=max(1, int(float(self.settings.siliconflow_timeout_seconds) * 1000)),
        )
        try:
            result = adapter.execute(request)
        except ProviderExecutionError as error:
            raise SiteKnowledgeVectorProfileAdminError(
                error.error_code or "site_knowledge_vector_profile.probe_failed",
                "SiliconFlow embedding probe failed",
                status_code=502,
            ) from error
        except Exception as error:
            raise SiteKnowledgeVectorProfileAdminError(
                "site_knowledge_vector_profile.probe_failed",
                "SiliconFlow embedding probe failed",
                status_code=502,
            ) from error

        reported_model_id = str(result.output.get("model_id") or "").strip()
        if reported_model_id != SITE_KNOWLEDGE_VECTOR_MODEL_ID:
            raise SiteKnowledgeVectorProfileAdminError(
                "site_knowledge_vector_profile.model_mismatch",
                "Embedding probe returned an unexpected model",
                status_code=502,
            )
        vector = _validated_embedding(result.output.get("embedding"))
        return {
            "status": "ready",
            "provider_id": SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
            "model_id": SITE_KNOWLEDGE_VECTOR_MODEL_ID,
            "dimensions": len(vector),
            "metric": SITE_KNOWLEDGE_VECTOR_METRIC,
            "latency_ms": max(0, int(result.latency_ms)),
            "credential_value_exposure": "none",
        }

    def _provider_state(self, row: ProviderConnection | None) -> dict[str, Any]:
        if row is None:
            return {
                "provider_id": SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
                "display_name": SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME,
                "connection_id": SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
                "configured": False,
                "verified": False,
                "status": "not_configured",
                "last_tested_at": "",
            }
        config = row.config_json if isinstance(row.config_json, dict) else {}
        configured = bool(self._decrypt_credential(row))
        verified = bool(
            configured
            and row.enabled
            and row.status == "ready"
            and config.get("site_knowledge_profile_id") == SITE_KNOWLEDGE_VECTOR_PROFILE_ID
            and config.get("site_knowledge_probe_revision")
            == SITE_KNOWLEDGE_VECTOR_PROBE_REVISION
            and config.get("site_knowledge_model_id") == SITE_KNOWLEDGE_VECTOR_MODEL_ID
            and int(config.get("dimensions") or 0) == SITE_KNOWLEDGE_VECTOR_DIMENSIONS
            and str(config.get("metric") or "").upper() == SITE_KNOWLEDGE_VECTOR_METRIC
        )
        return {
            "provider_id": SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
            "display_name": SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME,
            "connection_id": SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
            "configured": configured,
            "verified": verified,
            "status": (
                "ready" if verified else ("probe_required" if configured else "not_configured")
            ),
            "last_tested_at": _iso(row.last_tested_at),
        }

    def _vector_store_state(self, rows: list[ProviderConnection]) -> dict[str, Any]:
        configured = False
        for row in rows:
            config = row.config_json if isinstance(row.config_json, dict) else {}
            provider_id = str(config.get("provider_id") or row.connection_id).strip().lower()
            kind = str(config.get("kind") or row.provider_type).strip().lower()
            if provider_id != "zilliz" or kind != "vector_store_provider":
                continue
            uri = str(config.get("uri") or row.base_url or "").strip()
            collection = str(config.get("collection") or "").strip()
            configured = bool(uri and collection and self._decrypt_credential(row))
            if configured:
                break
        return {
            "provider_id": "zilliz",
            "display_name": "Zilliz Cloud",
            "configured": configured,
            "status": "ready" if configured else "deployment_managed",
            "settings_owner": "cloud_deployment",
        }

    def _decrypt_credential(self, row: ProviderConnection) -> str:
        ciphertext = str(row.secret_ciphertext or "").strip()
        if not ciphertext:
            return ""
        try:
            return decrypt_provider_connection_secret(ciphertext, settings=self.settings)
        except RuntimeError:
            return ""

    @staticmethod
    def _disable_legacy_embedding_slots(session: Any) -> None:
        rows = list(
            session.scalars(
                select(ProviderConnection).where(
                    ProviderConnection.enabled.is_(True),
                    ProviderConnection.connection_id != SITE_KNOWLEDGE_VECTOR_CONNECTION_ID,
                )
            )
        )
        for row in rows:
            config = row.config_json if isinstance(row.config_json, dict) else {}
            kind = str(config.get("kind") or row.provider_type).strip().lower()
            if kind != "embedding_provider":
                continue
            row.enabled = False
            row.status = "disabled"


def _validated_embedding(value: object) -> list[float]:
    if not isinstance(value, list) or not value:
        raise SiteKnowledgeVectorProfileAdminError(
            "site_knowledge_vector_profile.embedding_invalid",
            "Embedding probe returned an empty or invalid vector",
            status_code=502,
        )
    vector: list[float] = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise SiteKnowledgeVectorProfileAdminError(
                "site_knowledge_vector_profile.embedding_invalid",
                "Embedding probe returned a non-numeric vector",
                status_code=502,
            )
        number = float(item)
        if not math.isfinite(number):
            raise SiteKnowledgeVectorProfileAdminError(
                "site_knowledge_vector_profile.embedding_invalid",
                "Embedding probe returned a non-finite vector",
                status_code=502,
            )
        vector.append(number)
    if len(vector) != SITE_KNOWLEDGE_VECTOR_DIMENSIONS:
        raise SiteKnowledgeVectorProfileAdminError(
            "site_knowledge_vector_profile.dimension_mismatch",
            (
                "Embedding probe returned "
                f"{len(vector)} dimensions; {SITE_KNOWLEDGE_VECTOR_DIMENSIONS} required"
            ),
            status_code=502,
        )
    return vector


def _iso(value: datetime | None) -> str:
    return value.isoformat() if value is not None else ""
