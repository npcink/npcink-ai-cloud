"""Validate counters for the existing WordPress text projection."""

from typing import Any

from app.domain.site_knowledge.contracts import SiteKnowledgeContractViolation


def normalize_delivery_evidence(value: object, received_text: object) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or not isinstance(received_text, str):
        raise SiteKnowledgeContractViolation(
            "site_knowledge.invalid_delivery_evidence", "Invalid public text delivery evidence"
        )
    expected = {
        "contract_version": "site_knowledge_delivery_evidence.v1",
        "projection_version": "wordpress_public_text_bytes.v1",
        "length_basis": "sanitized_public_text_before_byte_limit",
    }
    fields = ("source_bytes", "source_chars", "delivered_bytes", "delivered_chars", "max_bytes")
    valid = (
        all(value.get(k) == v for k, v in expected.items())
        and all(type(value.get(k)) is int and 0 <= value[k] <= 10_000_000 for k in fields)
        and type(value.get("truncated")) is bool
    )
    if valid:
        valid = (
            value["max_bytes"] == 1800
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
