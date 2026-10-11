from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.models import ProviderConnection, Site
from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation
from app.domain.site_knowledge.repository import SiteKnowledgeRepository
from app.domain.site_knowledge.vector_profile_contract import (
    SITE_KNOWLEDGE_VECTOR_MODEL_ID,
    SITE_KNOWLEDGE_VECTOR_PROVIDER_ID,
    SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID,
)

SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY = "site_knowledge_maintenance"
SITE_KNOWLEDGE_MAINTENANCE_ACTION = "full_sync"
SITE_KNOWLEDGE_MAINTENANCE_REVISION = "site_knowledge_maintenance.v1"
ACTIVE_MAINTENANCE_LIFECYCLES = frozenset(
    {"reindex_required", "awaiting_site_sync", "rebuilding", "failed"}
)
SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD = "manifest_sources"
SITE_KNOWLEDGE_MANIFEST_TRUNCATED_FIELD = "manifest_truncated"
SITE_KNOWLEDGE_LAST_PRUNED_COUNT_FIELD = "last_pruned_source_count"
SITE_KNOWLEDGE_LAST_PRUNED_AT_FIELD = "last_pruned_at"
SITE_KNOWLEDGE_MANIFEST_SOURCES_LIMIT = 20000


def target_embedding_space_id() -> str:
    return f"{SITE_KNOWLEDGE_VECTOR_PROVIDER_ID}:{SITE_KNOWLEDGE_VECTOR_MODEL_ID}"


def maintenance_request_id(site_id: str, maintenance_revision: str = "legacy") -> str:
    seed = "|".join(
        (
            str(site_id or "").strip(),
            target_embedding_space_id(),
            str(maintenance_revision or "legacy").strip(),
            SITE_KNOWLEDGE_MAINTENANCE_REVISION,
        )
    )
    return "skm_" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]


def project_site_maintenance(
    session: Session,
    *,
    site_id: str,
    indexed_embedding_models: list[str],
) -> dict[str, Any]:
    target_space = target_embedding_space_id()
    lifecycle = _maintenance_lifecycle(session)
    request_id = maintenance_request_id(
        site_id,
        str(lifecycle.get("maintenance_revision") or "legacy"),
    )
    state = _site_maintenance_state(session, site_id)
    state_matches = (
        str(state.get("request_id") or "") == request_id
        and str(state.get("target_embedding_space_id") or "") == target_space
    )
    state_status = str(state.get("status") or "") if state_matches else ""
    if state_status == "ready":
        return {
            "contract_version": SITE_KNOWLEDGE_MAINTENANCE_REVISION,
            "status": "not_required",
            "action": "none",
            "automatic": True,
            "request_id": "",
            "target_embedding_space_id": target_space,
            "completed_batches": 0,
            "total_batches": 0,
            "last_error_code": "",
        }
    if state_status in {"delivering", "blocked"}:
        return _projection(
            status=state_status,
            request_id=request_id,
            completed_batches=_positive_or_zero(state.get("completed_batches")),
            total_batches=_positive_or_zero(state.get("total_batches")),
            last_error_code=str(state.get("last_error_code") or ""),
        )

    indexed_models = {
        str(model or "").strip() for model in indexed_embedding_models if str(model or "").strip()
    }
    mismatch = any(model != target_space for model in indexed_models)
    if mismatch and str(lifecycle.get("status") or "") in ACTIVE_MAINTENANCE_LIFECYCLES:
        return _projection(
            status="awaiting_site",
            request_id=request_id,
            completed_batches=0,
            total_batches=0,
            last_error_code="",
        )

    return {
        "contract_version": SITE_KNOWLEDGE_MAINTENANCE_REVISION,
        "status": "not_required",
        "action": "none",
        "automatic": True,
        "request_id": "",
        "target_embedding_space_id": target_space,
        "completed_batches": 0,
        "total_batches": 0,
        "last_error_code": "",
    }


