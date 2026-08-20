from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any, cast
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from sqlalchemy import delete, select
from sqlalchemy.engine import CursorResult

from app.adapters.providers.base import (
    ProviderCatalogSnapshot,
    ProviderExecutionError,
    ProviderExecutionRequest,
    ProviderMediaCandidate,
)
from app.adapters.providers.openai import (
    ALLOWED_PROVIDER_IMAGE_RESPONSE_FORMATS,
    normalize_provider_image_output_hosts,
    normalize_provider_output_hosts,
)
from app.adapters.providers.registry import build_provider_adapter_from_connection
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import CatalogInstance, CatalogModel, ProviderConnection, RunRecord
from app.core.secrets import decrypt_provider_connection_secret, encrypt_provider_connection_secret
from app.domain.catalog.service import CatalogService
from app.domain.image_generation.materialization import (
    ImageGenerationArtifactMaterializationError,
    clean_provider_image,
)
from app.domain.image_generation.provider_fetch import (
    PROVIDER_IMAGE_DEFAULT_MAX_BYTES,
    ProviderImageFetchError,
    fetch_provider_image_url,
)
from app.domain.provider_connections.runtime_settings import (
    apply_provider_connection_runtime_settings,
)
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_VERIFICATION_CONFIG_KEYS,
)
from app.domain.web_search.contracts import WEB_SEARCH_ABILITY, WEB_SEARCH_CONTRACT
from app.domain.web_search.service import WebSearchService

_IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.-]{1,63}$")
_ALLOWED_SOURCE_ROLES = frozenset({"execution_source", "runtime_metadata", "diagnostic_source"})
_SERVER_OWNED_PROVIDER_METADATA_KEYS = frozenset({"image_delivery_probe", "image_delivery_repair"})
_IMAGE_DELIVERY_PROBE_PROMPT = "A simple blue circle centered on a plain white background, no text."
_SECRET_CONFIG_KEY_PARTS = (
    "secret",
    "credential",
    "token",
    "password",
    "api_key",
    "apikey",
)
_RUNTIME_CONFIG_CONNECTION_KINDS = frozenset(
    {
        "web_search_provider",
        "image_source_provider",
        "embedding_provider",
        "rerank_provider",
        "vector_store_provider",
    }
)
_PUBLIC_PROVIDER_TEST_ERROR_CODES = {
    "provider.auth_invalid": "provider.auth_invalid",
    "provider.error": "provider.error",
    "provider.invalid_response": "provider.invalid_response",
    "provider.network_error": "provider.network_error",
    "provider.output_contract_invalid": "provider.output_contract_invalid",
    "provider.rate_limited": "provider.rate_limited",
    "provider.reader_error": "provider.reader_error",
    "provider.response_too_large": "provider.response_too_large",
    "provider.timeout": "provider.timeout",
    "provider.unavailable": "provider.unavailable",
    "web_search.apify_actor_missing": "web_search.apify_actor_missing",
    "web_search.apify_api_token_missing": "web_search.apify_api_token_missing",
    "web_search.apify_http_error": "web_search.apify_http_error",
    "web_search.anysearch_api_key_missing": "web_search.anysearch_api_key_missing",
    "web_search.anysearch_endpoint_missing": "web_search.anysearch_endpoint_missing",
    "web_search.anysearch_filters_unsupported": "web_search.anysearch_filters_unsupported",
    "web_search.anysearch_http_error": "web_search.anysearch_http_error",
    "web_search.bocha_api_key_missing": "web_search.bocha_api_key_missing",
    "web_search.bocha_http_error": "web_search.bocha_http_error",
    "web_search.doubao_api_key_missing": "web_search.doubao_api_key_missing",
    "web_search.doubao_endpoint_missing": "web_search.doubao_endpoint_missing",
    "web_search.doubao_http_error": "web_search.doubao_http_error",
    "web_search.provider_fallback_exhausted": "web_search.provider_fallback_exhausted",
    "web_search.provider_not_configured": "web_search.provider_not_configured",
    "web_search.provider_not_supported": "web_search.provider_not_supported",
    "web_search.query_required": "web_search.query_required",
    "web_search.reader_not_configured": "web_search.reader_not_configured",
    "web_search.tavily_api_key_missing": "web_search.tavily_api_key_missing",
    "web_search.tavily_http_error": "web_search.tavily_http_error",
    "web_search.zhihu_access_secret_missing": "web_search.zhihu_access_secret_missing",
    "web_search.zhihu_endpoint_missing": "web_search.zhihu_endpoint_missing",
    "web_search.zhihu_http_error": "web_search.zhihu_http_error",
    "provider.quota_exhausted": "provider.quota_exhausted",
}


