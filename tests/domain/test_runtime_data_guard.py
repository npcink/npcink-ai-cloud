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
