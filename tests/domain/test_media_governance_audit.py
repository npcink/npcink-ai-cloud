from __future__ import annotations

import pytest

from app.domain.media_derivatives.contracts import MediaJobRequest
from app.domain.media_governance.contracts import (
    MediaGovernanceAuditContractViolation,
)
from app.domain.media_governance.service import MediaGovernanceAuditService


def _payload(*, snapshot_id: str = "scan_20260831_001") -> dict[str, object]:
    return {
        "contract_version": "media_governance_audit_request.v1",
        "snapshot": {
            "snapshot_id": snapshot_id,
            "captured_at": "2026-08-31T10:00:00Z",
            "inventory_complete": True,
            "capacity": {
                "uploads_bytes": 5_000_000,
                "filesystem_used_bytes": 50_000_000,
                "filesystem_available_bytes": 100_000_000,
            },
            "coverage": {
                "complete": True,
                "sources": ["attachment_meta", "post_content", "termmeta"],
            },
            "items": [
                {
                    "item_id": "attachment:101",
                    "source_sha256": "a" * 64,
                    "filesize_bytes": 1_000_000,
                    "format": "jpg",
                    "width": 1600,
                    "height": 900,
                    "animated": False,
                    "reference_state": "referenced",
                    "evidence_revision": "refs_101_v1",
                    "evidence_sources": ["attachment_meta", "termmeta"],
                },
                {
                    "item_id": "attachment:102",
                    "source_sha256": "b" * 64,
                    "filesize_bytes": 400_000,
                    "format": "png",
                    "width": 800,
                    "height": 800,
                    "animated": False,
                    "reference_state": "referenced",
                    "evidence_revision": "refs_102_v1",
                    "evidence_sources": ["attachment_meta"],
                },
                {
                    "item_id": "file:legacy-gif",
                    "source_sha256": "c" * 64,
                    "filesize_bytes": 1_500_000,
                    "format": "gif",
                    "width": 640,
                    "height": 480,
                    "animated": True,
                    "reference_state": "no_known_reference",
                    "evidence_revision": "refs_legacy_v1",
                    "evidence_sources": [],
                },
                {
                    "item_id": "attachment:103",
                    "source_sha256": "d" * 64,
                    "filesize_bytes": 2_100_000,
                    "format": "jpeg",
                    "width": None,
                    "height": None,
                    "animated": False,
                    "reference_state": "dynamic_reference_possible",
                    "evidence_revision": "refs_103_v1",
                    "evidence_sources": ["theme_dynamic_path"],
                },
            ],
        },
    }


def _execute(payload: dict[str, object]) -> dict[str, object]:
    return (
        MediaGovernanceAuditService()
        .execute(
            site_id="site_alpha",
            ability_name="npcink-toolbox/audit-media-governance",
            contract_version="media_governance_audit_request.v1",
            input_payload=payload,
            run_id="run_media_governance_test",
        )
        .result_json
    )


def test_media_governance_audit_classifies_candidates_and_evidence() -> None:
    result = _execute(_payload())

    assert result["contract_version"] == "media_governance_audit.v1"
    assert result["write_posture"] == "read_only"
    assert result["direct_wordpress_write"] is False
    assert result["handoff"] == {
        "inventory_owner": "local_wordpress_host",
        "wordpress_write_owner": "npcink-abilities-toolkit",
        "cloud_scan": False,
        "direct_wordpress_write": False,
        "next_action": "select_canary_previews",
    }
    assert result["format_distribution"] == [
        {"value": "jpeg", "count": 2, "bytes": 3_100_000},
        {"value": "gif", "count": 1, "bytes": 1_500_000},
        {"value": "png", "count": 1, "bytes": 400_000},
    ]
    assert result["risk_distribution"] == [
        {"value": "low", "count": 2, "bytes": 1_400_000},
        {"value": "medium", "count": 1, "bytes": 2_100_000},
        {"value": "high", "count": 1, "bytes": 1_500_000},
    ]
    assert result["candidate_summary"] == {
        "eligible_count": 1,
        "eligible_source_bytes": 1_000_000,
        "minimum_qualified_savings_bytes": 150_000,
        "estimate_method": "qualification_floor",
        "actual_savings_unknown": True,
        "canary_count": 1,
    }
    assert result["canary_plan"] == {
        "contract_version": "media_governance_canary_plan.v1",
        "item_count": 1,
        "candidate_ids": [result["candidates"][0]["candidate_id"]],
        "items": [
            {
                "candidate_id": result["candidates"][0]["candidate_id"],
                "snapshot_id": "scan_20260831_001",
                "source_sha256": f"sha256:{'a' * 64}",
                "evidence_revision": "refs_101_v1",
                "source_artifact_id_binding": "uploaded_source_artifact.artifact_id",
                "job_request_template": {
                    "request_contract_version": "media_job_request.v1",
                    "operation": "image.transform.v1",
                    "params": {
                        "mode": "auto_safe",
                        "optimization_profile": "auto_safe.v1",
                        "target_format": "webp",
                        "max_width": 1920,
                        "resize_mode": "preserve",
                        "source_media_type": "image",
                    },
                    "governance": {
                        "contract_version": "media_governance_canary.v1",
                        "candidate_id": result["candidates"][0]["candidate_id"],
                        "snapshot_id": "scan_20260831_001",
                        "source_sha256": f"sha256:{'a' * 64}",
                        "evidence_revision": "refs_101_v1",
                        "minimum_savings_basis_points": 1500,
                        "require_dimensions_unchanged": True,
                        "skip_if_not_beneficial": True,
                        "retain_originals": True,
                    },
                    "result_ttl_minutes": 30,
                },
            }
        ],
        "operation": "image.transform.v1",
        "params": {
            "mode": "auto_safe",
            "optimization_profile": "auto_safe.v1",
            "target_format": "webp",
            "max_width": 1920,
            "resize_mode": "preserve",
            "source_media_type": "image",
        },
        "validation": {
            "minimum_savings_basis_points": 1500,
            "require_dimensions_unchanged": True,
            "skip_if_not_beneficial": True,
            "retain_originals": True,
        },
        "preview_only": True,
        "direct_wordpress_write": False,
    }
    candidates = {item["item_id"]: item for item in result["candidates"]}
    assert candidates["attachment:101"]["eligible_for_canary"] is True
    assert candidates["attachment:101"]["evidence_sources"] == [
        "attachment_meta",
        "termmeta",
    ]
    assert candidates["attachment:102"]["ineligibility_reasons"] == ["below_minimum_source_bytes"]
    assert candidates["file:legacy-gif"]["risk_class"] == "high"
    assert candidates["attachment:103"]["risk_class"] == "medium"
    assert result["evidence_gaps"] == [
        {"code": "capacity.backup_bytes.missing", "item_count": 0},
        {"code": "capacity.logs_bytes.missing", "item_count": 0},
        {"code": "reference_evidence.sources_missing", "item_count": 1},
        {"code": "media.dimensions_missing", "item_count": 1},
    ]


