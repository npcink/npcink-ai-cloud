from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from app.domain.media_derivatives.contracts import MEDIA_GOVERNANCE_CANARY_RESULT_CONTRACT
from app.domain.media_derivatives.processor import MediaDerivativeResult
from app.domain.media_governance.contracts import (
    MEDIA_GOVERNANCE_AUDIT_RESULT_CONTRACT,
    validate_media_governance_audit_runtime_contract,
)

MIN_SOURCE_BYTES = 500 * 1024
MIN_SAVINGS_BASIS_POINTS = 1500
MAX_CANARY_ITEMS = 10
SUPPORTED_STATIC_FORMATS = frozenset({"jpeg", "png"})
EXPECTED_CAPACITY_FIELDS = (
    "uploads_bytes",
    "backup_bytes",
    "logs_bytes",
    "filesystem_used_bytes",
    "filesystem_available_bytes",
)


@dataclass(slots=True)
class MediaGovernanceAuditExecutionResult:
    result_json: dict[str, Any]


class MediaGovernanceAuditService:
    def execute(
        self,
        *,
        site_id: str,
        ability_name: str,
        contract_version: str,
        input_payload: dict[str, Any],
        run_id: str,
    ) -> MediaGovernanceAuditExecutionResult:
        validate_media_governance_audit_runtime_contract(
            ability_name=ability_name,
            contract_version=contract_version,
            input_payload=input_payload,
        )
        snapshot = dict(input_payload["snapshot"])
        snapshot_id = str(snapshot["snapshot_id"])
        coverage = dict(snapshot["coverage"])
        capacity = dict(snapshot["capacity"])
        items = [dict(item) for item in snapshot["items"]]

        candidates = [
            _build_candidate(
                site_id=site_id,
                snapshot_id=snapshot_id,
                coverage_complete=bool(coverage["complete"]),
                item=item,
            )
            for item in items
        ]
        format_distribution = _distribution(items, key_name="format")
        reference_distribution = _distribution(items, key_name="reference_state")
        risk_distribution = _candidate_distribution(candidates, key_name="risk_class")
        eligible_candidates = [item for item in candidates if item["eligible_for_canary"]]
        canary_candidates = sorted(
            eligible_candidates,
            key=lambda item: (-int(item["filesize_bytes"]), str(item["candidate_id"])),
        )[:MAX_CANARY_ITEMS]
        candidate_source_bytes = sum(int(item["filesize_bytes"]) for item in eligible_candidates)
        minimum_qualified_savings_bytes = sum(
            int(item["minimum_qualified_savings_bytes"]) for item in eligible_candidates
        )
        evidence_gaps = _build_evidence_gaps(
            capacity=capacity,
            coverage=coverage,
            inventory_complete=bool(snapshot["inventory_complete"]),
            items=items,
        )

        result = {
            "contract_version": MEDIA_GOVERNANCE_AUDIT_RESULT_CONTRACT,
            "artifact_type": "media_governance_audit",
            "status": "ready",
            "site_id": site_id,
            "audit_id": f"mga_{_hash_text(f'{site_id}:{run_id}:{snapshot_id}')[:24]}",
            "snapshot": {
                "snapshot_id": snapshot_id,
                "captured_at": str(snapshot["captured_at"]),
                "source": "local_addon_manifest",
                "item_count": len(items),
                "item_bytes": sum(int(item["filesize_bytes"]) for item in items),
                "inventory_complete": bool(snapshot["inventory_complete"]),
                "coverage_complete": bool(coverage["complete"]),
                "coverage_sources": sorted(set(str(value) for value in coverage["sources"])),
            },
            "capacity": {field: capacity.get(field) for field in EXPECTED_CAPACITY_FIELDS},
            "format_distribution": format_distribution,
            "reference_distribution": reference_distribution,
            "risk_distribution": risk_distribution,
            "candidate_summary": {
                "eligible_count": len(eligible_candidates),
                "eligible_source_bytes": candidate_source_bytes,
                "minimum_qualified_savings_bytes": minimum_qualified_savings_bytes,
                "estimate_method": "qualification_floor",
                "actual_savings_unknown": True,
                "canary_count": min(MAX_CANARY_ITEMS, len(eligible_candidates)),
            },
            "candidates": candidates,
            "canary_plan": {
                "contract_version": "media_governance_canary_plan.v1",
                "item_count": len(canary_candidates),
                "candidate_ids": [item["candidate_id"] for item in canary_candidates],
                "items": [
                    {
                        "candidate_id": item["candidate_id"],
                        "snapshot_id": item["snapshot_id"],
                        "source_sha256": item["source_sha256"],
                        "evidence_revision": item["evidence_revision"],
                    }
                    for item in canary_candidates
                ],
                "operation": "image.transform.v1",
                "params": {
                    "target_format": "webp",
                    "resize_mode": "preserve",
                    "quality": 82,
                    "source_media_type": "image",
                },
                "validation": {
                    "minimum_savings_basis_points": MIN_SAVINGS_BASIS_POINTS,
                    "require_dimensions_unchanged": True,
                    "skip_if_not_beneficial": True,
                    "retain_originals": True,
                },
                "preview_only": True,
                "direct_wordpress_write": False,
            },
            "evidence_gaps": evidence_gaps,
            "policy": {
                "source_formats": ["jpeg", "png"],
                "target_format": "webp",
                "minimum_source_bytes": MIN_SOURCE_BYTES,
                "minimum_savings_basis_points": MIN_SAVINGS_BASIS_POINTS,
                "preserve_dimensions": True,
                "max_canary_items": MAX_CANARY_ITEMS,
                "skip_animated": True,
                "retain_originals": True,
            },
            "stale_candidate_guard": {
                "binding_fields": [
                    "snapshot_id",
                    "source_sha256",
                    "evidence_revision",
                ],
                "requires_local_revalidation": True,
                "invalidates_on_snapshot_change": True,
            },
            "handoff": {
                "inventory_owner": "local_wordpress_host",
                "wordpress_write_owner": "npcink-abilities-toolkit",
                "cloud_scan": False,
                "direct_wordpress_write": False,
                "next_action": "select_canary_previews",
            },
            "write_posture": "read_only",
            "direct_wordpress_write": False,
        }
        return MediaGovernanceAuditExecutionResult(result_json=result)


