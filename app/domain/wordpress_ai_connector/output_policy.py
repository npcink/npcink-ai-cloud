"""Bounded budgets and completion checks for transformations and summaries."""

from typing import Any

from app.adapters.providers.compatibility import estimate_text_tokens

TRANSFORMATION_TASKS = frozenset({"content_rewrite", "content_translation", "editorial_updates"})
MAX_TRANSFORMATION_OUTPUT_TOKENS = 65536
MAX_TRANSFORMATION_OUTPUT_CHARS = 75000
SUMMARY_OUTPUT_TOKENS = 512
MAX_SUMMARY_OUTPUT_CHARS = 2000


def transformation_token_budget(source: str) -> int:
    # Use the existing conservative Unicode estimate and leave expansion headroom.
    return min(
        MAX_TRANSFORMATION_OUTPUT_TOKENS,
        max(512, (estimate_text_tokens(source) * 5 + 3) // 4 + 256),
    )


def completion_failure(
    input_payload: dict[str, Any],
    output: dict[str, Any],
    *,
    finish_reason: str | None = None,
    extracted_text: str = "",
) -> str:
    metadata = input_payload.get("metadata")
    if not isinstance(metadata, dict):
        return ""
    task = metadata.get("task")
    if task not in TRANSFORMATION_TASKS and task != "content_summary":
        return ""
    if output.get("response_status") in {"incomplete", "failed", "cancelled"}:
        return "provider.output_incomplete"
    if finish_reason is not None and finish_reason.lower() not in {
        "stop",
        "end_turn",
        "stop_sequence",
        "completed",
        "complete",
        "end",
    }:
        return "provider.output_incomplete"
    limit = (
        MAX_SUMMARY_OUTPUT_CHARS if task == "content_summary" else MAX_TRANSFORMATION_OUTPUT_CHARS
    )
    text = output.get("output_text")
    if (
        isinstance(text, str) and len(text) > limit
    ) or len(extracted_text) > limit:
        return "provider.output_too_large"
    return ""