class ProviderConnectionAdminError(ValueError):
    def __init__(self, error_code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code


@dataclass(slots=True)
class ProviderConnectionAdminService:
    database_url: str
    settings: Settings

    def list_connections(self) -> dict[str, Any]:
        with get_session(self.database_url) as session:
            rows = list(
                session.scalars(
                    select(ProviderConnection).order_by(
                        ProviderConnection.enabled.desc(),
                        ProviderConnection.provider_type.asc(),
                        ProviderConnection.connection_id.asc(),
                    )
                )
            )
        connections = [self._serialize(row) for row in rows]
        connections.sort(
            key=lambda item: (
                not bool(item.get("enabled")),
                str(item.get("provider_type") or ""),
                str(item.get("provider_id") or ""),
                str(item.get("connection_id") or ""),
            )
        )
        return {
            "surface": "admin_provider_connections",
            "connections": connections,
            "boundary": _boundary(),
        }

    def save_connection(
        self,
        payload: dict[str, Any],
        *,
        connection_id: str | None = None,
    ) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, connection_id=connection_id)
        now = datetime.now(UTC)
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized["connection_id"])
            credential = normalized["credential"]
            if row is None:
                row = ProviderConnection(
                    connection_id=normalized["connection_id"],
                    provider_type=normalized["provider_type"],
                    display_name=normalized["display_name"],
                    enabled=normalized["enabled"],
                    base_url=normalized["base_url"],
                    config_json=normalized["config_json"],
                    secret_ciphertext=None,
                    status="missing_secret",
                    source_role=normalized["source_role"],
                    metadata_json=normalized["metadata_json"],
                    last_tested_at=None,
                    last_sync_at=None,
                    last_error_code=None,
                    last_error_message=None,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
            else:
                existing_metadata = dict(_dict(row.metadata_json))
                verification_inputs_changed = (
                    row.provider_type != normalized["provider_type"]
                    or bool(row.enabled) != normalized["enabled"]
                    or (row.base_url or "") != normalized["base_url"]
                    or _dict(row.config_json) != normalized["config_json"]
                    or row.source_role != normalized["source_role"]
                    or credential is not None
                )
                row.provider_type = normalized["provider_type"]
                row.display_name = normalized["display_name"]
                row.enabled = normalized["enabled"]
                row.base_url = normalized["base_url"]
                row.config_json = normalized["config_json"]
                row.source_role = normalized["source_role"]
                next_metadata = dict(normalized["metadata_json"])
                if not verification_inputs_changed:
                    for key in _SERVER_OWNED_PROVIDER_METADATA_KEYS:
                        if key in existing_metadata:
                            next_metadata[key] = existing_metadata[key]
                row.metadata_json = next_metadata
                row.updated_at = now
                if verification_inputs_changed:
                    row.last_tested_at = None
                    row.last_error_code = None
                    row.last_error_message = None

            if credential is not None:
                try:
                    row.secret_ciphertext = (
                        encrypt_provider_connection_secret(credential, settings=self.settings)
                        if credential
                        else None
                    )
                except RuntimeError as error:
                    raise ProviderConnectionAdminError(
                        "provider_connection.credential_storage_unavailable",
                        "provider credential storage is unavailable",
                        status_code=503,
                    ) from error

            configured, credential_error = _credential_readiness(
                self.settings,
                row,
                config=normalized["config_json"],
                provider_id=normalized["provider_id"],
            )
            row.status = _connection_status(
                enabled=row.enabled,
                configured=configured,
                credential_error=credential_error,
            )
            if row.enabled and configured:
                _disable_competing_runtime_connections(
                    session,
                    selected=row,
                    selected_config=normalized["config_json"],
                    selected_provider_id=normalized["provider_id"],
                )
            session.commit()
            session.refresh(row)
            return self._serialize(row)

    def get_delete_preflight(self, connection_id: str) -> dict[str, Any]:
        normalized_id = _normalize_identifier(connection_id, field="connection_id")
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized_id)
            if row is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.not_found",
                    "provider connection was not found",
                    status_code=404,
                )
            connection = self._serialize(row)
            target_profiles = set(_normalize_id_list(connection.get("runtime_profile_ids")))
            alternative_connections: list[dict[str, Any]] = []
            covered_profiles: set[str] = set()
            for candidate_row in session.scalars(
                select(ProviderConnection).where(
                    ProviderConnection.connection_id != normalized_id
                )
            ):
                candidate = self._serialize(candidate_row)
                candidate_profiles = set(
                    _normalize_id_list(candidate.get("runtime_profile_ids"))
                )
                shared_profiles = sorted(target_profiles & candidate_profiles)
                if (
                    not shared_profiles
                    or not bool(candidate.get("enabled"))
                    or str(candidate.get("configuration_status") or "") != "ready"
                ):
                    continue
                covered_profiles.update(shared_profiles)
                alternative_connections.append(
                    {
                        "connection_id": str(candidate.get("connection_id") or ""),
                        "display_name": str(candidate.get("display_name") or ""),
                        "shared_runtime_profile_ids": shared_profiles,
                    }
                )

        uncovered_profiles = sorted(target_profiles - covered_profiles)
        model_ids = _normalize_id_list(connection.get("model_ids"))
        capability_ids = _normalize_id_list(connection.get("capability_ids"))
        enabled = bool(connection.get("enabled"))
        if enabled and uncovered_profiles:
            risk_level = "high"
        elif enabled or target_profiles or model_ids:
            risk_level = "warning"
        else:
            risk_level = "low"
        return {
            "surface": "admin_provider_connection_delete_preflight",
            "connection": {
                "connection_id": str(connection.get("connection_id") or ""),
                "provider_id": str(connection.get("provider_id") or ""),
                "display_name": str(connection.get("display_name") or ""),
                "enabled": enabled,
                "configuration_status": str(
                    connection.get("configuration_status") or ""
                ),
            },
            "expected_updated_at": str(connection.get("updated_at") or ""),
            "impact": {
                "risk_level": risk_level,
                "runtime_profile_ids": sorted(target_profiles),
                "uncovered_runtime_profile_ids": uncovered_profiles,
                "capability_ids": capability_ids,
                "model_count": len(model_ids),
                "alternative_connections": alternative_connections,
            },
            "requires_confirmation": True,
            "boundary": _boundary(),
        }

    def delete_connection(
        self,
        connection_id: str,
        *,
        expected_updated_at: datetime,
    ) -> dict[str, Any]:
        normalized_id = _normalize_identifier(connection_id, field="connection_id")
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized_id)
            if row is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.not_found",
                    "provider connection was not found",
                    status_code=404,
                )
            if _iso(row.updated_at) != _iso(expected_updated_at):
                raise ProviderConnectionAdminError(
                    "provider_connection.delete_conflict",
                    "provider connection changed after deletion preflight",
                    status_code=409,
                )
            serialized = self._serialize(row)
            timestamp_lower_bound = row.updated_at - timedelta(microseconds=1)
            timestamp_upper_bound = row.updated_at + timedelta(microseconds=1)
            deleted = cast(
                CursorResult[Any],
                session.execute(
                    delete(ProviderConnection)
                    .where(
                        ProviderConnection.connection_id == normalized_id,
                        ProviderConnection.updated_at >= timestamp_lower_bound,
                        ProviderConnection.updated_at <= timestamp_upper_bound,
                    )
                    .execution_options(synchronize_session=False)
                ),
            )
            if deleted.rowcount != 1:
                raise ProviderConnectionAdminError(
                    "provider_connection.delete_conflict",
                    "provider connection changed after deletion preflight",
                    status_code=409,
                )
            session.commit()
        return {"deleted": True, "connection": serialized}

    def approve_detected_image_output_host(
        self,
        connection_id: str,
        *,
        evidence_run_id: str = "",
        evidence_probe_id: str = "",
    ) -> dict[str, Any]:
        normalized_id = _normalize_identifier(connection_id, field="connection_id")
        normalized_run_id = _string(evidence_run_id)
        normalized_probe_id = _string(evidence_probe_id)
        if (
            bool(normalized_run_id) == bool(normalized_probe_id)
            or max(len(normalized_run_id), len(normalized_probe_id)) > 191
        ):
            raise ProviderConnectionAdminError(
                "provider_connection.image_host_evidence_invalid",
                "exactly one image host evidence identifier is required",
            )
        now = datetime.now(UTC)
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized_id)
            if row is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.not_found",
                    "provider connection was not found",
                    status_code=404,
                )
            metadata = dict(_dict(row.metadata_json))
            evidence = _dict(metadata.get("image_delivery_repair"))
            evidence_kind = _string(evidence.get("evidence_kind")) or "runtime_run"
            evidence_identifier_matches = (
                evidence_kind == "admin_probe"
                and _string(evidence.get("probe_id")) == normalized_probe_id
            ) or (
                evidence_kind == "runtime_run"
                and _string(evidence.get("run_id")) == normalized_run_id
            )
            if (
                evidence.get("status") != "pending"
                or _string(evidence.get("reason_code")) != "host_not_allowlisted"
                or not evidence_identifier_matches
            ):
                raise ProviderConnectionAdminError(
                    "provider_connection.image_host_evidence_stale",
                    "image host approval evidence is missing or no longer current",
                    status_code=409,
                )
            config = dict(_dict(row.config_json))
            provider_id = _string(config.get("provider_id") or row.connection_id)
            if _string(evidence.get("provider_id")) != provider_id:
                raise ProviderConnectionAdminError(
                    "provider_connection.image_host_evidence_mismatch",
                    "image host approval evidence does not match this provider connection",
                    status_code=409,
                )
            if evidence_kind == "runtime_run":
                run = session.get(RunRecord, normalized_run_id)
                if (
                    run is None
                    or _string(run.status) != "failed"
                    or _string(run.execution_kind) != "image_generation"
                    or _string(run.error_code) != "image_generation.artifact_materialization_failed"
                    or _string(run.selected_provider_id) != provider_id
                ):
                    raise ProviderConnectionAdminError(
                        "provider_connection.image_host_evidence_mismatch",
                        "image host approval evidence does not match this provider connection",
                        status_code=409,
                    )
            elif evidence_kind != "admin_probe":
                raise ProviderConnectionAdminError(
                    "provider_connection.image_host_evidence_invalid",
                    "image host approval evidence kind is invalid",
                    status_code=409,
                )
            try:
                approved_host = normalize_provider_image_output_hosts(
                    [_string(evidence.get("detected_host"))]
                )[0]
            except (IndexError, ValueError) as error:
                raise ProviderConnectionAdminError(
                    "provider_connection.image_host_evidence_invalid",
                    "detected image host is invalid",
                    status_code=409,
                ) from error

            raw_existing_hosts = config.get("image_output_hosts")
            existing_hosts_input = (
                [item for item in raw_existing_hosts if isinstance(item, str)]
                if isinstance(raw_existing_hosts, list)
                else []
            )
            existing_hosts = list(normalize_provider_image_output_hosts(existing_hosts_input))
            if approved_host not in existing_hosts:
                existing_hosts.append(approved_host)
            config["image_response_format"] = "url"
            config["image_output_hosts"] = existing_hosts
            capability_ids = _effective_capability_ids(config, row.provider_type)
            config["capability_ids"] = capability_ids
            row.config_json = config
            metadata["image_delivery_repair"] = {
                **evidence,
                "status": "approved",
                "approved_at": now.isoformat(),
            }
            probe = _dict(metadata.get("image_delivery_probe"))
            if evidence_kind == "admin_probe" and _string(probe.get("probe_id")) == (
                normalized_probe_id
            ):
                metadata["image_delivery_probe"] = {
                    **probe,
                    "status": "host_approved",
                    "host_approved_at": now.isoformat(),
                }
            row.metadata_json = metadata
            row.last_tested_at = None
            row.last_error_code = None
            row.last_error_message = None
            row.updated_at = now
            session.commit()
            session.refresh(row)
            return {
                "approved_image_output_host": approved_host,
                "evidence_run_id": normalized_run_id,
                "evidence_probe_id": normalized_probe_id,
                "connection": self._serialize(row),
            }

    def test_image_delivery(self, connection_id: str) -> dict[str, Any]:
        normalized_id = _normalize_identifier(connection_id, field="connection_id")
        probe_id = f"image-probe-{uuid4().hex}"
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized_id)
            if row is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.not_found",
                    "provider connection was not found",
                    status_code=404,
                )
            serialized = self._serialize(row)
            if not bool(row.enabled):
                raise ProviderConnectionAdminError(
                    "provider_connection.disabled",
                    "provider connection must be enabled before testing image delivery",
                    status_code=409,
                )
            if not bool(serialized.get("configured")):
                raise ProviderConnectionAdminError(
                    "provider_connection.missing_secret",
                    "provider credential is required before testing image delivery",
                    status_code=409,
                )
            if "image_generation" not in serialized.get("capability_ids", []):
                raise ProviderConnectionAdminError(
                    "provider_connection.image_generation_not_enabled",
                    "image generation must be enabled before testing image delivery",
                    status_code=409,
                )

            verification_inputs = _image_delivery_probe_verification_inputs(row)
            model, instance = _select_image_delivery_probe_target(session, row)
            adapter = build_provider_adapter_from_connection(self.settings, row)
            if adapter is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.unsupported_provider_kind",
                    "provider kind is not supported by the runtime adapter registry",
                )
            provider_id = _string(serialized.get("provider_id"))
            request = ProviderExecutionRequest(
                run_id=probe_id,
                site_id="admin_provider_connection_probe",
                ability_name="admin.provider_image_delivery_probe",
                profile_id="admin.image_delivery_probe",
                execution_kind="image_generation",
                model_id=model.model_id,
                instance_id=instance.instance_id,
                endpoint_variant=instance.endpoint_variant,
                trace_id=probe_id,
                input_payload=_image_delivery_probe_input(provider_id),
                policy={"allow_fallback": False},
                timeout_ms=_image_delivery_probe_timeout_ms(adapter),
            )
            try:
                execution_result = adapter.execute(request)
                probe_result = _inspect_image_delivery_probe_candidate(
                    execution_result.media_candidates,
                )
            except ProviderExecutionError as error:
                raise ProviderConnectionAdminError(
                    _map_test_error_code(error),
                    "provider image delivery probe failed",
                    status_code=502,
                ) from error
            except (ImageGenerationArtifactMaterializationError, ProviderImageFetchError) as error:
                reason_code = _string(getattr(error, "reason_code", ""))
                raise ProviderConnectionAdminError(
                    "provider_connection.image_delivery_probe_failed",
                    (
                        f"provider image delivery validation failed: {reason_code}"
                        if reason_code
                        else "provider image delivery validation failed"
                    ),
                    status_code=502,
                ) from error

            session.refresh(row)
            if verification_inputs != _image_delivery_probe_verification_inputs(row):
                raise ProviderConnectionAdminError(
                    "provider_connection.image_delivery_probe_stale",
                    (
                        "provider connection changed while image delivery was being tested; "
                        "run the test again"
                    ),
                    status_code=409,
                )
            now = datetime.now(UTC)
            metadata = dict(_dict(row.metadata_json))
            probe_evidence = {
                "probe_id": probe_id,
                "status": probe_result["status"],
                "provider_id": provider_id,
                "model_id": model.model_id,
                "delivery_format": probe_result["delivery_format"],
                "detected_host": probe_result.get("detected_host", ""),
                "tested_at": now.isoformat(),
            }
            metadata["image_delivery_probe"] = probe_evidence
            if probe_result["status"] == "approval_required":
                metadata["image_delivery_repair"] = {
                    "status": "pending",
                    "reason_code": "host_not_allowlisted",
                    "detected_host": probe_result["detected_host"],
                    "evidence_kind": "admin_probe",
                    "probe_id": probe_id,
                    "provider_id": provider_id,
                    "model_id": model.model_id,
                    "observed_at": now.isoformat(),
                }
            else:
                metadata.pop("image_delivery_repair", None)
            row.metadata_json = metadata
            row.updated_at = now
            session.commit()
            session.refresh(row)

            return {
                **probe_evidence,
                "connection_id": row.connection_id,
                "ok": probe_result["status"] == "ready",
                "host_approved": bool(probe_result.get("host_approved")),
                "content_type": probe_result.get("content_type", ""),
                "width": probe_result.get("width", 0),
                "height": probe_result.get("height", 0),
                "latency_ms": int(execution_result.latency_ms),
                "estimated_cost": float(execution_result.cost),
                "provider_call_billable": True,
                "message": (
                    "provider image host approval is required"
                    if probe_result["status"] == "approval_required"
                    else "provider image delivery probe passed"
                ),
                "connection": self._serialize(row),
            }

    def test_connection(self, connection_id: str) -> dict[str, Any]:
        normalized_id = _normalize_identifier(connection_id, field="connection_id")
        now = datetime.now(UTC)
        with get_session(self.database_url) as session:
            row = session.get(ProviderConnection, normalized_id)
            if row is None:
                raise ProviderConnectionAdminError(
                    "provider_connection.not_found",
                    "provider connection was not found",
                    status_code=404,
                )

            serialized = self._serialize(row)
            result = self._build_test_result(row, serialized, now=now)
            row.last_tested_at = now
            if result["status"] == "ready":
                row.status = "ready"
                row.last_sync_at = now
                row.last_error_code = None
                row.last_error_message = None
            else:
                row.status = str(result["status"])
                row.last_error_code = str(result["error_code"] or "")
                row.last_error_message = str(result["message"] or "")
            session.commit()
            session.refresh(row)
            result["connection"] = self._serialize(row)
            return result

    def preview_catalog(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, connection_id=None)
        secret_ciphertext = ""
        if normalized["credential"]:
            secret_ciphertext = encrypt_provider_connection_secret(
                str(normalized["credential"]),
                settings=self.settings,
            )
        elif not bool(normalized["config_json"].get("secretless")):
            with get_session(self.database_url) as session:
                existing = session.get(ProviderConnection, normalized["connection_id"])
                if existing is not None:
                    secret_ciphertext = _string(existing.secret_ciphertext)
        if secret_ciphertext and not normalized["credential"]:
            try:
                decrypt_provider_connection_secret(secret_ciphertext, settings=self.settings)
            except RuntimeError as error:
                raise ProviderConnectionAdminError(
                    "provider_connection.saved_credential_unreadable",
                    (
                        "saved provider credential cannot be decrypted; "
                        "enter the API key again and save"
                    ),
                ) from error
        if not secret_ciphertext and not bool(normalized["config_json"].get("secretless")):
            raise ProviderConnectionAdminError(
                "provider_connection.preview_credential_required",
                "provider credential is required to fetch upstream models",
            )
        row = ProviderConnection(
            connection_id=normalized["connection_id"],
            provider_type=normalized["provider_type"],
            display_name=normalized["display_name"],
            enabled=True,
            base_url=normalized["base_url"],
            config_json=normalized["config_json"],
            secret_ciphertext=secret_ciphertext or None,
            status="ready",
            source_role=normalized["source_role"],
            metadata_json=normalized["metadata_json"],
            last_tested_at=None,
            last_sync_at=None,
            last_error_code=None,
            last_error_message=None,
        )
        adapter = build_provider_adapter_from_connection(self.settings, row)
        if adapter is None:
            raise ProviderConnectionAdminError(
                "provider_connection.unsupported_provider_kind",
                "provider kind is not supported by the runtime adapter registry",
            )
        try:
            snapshot = adapter.fetch_catalog()
        except Exception as error:
            raise ProviderConnectionAdminError(
                _map_test_error_code(error),
                "provider connection catalog preview failed",
                status_code=502,
            ) from error

        preview_models = [_catalog_preview_model(model) for model in list(snapshot.models or [])]
        model_ids = [model["model_id"] for model in preview_models if model["model_id"]]
        return {
            "surface": "admin_provider_connection_catalog_preview",
            "provider_id": str(snapshot.provider_id or normalized["provider_id"]),
            "display_name": str(snapshot.display_name or normalized["display_name"]),
            "adapter_type": str(snapshot.adapter_type or ""),
            "model_count": len(model_ids),
            "model_ids": model_ids,
            "models": preview_models,
            "truncated": False,
            "credential_value_exposure": "none",
            "boundary": _boundary(),
        }

    def _build_test_result(
        self,
        row: ProviderConnection,
        serialized: dict[str, Any],
        *,
        now: datetime,
    ) -> dict[str, Any]:
        if not bool(row.enabled):
            return _test_result(
                connection=serialized,
                status="disabled",
                stage="preflight",
                error_code="provider_connection.disabled",
                message="provider connection is disabled",
                now=now,
            )
        if not bool(serialized.get("configured")):
            return _test_result(
                connection=serialized,
                status="missing_secret",
                stage="preflight",
                error_code="provider_connection.missing_secret",
                message="provider credential is missing",
                now=now,
            )

        if str(serialized.get("kind") or "").strip().lower() == "web_search_provider":
            return self._build_web_search_test_result(row, serialized, now=now)

        if str(serialized.get("kind") or "").strip().lower() in _RUNTIME_CONFIG_CONNECTION_KINDS:
            return _test_result(
                connection=serialized,
                status="ready",
                stage="config_preflight",
                error_code="",
                message="provider runtime configuration is present",
                now=now,
            )

        adapter = build_provider_adapter_from_connection(self.settings, row)
        if adapter is None:
            return _test_result(
                connection=serialized,
                status="unsupported_provider_kind",
                stage="adapter_build",
                error_code="provider_connection.unsupported_provider_kind",
                message="provider kind is not supported by the runtime adapter registry",
                now=now,
            )

        try:
            snapshot = adapter.fetch_catalog()
        except Exception as error:  # provider adapters raise driver-specific exceptions.
            error_code = _map_test_error_code(error)
            return _test_result(
                connection=serialized,
                status=error_code.rsplit(".", 1)[-1],
                stage="catalog_fetch",
                error_code=error_code,
                message="provider catalog request failed",
                now=now,
            )

        models = list(snapshot.models or [])
        if not models:
            return _test_result(
                connection=serialized,
                status="catalog_empty",
                stage="catalog_fetch",
                error_code="provider_connection.catalog_empty",
                message="provider catalog returned no usable models",
                now=now,
            )

        catalog_sync = self._store_model_provider_catalog(row, snapshot)
        if catalog_sync.get("status") != "synced":
            return _test_result(
                connection=serialized,
                status="catalog_sync_failed",
                stage="catalog_sync",
                error_code="provider_connection.catalog_sync_failed",
                message=str(catalog_sync.get("message") or "provider catalog sync failed"),
                now=now,
            )

        return _test_result(
            connection=serialized,
            status="ready",
            stage="catalog_fetch",
            error_code="",
            message="provider connection is ready",
            now=now,
            catalog={
                "provider_id": str(snapshot.provider_id or ""),
                "display_name": str(snapshot.display_name or ""),
                "adapter_type": str(snapshot.adapter_type or ""),
                "model_count": len(models),
                "sample_model_ids": [str(model.model_id) for model in models[:5]],
                "sync": catalog_sync,
            },
        )

    def _store_model_provider_catalog(
        self,
        row: ProviderConnection,
        snapshot: ProviderCatalogSnapshot,
    ) -> dict[str, Any]:
        try:
            result = CatalogService(
                self.database_url,
                providers={},
                settings=self.settings,
            ).store_provider_snapshot(
                snapshot,
                source="provider_connection_test",
                notes=f"connection={row.connection_id}",
            )
        except Exception:
            return {
                "status": "error",
                "message": "provider catalog sync failed",
            }
        return {
            "status": "synced",
            "revision": str(result.get("revision") or ""),
            "provider_id": str(snapshot.provider_id or ""),
            "model_count": len(list(snapshot.models or [])),
        }

    def _build_web_search_test_result(
        self,
        row: ProviderConnection,
        serialized: dict[str, Any],
        *,
        now: datetime,
    ) -> dict[str, Any]:
        provider_id = str(serialized.get("provider_id") or "").strip().lower()
        if provider_id == "jina_reader":
            return self._build_jina_reader_test_result(row, serialized, now=now)

        test_settings = self.settings.model_copy(deep=True)
        apply_provider_connection_runtime_settings(test_settings)
        test_settings.web_search_provider = provider_id
        input_payload = {
            "contract_version": WEB_SEARCH_CONTRACT,
            "query": "WordPress AI provider connection smoke test",
            "intent": "general_research",
            "max_results": 1,
            "provider": provider_id,
            "write_posture": "suggestion_only",
            "direct_wordpress_write": False,
        }
        try:
            result = WebSearchService(test_settings).execute(
                site_id="admin_provider_connection_test",
                ability_name=WEB_SEARCH_ABILITY,
                contract_version=WEB_SEARCH_CONTRACT,
                input_payload=input_payload,
                run_id=f"provider-connection-test-{row.connection_id}-{int(now.timestamp())}",
            )
        except Exception as error:
            error_code = _map_test_error_code(error)
            return _test_result(
                connection=serialized,
                status=error_code.rsplit(".", 1)[-1],
                stage="web_search_probe",
                error_code=error_code,
                message="web search provider probe failed",
                now=now,
            )

        result_json = result.result_json
        results = result_json.get("results")
        result_count = int(
            result_json.get("result_count") or (len(results) if isinstance(results, list) else 0)
        )
        return _test_result(
            connection=serialized,
            status="ready",
            stage="web_search_probe",
            error_code="",
            message=f"web search provider returned {result_count} source candidates",
            now=now,
            probe={
                "provider_id": str(result.usage.provider_id or provider_id),
                "result_count": result_count,
                "latency_ms": int(result.usage.latency_ms),
                "write_posture": str(result_json.get("write_posture") or "suggestion_only"),
                "direct_wordpress_write": bool(result_json.get("direct_wordpress_write")),
            },
        )

    def _build_jina_reader_test_result(
        self,
        row: ProviderConnection,
        serialized: dict[str, Any],
        *,
        now: datetime,
    ) -> dict[str, Any]:
        test_settings = self.settings.model_copy(deep=True)
        apply_provider_connection_runtime_settings(test_settings)
        base_url = str(test_settings.web_search_jina_reader_base_url or "").strip().rstrip("/")
        if not base_url:
            return _test_result(
                connection=serialized,
                status="missing_base_url",
                stage="web_search_reader_probe",
                error_code="provider_connection.missing_base_url",
                message="web search reader base URL is missing",
                now=now,
            )

        headers = {"Accept": "text/plain"}
        api_key = str(test_settings.web_search_jina_reader_api_key or "").strip()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        probe_url = "https://example.com/"
        started = time.monotonic()
        try:
            timeout = float(test_settings.web_search_jina_reader_timeout_seconds)
            with httpx.Client(timeout=timeout) as client:
                response = client.get(f"{base_url}/{probe_url}", headers=headers)
                response.raise_for_status()
                readable_count = 1 if bytes(response.content[:4096]).strip() else 0
        except Exception as error:
            error_code = _map_test_error_code(error)
            return _test_result(
                connection=serialized,
                status=error_code.rsplit(".", 1)[-1],
                stage="web_search_reader_probe",
                error_code=error_code,
                message="web search reader probe failed",
                now=now,
            )

        if readable_count < 1:
            return _test_result(
                connection=serialized,
                status="reader_empty",
                stage="web_search_reader_probe",
                error_code="provider_connection.reader_empty",
                message="web search reader returned no readable content",
                now=now,
            )

        latency_ms = max(0, int((time.monotonic() - started) * 1000))
        return _test_result(
            connection=serialized,
            status="ready",
            stage="web_search_reader_probe",
            error_code="",
            message="web search reader returned 1 readable source candidates",
            now=now,
            probe={
                "provider_id": "jina_reader",
                "result_count": readable_count,
                "latency_ms": latency_ms,
                "write_posture": "suggestion_only",
                "direct_wordpress_write": False,
            },
        )

    def _normalize_payload(
        self,
        payload: dict[str, Any],
        *,
        connection_id: str | None,
    ) -> dict[str, Any]:
        raw_connection_id = connection_id or _string(payload.get("connection_id"))
        raw_provider_id = _string(payload.get("provider_id"))
        provider_type = _string(
            payload.get("provider_type") or payload.get("kind") or raw_provider_id
        )
        if not raw_connection_id and raw_provider_id:
            raw_connection_id = raw_provider_id
        normalized_connection_id = _normalize_identifier(raw_connection_id, field="connection_id")
        normalized_provider_id = _normalize_identifier(
            raw_provider_id or normalized_connection_id,
            field="provider_id",
        )
        normalized_provider_type = _normalize_identifier(provider_type, field="provider_type")
        display_name = _string(payload.get("display_name")) or normalized_provider_id
        if len(display_name) > 191:
            raise ProviderConnectionAdminError(
                "provider_connection.display_name_invalid",
                "display_name must be 191 characters or less",
            )
        source_role = _string(payload.get("source_role") or "execution_source")
        if source_role not in _ALLOWED_SOURCE_ROLES:
            raise ProviderConnectionAdminError(
                "provider_connection.source_role_invalid",
                "source_role must be execution_source, runtime_metadata, or diagnostic_source",
            )
        base_url = _string(payload.get("base_url"))
        if len(base_url) > 500:
            raise ProviderConnectionAdminError(
                "provider_connection.base_url_invalid",
                "base_url must be 500 characters or less",
            )
        config = _dict(payload.get("config"))
        config = _sanitize_config(config)
        config = _normalize_image_delivery_config(config)
        for key in SITE_KNOWLEDGE_VECTOR_VERIFICATION_CONFIG_KEYS:
            config.pop(key, None)
        capability_ids = _normalize_id_list(payload.get("capability_ids"))
        runtime_profile_ids = _normalize_id_list(payload.get("runtime_profile_ids"))
        metadata = _sanitize_config(_dict(payload.get("metadata")))
        for key in _SERVER_OWNED_PROVIDER_METADATA_KEYS:
            metadata.pop(key, None)
        metadata.pop("note", None)
        metadata.pop("operator_note", None)
        metadata.pop("priority", None)
        secretless = bool(payload.get("secretless") or config.get("secretless"))
        if (
            normalized_provider_type == "web_search_provider"
            and normalized_provider_id == "jina_reader"
        ):
            secretless = True
        config_json = {
            **config,
            "provider_id": normalized_provider_id,
            "kind": _string(payload.get("kind") or normalized_provider_type),
            "capability_ids": capability_ids,
            "runtime_profile_ids": runtime_profile_ids,
            "secretless": secretless,
        }
        credential = payload.get("credential")
        if credential is None:
            credential = payload.get("secret")
        normalized_credential = None if credential is None else str(credential)
        return {
            "connection_id": normalized_connection_id,
            "provider_id": normalized_provider_id,
            "provider_type": normalized_provider_type,
            "display_name": display_name,
            "enabled": bool(payload.get("enabled", True)),
            "base_url": base_url,
            "source_role": source_role,
            "config_json": config_json,
            "metadata_json": metadata,
            "credential": normalized_credential,
        }

    def _serialize(self, row: ProviderConnection) -> dict[str, Any]:
        config = _dict(row.config_json)
        kind = _string(config.get("kind") or row.provider_type)
        capability_ids = _effective_capability_ids(config, kind)
        runtime_profile_ids = _normalize_id_list(config.get("runtime_profile_ids"))
        metadata = dict(_dict(row.metadata_json))
        image_delivery_repair = _public_image_delivery_repair(metadata)
        image_delivery_probe = _public_image_delivery_probe(metadata)
        metadata.pop("image_delivery_repair", None)
        metadata.pop("image_delivery_probe", None)
        metadata.pop("note", None)
        metadata.pop("operator_note", None)
        metadata.pop("priority", None)
        model_ids = _normalize_id_list(config.get("model_ids"))
        if not model_ids:
            model_ids = _normalize_id_list(metadata.get("model_ids"))
        provider_id = _string(config.get("provider_id") or row.connection_id)
        configured, credential_error = _credential_readiness(
            self.settings,
            row,
            config=config,
            provider_id=provider_id,
        )
        status = _connection_status(
            enabled=bool(row.enabled),
            configured=configured,
            credential_error=credential_error,
        )
        verification_status = _verification_status(
            last_tested_at=row.last_tested_at,
            last_error_code=row.last_error_code or "",
        )
        attention_reasons = _connection_attention_reasons(
            configuration_status=status,
            verification_status=verification_status,
            capability_ids=capability_ids,
            config=config,
            image_delivery_probe=image_delivery_probe,
        )
        return {
            "connection_id": row.connection_id,
            "provider_id": provider_id,
            "provider_type": row.provider_type,
            "display_name": row.display_name,
            "kind": kind,
            "enabled": bool(row.enabled),
            "configured": configured,
            "status": status,
            "configuration_status": status,
            "verification_status": verification_status,
            "attention_required": bool(attention_reasons),
            "attention_reasons": attention_reasons,
            "source_role": row.source_role,
            "base_url": row.base_url or "",
            "capability_ids": capability_ids,
            "runtime_profile_ids": runtime_profile_ids,
            "model_ids": model_ids,
            "secrets": {
                "credential": {
                    "configured": configured,
                    "display": _credential_display(configured, credential_error),
                }
            },
            "config": _public_config(config),
            "metadata": metadata,
            "image_delivery_probe": image_delivery_probe,
            "image_delivery_repair": image_delivery_repair,
            "last_tested_at": _iso(row.last_tested_at),
            "last_sync_at": _iso(row.last_sync_at),
            "last_error_code": row.last_error_code or "",
            "last_error_message": row.last_error_message or "",
            "updated_at": _iso(row.updated_at),
            "detail_href": "/admin/ai-resources",
            "managed_by": "cloud_provider_connections",
            "boundary": _boundary(),
        }


