from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote, urlsplit

_WORDPRESS_IMAGE_SIZE_SUFFIX = re.compile(r"-(?:\d{2,5}x\d{2,5}|scaled)(?=\.[^.]+$)")
_NON_SEARCH_CHARACTER = re.compile(r"[^0-9a-z\u3400-\u9fff]+")
_CJK_CHARACTER = re.compile(r"[\u3400-\u9fff]")
_LOW_SIGNAL_CJK_CHARACTERS = frozenset("的一是在有和与及图图片")


def rank_media_search_results(
    query: str,
    results: list[dict[str, object]],
) -> list[dict[str, object]]:
    ranked: list[dict[str, object]] = []
    for result in results:
        candidate = dict(result)
        evidence = _media_lexical_evidence(
            query=query,
            title=str(candidate.get("title") or ""),
            chunk=str(candidate.get("chunk") or ""),
        )
        semantic_score = _coerce_score(candidate.get("score"))
        lexical_score = _coerce_score(evidence["lexical_score"])
        candidate["media_ranking"] = {
            **evidence,
            "strategy": "semantic_plus_bounded_lexical",
            "semantic_score": round(semantic_score, 4),
            "hybrid_score": round(min(1.0, semantic_score + lexical_score), 4),
        }
        ranked.append(candidate)

    return sorted(
        ranked,
        key=lambda result: (
            0 if bool(result.get("exact_query_match")) else 1,
            -_media_hybrid_score(result),
            -_coerce_score(result.get("score")),
            _coerce_int(result.get("source_id") or result.get("post_id")),
        ),
    )


def collapse_media_search_duplicates(
    results: list[dict[str, object]],
) -> tuple[list[dict[str, object]], int]:
    unique: list[dict[str, object]] = []
    seen_media_keys: set[str] = set()
    duplicate_count = 0
    for result in results:
        media_key = _canonical_wordpress_media_key(str(result.get("url") or ""))
        if media_key and media_key in seen_media_keys:
            duplicate_count += 1
            continue
        if media_key:
            seen_media_keys.add(media_key)
        unique.append(result)
    return unique, duplicate_count


def _media_lexical_evidence(*, query: str, title: str, chunk: str) -> dict[str, object]:
    normalized_query = _normalize_search_text(query)
    normalized_title = _normalize_search_text(title)
    normalized_chunk = _normalize_search_text(chunk)
    if not normalized_query:
        return {
            "lexical_score": 0.0,
            "exact_phrase_match": False,
            "query_unit_matches": 0,
            "query_unit_count": 0,
        }

    exact_title = normalized_query in normalized_title
    exact_chunk = normalized_query in normalized_chunk
    query_units = _query_units(normalized_query)
    haystack = f"{normalized_title} {normalized_chunk}"
    unit_matches = sum(1 for unit in query_units if unit in haystack)
    unit_coverage = unit_matches / len(query_units) if query_units else 0.0

    lexical_score = 0.0
    if exact_title:
        lexical_score += 0.16
    elif exact_chunk:
        lexical_score += 0.12
    lexical_score += min(0.08, unit_coverage * 0.08)

    cjk_query = [
        character
        for character in normalized_query
        if _CJK_CHARACTER.fullmatch(character)
        and character not in _LOW_SIGNAL_CJK_CHARACTERS
    ]
    if 1 < len(cjk_query) <= 8:
        cjk_matches = len({character for character in cjk_query if character in haystack})
        cjk_coverage = cjk_matches / len(set(cjk_query))
        if cjk_coverage >= 0.5:
            lexical_score += min(0.08, cjk_coverage * 0.16)

    return {
        "lexical_score": round(min(0.2, lexical_score), 4),
        "exact_phrase_match": bool(exact_title or exact_chunk),
        "query_unit_matches": unit_matches,
        "query_unit_count": len(query_units),
    }


def _query_units(normalized_query: str) -> list[str]:
    return list(
        dict.fromkeys(
            unit
            for unit in normalized_query.split()
            if len(unit) >= 2
        )
    )


def _normalize_search_text(value: str) -> str:
    return " ".join(
        part
        for part in _NON_SEARCH_CHARACTER.sub(" ", str(value or "").lower()).split()
        if part
    )


def _canonical_wordpress_media_key(url: str) -> str:
    try:
        parsed = urlsplit(str(url or "").strip())
    except ValueError:
        return ""
    host = str(parsed.hostname or "").lower()
    path = unquote(parsed.path or "")
    if not host or not path:
        return ""
    canonical_path = _WORDPRESS_IMAGE_SIZE_SUFFIX.sub("", path)
    return f"{host}{canonical_path}"


def _media_hybrid_score(result: dict[str, object]) -> float:
    ranking = result.get("media_ranking")
    if not isinstance(ranking, dict):
        return _coerce_score(result.get("score"))
    return _coerce_score(ranking.get("hybrid_score"))


def _coerce_score(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _coerce_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