def validate_maintenance_batch(
    *,
    session: Session,
    site_id: str,
    input_payload: dict[str, Any],
    sync_mode: str,
) -> dict[str, Any] | None:
    value = input_payload.get("maintenance")
    if value is None:
        return None
    if not isinstance(value, dict):
        raise SiteKnowledgeContractViolation(
            "site_knowledge.invalid_maintenance",
            "site knowledge maintenance must be an object",
        )

    lifecycle = _maintenance_lifecycle(session)
    if str(lifecycle.get("status") or "") not in ACTIVE_MAINTENANCE_LIFECYCLES:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_not_active",
            "site knowledge maintenance is not active for the fixed profile",
        )
    request_id = str(value.get("request_id") or "").strip()
    expected_request_id = maintenance_request_id(
        site_id,
        str(lifecycle.get("maintenance_revision") or "legacy"),
    )
    if request_id != expected_request_id:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_request_mismatch",
            "site knowledge maintenance request does not match the active profile",
        )
    if str(value.get("action") or "") != SITE_KNOWLEDGE_MAINTENANCE_ACTION:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_action_invalid",
            "site knowledge maintenance action must be full_sync",
        )

    batch_index = _bounded_int(value.get("batch_index"), minimum=0, maximum=9999)
    batch_count = _bounded_int(value.get("batch_count"), minimum=1, maximum=10000)
    is_final_value = value.get("is_final")
    if not isinstance(is_final_value, bool):
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_batch_invalid",
            "site knowledge maintenance is_final must be a boolean",
        )
    is_final = is_final_value
    if batch_index >= batch_count or is_final != (batch_index == batch_count - 1):
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_batch_invalid",
            "site knowledge maintenance batch position is invalid",
        )

    state = _site_maintenance_state(session, site_id)
    state_matches = (
        str(state.get("request_id") or "") == expected_request_id
        and str(state.get("target_embedding_space_id") or "")
        == target_embedding_space_id()
    )
    expected_batch_index = 0
    if state_matches:
        if str(state.get("status") or "") == "ready":
            raise SiteKnowledgeContractViolation(
                "site_knowledge.maintenance_not_active",
                "site knowledge maintenance is already complete for this site",
            )
        recorded_batch_count = _positive_or_zero(state.get("total_batches"))
        if recorded_batch_count and recorded_batch_count != batch_count:
            raise SiteKnowledgeContractViolation(
                "site_knowledge.maintenance_batch_invalid",
                "site knowledge maintenance batch count changed during delivery",
            )
        expected_batch_index = _positive_or_zero(state.get("completed_batches"))
    if batch_index != expected_batch_index:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_batch_invalid",
            "site knowledge maintenance batches must be delivered in order",
        )

    expected_mode = "rebuild" if batch_index == 0 else "refresh"
    if sync_mode != expected_mode:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_sync_mode_invalid",
            "site knowledge maintenance batches must start with rebuild and continue with refresh",
        )

    return {
        "request_id": request_id,
        "action": SITE_KNOWLEDGE_MAINTENANCE_ACTION,
        "batch_index": batch_index,
        "batch_count": batch_count,
        "is_final": is_final,
        "target_embedding_space_id": target_embedding_space_id(),
    }