def _image_delivery_probe_verification_inputs(row: ProviderConnection) -> dict[str, Any]:
    return {
        "provider_type": _string(row.provider_type),
        "enabled": bool(row.enabled),
        "base_url": _string(row.base_url),
        "config": dict(_dict(row.config_json)),
        "source_role": _string(row.source_role),
        "secret_ciphertext": _string(row.secret_ciphertext),
    }


def _select_image_delivery_probe_target(
    session: Any,
    row: ProviderConnection,
) -> tuple[CatalogModel, CatalogInstance]:
    config = _dict(row.config_json)
    selected_model_ids = _normalize_id_list(config.get("model_ids"))
    if not selected_model_ids:
        selected_model_ids = _normalize_id_list(_dict(row.metadata_json).get("model_ids"))
    if not selected_model_ids:
        raise ProviderConnectionAdminError(
            "provider_connection.image_probe_model_required",
            "enable and save at least one image-generation model before testing delivery",
            status_code=409,
        )
    provider_id = _string(config.get("provider_id") or row.connection_id)
    rows = session.execute(
        select(CatalogModel, CatalogInstance)
        .join(CatalogInstance, CatalogInstance.model_id == CatalogModel.model_id)
        .where(
            CatalogModel.provider_id == provider_id,
            CatalogModel.feature == "image_generation",
            CatalogModel.status != "unavailable",
            CatalogModel.is_deprecated.is_(False),
            CatalogInstance.endpoint_variant == "image_generations",
            CatalogInstance.health_status != "unhealthy",
        )
    ).all()
    targets_by_key: dict[str, list[tuple[CatalogModel, CatalogInstance]]] = {}
    for model, instance in rows:
        for key in _provider_model_identity_keys(model.model_id, provider_id):
            targets_by_key.setdefault(key, []).append((model, instance))
    for selected_model_id in selected_model_ids:
        candidates: list[tuple[CatalogModel, CatalogInstance]] = []
        for key in _provider_model_identity_keys(selected_model_id, provider_id):
            candidates.extend(targets_by_key.get(key, []))
        if candidates:
            candidates.sort(
                key=lambda item: (
                    not bool(item[1].is_default),
                    -int(item[1].weight),
                    item[1].instance_id,
                )
            )
            return candidates[0]
    raise ProviderConnectionAdminError(
        "provider_connection.image_probe_model_required",
        "the saved model selection contains no verified image-generation model",
        status_code=409,
    )