def test_media_governance_canary_plan_builds_valid_job_without_transform_guesswork() -> None:
    result = _execute(_payload())
    plan_item = result["canary_plan"]["items"][0]

    request = MediaJobRequest.model_validate(
        {
            **plan_item["job_request_template"],
            "source_artifact_id": "art_0123456789abcdef0123456789abcdef",
        }
    )

    assert plan_item["source_artifact_id_binding"] == "uploaded_source_artifact.artifact_id"
    assert request.params.mode == "auto_safe"
    assert request.params.optimization_profile == "auto_safe.v1"
    assert request.params.resize_mode == "preserve"
    assert request.params.max_width == 1920
    assert request.governance is not None
    assert request.governance.candidate_id == plan_item["candidate_id"]
    assert request.governance.source_sha256 == plan_item["source_sha256"]
    assert request.governance.require_dimensions_unchanged is True
    assert request.governance.minimum_savings_basis_points == 1500


def test_media_governance_audit_snapshot_change_invalidates_candidate_binding() -> None:
    first = _execute(_payload(snapshot_id="scan_20260831_001"))
    second = _execute(_payload(snapshot_id="scan_20260831_002"))

    assert first["candidates"][0]["candidate_id"] != second["candidates"][0]["candidate_id"]
    assert first["candidates"][0]["adoption_guard"]["snapshot_id"] == "scan_20260831_001"
    assert second["candidates"][0]["adoption_guard"]["snapshot_id"] == "scan_20260831_002"
    assert second["stale_candidate_guard"]["invalidates_on_snapshot_change"] is True


def test_media_governance_audit_rejects_write_controls() -> None:
    payload = _payload()
    payload["snapshot"]["items"][0]["direct_publish"] = True

    with pytest.raises(MediaGovernanceAuditContractViolation) as caught:
        _execute(payload)

    assert caught.value.error_code == "media_governance_audit.write_field_forbidden"


def test_media_governance_audit_rejects_unneeded_media_content() -> None:
    payload = _payload()
    payload["snapshot"]["items"][0]["source_path"] = "/srv/wordpress/uploads/private.jpg"

    with pytest.raises(MediaGovernanceAuditContractViolation) as caught:
        _execute(payload)

    assert caught.value.error_code == "media_governance_audit.unknown_field"


def test_media_governance_audit_accepts_incomplete_coverage_as_report_only() -> None:
    payload = _payload()
    payload["snapshot"]["coverage"]["complete"] = False

    result = _execute(payload)

    assert result["candidate_summary"]["eligible_count"] == 0
    assert result["risk_distribution"] == [{"value": "high", "count": 4, "bytes": 5_000_000}]
    assert {gap["code"] for gap in result["evidence_gaps"]} >= {"reference_coverage.incomplete"}


def test_media_governance_audit_marks_partial_inventory_as_evidence_gap() -> None:
    payload = _payload()
    payload["snapshot"]["inventory_complete"] = False

    result = _execute(payload)

    assert result["snapshot"]["inventory_complete"] is False
    assert {gap["code"] for gap in result["evidence_gaps"]} >= {"inventory.coverage_incomplete"}


def test_media_governance_audit_requires_timezone_aware_snapshot() -> None:
    payload = _payload()
    payload["snapshot"]["captured_at"] = "2026-08-31T10:00:00"

    with pytest.raises(MediaGovernanceAuditContractViolation) as caught:
        _execute(payload)

    assert caught.value.error_code == "media_governance_audit.captured_at_timezone_required"