def record_maintenance_batch(
    session: Session,
    *,
    site_id: str,
    maintenance: dict[str, Any],
    status: str,
    last_error_code: str = "",
) -> None:
    site = session.get(Site, site_id)
    if site is None:
        return
    metadata = dict(site.metadata_json) if isinstance(site.metadata_json, dict) else {}
    previous = _copy_maintenance_state(metadata)
    state: dict[str, Any] = {
        "contract_version": SITE_KNOWLEDGE_MAINTENANCE_REVISION,
        "status": status,
        "request_id": str(maintenance["request_id"]),
        "target_embedding_space_id": target_embedding_space_id(),
        "completed_batches": int(maintenance["batch_index"]) + (0 if status == "blocked" else 1),
        "total_batches": int(maintenance["batch_count"]),
        "last_error_code": str(last_error_code or ""),
    }
    for evidence_field in (
        SITE_KNOWLEDGE_LAST_PRUNED_COUNT_FIELD,
        SITE_KNOWLEDGE_LAST_PRUNED_AT_FIELD,
    ):
        if evidence_field in previous:
            state[evidence_field] = previous[evidence_field]
    if status != "ready" and str(previous.get("request_id") or "") == str(
        maintenance["request_id"]
    ):
        # An in-flight delivery still needs its accumulated manifest for the
        # final batch's prune; only a completed delivery drops it. The
        # request_id guard keeps one delivery's manifest from leaking into
        # the next one after a blocked delivery is re-activated.
        for manifest_field in (
            SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD,
            SITE_KNOWLEDGE_MANIFEST_TRUNCATED_FIELD,
        ):
            if manifest_field in previous:
                state[manifest_field] = previous[manifest_field]
    metadata[SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY] = state
    site.metadata_json = metadata
    session.flush()


def merge_maintenance_manifest_sources(
    session: Session,
    *,
    site_id: str,
    request_id: str,
    delivered_sources: list[tuple[str, int]],
) -> None:
    """Accumulate one full-sync batch's delivered public sources.

    The delivery-wide accumulation is the manifest the final batch prunes
    against. WordPress stays the public-content truth, and the change bridge
    cannot replay removals that happened while it could not deliver, so the
    delivered-set difference is the only Cloud-side evidence that an indexed
    source no longer exists publicly. The manifest is always recorded for the
    active delivery, even when a batch delivers nothing: an empty manifest is
    the strongest prune signal for a site whose public content was removed.
    """
    normalized_request_id = str(request_id or "").strip()
    delivered_keys: list[str] = []
    for source_type, source_id in delivered_sources:
        normalized_type = str(source_type or "").strip()
        try:
            normalized_id = int(source_id)
        except (TypeError, ValueError):
            continue
        if normalized_type and normalized_id > 0:
            delivered_keys.append(f"{normalized_type}:{normalized_id}")
    site = session.get(Site, site_id)
    if site is None:
        return
    metadata = dict(site.metadata_json) if isinstance(site.metadata_json, dict) else {}
    state = _copy_maintenance_state(metadata)
    same_delivery = (
        bool(normalized_request_id)
        and str(state.get("request_id") or "") == normalized_request_id
    )
    accumulated = state.get(SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD)
    keys = (
        [str(key) for key in accumulated if isinstance(key, str)]
        if isinstance(accumulated, list) and same_delivery
        else []
    )
    seen = set(keys)
    for key in delivered_keys:
        if key not in seen:
            seen.add(key)
            keys.append(key)
    truncated = (
        bool(state.get(SITE_KNOWLEDGE_MANIFEST_TRUNCATED_FIELD)) if same_delivery else False
    ) or (len(keys) > SITE_KNOWLEDGE_MANIFEST_SOURCES_LIMIT)
    state["request_id"] = normalized_request_id
    state[SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD] = keys[:SITE_KNOWLEDGE_MANIFEST_SOURCES_LIMIT]
    state[SITE_KNOWLEDGE_MANIFEST_TRUNCATED_FIELD] = truncated
    metadata[SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY] = state
    site.metadata_json = metadata
    session.flush()