def _provider_model_identity_keys(model_id: str, provider_id: str) -> set[str]:
    normalized_model_id = _string(model_id).lower()
    normalized_provider_id = _string(provider_id).lower()
    if not normalized_model_id:
        return set()
    keys = {normalized_model_id}
    if "/" in normalized_model_id:
        keys.add(normalized_model_id.split("/", 1)[1])
    if normalized_provider_id and normalized_model_id.startswith(f"{normalized_provider_id}/"):
        keys.add(normalized_model_id[len(normalized_provider_id) + 1 :])
    if normalized_provider_id and not normalized_model_id.startswith(f"{normalized_provider_id}/"):
        keys.add(f"{normalized_provider_id}/{normalized_model_id}")
    return keys


def _image_delivery_probe_input(provider_id: str) -> dict[str, Any]:
    input_payload: dict[str, Any] = {
        "prompt": _IMAGE_DELIVERY_PROBE_PROMPT,
        "n": 1,
    }
    if provider_id == "siliconflow":
        input_payload["extra"] = {
            "image_size": "1024x1024",
            "batch_size": 1,
        }
    return input_payload


def _image_delivery_probe_timeout_ms(adapter: Any) -> int:
    try:
        timeout_seconds = float(getattr(adapter, "timeout_seconds", 30.0))
    except (TypeError, ValueError):
        timeout_seconds = 30.0
    return max(1_000, min(120_000, int(timeout_seconds * 1_000)))


