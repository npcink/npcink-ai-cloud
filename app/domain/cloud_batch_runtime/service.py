from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.domain.cloud_batch_runtime.contracts import (
    CLOUD_BATCH_RUNTIME_REQUEST_CONTRACT,
    CLOUD_BATCH_RUNTIME_RESULT_CONTRACT,
    CloudBatchRuntimeContractViolation,
    validate_cloud_batch_runtime_contract,
)


@dataclass(slots=True)
class CloudBatchRuntimeExecution:
    result_json: dict[str, Any]


class CloudBatchRuntimeService:
    def execute(
        self,
        *,
        site_id: str,
        ability_name: str,
        contract_version: str,
        input_payload: dict[str, Any],
        run_id: str,
    ) -> CloudBatchRuntimeExecution:
        validate_cloud_batch_runtime_contract(
            ability_name=ability_name,
            contract_version=contract_version,
            input_payload=input_payload,
        )

        items = _extract_items(input_payload)
        actions = [
            _score_item(item, sequence=index + 1)
            for index, item in enumerate(items)
            if isinstance(item, dict)
        ]
        warning_count = sum(1 for action in actions if action["severity"] == "warning")
        critical_count = sum(1 for action in actions if action["severity"] == "critical")
        average_score = round(
            sum(float(action["score"]) for action in actions) / len(actions),
            2,
        )

        result = {
            "contract_version": CLOUD_BATCH_RUNTIME_RESULT_CONTRACT,
            "request_contract_version": CLOUD_BATCH_RUNTIME_REQUEST_CONTRACT,
            "run_id": run_id,
            "site_id": site_id,
            "generated_at": datetime.now(UTC).isoformat(),
            "runtime_owner": "npcink-local-automation-runtime",
            "cloud_role": "runtime_detail",
            "task_profile": str(
                input_payload.get("task_profile") or "nightly_site_inspection_morning_brief"
            ),
            "summary": {
                "items_scanned": len(actions),
                "actions_total": len([action for action in actions if action["reason_codes"]]),
                "warning_total": warning_count,
                "critical_total": critical_count,
                "average_score": average_score,
            },
            "actions": actions,
            "writing_preparation": _build_writing_preparation(actions),
            "safety": {
                "direct_wordpress_write": False,
                "final_write_path": "core_proposal_required",
                "article_body_generated": False,
                "article_write_plan_generated": False,
                "requires_local_review": True,
            },
            "handoff": {
                "target_owner": "magick-ai-core",
                "proposal_created": False,
                "operator_next_action": "review_cloud_batch_result",
            },
        }
        return CloudBatchRuntimeExecution(result_json=result)


def _extract_items(input_payload: dict[str, Any]) -> list[dict[str, Any]]:
    items = input_payload.get("items")
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    snapshot = input_payload.get("snapshot")
    if isinstance(snapshot, dict) and isinstance(snapshot.get("items"), list):
        return [item for item in snapshot["items"] if isinstance(item, dict)]
    raise CloudBatchRuntimeContractViolation(
        "cloud_batch_runtime.items_required",
        "cloud batch runtime input requires at least one content item",
    )


def _score_item(item: dict[str, Any], *, sequence: int) -> dict[str, Any]:
    reason_codes: list[str] = []
    title = str(item.get("title") or "").strip()
    excerpt = str(item.get("excerpt") or item.get("summary") or "").strip()
    meta_description = str(item.get("meta_description") or "").strip()
    word_count = _coerce_int(item.get("word_count"), default=0)
    internal_link_count = _coerce_int(item.get("internal_link_count"), default=0)
    image_alt_missing = _coerce_int(item.get("image_alt_missing"), default=0)
    days_since_modified = _coerce_int(item.get("days_since_modified"), default=0)

    score = 100
    if len(title) < 20:
        score -= 12
        reason_codes.append("short_title")
    if not meta_description:
        score -= 14
        reason_codes.append("missing_meta_description")
    elif len(meta_description) < 80:
        score -= 8
        reason_codes.append("short_meta_description")
    if word_count and word_count < 500:
        score -= 10
        reason_codes.append("thin_content")
    if internal_link_count <= 0:
        score -= 9
        reason_codes.append("missing_internal_links")
    if image_alt_missing > 0:
        score -= min(15, 5 * image_alt_missing)
        reason_codes.append("missing_image_alt_text")
    if days_since_modified >= 365:
        score -= 10
        reason_codes.append("stale_content")

    normalized_score = max(0, min(100, score))
    severity = "ok"
    if normalized_score < 60:
        severity = "critical"
    elif normalized_score < 80:
        severity = "warning"

    object_type = str(item.get("object_type") or item.get("post_type") or "post")
    object_id = str(item.get("object_id") or item.get("post_id") or item.get("id") or "")
    return {
        "action_id": f"action_{sequence:03d}",
        "action_type": "content_quality_signal",
        "object_type": object_type,
        "object_id": object_id,
        "title": title or "(untitled)",
        "score": normalized_score,
        "severity": severity,
        "reason_codes": reason_codes,
        "evidence_summary": _build_evidence_summary(reason_codes, excerpt=excerpt),
        "recommended_next_action": (
            "review_update_brief" if severity != "ok" else "no_immediate_action"
        ),
        "direct_wordpress_write": False,
        "status": "succeeded",
    }


def _build_evidence_summary(reason_codes: list[str], *, excerpt: str) -> str:
    if reason_codes:
        return "Review suggested for: " + ", ".join(reason_codes[:5])
    if excerpt:
        return "No immediate quality issue detected from supplied evidence."
    return "No immediate quality issue detected from supplied metadata."


def _build_writing_preparation(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    preparation: list[dict[str, Any]] = []
    for action in actions:
        reason_codes = action.get("reason_codes")
        if not isinstance(reason_codes, list) or not reason_codes:
            continue
        preparation.append(
            {
                "source_object_ids": [action.get("object_id")],
                "opportunity_kind": "refresh_existing_content",
                "evidence_summary": action.get("evidence_summary") or "",
                "forbidden_output_absent": True,
            }
        )
    return preparation


def _coerce_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
