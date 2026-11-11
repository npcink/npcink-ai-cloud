#!/usr/bin/env python3
"""Filter only reviewed, immutable handoff-report CodeQL false positives."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "app/ops/live_site_save_verify_handoff.py"
SOURCE_SHA256 = "63679b69d1f7300ce8263ee10ef9b931f799a3a206a67d9b5acd32d045dbbeee"
# _secret_summary returns public IDs and presence/length metadata, not credentials.
# These exact sinks write that redacted report or print its readiness projection.
REVIEWED_LOCATIONS = {
    ("py/clear-text-storage-sensitive-data", 195, 195),
    ("py/clear-text-storage-sensitive-data", 198, 198),
    ("py/clear-text-logging-sensitive-data", 303, 311),
}


def is_reviewed(result: dict, root: Path) -> bool:
    locations = result.get("locations", [])
    if len(locations) != 1:
        return False
    physical = locations[0].get("physicalLocation", {})
    uri = unquote(physical.get("artifactLocation", {}).get("uri", ""))
    if uri != SOURCE:
        return False
    region = physical.get("region", {})
    location = (result.get("ruleId"), region.get("startLine"), region.get("endLine"))
    if location not in REVIEWED_LOCATIONS:
        return False
    source = root / SOURCE
    return source.is_file() and hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256


def filter_sarif(path: Path, root: Path) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    removed = 0
    for run in payload["runs"]:
        kept = []
        for result in run.get("results", []):
            if is_reviewed(result, root):
                removed += 1
            else:
                kept.append(result)
        run["results"] = kept
    path.write_text(json.dumps(payload), encoding="utf-8")
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sarif_directory", type=Path)
    args = parser.parse_args()
    paths = sorted(args.sarif_directory.glob("*.sarif"))
    if not paths:
        raise SystemExit("CodeQL produced no SARIF files; refusing an empty upload")
    for path in paths:
        count = filter_sarif(path, ROOT)
        print(f"{path.name}: filtered {count} exact reviewed false positives")


if __name__ == "__main__":
    main()