def _inspect_image_delivery_probe_candidate(
    media_candidates: tuple[ProviderMediaCandidate, ...],
) -> dict[str, Any]:
    if len(media_candidates) != 1:
        raise ImageGenerationArtifactMaterializationError(
            "image delivery probe must return exactly one candidate"
        )
    candidate = media_candidates[0]
    if candidate.content_bytes is not None:
        cleaned = clean_provider_image(
            BytesIO(candidate.content_bytes),
            declared_mime_types=tuple(value for value in (candidate.claimed_mime_type,) if value),
            max_output_bytes=PROVIDER_IMAGE_DEFAULT_MAX_BYTES,
        )
        try:
            return {
                "status": "ready",
                "delivery_format": "base64",
                "host_approved": True,
                "content_type": cleaned.content_type,
                "width": cleaned.width,
                "height": cleaned.height,
            }
        finally:
            cleaned.stream.close()

    source_url = _string(candidate.source_url)
    hostname = _normalized_probe_hostname(source_url)
    allowed_hosts = tuple(candidate.image_output_hosts)
    if hostname not in allowed_hosts:
        return {
            "status": "approval_required",
            "delivery_format": "url",
            "detected_host": hostname,
            "host_approved": False,
        }

    fetched = fetch_provider_image_url(
        source_url,
        allowed_hosts=allowed_hosts,
    )
    try:
        cleaned = clean_provider_image(
            fetched.stream,
            declared_mime_types=tuple(
                value
                for value in (candidate.claimed_mime_type, fetched.declared_mime_type)
                if value
            ),
            max_output_bytes=PROVIDER_IMAGE_DEFAULT_MAX_BYTES,
        )
        try:
            return {
                "status": "ready",
                "delivery_format": "url",
                "detected_host": hostname,
                "host_approved": True,
                "content_type": cleaned.content_type,
                "width": cleaned.width,
                "height": cleaned.height,
            }
        finally:
            cleaned.stream.close()
    finally:
        fetched.close()


