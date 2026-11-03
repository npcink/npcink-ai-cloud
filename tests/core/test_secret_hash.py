from __future__ import annotations

import hashlib

from app.core.security import (
    SECRET_HASH_ALGORITHM,
    SECRET_HASH_ITERATIONS,
    SECRET_HASH_SALT,
    build_secret_hash,
    derive_stable_secret_digest,
    verify_secret_hash,
)


def test_build_secret_hash_uses_per_secret_salt_and_stays_under_column_limit() -> None:
    first = build_secret_hash("site-api-secret")
    second = build_secret_hash("site-api-secret")

    assert first != second
    assert first.startswith(f"{SECRET_HASH_ALGORITHM}${SECRET_HASH_ITERATIONS}$")
    assert len(first.split("$")) == 4
    assert len(first) <= 191
    assert verify_secret_hash("site-api-secret", first)
    assert verify_secret_hash("site-api-secret", second)
    assert not verify_secret_hash("other-secret", first)


def test_verify_secret_hash_accepts_legacy_global_salt_format() -> None:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        b"legacy-secret",
        SECRET_HASH_SALT,
        SECRET_HASH_ITERATIONS,
    ).hex()
    legacy = f"{SECRET_HASH_ALGORITHM}${SECRET_HASH_ITERATIONS}${digest}"

    assert len(legacy.split("$")) == 3
    assert verify_secret_hash("legacy-secret", legacy)
    assert not verify_secret_hash("wrong", legacy)


def test_derive_stable_secret_digest_is_deterministic() -> None:
    first = derive_stable_secret_digest("callback-material")
    second = derive_stable_secret_digest("callback-material")

    assert first == second
    assert len(first.split("$")) == 3
    assert verify_secret_hash("callback-material", first)
