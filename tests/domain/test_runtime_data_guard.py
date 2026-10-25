from __future__ import annotations

import pytest

from app.domain.runtime.data_guard import find_runtime_data_guard_finding


@pytest.mark.parametrize(
    "value",
    (
        "art_0123456789abcdef0123456789abcdef",
        "run_0123456789abcdef0123456789abcdef",
        "mgs_0123456789abcdef01234567",
        "rev_0123456789abcdef01234567",
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ),
)
def test_contract_opaque_value_is_not_misclassified_as_pii(value: str) -> None:
    finding = find_runtime_data_guard_finding({"value": value})

    assert finding is None


def test_artifact_id_exemption_requires_full_canonical_match() -> None:
    finding = find_runtime_data_guard_finding(
        {"value": "prefix-art_0123456789abcdef0123456789abcdef"}
    )

    assert finding is not None
    assert finding.kind == "pii"


def test_revision_exemption_requires_exact_hex_length() -> None:
    finding = find_runtime_data_guard_finding({"value": "rev_0123456789abcdef012345678"})

    assert finding is not None
    assert finding.kind == "pii"


def test_run_id_exemption_requires_full_canonical_match() -> None:
    finding = find_runtime_data_guard_finding(
        {"value": "prefix-run_0123456789abcdef0123456789abcdef"}
    )

    assert finding is not None
    assert finding.kind == "pii"


def test_artifact_id_exemption_does_not_change_secret_field_detection() -> None:
    finding = find_runtime_data_guard_finding(
        {"api_key": "art_0123456789abcdef0123456789abcdef"}
    )

    assert finding is not None
    assert finding.kind == "secret"
    assert finding.code == "secret_field"


_MEDIA_DIGEST = "a" * 27 + "1234567890" + "b" * 27
_SYNC_CONTEXT = {
    "ability_name": "npcink-cloud/site-knowledge-sync",
    "contract_version": "site_knowledge_sync.v1",
}


def test_canonical_media_digest_uses_exact_contract_field_only() -> None:
    payload = {
        "contract_version": "site_knowledge_sync.v1",
        "media_items": [{"media_fingerprint": _MEDIA_DIGEST}],
    }

    assert find_runtime_data_guard_finding(payload, **_SYNC_CONTEXT) is None
    finding = find_runtime_data_guard_finding(payload)
    assert finding is not None and finding.kind == "pii"


@pytest.mark.parametrize(
    "value",
    (
        _MEDIA_DIGEST[:-1],
        _MEDIA_DIGEST + "b",
        _MEDIA_DIGEST.upper(),
        " " + _MEDIA_DIGEST,
        _MEDIA_DIGEST + "\n",
        "g" + _MEDIA_DIGEST[1:],
        "prefix-" + _MEDIA_DIGEST,
        "+1 202-555-0198",
        "person@example.com",
    ),
)
def test_media_digest_recognition_rejects_noncanonical_values(value: str) -> None:
    finding = find_runtime_data_guard_finding(
        {
            "contract_version": "site_knowledge_sync.v1",
            "media_items": [{"media_fingerprint": value}],
        },
        **_SYNC_CONTEXT,
    )

    assert finding is not None and finding.kind == "pii"


@pytest.mark.parametrize(
    "payload",
    (
        {"text": _MEDIA_DIGEST},
        {"media_fingerprint": _MEDIA_DIGEST},
        {"media_items[0].media_fingerprint": _MEDIA_DIGEST},
        {"media_items": {"0": {"media_fingerprint": _MEDIA_DIGEST}}},
        {"media_items": {0: {"media_fingerprint": _MEDIA_DIGEST}}},
        {"media_items": [{" media_fingerprint ": _MEDIA_DIGEST}]},
        {" media_items ": [{"media_fingerprint": _MEDIA_DIGEST}]},
        {"media_items": [{"media_fingerprint": {"value": _MEDIA_DIGEST}}]},
        {"wrapper": {"media_items": [{"media_fingerprint": _MEDIA_DIGEST}]}},
        {"documents": [{"media_fingerprint": _MEDIA_DIGEST}]},
    ),
)
def test_digest_in_other_or_spoofed_structural_paths_remains_pii(payload: dict) -> None:
    finding = find_runtime_data_guard_finding(
        {"contract_version": "site_knowledge_sync.v1", **payload}, **_SYNC_CONTEXT
    )

    assert finding is not None and finding.kind == "pii"


@pytest.mark.parametrize("field", ("title", "alt", "caption", "description", "url"))
@pytest.mark.parametrize("value", (_MEDIA_DIGEST, "+1 202-555-0198"))
def test_media_text_and_url_are_still_checked_after_digest(field: str, value: str) -> None:
    finding = find_runtime_data_guard_finding(
        {
            "contract_version": "site_knowledge_sync.v1",
            "media_items": [{"media_fingerprint": _MEDIA_DIGEST, field: value}],
        },
        **_SYNC_CONTEXT,
    )

    assert finding is not None and finding.kind == "pii"
    assert finding.path == f"input.media_items[0].{field}"


@pytest.mark.parametrize(
    ("ability", "outer", "inner"),
    (
        ("other-ability", "site_knowledge_sync.v1", "site_knowledge_sync.v1"),
        ("npcink-cloud/site-knowledge-search", "site_knowledge_sync.v1", "site_knowledge_sync.v1"),
        ("npcink-cloud/site-knowledge-sync", "other.v1", "site_knowledge_sync.v1"),
        ("npcink-cloud/site-knowledge-sync", "site_knowledge_sync.v1", "other.v1"),
        ("npcink-cloud/site-knowledge-sync", "site_knowledge_sync.v1", ""),
    ),
)
def test_media_digest_recognition_requires_matching_sync_context(
    ability: str, outer: str, inner: str
) -> None:
    finding = find_runtime_data_guard_finding(
        {"contract_version": inner, "media_items": [{"media_fingerprint": _MEDIA_DIGEST}]},
        ability_name=ability,
        contract_version=outer,
    )

    assert finding is not None and finding.kind == "pii"


@pytest.mark.parametrize(
    ("field", "value", "code"),
    (
        ("api_key", _MEDIA_DIGEST, "secret_field"),
        ("media_fingerprint", "mak1_" + "a" * 59, "secret_value"),
        ("alt", "sk-" + "a" * 40, "secret_value"),
    ),
)
def test_media_digest_recognition_preserves_secret_checks(
    field: str, value: str, code: str
) -> None:
    finding = find_runtime_data_guard_finding(
        {
            "contract_version": "site_knowledge_sync.v1",
            "media_items": [{"media_fingerprint": _MEDIA_DIGEST, field: value}],
        },
        **_SYNC_CONTEXT,
    )

    assert finding is not None and finding.kind == "secret" and finding.code == code