def _normalized_probe_hostname(source_url: str) -> str:
    try:
        hostname = urlsplit(source_url).hostname or ""
        return normalize_provider_image_output_hosts([hostname])[0]
    except (IndexError, ValueError) as error:
        raise ImageGenerationArtifactMaterializationError(
            "provider image delivery probe returned an invalid host"
        ) from error


def _boundary() -> dict[str, Any]:
    return {
        "owner": "cloud_runtime",
        "secret_exposure": "masked_status_only",
        "direct_wordpress_write": False,
        "final_writes": "core_proposal_required",
        "not_a_control_plane": True,
        "does_not_own": [
            "wordpress_writes",
            "approval_truth",
            "ability_registry",
            "workflow_registry",
            "prompt_router_preset_truth",
        ],
    }


def _catalog_preview_model(model: Any) -> dict[str, Any]:
    instances = list(getattr(model, "instances", []) or [])
    capability_tags = sorted(
        {
            str(tag)
            for instance in instances
            for tag in list(getattr(instance, "capability_tags", []) or [])
            if str(tag)
        }
    )
    runtime_supported = bool(instances)
    return {
        "model_id": str(getattr(model, "model_id", "") or ""),
        "family": str(getattr(model, "family", "") or ""),
        "feature": str(getattr(model, "feature", "") or ""),
        "status": str(getattr(model, "status", "") or ""),
        "is_deprecated": bool(getattr(model, "is_deprecated", False)),
        "runtime_supported": runtime_supported,
        "verified": runtime_supported,
        "capability_tags": capability_tags,
    }


