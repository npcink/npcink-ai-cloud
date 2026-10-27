"""Bounded evidence for offline link review; never a ranker or an Apply gate."""

from __future__ import annotations

import hashlib
import ipaddress
import re
from typing import Any
from urllib.parse import urlsplit

CONTEXT_VERSION = "internal_link_context_preview.v1"
MAX_CANDIDATES = 10
MAX_TARGET_CHARS = 50000
WINDOW_CHARS = 900


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _span(text: str, start: int, end: int, *, digest: str | None = None) -> dict[str, Any]:
    return {
        "text": text[start:end],
        "start": start,
        "end": end,
        "text_sha256": digest if digest is not None else text_sha256(text),
        "text_chars": len(text),
    }


def _occurrences(text: str, anchor: str) -> list[int]:
    return [m.start() for m in re.finditer(f"(?={re.escape(anchor)})", text)] if anchor else []


def _windows(text: str, anchor: str, digest: str) -> list[dict[str, Any]]:
    """Show two exact lexical locations, explicitly without a support verdict."""
    windows: list[dict[str, Any]] = []
    for position in _occurrences(text, anchor):
        if windows and position < windows[-1]["end"]:
            continue
        start = max(0, position - WINDOW_CHARS // 3)
        end = min(len(text), start + WINDOW_CHARS)
        windows.append({
            **_span(text, start, end, digest=digest), "basis": "literal_anchor_occurrence",
        })
        if len(windows) == 2:
            break
    return windows


def _public_references(text: str) -> list[str]:
    """Literal public URL tokens only; no fetching or resource-identity inference."""
    urls: list[str] = []
    for match in re.finditer(r'https?://[^\s<>"\'，。；：！？、]+', text):
        value = match.group().rstrip(".,;:!?)]}")
        try:
            parsed = urlsplit(value)
            host = (parsed.hostname or "").lower()
            if (
                not host
                or parsed.username is not None
                or parsed.password is not None
                or parsed.query
                or parsed.fragment
                or parsed.port not in {None, 80, 443}
                or "." not in host
                or host.endswith((".local", ".localhost", ".test", ".invalid", ".example"))
                or len(value) > 500
            ):
                continue
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                address = None
            if address is not None and not address.is_global:
                continue
        except ValueError:
            continue
        if value not in urls:
            urls.append(value)
        if len(urls) == 8:
            break
    return urls


def _source_context(
    result: dict[str, Any], source_passages: list[str], anchor: str
) -> dict[str, Any]:
    evidence = result.get("anchor_evidence")
    index = evidence.get("source_passage_index") if isinstance(evidence, dict) else None
    if not anchor:
        return {"status": "missing_anchor"}
    if type(index) is not int or not 0 <= index < len(source_passages):
        return {"status": "missing_source_location"}
    passage = source_passages[index]
    positions = _occurrences(passage, anchor)
    if not positions:
        return {"status": "anchor_not_in_source", "passage_index": index}
    return {
        "status": "located" if len(positions) == 1 else "ambiguous_occurrence",
        "passage_index": index,
        "passage": _span(passage, 0, len(passage)),
        "occurrence_count": len(positions),
        "anchor_spans": [{"start": p, "end": p + len(anchor)} for p in positions[:8]],
    }


def build_internal_link_context_preview(
    *,
    results: list[dict[str, Any]],
    source_passages: list[str],
    target_documents: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    """Project already-ranked, same-site public results without changing them.

    The caller owns site authorization and freshness. Optional target documents
    must be the existing public, sanitized ingestion projection, never raw HTML.
    Missing/stale evidence remains explicit. Offsets count Unicode code points
    in the exact supplied text (not HTML, UTF-8 bytes or editor block offsets).
    """
    if len(results) > MAX_CANDIDATES:
        raise ValueError("context_candidate_limit")
    if (
        len(source_passages) > 24
        or any(not isinstance(p, str) or not p.strip() or len(p) > 1200
               for p in source_passages)
        or sum(map(len, source_passages)) > 12000
    ):
        raise ValueError("context_source_limit")
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()
    for rank, result in enumerate(results):
        post_id = result.get("post_id")
        chunk_index = result.get("chunk_index")
        source_type = result.get("source_type")
        if (
            type(post_id) is not int or post_id < 1
            or source_type not in {"post", "page"}
            or type(chunk_index) is not int or chunk_index < 0
        ):
            raise ValueError("context_candidate_identity")
        key = (source_type, post_id, chunk_index)
        if key in seen:
            raise ValueError("context_duplicate_candidate")
        seen.add(key)
        title, url, chunk = (result.get(k, "") for k in ("title", "url", "chunk"))
        anchor = result.get("anchor_or_context", "")
        if (
            any(not isinstance(v, str) for v in (title, url, chunk, anchor))
            or len(title) > 500 or len(url) > 2000
            or len(chunk) > 1200 or len(anchor) > 80
        ):
            raise ValueError("context_candidate_text")
        source = _source_context(result, source_passages, anchor)
        target: dict[str, Any] = {
            "title": title,
            "retrieved_chunk": {**_span(chunk, 0, len(chunk)), "chunk_index": chunk_index},
            "document_status": "missing_document",
            "anchor_passages": [],
        }
        document = target_documents.get(post_id)
        body = ""
        if document is not None:
            if (
                type(document.get("post_id")) is not int or document["post_id"] != post_id
                or document.get("post_status") != "publish"
                or document.get("post_type") != source_type
                or document.get("title") != title or document.get("url") != url
            ):
                target["document_status"] = "document_identity_mismatch"
            else:
                supplied = document.get("content_excerpt")
                if not isinstance(supplied, str) or len(supplied) > MAX_TARGET_CHARS:
                    raise ValueError("context_target_limit")
                body = supplied
                body_hash = text_sha256(body)
                target.update({
                    "document_status": "available" if body else "empty_document",
                    "document_text_sha256": body_hash,
                    "document_text_chars": len(body),
                    "anchor_passages": _windows(body, anchor, body_hash),
                    "document_scope": "supplied_bounded_ingestion_text",
                })
        passage = source.get("passage", {}).get("text", "")
        source_refs = _public_references(passage)
        target_refs = _public_references(body or chunk)
        candidates.append({
            "input_rank": rank,
            "post_id": post_id,
            "source_type": source_type,
            "chunk_index": chunk_index,
            "anchor": anchor,
            "source": source,
            "target": target,
            "references": {
                "source_literal_urls": source_refs,
                "target_literal_urls": target_refs,
                "shared_literal_urls": [u for u in source_refs if u in target_refs],
                "identity_status": "not_established",
                "basis": "literal_urls_are_not_resource_identity_proof",
            },
            "semantic_support": "not_assessed",
        })
    return {
        "contract_version": CONTEXT_VERSION,
        "intent": "internal_links",
        "write_posture": "suggestion_only",
        "apply_authority": False,
        "ranking_changed": False,
        "candidates": candidates,
    }
