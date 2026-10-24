import pytest

from app.domain.portal_totp.codec import hotp, matched_counter, provisioning


@pytest.mark.parametrize(
    "timestamp,expected",
    [
        (59, "94287082"),
        (1111111109, "07081804"),
        (1111111111, "14050471"),
        (1234567890, "89005924"),
        (2000000000, "69279037"),
        (20000000000, "65353130"),
    ],
)
def test_rfc6238_sha1_vectors(timestamp, expected):
    seed = b"12345678901234567890"
    assert hotp(seed, timestamp // 30, digits=8) == expected
    assert hotp(seed, timestamp // 30) == expected[-6:]
    assert matched_counter(seed, expected[-6:], timestamp) == timestamp // 30


def test_window_is_exactly_one_step_and_strict_ascii():
    seed = b"12345678901234567890"
    for step in (99, 100, 101):
        assert matched_counter(seed, hotp(seed, step), 3000) == step
    for step in (98, 102):
        assert matched_counter(seed, hotp(seed, step), 3000) is None
    for bad in ("", "12345", "1234567", "１２３４５６", " 123456", "12e345"):
        assert matched_counter(seed, bad, 3000) is None
    key, uri = provisioning(seed, "a+b@example.test")
    assert key == "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # gitleaks:allow -- public RFC6238 test vector
    assert "algorithm=SHA1" in uri and "digits=6" in uri and "period=30" in uri
    assert "a%2Bb%40example.test" in uri