def _connection_status(
    *,
    enabled: bool,
    configured: bool,
    credential_error: str = "",
) -> str:
    if not enabled:
        return "disabled"
    if credential_error:
        return credential_error
    return "ready" if configured else "missing_secret"


def _verification_status(
    *,
    last_tested_at: datetime | None,
    last_error_code: str,
) -> str:
    if last_tested_at is None:
        return "not_observed"
    return "failed" if _string(last_error_code) else "passed"


def _connection_attention_reasons(
    *,
    configuration_status: str,
    verification_status: str,
    capability_ids: list[str],
    config: dict[str, Any],
    image_delivery_probe: dict[str, Any] | None = None,
) -> list[str]:
    reasons: list[str] = []
    if configuration_status != "ready":
        reasons.append(configuration_status)
    if verification_status == "failed":
        reasons.append("last_test_failed")
    elif verification_status == "not_observed" and configuration_status == "ready":
        reasons.append("verification_not_observed")

    if "image_generation" in capability_ids:
        image_response_format = _string(config.get("image_response_format")).lower()
        probe_status = _string((image_delivery_probe or {}).get("status"))
        if not image_response_format and probe_status != "ready":
            reasons.append("image_delivery_unconfirmed")
        elif image_response_format == "url" and not _normalize_id_list(
            config.get("image_output_hosts")
        ):
            reasons.append("image_output_hosts_missing")
    return reasons


def _credential_readiness(
    settings: Settings,
    row: ProviderConnection,
    *,
    config: dict[str, Any],
    provider_id: str,
) -> tuple[bool, str]:
    if bool(config.get("secretless")) or provider_id == "jina_reader":
        return True, ""
    ciphertext = str(row.secret_ciphertext or "").strip()
    if not ciphertext:
        return False, ""
    try:
        return bool(decrypt_provider_connection_secret(ciphertext, settings=settings)), ""
    except RuntimeError:
        return False, "saved_credential_unreadable"


def _credential_display(configured: bool, credential_error: str) -> str:
    if configured:
        return "configured"
    if credential_error:
        return "unreadable"
    return "missing"


def _test_result(
    *,
    connection: dict[str, Any],
    status: str,
    stage: str,
    error_code: str,
    message: str,
    now: datetime,
    catalog: dict[str, Any] | None = None,
    probe: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "surface": "admin_provider_connection_test",
        "connection_id": str(connection.get("connection_id") or ""),
        "provider_id": str(connection.get("provider_id") or ""),
        "kind": str(connection.get("kind") or ""),
        "status": status,
        "stage": stage,
        "ok": status == "ready",
        "error_code": error_code,
        "message": message,
        "tested_at": _iso(now),
        "catalog": catalog or {},
        "probe": probe or {},
        "connection": connection,
        "boundary": _boundary(),
    }


def _map_test_error_code(error: Exception) -> str:
    provider_error_code = str(getattr(error, "error_code", "") or "").strip().lower()
    public_error_code = _PUBLIC_PROVIDER_TEST_ERROR_CODES.get(provider_error_code)
    if public_error_code:
        return public_error_code
    message = str(error).lower()
    if "401" in message or "403" in message or "auth" in message or "credential" in message:
        return "provider_connection.auth_failed"
    if "timed out" in message or "timeout" in message:
        return "provider_connection.network_error"
    if "network" in message or "connect" in message or "name resolution" in message:
        return "provider_connection.network_error"
    if "no usable models" in message:
        return "provider_connection.catalog_empty"
    return "provider_connection.test_failed"


def _normalize_identifier(value: str, *, field: str) -> str:
    normalized = _string(value).lower()
    if not _IDENTIFIER_PATTERN.match(normalized):
        raise ProviderConnectionAdminError(
            f"provider_connection.{field}_invalid",
            (
                f"{field} must be 2-64 lowercase characters using letters, numbers, "
                "dot, dash, or underscore"
            ),
        )
    return normalized


