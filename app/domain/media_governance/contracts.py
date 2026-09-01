from __future__ import annotations

import re
from datetime import datetime
from typing import Any, NoReturn

MEDIA_GOVERNANCE_AUDIT_CLOUD_ABILITY = "npcink-cloud/audit-media-governance"
MEDIA_GOVERNANCE_AUDIT_TOOLBOX_ABILITY = "npcink-toolbox/audit-media-governance"
MEDIA_GOVERNANCE_AUDIT_ABILITIES = frozenset(
    {
        MEDIA_GOVERNANCE_AUDIT_CLOUD_ABILITY,
        MEDIA_GOVERNANCE_AUDIT_TOOLBOX_ABILITY,
    }
)
MEDIA_GOVERNANCE_AUDIT_REQUEST_CONTRACT = "media_governance_audit_request.v1"
MEDIA_GOVERNANCE_AUDIT_RESULT_CONTRACT = "media_governance_audit.v1"
MEDIA_GOVERNANCE_AUDIT_EXECUTION_KIND = "media_governance_audit"
MEDIA_GOVERNANCE_AUDIT_PROFILE_ID = "media-governance-audit.managed"
MEDIA_GOVERNANCE_AUDIT_ABILITY_FAMILY = "vision"
MEDIA_GOVERNANCE_AUDIT_DATA_CLASSIFICATION = "internal"
MEDIA_GOVERNANCE_AUDIT_MAX_ITEMS = 500

MEDIA_GOVERNANCE_REFERENCE_STATES = frozenset(
    {
        "referenced",
        "no_known_reference",
        "coverage_incomplete",
        "dynamic_reference_possible",
        "externally_observed",
    }
)
MEDIA_GOVERNANCE_FORMATS = frozenset(
    {"jpeg", "jpg", "png", "webp", "gif", "avif", "svg", "unknown", "other"}
)
MEDIA_GOVERNANCE_CAPACITY_FIELDS = frozenset(
    {
        "uploads_bytes",
        "backup_bytes",
        "logs_bytes",
        "filesystem_used_bytes",
        "filesystem_available_bytes",
    }
)
MEDIA_GOVERNANCE_INPUT_FIELDS = frozenset({"contract_version", "snapshot"})
MEDIA_GOVERNANCE_SNAPSHOT_FIELDS = frozenset(
    {"snapshot_id", "captured_at", "inventory_complete", "capacity", "coverage", "items"}
)
MEDIA_GOVERNANCE_COVERAGE_FIELDS = frozenset({"complete", "sources"})
MEDIA_GOVERNANCE_ITEM_FIELDS = frozenset(
    {
        "item_id",
        "source_sha256",
        "filesize_bytes",
        "format",
        "width",
        "height",
        "animated",
        "reference_state",
        "evidence_revision",
        "evidence_sources",
    }
)
FORBIDDEN_MEDIA_GOVERNANCE_KEYS = frozenset(
    {
        "approval_decision",
        "confirm_token",
        "database_password",
        "database_url",
        "delete_file",
        "direct_publish",
        "direct_wordpress_write",
        "final_write_target",
        "metadata_patch",
        "replace_file",
        "ssh_key",
        "ssh_password",
        "update_attachment_metadata",
        "update_post",
        "wordpress_password",
        "wordpress_secret",
        "wordpress_write_policy",
        "write_confirmed",
        "write_control",
        "write_controls",
    }
)

_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")
_SHA256_PATTERN = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")


class MediaGovernanceAuditContractViolation(ValueError):
    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message


