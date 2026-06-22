from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from app.domain.site_ops_analysis.contracts import (
    SITE_OPS_ANALYSIS_RESULT_CONTRACT,
    validate_site_ops_analysis_runtime_contract,
)


@dataclass(slots=True)
class SiteOpsAnalysisExecutionResult:
    result_json: dict[str, Any]


class SiteOpsAnalysisService:
    def execute(
        self,
        *,
        site_id: str,
        ability_name: str,
        contract_version: str,
        input_payload: dict[str, Any],
        run_id: str,
    ) -> SiteOpsAnalysisExecutionResult:
        validate_site_ops_analysis_runtime_contract(
            ability_name=ability_name,
            contract_version=contract_version,
            input_payload=input_payload,
        )
        request_input = _dict(input_payload.get("input"))
        local_findings = _list(request_input.get("local_findings"))
        sample_summaries = _dict(request_input.get("sample_summaries"))
        blocked_items = _list(request_input.get("blocked_items"))
        priority_queue = _priority_queue(local_findings, sample_summaries)
        result = {
            "contract_version": SITE_OPS_ANALYSIS_RESULT_CONTRACT,
            "artifact_type": "site_ops_cloud_analysis_result",
            "status": "ready",
            "site_id": site_id,
            "analysis_id": f"site_ops_{_hash_text(f'{site_id}:{run_id}')[:24]}",
            "source": {
                "provider": "magick_ai_cloud",
                "provider_mode": "deterministic_site_ops_analyzer",
                "request_contract": contract_version,
                "source_pack_contract": _text(input_payload.get("source_pack_contract")),
                "request_id_hash": _hash_text(_text(input_payload.get("request_id"))),
            },
            "priority_queue": priority_queue,
            "trend_notes": _trend_notes(sample_summaries),
            "confidence": _confidence(sample_summaries, priority_queue),
            "blocked_items": _blocked_items(blocked_items, request_input),
            "core_handoff_candidates": _core_handoff_candidates(priority_queue),
            "operator_next_actions": _operator_next_actions(priority_queue, blocked_items),
            "safety": {
                "write_posture": "suggestion_only",
                "direct_wordpress_write": False,
                "core_proposal_created": False,
                "cloud_scheduler_truth": False,
                "wordpress_write_owner": "core_proposal_approval",
                "operator_review_required": True,
                "comment_text_returned": False,
                "private_comment_author_contact_returned": False,
                "private_comment_network_metadata_returned": False,
            },
            "write_posture": "suggestion_only",
            "direct_wordpress_write": False,
            "core_proposal_created": False,
        }
        return SiteOpsAnalysisExecutionResult(result_json=result)


def _priority_queue(
    local_findings: list[Any],
    sample_summaries: dict[str, Any],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for finding in local_findings:
        if not isinstance(finding, dict):
            continue
        priority_score = _coerce_int(finding.get("priority_score"))
        issue_type = _key(finding.get("issue_type"))
        score = min(100, priority_score + _issue_boost(issue_type, sample_summaries))
        reason_codes = _reason_codes(issue_type, sample_summaries)
        items.append(
            {
                "finding_id": _key(finding.get("id")) or "finding",
                "issue_type": issue_type,
                "severity": _key(finding.get("severity")) or _severity_from_score(score),
                "cloud_priority_score": score,
                "local_priority_score": priority_score,
                "reason_codes": reason_codes,
                "evidence_summary": _clean_text(finding.get("evidence_summary"), limit=600),
                "recommended_action": _clean_text(finding.get("recommended_action"), limit=600),
                "write_boundary": _key(finding.get("write_boundary")) or "suggestion_only",
                "source_refs": _source_refs(_list(finding.get("source_refs"))),
            }
        )
    items.sort(key=lambda item: (-int(item["cloud_priority_score"]), str(item["finding_id"])))
    for index, item in enumerate(items, start=1):
        item["rank"] = index
    return items[:8]


def _trend_notes(sample_summaries: dict[str, Any]) -> list[dict[str, Any]]:
    posts = _dict(sample_summaries.get("posts"))
    media = _dict(sample_summaries.get("media"))
    comments = _dict(sample_summaries.get("comments"))
    taxonomies = _dict(sample_summaries.get("taxonomies"))
    category = _dict(taxonomies.get("category"))
    tag = _dict(taxonomies.get("post_tag"))
    notes: list[dict[str, Any]] = []
    if _coerce_int(posts.get("stale_180d_count")) > 0:
        notes.append(
            {
                "id": "content_refresh_trend",
                "summary": "Sampled content includes stale public items that should be reviewed before new production.",
                "signal_count": _coerce_int(posts.get("stale_180d_count")),
            }
        )
    if _coerce_int(comments.get("question_like_count")) > 0:
        notes.append(
            {
                "id": "comment_question_trend",
                "summary": "Approved public comments show repeated question-like demand without exposing raw comment text.",
                "signal_count": _coerce_int(comments.get("question_like_count")),
            }
        )
    media_gap = _coerce_int(media.get("missing_alt_count")) + _coerce_int(
        media.get("referenced_alt_gap_count")
    )
    if media_gap > 0:
        notes.append(
            {
                "id": "media_metadata_trend",
                "summary": "Media metadata gaps are visible in attachment and referenced-image samples.",
                "signal_count": media_gap,
            }
        )
    taxonomy_gap = (
        _coerce_int(category.get("empty_count"))
        + _coerce_int(category.get("low_count"))
        + _coerce_int(tag.get("empty_count"))
        + _coerce_int(tag.get("low_count"))
    )
    if taxonomy_gap > 0:
        notes.append(
            {
                "id": "taxonomy_drift_trend",
                "summary": "Sparse or empty taxonomy terms may weaken discovery and recommendation quality.",
                "signal_count": taxonomy_gap,
            }
        )
    return notes


def _confidence(
    sample_summaries: dict[str, Any],
    priority_queue: list[dict[str, Any]],
) -> dict[str, Any]:
    posts = _dict(sample_summaries.get("posts"))
    media = _dict(sample_summaries.get("media"))
    comments = _dict(sample_summaries.get("comments"))
    sample_size = (
        _coerce_int(posts.get("sampled_count"))
        + _coerce_int(media.get("sampled_count"))
        + _coerce_int(comments.get("recent_sample_count"))
    )
    level = "low"
    if sample_size >= 30 and priority_queue:
        level = "high"
    elif sample_size >= 10 or priority_queue:
        level = "medium"
    return {
        "level": level,
        "sample_size": sample_size,
        "method": "deterministic_aggregate_signal_scoring",
        "limitations": [
            "No raw comment text was used.",
            "No private WordPress content was used.",
            "No WordPress writes or Core proposals were created.",
        ],
    }


def _blocked_items(blocked_items: list[Any], request_input: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in blocked_items:
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "id": _key(item.get("id")) or "blocked_item",
                "reason": _key(item.get("reason")) or "review_required",
                "next": _key(item.get("next")) or "operator_review",
            }
        )
    operator_context = _dict(request_input.get("operator_context"))
    if operator_context and not bool(operator_context.get("content_context_ready")):
        items.append(
            {
                "id": "site_context_brief",
                "reason": "content_context_incomplete",
                "next": "complete_site_context_before_repeating_analysis",
            }
        )
    return items[:8]