def _normalize_id_list(value: object) -> list[str]:
    if isinstance(value, str):
        values = [item.strip() for item in value.split(",")]
    elif isinstance(value, list):
        values = [_string(item) for item in value]
    else:
        values = []
    normalized: list[str] = []
    for item in values:
        if not item or item in normalized:
            continue
        normalized.append(item[:128])
    return normalized


def _effective_capability_ids(config: dict[str, Any], kind: str) -> list[str]:
    capability_ids = _normalize_id_list(config.get("capability_ids"))
    if _string(kind).lower() == "siliconflow" and "image_generation" not in capability_ids:
        capability_ids.append("image_generation")
    return capability_ids


def _public_image_delivery_repair(metadata: dict[str, Any]) -> dict[str, Any]:
    evidence = _dict(metadata.get("image_delivery_repair"))
    if not evidence:
        return {}
    return {
        "status": _string(evidence.get("status")),
        "reason_code": _string(evidence.get("reason_code")),
        "detected_host": _string(evidence.get("detected_host")),
        "evidence_kind": _string(evidence.get("evidence_kind")) or "runtime_run",
        "probe_id": _string(evidence.get("probe_id")),
        "run_id": _string(evidence.get("run_id")),
        "observed_at": _string(evidence.get("observed_at")),
        "approved_at": _string(evidence.get("approved_at")),
    }


def _public_image_delivery_probe(metadata: dict[str, Any]) -> dict[str, Any]:
    evidence = _dict(metadata.get("image_delivery_probe"))
    if not evidence:
        return {}
    return {
        "probe_id": _string(evidence.get("probe_id")),
        "status": _string(evidence.get("status")),
        "provider_id": _string(evidence.get("provider_id")),
        "model_id": _string(evidence.get("model_id")),
        "delivery_format": _string(evidence.get("delivery_format")),
        "detected_host": _string(evidence.get("detected_host")),
        "tested_at": _string(evidence.get("tested_at")),
        "host_approved_at": _string(evidence.get("host_approved_at")),
    }


def _normalize_image_delivery_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(config)
    response_format = _string(normalized.get("image_response_format")).lower()
    if response_format and response_format not in ALLOWED_PROVIDER_IMAGE_RESPONSE_FORMATS:
        raise ProviderConnectionAdminError(
            "provider_connection.image_response_format_invalid",
            "image_response_format must be url or b64_json",
        )

    raw_hosts = normalized.get("image_output_hosts")
    if raw_hosts is None:
        hosts_input: list[str] = []
    elif isinstance(raw_hosts, str):
        hosts_input = [item.strip() for item in raw_hosts.split(",") if item.strip()]
    elif isinstance(raw_hosts, list):
        if any(not isinstance(item, str) for item in raw_hosts):
            raise ProviderConnectionAdminError(
                "provider_connection.image_output_hosts_invalid",
                "image_output_hosts must contain strings only",
            )
        hosts_input = list(raw_hosts)
    else:
        raise ProviderConnectionAdminError(
            "provider_connection.image_output_hosts_invalid",
            "image_output_hosts must be a list of exact host names",
        )
    try:
        image_output_hosts = list(normalize_provider_image_output_hosts(hosts_input))
    except ValueError as error:
        raise ProviderConnectionAdminError(
            "provider_connection.image_output_hosts_invalid",
            "image_output_hosts must contain exact host names without schemes, paths, or wildcards",
        ) from error

    if response_format:
        normalized["image_response_format"] = response_format
    else:
        normalized.pop("image_response_format", None)
    if image_output_hosts:
        normalized["image_output_hosts"] = image_output_hosts
    else:
        normalized.pop("image_output_hosts", None)

    raw_audio_hosts = normalized.get("audio_output_hosts")
    if raw_audio_hosts is None:
        audio_hosts_input: list[str] = []
    elif isinstance(raw_audio_hosts, str):
        audio_hosts_input = [item.strip() for item in raw_audio_hosts.split(",") if item.strip()]
    elif isinstance(raw_audio_hosts, list) and all(
        isinstance(item, str) for item in raw_audio_hosts
    ):
        audio_hosts_input = list(raw_audio_hosts)
    else:
        raise ProviderConnectionAdminError(
            "provider_connection.audio_output_hosts_invalid",
            "audio_output_hosts must be a list of exact host names",
        )
    try:
        audio_output_hosts = list(normalize_provider_output_hosts(audio_hosts_input))
    except ValueError as error:
        raise ProviderConnectionAdminError(
            "provider_connection.audio_output_hosts_invalid",
            "audio_output_hosts must contain exact host names without schemes, paths, or wildcards",
        ) from error
    if audio_output_hosts:
        normalized["audio_output_hosts"] = audio_output_hosts
    else:
        normalized.pop("audio_output_hosts", None)
    return normalized


def _disable_competing_runtime_connections(
    session: Any,
    *,
    selected: ProviderConnection,
    selected_config: dict[str, Any],
    selected_provider_id: str,
) -> None:
    selected_slot = _runtime_selection_slot(
        kind=_string(selected_config.get("kind") or selected.provider_type),
        provider_id=selected_provider_id,
    )
    if not selected_slot:
        return
    rows = list(
        session.scalars(
            select(ProviderConnection).where(
                ProviderConnection.enabled.is_(True),
                ProviderConnection.connection_id != selected.connection_id,
            )
        )
    )
    for row in rows:
        config = _dict(row.config_json)
        slot = _runtime_selection_slot(
            kind=_string(config.get("kind") or row.provider_type),
            provider_id=_string(config.get("provider_id") or row.connection_id),
        )
        if slot == selected_slot:
            row.enabled = False
            row.status = "disabled"


def _runtime_selection_slot(*, kind: str, provider_id: str) -> str:
    normalized_kind = _string(kind).lower()
    normalized_provider_id = _string(provider_id).lower()
    if normalized_kind == "web_search_provider" and normalized_provider_id != "jina_reader":
        return "web_search_primary"
    if normalized_kind in {"embedding_provider", "rerank_provider", "vector_store_provider"}:
        return normalized_kind
    return ""


def _public_config(config: dict[str, Any]) -> dict[str, Any]:
    hidden_keys = {
        "provider_id",
        "kind",
        "capability_ids",
        "runtime_profile_ids",
        "group_id",
    }
    return {
        key: value
        for key, value in _sanitize_config(config).items()
        if key not in hidden_keys and key != "secretless"
    }


def _sanitize_config(config: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in config.items():
        normalized_key = str(key)
        if _is_secret_key(normalized_key):
            continue
        if isinstance(value, dict):
            sanitized[normalized_key] = _sanitize_config(value)
        elif isinstance(value, list):
            sanitized[normalized_key] = [
                _sanitize_config(item) if isinstance(item, dict) else item for item in value
            ]
        else:
            sanitized[normalized_key] = value
    return sanitized


def _is_secret_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    if normalized in {"api_key_label", "api_key_labels", "key_label", "key_labels"}:
        return False
    return any(part in normalized for part in _SECRET_CONFIG_KEY_PARTS)


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string(value: object) -> str:
    return str(value or "").strip()


def _iso(value: datetime | None) -> str:
    return value.isoformat() if value is not None else ""