def validate_media_governance_audit_runtime_contract(
    *,
    ability_name: str,
    contract_version: str,
    input_payload: dict[str, Any],
) -> None:
    if ability_name not in MEDIA_GOVERNANCE_AUDIT_ABILITIES:
        _violation("unknown_ability", "media governance audit ability_name is not supported")
    if contract_version != MEDIA_GOVERNANCE_AUDIT_REQUEST_CONTRACT:
        _violation(
            "contract_mismatch",
            "media governance audit contract_version does not match ability_name",
        )
    if not isinstance(input_payload, dict):
        _violation("invalid_input", "media governance audit input must be an object")
    if (
        str(input_payload.get("contract_version") or contract_version)
        != MEDIA_GOVERNANCE_AUDIT_REQUEST_CONTRACT
    ):
        _violation(
            "input_contract_mismatch",
            "media governance audit input contract_version does not match runtime contract",
        )
    forbidden_path = find_forbidden_media_governance_field(input_payload)
    if forbidden_path:
        _violation(
            "write_field_forbidden",
            "media governance audit input may not include write/control or credential "
            f"field '{forbidden_path}'",
        )
    _reject_unknown_keys(input_payload, allowed=MEDIA_GOVERNANCE_INPUT_FIELDS, path="input")

    snapshot = input_payload.get("snapshot")
    if not isinstance(snapshot, dict):
        _violation("snapshot_required", "media governance audit snapshot is required")
    _reject_unknown_keys(snapshot, allowed=MEDIA_GOVERNANCE_SNAPSHOT_FIELDS, path="snapshot")
    _validate_id(snapshot.get("snapshot_id"), field_name="snapshot.snapshot_id")
    if not isinstance(snapshot.get("inventory_complete"), bool):
        _violation(
            "inventory_complete_required",
            "snapshot.inventory_complete must be boolean",
        )
    captured_at = snapshot.get("captured_at")
    if not isinstance(captured_at, str) or not captured_at.strip():
        _violation("captured_at_required", "snapshot.captured_at is required")
    try:
        captured_datetime = datetime.fromisoformat(captured_at.strip().replace("Z", "+00:00"))
    except ValueError:
        _violation("captured_at_invalid", "snapshot.captured_at must be an ISO-8601 timestamp")
    if captured_datetime.tzinfo is None:
        _violation(
            "captured_at_timezone_required",
            "snapshot.captured_at must include a timezone",
        )

    capacity = snapshot.get("capacity")
    if not isinstance(capacity, dict):
        _violation("capacity_required", "snapshot.capacity is required")
    _reject_unknown_keys(
        capacity, allowed=MEDIA_GOVERNANCE_CAPACITY_FIELDS, path="snapshot.capacity"
    )
    if "uploads_bytes" not in capacity:
        _violation("uploads_bytes_required", "snapshot.capacity.uploads_bytes is required")
    for field_name, value in capacity.items():
        if field_name not in MEDIA_GOVERNANCE_CAPACITY_FIELDS:
            continue
        _validate_non_negative_int(value, field_name=f"snapshot.capacity.{field_name}")

    coverage = snapshot.get("coverage")
    if not isinstance(coverage, dict):
        _violation("coverage_required", "snapshot.coverage is required")
    _reject_unknown_keys(
        coverage,
        allowed=MEDIA_GOVERNANCE_COVERAGE_FIELDS,
        path="snapshot.coverage",
    )
    if not isinstance(coverage.get("complete"), bool):
        _violation("coverage_complete_required", "snapshot.coverage.complete must be boolean")
    _validate_string_list(
        coverage.get("sources"),
        field_name="snapshot.coverage.sources",
        allow_empty=True,
    )

    items = snapshot.get("items")
    if not isinstance(items, list) or not items:
        _violation("items_required", "snapshot.items must contain at least one item")
    if len(items) > MEDIA_GOVERNANCE_AUDIT_MAX_ITEMS:
        _violation(
            "too_many_items",
            f"snapshot.items may contain at most {MEDIA_GOVERNANCE_AUDIT_MAX_ITEMS} items",
        )
    seen_item_ids: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            _violation("item_invalid", f"snapshot.items[{index}] must be an object")
        _reject_unknown_keys(
            item,
            allowed=MEDIA_GOVERNANCE_ITEM_FIELDS,
            path=f"snapshot.items[{index}]",
        )
        item_id = _validate_id(item.get("item_id"), field_name=f"snapshot.items[{index}].item_id")
        if item_id in seen_item_ids:
            _violation("duplicate_item_id", f"snapshot.items[{index}].item_id is duplicated")
        seen_item_ids.add(item_id)
        source_sha256 = item.get("source_sha256")
        if not isinstance(source_sha256, str) or not _SHA256_PATTERN.fullmatch(
            source_sha256.strip()
        ):
            _violation(
                "source_sha256_invalid",
                f"snapshot.items[{index}].source_sha256 must be a SHA-256 digest",
            )
        _validate_non_negative_int(
            item.get("filesize_bytes"),
            field_name=f"snapshot.items[{index}].filesize_bytes",
            positive=True,
        )
        media_format = str(item.get("format") or "").strip().lower()
        if media_format not in MEDIA_GOVERNANCE_FORMATS:
            _violation(
                "format_invalid",
                f"snapshot.items[{index}].format is not supported",
            )
        reference_state = str(item.get("reference_state") or "").strip().lower()
        if reference_state not in MEDIA_GOVERNANCE_REFERENCE_STATES:
            _violation(
                "reference_state_invalid",
                f"snapshot.items[{index}].reference_state is not supported",
            )
        _validate_id(
            item.get("evidence_revision"),
            field_name=f"snapshot.items[{index}].evidence_revision",
        )
        _validate_string_list(
            item.get("evidence_sources"),
            field_name=f"snapshot.items[{index}].evidence_sources",
            allow_empty=True,
        )
        if not isinstance(item.get("animated"), bool):
            _violation(
                "animated_required",
                f"snapshot.items[{index}].animated must be boolean",
            )
        for dimension in ("width", "height"):
            value = item.get(dimension)
            if value is not None:
                _validate_non_negative_int(
                    value,
                    field_name=f"snapshot.items[{index}].{dimension}",
                    positive=True,
                )