def build_media_governance_canary_result(
    *,
    governance: dict[str, Any],
    source: dict[str, Any],
    derivative_result: MediaDerivativeResult,
    derivative_artifact: dict[str, Any] | None,
) -> dict[str, Any]:
    source_bytes = int(source["filesize_bytes"])
    output_bytes = int(derivative_result.filesize_bytes)
    savings_bytes = source_bytes - output_bytes
    savings_basis_points = max(0, savings_bytes * 10_000 // max(1, source_bytes))
    dimensions_unchanged = (
        int(source["width"]) == derivative_result.width
        and int(source["height"]) == derivative_result.height
    )
    minimum_savings = int(governance["minimum_savings_basis_points"])
    reasons: list[str] = []
    if str(source["format"]).lower() not in SUPPORTED_STATIC_FORMATS:
        reasons.append("source_format_not_supported")
    if output_bytes >= source_bytes:
        reasons.append("output_not_smaller")
    if source_bytes <= MIN_SOURCE_BYTES:
        reasons.append("below_minimum_source_bytes")
    if savings_basis_points < minimum_savings:
        reasons.append("minimum_savings_not_met")
    if not dimensions_unchanged:
        reasons.append("dimensions_changed")
    qualified = not reasons
    return {
        "contract_version": MEDIA_GOVERNANCE_CANARY_RESULT_CONTRACT,
        "artifact_type": "media_governance_canary_preview",
        "status": "ready" if qualified else "skipped",
        "candidate": {
            "candidate_id": str(governance["candidate_id"]),
            "snapshot_id": str(governance["snapshot_id"]),
            "source_sha256": str(governance["source_sha256"]),
            "evidence_revision": str(governance["evidence_revision"]),
        },
        "source": source,
        "validation": {
            "source_checksum_matches": True,
            "dimensions_unchanged": dimensions_unchanged,
            "output_smaller": output_bytes < source_bytes,
            "source_bytes": source_bytes,
            "output_bytes": output_bytes,
            "savings_bytes": max(0, savings_bytes),
            "savings_basis_points": savings_basis_points,
            "minimum_savings_basis_points": minimum_savings,
            "qualified": qualified,
            "reasons": reasons,
        },
        "derivative": derivative_artifact if qualified else None,
        "preview_only": True,
        "retain_originals": True,
        "write_posture": "artifact_only" if qualified else "no_artifact",
        "direct_wordpress_write": False,
    }


def _build_candidate(
    *,
    site_id: str,
    snapshot_id: str,
    coverage_complete: bool,
    item: dict[str, Any],
) -> dict[str, Any]:
    item_id = str(item["item_id"])
    source_sha256 = _normalize_sha256(str(item["source_sha256"]))
    evidence_revision = str(item["evidence_revision"])
    media_format = _normalize_format(str(item["format"]))
    reference_state = str(item["reference_state"])
    filesize_bytes = int(item["filesize_bytes"])
    animated = bool(item["animated"])
    width = item.get("width")
    height = item.get("height")
    evidence_sources = sorted(set(str(value) for value in item["evidence_sources"]))
    risk_class = _risk_class(
        media_format=media_format,
        reference_state=reference_state,
        coverage_complete=coverage_complete,
        animated=animated,
        width=width,
        height=height,
        evidence_sources=evidence_sources,
    )
    reasons = _ineligibility_reasons(
        risk_class=risk_class,
        media_format=media_format,
        filesize_bytes=filesize_bytes,
        animated=animated,
        width=width,
        height=height,
    )
    binding = f"{site_id}:{snapshot_id}:{item_id}:{source_sha256}:{evidence_revision}"
    return {
        "candidate_id": f"mgc_{_hash_text(binding)[:24]}",
        "item_id": item_id,
        "snapshot_id": snapshot_id,
        "source_sha256": source_sha256,
        "evidence_revision": evidence_revision,
        "evidence_sources": evidence_sources,
        "format": media_format,
        "filesize_bytes": filesize_bytes,
        "width": width,
        "height": height,
        "animated": animated,
        "reference_state": reference_state,
        "risk_class": risk_class,
        "eligible_for_canary": not reasons,
        "ineligibility_reasons": reasons,
        "minimum_qualified_savings_bytes": (
            filesize_bytes * MIN_SAVINGS_BASIS_POINTS // 10_000 if not reasons else 0
        ),
        "adoption_guard": {
            "snapshot_id": snapshot_id,
            "source_sha256": source_sha256,
            "evidence_revision": evidence_revision,
        },
    }


def _risk_class(
    *,
    media_format: str,
    reference_state: str,
    coverage_complete: bool,
    animated: bool,
    width: Any,
    height: Any,
    evidence_sources: list[str],
) -> str:
    if reference_state in {"no_known_reference", "coverage_incomplete"}:
        return "high"
    if not coverage_complete:
        return "high"
    if (
        reference_state != "referenced"
        or media_format not in SUPPORTED_STATIC_FORMATS
        or animated
        or not evidence_sources
        or width is None
        or height is None
    ):
        return "medium"
    return "low"


def _ineligibility_reasons(
    *,
    risk_class: str,
    media_format: str,
    filesize_bytes: int,
    animated: bool,
    width: Any,
    height: Any,
) -> list[str]:
    reasons: list[str] = []
    if risk_class != "low":
        reasons.append("risk_not_low")
    if media_format not in SUPPORTED_STATIC_FORMATS:
        reasons.append("format_not_supported")
    if animated:
        reasons.append("animated_media_excluded")
    if filesize_bytes <= MIN_SOURCE_BYTES:
        reasons.append("below_minimum_source_bytes")
    if width is None or height is None:
        reasons.append("dimensions_missing")
    return reasons


def _distribution(items: list[dict[str, Any]], *, key_name: str) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    sizes: defaultdict[str, int] = defaultdict(int)
    for item in items:
        raw_key = str(item[key_name]).lower()
        key = _normalize_format(raw_key) if key_name == "format" else raw_key
        counts[key] += 1
        sizes[key] += int(item["filesize_bytes"])
    return [
        {"value": key, "count": counts[key], "bytes": sizes[key]}
        for key in sorted(counts, key=lambda value: (-sizes[value], value))
    ]


def _candidate_distribution(
    candidates: list[dict[str, Any]], *, key_name: str
) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    sizes: defaultdict[str, int] = defaultdict(int)
    for candidate in candidates:
        key = str(candidate[key_name])
        counts[key] += 1
        sizes[key] += int(candidate["filesize_bytes"])
    order = {"low": 0, "medium": 1, "high": 2}
    return [
        {"value": key, "count": counts[key], "bytes": sizes[key]}
        for key in sorted(counts, key=lambda value: (order.get(value, 99), value))
    ]


def _build_evidence_gaps(
    *,
    capacity: dict[str, Any],
    coverage: dict[str, Any],
    inventory_complete: bool,
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    for field in EXPECTED_CAPACITY_FIELDS:
        if field not in capacity:
            gaps.append({"code": f"capacity.{field}.missing", "item_count": 0})
    if not inventory_complete:
        gaps.append({"code": "inventory.coverage_incomplete", "item_count": len(items)})
    if not bool(coverage["complete"]):
        gaps.append({"code": "reference_coverage.incomplete", "item_count": len(items)})
    missing_sources = sum(1 for item in items if not item["evidence_sources"])
    if missing_sources:
        gaps.append({"code": "reference_evidence.sources_missing", "item_count": missing_sources})
    missing_dimensions = sum(
        1 for item in items if item.get("width") is None or item.get("height") is None
    )
    if missing_dimensions:
        gaps.append({"code": "media.dimensions_missing", "item_count": missing_dimensions})
    return gaps


def _normalize_format(value: str) -> str:
    normalized = value.strip().lower()
    return "jpeg" if normalized == "jpg" else normalized


def _normalize_sha256(value: str) -> str:
    normalized = value.strip().lower()
    return normalized if normalized.startswith("sha256:") else f"sha256:{normalized}"


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
