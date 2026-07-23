#!/usr/bin/env python3
"""Redact common credentials before remote preview logs leave the M4."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

SENSITIVE_KEY = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|private[_-]?key|"
    r"authorization|cookie|database[_-]?url|smtp)",
    re.IGNORECASE,
)
NAMED_VALUE = re.compile(
    r"(?i)\b(secret|token|password|passwd|api[_-]?key|private[_-]?key|"
    r"authorization|cookie)\b(\s*[:=]\s*)([^\s,;]+)"
)
AUTH_HEADER = re.compile(r"(?i)\b(authorization\s*:\s*)([^\r\n]+)")
URL = re.compile(r"\b(?:postgresql(?:\+psycopg)?|redis|https?)://[^\s\"'<>]+")
PEM = re.compile(
    r"-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----.*?"
    r"-----END [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----",
    re.DOTALL,
)


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_secret_values(paths: list[Path]) -> list[str]:
    values: set[str] = set()
    for path in paths:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError):
            continue
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if not SENSITIVE_KEY.search(key):
                continue
            candidate = _unquote(value)
            if len(candidate) >= 8:
                values.add(candidate)
    return sorted(values, key=len, reverse=True)


def redact_url(match: re.Match[str]) -> str:
    raw = match.group(0)
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return "[redacted-url]"
    hostname = parsed.hostname or ""
    if parsed.port:
        hostname = f"{hostname}:{parsed.port}"
    netloc = hostname
    if parsed.username is not None or parsed.password is not None:
        netloc = f"[redacted]@{hostname}"
    return urlunsplit(
        (parsed.scheme, netloc, parsed.path, "[redacted]" if parsed.query else "", "")
    )


def redact(text: str, secret_values: list[str]) -> str:
    sanitized = text
    for value in secret_values:
        sanitized = sanitized.replace(value, "[redacted]")
    sanitized = PEM.sub("[redacted-pem]", sanitized)
    sanitized = AUTH_HEADER.sub(r"\1[redacted]", sanitized)
    sanitized = NAMED_VALUE.sub(r"\1\2[redacted]", sanitized)
    return URL.sub(redact_url, sanitized)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", action="append", default=[])
    args = parser.parse_args()
    secret_values = load_secret_values([Path(value) for value in args.env_file])
    for line in sys.stdin:
        sys.stdout.write(redact(line, secret_values))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
