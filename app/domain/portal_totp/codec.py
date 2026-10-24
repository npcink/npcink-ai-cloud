"""Fixed RFC6238 profile; persistence, replay and rate policy belong to the UoW."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import struct
from urllib.parse import quote, urlencode


def hotp(seed: bytes, counter: int, *, digits: int = 6) -> str:
    if not seed or counter < 0 or digits not in (6, 8):
        raise ValueError("invalid OTP input")
    digest = hmac.digest(seed, struct.pack(">Q", counter), hashlib.sha1)
    offset = digest[-1] & 15
    number = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(number % (10**digits)).zfill(digits)


def matched_counter(seed: bytes, code: str, timestamp: float) -> int | None:
    if re.fullmatch(r"[0-9]{6}", code) is None or timestamp < 0:
        return None
    step = int(timestamp) // 30
    # Prefer the largest matching counter on the rare cross-window collision.
    matches = [
        c for c in range(max(0, step - 1), step + 2) if hmac.compare_digest(hotp(seed, c), code)
    ]
    return max(matches) if matches else None


def provisioning(seed: bytes, label: str) -> tuple[str, str]:
    encoded = base64.b32encode(seed).decode("ascii").rstrip("=")
    uri = (
        "otpauth://totp/"
        + quote("Npcink:" + label, safe="")
        + "?"
        + urlencode(
            {
                "secret": encoded,
                "issuer": "Npcink",
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
            }
        )
    )
    return encoded, uri