def prune_unmanifested_sources(
    session: Session,
    *,
    site_id: str,
    repository: SiteKnowledgeRepository,
) -> dict[str, Any]:
    """Mark indexed sources that a completed full sync never delivered stale.

    Runs only on the final maintenance batch. Sources delivered by earlier
    batches of the same delivery form the authoritative public manifest, so
    documents that remain indexed but never reappear are removals the change
    bridge could not reconcile (for example deletions that happened while the
    site was offline). Stale rows keep their content for audit while every
    public-status-filtered read path stops serving them.
    """
    state = _site_maintenance_state(session, site_id)
    summary: dict[str, Any] = {
        "status": "skipped_no_manifest",
        "pruned_source_count": 0,
    }
    if SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD not in state:
        return summary
    if bool(state.get(SITE_KNOWLEDGE_MANIFEST_TRUNCATED_FIELD)):
        summary["status"] = "skipped_truncated_manifest"
        return summary
    keys = _manifest_source_keys(state)
    keep_sources: set[tuple[str, int]] = set()
    source_types: set[str] = set()
    for key in keys:
        source_type, _, raw_source_id = key.partition(":")
        try:
            source_id = int(raw_source_id)
        except ValueError:
            continue
        keep_sources.add((source_type, source_id))
        source_types.add(source_type)
    if not source_types:
        # A recorded-but-empty manifest means the delivery saw no public
        # sources at all, so every public source type in the index is pruned.
        source_types = set(repository.list_public_source_types(site_id))
    pruned_source_count = repository.mark_unmanifested_sources_stale(
        site_id,
        keep_sources=keep_sources,
        source_types=source_types,
    )
    site = session.get(Site, site_id)
    if site is not None:
        metadata = dict(site.metadata_json) if isinstance(site.metadata_json, dict) else {}
        state = _copy_maintenance_state(metadata)
        # The accumulated manifest must survive a failed publish: a blocked
        # final batch is re-delivered, and record_maintenance_batch drops these
        # fields itself on the only path where the delivery truly completed
        # (status="ready"). Clearing here would make the retried batch prune
        # against just its own slice and stale-mark earlier batches' content.
        state[SITE_KNOWLEDGE_LAST_PRUNED_COUNT_FIELD] = int(pruned_source_count)
        state[SITE_KNOWLEDGE_LAST_PRUNED_AT_FIELD] = datetime.now(UTC).isoformat()
        metadata[SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY] = state
        site.metadata_json = metadata
        session.flush()
    summary["status"] = "pruned"
    summary["pruned_source_count"] = int(pruned_source_count)
    return summary


def _projection(
    *,
    status: str,
    request_id: str,
    completed_batches: int,
    total_batches: int,
    last_error_code: str,
) -> dict[str, Any]:
    return {
        "contract_version": SITE_KNOWLEDGE_MAINTENANCE_REVISION,
        "status": status,
        "action": SITE_KNOWLEDGE_MAINTENANCE_ACTION,
        "automatic": True,
        "request_id": request_id,
        "target_embedding_space_id": target_embedding_space_id(),
        "completed_batches": completed_batches,
        "total_batches": total_batches,
        "last_error_code": last_error_code,
    }


def _maintenance_lifecycle(session: Session) -> dict[str, Any]:
    row = session.get(ProviderConnection, SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID)
    if row is None or not row.enabled or row.status != "ready":
        return {}
    config = row.config_json if isinstance(row.config_json, dict) else {}
    lifecycle = config.get("site_knowledge_index_lifecycle")
    return lifecycle if isinstance(lifecycle, dict) else {}


def _site_maintenance_state(session: Session, site_id: str) -> dict[str, Any]:
    site = session.get(Site, site_id)
    metadata = (
        site.metadata_json if site is not None and isinstance(site.metadata_json, dict) else {}
    )
    value = metadata.get(SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY)
    return value if isinstance(value, dict) else {}


def _copy_maintenance_state(metadata: dict[str, Any]) -> dict[str, Any]:
    state = metadata.get(SITE_KNOWLEDGE_MAINTENANCE_METADATA_KEY)
    return dict(state) if isinstance(state, dict) else {}


def _manifest_source_keys(state: dict[str, Any]) -> list[str]:
    value = state.get(SITE_KNOWLEDGE_MANIFEST_SOURCES_FIELD)
    if not isinstance(value, list):
        return []
    return [str(key) for key in value if isinstance(key, str) and ":" in key]


def _bounded_int(value: Any, *, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError) as error:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_batch_invalid",
            "site knowledge maintenance batch position is invalid",
        ) from error
    if normalized < minimum or normalized > maximum:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.maintenance_batch_invalid",
            "site knowledge maintenance batch position is invalid",
        )
    return normalized


def _positive_or_zero(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0
