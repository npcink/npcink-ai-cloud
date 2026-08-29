from __future__ import annotations

import re
from typing import Any

_ASCII_TERM = re.compile(r"[a-z0-9][a-z0-9._+-]{1,31}")
_CJK_SEQUENCE = re.compile(r"[\u3400-\u9fff]{3,64}")
_GENERIC_TERMS = frozenset(
    {
        "article",
        "content",
        "page",
        "post",
        "文章",
        "内容",
        "相关内容",
        "相关主题",
        "站点内容",
    }
)


def shared_text_terms(query: str, candidate_text: str, *, limit: int) -> list[str]:
    normalized_query = str(query or "").lower()
    normalized_candidate = str(candidate_text or "").lower()
    shared: list[str] = []
    for term in _ASCII_TERM.findall(normalized_query):
        if term not in _GENERIC_TERMS and term in normalized_candidate and term not in shared:
            shared.append(term)

    cjk_matches: list[tuple[int, int, str]] = []
    for sequence_match in _CJK_SEQUENCE.finditer(normalized_query):
        sequence = sequence_match.group(0)
        for size in range(min(8, len(sequence)), 2, -1):
            for offset in range(0, len(sequence) - size + 1):
                term = sequence[offset : offset + size]
                if term in _GENERIC_TERMS or term not in normalized_candidate:
                    continue
                cjk_matches.append((sequence_match.start() + offset, -size, term))

    selected_cjk: list[str] = []
    for _, _, term in sorted(set(cjk_matches), key=lambda item: (item[1], item[0], item[2])):
        if any(term in selected for selected in selected_cjk):
            continue
        selected_cjk.append(term)
    shared.extend(term for term in selected_cjk if term not in shared)
    return shared[: max(0, limit)]


def shared_topic_terms(query: str, taxonomies: object, *, limit: int) -> list[str]:
    if not isinstance(taxonomies, dict):
        return []
    normalized_query = str(query or "").lower()
    shared: list[str] = []
    for taxonomy in ("category", "post_tag"):
        values = taxonomies.get(taxonomy)
        if not isinstance(values, list):
            continue
        for value in values:
            term = " ".join(str(value or "").lower().split())
            if len(term) < 2 or term in _GENERIC_TERMS or term not in normalized_query:
                continue
            if term not in shared:
                shared.append(term)
    return shared[: max(0, limit)]


def semantic_score(candidate: dict[str, object]) -> float:
    if candidate.get("reranked") is True:
        return coerce_score(candidate.get("rerank_score"))
    return coerce_score(candidate.get("score"))


def semantic_source(candidate: dict[str, object]) -> str:
    return "provider_rerank" if candidate.get("reranked") is True else "vector"


def coerce_score(value: Any) -> float:
    return max(0.0, min(1.0, coerce_float(value)))


def coerce_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def coerce_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