def find_forbidden_media_governance_field(value: Any, *, path: str = "") -> str:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized_key = str(key or "").strip().lower()
            current_path = f"{path}.{normalized_key}" if path else normalized_key
            if normalized_key in FORBIDDEN_MEDIA_GOVERNANCE_KEYS:
                if normalized_key == "direct_wordpress_write" and item is False:
                    continue
                return current_path
            nested = find_forbidden_media_governance_field(item, path=current_path)
            if nested:
                return nested
    if isinstance(value, list):
        for index, item in enumerate(value):
            nested = find_forbidden_media_governance_field(item, path=f"{path}[{index}]")
            if nested:
                return nested
    return ""


def _reject_unknown_keys(value: dict[str, Any], *, allowed: frozenset[str], path: str) -> None:
    unknown = sorted(str(key) for key in value if str(key) not in allowed)
    if unknown:
        _violation(
            "unknown_field",
            f"{path} contains unsupported field '{unknown[0]}'",
        )


def _validate_id(value: Any, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not _ID_PATTERN.fullmatch(normalized):
        _violation("identifier_invalid", f"{field_name} must be a stable opaque identifier")
    return normalized


def _validate_non_negative_int(
    value: Any,
    *,
    field_name: str,
    positive: bool = False,
) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < (1 if positive else 0):
        qualifier = "positive" if positive else "non-negative"
        _violation("integer_invalid", f"{field_name} must be a {qualifier} integer")


def _validate_string_list(value: Any, *, field_name: str, allow_empty: bool) -> None:
    if not isinstance(value, list) or (not value and not allow_empty) or len(value) > 32:
        _violation("string_list_invalid", f"{field_name} must be a bounded string list")
    for item in value:
        if not isinstance(item, str) or not item.strip() or len(item.strip()) > 80:
            _violation("string_list_invalid", f"{field_name} contains an invalid value")


def _violation(code: str, message: str) -> NoReturn:
    raise MediaGovernanceAuditContractViolation(f"media_governance_audit.{code}", message)
