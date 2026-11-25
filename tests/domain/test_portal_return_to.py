from __future__ import annotations

import pytest

from app.domain.commercial.mixins._portal_mixin import _sanitize_portal_return_to


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("", "/portal"),
        ("/portal", "/portal"),
        ("/portal/account", "/portal/account"),
        ("/portal/account?tab=orders", "/portal/account?tab=orders"),
        ("/portal/account#payment-orders", "/portal/account#payment-orders"),
        ("/portal/account?payment_return=alipay#payment-orders",
         "/portal/account?payment_return=alipay#payment-orders"),
        ("/portal/account/../usage", "/portal/usage"),
        ("/portal/../admin", "/portal"),
        ("/portal/%2e%2e/admin", "/portal"),
        ("/portal/%2E%2E/%2e%2e/admin", "/portal"),
        ("/portal%2f%2e%2e/admin", "/portal"),
        ("//evil.example", "/portal"),
        ("https://evil.example/phish", "/portal"),
        ("http://evil.example/portal", "/portal"),
        ("/portalism", "/portal"),
        ("/admin", "/portal"),
        ("\\portal", "/portal"),
        ("/portal/" + ("a" * 300), "/portal"),
    ],
)
def test_sanitize_portal_return_to_rejects_traversal_and_keeps_safe_targets(
    value: str,
    expected: str,
) -> None:
    assert _sanitize_portal_return_to(value) == expected