def _core_handoff_candidates(priority_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in priority_queue:
        if item.get("write_boundary") != "core_handoff_candidate":
            continue
        candidates.append(
            {
                "finding_id": item["finding_id"],
                "proposal_ready": False,
                "operator_review_required": True,
                "suggested_handoff": "prepare_core_proposal_after_operator_selection",
                "direct_wordpress_write": False,
                "core_proposal_created": False,
            }
        )
    return candidates[:5]


def _operator_next_actions(
    priority_queue: list[dict[str, Any]],
    blocked_items: list[Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    if blocked_items:
        actions.append(
            {
                "id": "clear_blockers",
                "label": "Review blocked prerequisites",
                "target": "blocked_items",
            }
        )
    for item in priority_queue[:3]:
        actions.append(
            {
                "id": f"review_{item['finding_id']}",
                "label": item.get("recommended_action") or "Review finding",
                "target": item["finding_id"],
            }
        )
    return actions[:5]


def _issue_boost(issue_type: str, sample_summaries: dict[str, Any]) -> int:
    posts = _dict(sample_summaries.get("posts"))
    media = _dict(sample_summaries.get("media"))
    comments = _dict(sample_summaries.get("comments"))
    if issue_type == "comments" and _coerce_int(comments.get("question_like_count")) >= 3:
        return 8
    if issue_type == "content_freshness" and _coerce_int(posts.get("commented_item_count")) > 0:
        return 6
    if issue_type == "media" and _coerce_int(media.get("missing_alt_count")) >= 5:
        return 6
    return 0


def _reason_codes(issue_type: str, sample_summaries: dict[str, Any]) -> list[str]:
    posts = _dict(sample_summaries.get("posts"))
    media = _dict(sample_summaries.get("media"))
    comments = _dict(sample_summaries.get("comments"))
    codes = [issue_type or "local_signal"]
    if _coerce_int(comments.get("question_like_count")) > 0:
        codes.append("comment_question_signal")
    if _coerce_int(posts.get("stale_180d_count")) > 0:
        codes.append("stale_content_signal")
    if _coerce_int(media.get("missing_alt_count")) > 0:
        codes.append("media_metadata_gap")
    return sorted(set(codes))


def _source_refs(refs: list[Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for ref in refs[:5]:
        if not isinstance(ref, dict):
            continue
        items.append(
            {
                "object_type": _key(ref.get("object_type")) or "post",
                "object_id": max(0, _coerce_int(ref.get("object_id"))),
                "title": _clean_text(ref.get("title"), limit=160),
            }
        )
    return items


def _severity_from_score(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def _key(value: Any) -> str:
    raw = _text(value).lower().replace(" ", "_")
    return "".join(ch for ch in raw if ch.isalnum() or ch in {"_", "-"})


def _clean_text(value: Any, *, limit: int) -> str:
    return " ".join(_text(value).split())[:limit]


def _coerce_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
