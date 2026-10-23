#!/usr/bin/env python3
"""Select Ubuntu HTTPS archives for the disposable CI runner's E2E install.

Supports the runner-images Ubuntu deb822 layout, including its mirror+file
indirection. Security stanzas, mirrorlists, suites and signing options stay intact.
Unknown layouts fail before any write; this does not run apt or change retries.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ARCHIVE = "https://archive.ubuntu.com/ubuntu"
MIRROR_URI = "mirror+file:/etc/apt/apt-mirrors.txt"
DIRECT_ARCHIVES = {
    "http://azure.archive.ubuntu.com/ubuntu",
    "https://azure.archive.ubuntu.com/ubuntu",
    "http://archive.ubuntu.com/ubuntu",
    ARCHIVE,
}
MIRRORS = DIRECT_ARCHIVES | {"https://security.ubuntu.com/ubuntu"}


def _validate_mirrorlist(apt_root: Path) -> None:
    entries = []
    for line in (apt_root / "apt-mirrors.txt").read_text().splitlines():
        value = line.split("#", 1)[0].split()
        if not value:
            continue
        if value[0].rstrip("/") not in MIRRORS or any(
            re.fullmatch(r"priority:[0-9]+", option) is None for option in value[1:]
        ):
            raise ValueError("unrecognized Ubuntu archive mirrorlist")
        entries.append(value[0].rstrip("/"))
    if ARCHIVE not in entries:
        raise ValueError("Ubuntu HTTPS archive missing from mirrorlist")


def configure_archive(apt_root: Path) -> int:
    source = apt_root / "sources.list.d" / "ubuntu.sources"
    original = source.read_text()
    # Keep every byte outside the archive URIs values, including stanza separators.
    parts = re.split(r"(\n[ \t]*\n)", original)
    selected = 0
    for index in range(0, len(parts), 2):
        stanza = parts[index]
        fields: dict[str, str] = {}
        for line in stanza.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            match = re.fullmatch(r"([A-Za-z][A-Za-z-]*):[ \t]*(.*)", line)
            if match is None or match[1].lower() in fields:
                raise ValueError("unrecognized Ubuntu deb822 fields")
            fields[match[1].lower()] = match[2].strip()
        if not fields or fields.get("enabled", "yes").lower() == "no":
            continue
        suites = fields.get("suites", "").split()
        if not suites:
            raise ValueError("Ubuntu suites missing")
        security = [suite.endswith("-security") for suite in suites]
        if all(security):
            continue
        if any(security):
            raise ValueError("mixed Ubuntu archive/security stanza")
        if (
            not fields.get("signed-by")
            or not fields.get("components")
            or not fields.get("types")
            or not set(fields["types"].split()) <= {"deb", "deb-src"}
            or any(re.fullmatch(r"[a-z]+(?:-updates|-backports)?", s) is None for s in suites)
        ):
            raise ValueError("unrecognized Ubuntu archive stanza")
        uri = fields.get("uris", "")
        if uri == MIRROR_URI:
            _validate_mirrorlist(apt_root)
        elif uri.rstrip("/") not in DIRECT_ARCHIVES:
            raise ValueError("unrecognized Ubuntu archive URI")
        parts[index], count = re.subn(
            r"(?im)^(URIs:[ \t]*)\S+([ \t]*)$",
            lambda match: match[1] + ARCHIVE + match[2],
            stanza,
        )
        if count != 1:
            raise ValueError("unrecognized Ubuntu archive URIs field")
        selected += 1
    if not selected:
        raise ValueError("no supported Ubuntu archive stanza")
    updated = "".join(parts)
    if updated != original:
        source.write_text(updated)
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apt-root", type=Path, default=Path("/etc/apt"))
    args = parser.parse_args()
    try:
        selected = configure_archive(args.apt_root)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Ubuntu archive selection failed: {error}\n")
    print(f"Selected {ARCHIVE} for {selected} Ubuntu archive stanza(s); security unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
