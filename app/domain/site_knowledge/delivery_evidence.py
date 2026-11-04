"""Validate legacy excerpts and bounded full-body WordPress projections."""

from typing import Any

from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation


def normalize_delivery_evidence(value: object, received_text: object) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or not isinstance(received_text, str):
        raise SiteKnowledgeContractViolation(
            "site_knowledge.invalid_delivery_evidence", "Invalid public text delivery evidence"
        )
    byte_limits = {"wordpress_public_text_bytes.v1": 1800, "wordpress_public_text_bytes.v2": 48000}
    projection = value.get("projection_version")
    max_bytes = byte_limits.get(projection) if isinstance(projection, str) else None
    expected = {
        "contract_version": "site_knowledge_delivery_evidence.v1",
        "projection_version": projection,
        "length_basis": "sanitized_public_text_before_byte_limit",
    }
    fields = ("source_bytes", "source_chars", "delivered_bytes", "delivered_chars", "max_bytes")
    valid = (
        max_bytes is not None
        and all(value.get(k) == v for k, v in expected.items())
        and all(type(value.get(k)) is int and 0 <= value[k] <= 10_000_000 for k in fields)
        and type(value.get("truncated")) is bool
    )
    if valid:
        valid = (
            value["max_bytes"] == max_bytes
            and value["delivered_bytes"] == len(received_text.encode("utf-8"))
            and value["delivered_chars"] == len(received_text)
            and value["delivered_bytes"] <= value["max_bytes"]
            and value["source_bytes"] >= value["delivered_bytes"]
            and value["source_chars"] >= value["delivered_chars"]
            and value["source_bytes"] >= value["source_chars"]
            and value["source_bytes"] <= 4 * value["source_chars"]
            and value["truncated"] == (value["source_bytes"] > value["delivered_bytes"])
            and value["truncated"] == (value["source_bytes"] > value["max_bytes"])
            and (not value["truncated"] or value["delivered_bytes"] >= value["max_bytes"] - 3)
            and (not value["truncated"] or value["source_chars"] > value["delivered_chars"])
            and (value["truncated"] or value["source_chars"] == value["delivered_chars"])
        )
    if not valid:
        raise SiteKnowledgeContractViolation(
            "site_knowledge.invalid_delivery_evidence", "Invalid public text delivery evidence"
        )
    return {**expected, **{key: value[key] for key in fields}, "truncated": value["truncated"]}
