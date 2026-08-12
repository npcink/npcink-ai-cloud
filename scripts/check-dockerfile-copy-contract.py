#!/usr/bin/env python3
"""Fail-closed validation of local Dockerfile COPY sources."""

from __future__ import annotations

import argparse
import json
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOCKERFILES = ("Dockerfile", "frontend/Dockerfile")


class CopyContractError(ValueError):
    pass


def _logical_lines(path: Path) -> list[tuple[int, str]]:
    lines: list[tuple[int, str]] = []
    pending = ""
    start = 0
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        text = raw.strip()
        if not text or text.startswith("#"):
            continue
        if not pending:
            start = number
        pending += (" " if pending else "") + text.rstrip("\\").rstrip()
        if not text.endswith("\\"):
            lines.append((start, pending))
            pending = ""
    if pending:
        raise CopyContractError(f"{path}: unterminated continuation at line {start}")
    return lines


def _validate_file(path: Path, root: Path) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for line, instruction in _logical_lines(path):
        try:
            tokens = shlex.split(instruction, comments=True, posix=True)
        except ValueError as exc:
            raise CopyContractError(f"{path}:{line}: invalid Dockerfile quoting: {exc}") from exc
        if not tokens or tokens[0].upper() != "COPY":
            continue
        arguments = tokens[1:]
        options: list[str] = []
        while arguments and arguments[0].startswith("--"):
            options.append(arguments.pop(0))
        if any(option.startswith("--from=") for option in options):
            continue
        if any(option == "--from" for option in options):
            raise CopyContractError(
                f"{path}:{line}: COPY --from must use --from=<stage> syntax"
            )
        sources = arguments
        if len(sources) < 2:
            raise CopyContractError(
                f"{path}:{line}: COPY requires at least one source and a destination"
            )
        for source in sources[:-1]:
            if source.startswith("/") or any(part == ".." for part in Path(source).parts):
                raise CopyContractError(
                    f"{path}:{line}: COPY source escapes build context: {source!r}"
                )
            matches = (
                list(root.glob(source))
                if any(char in source for char in "*?[")
                else [root / source]
            )
            if not matches or any(not match.exists() for match in matches):
                raise CopyContractError(f"{path}:{line}: missing local COPY source {source!r}")
            findings.append(
                {"dockerfile": str(path.relative_to(root)), "line": str(line), "source": source}
            )
    return findings


def check(root: Path, dockerfiles: tuple[str, ...]) -> dict[str, object]:
    checked: list[dict[str, str]] = []
    for relative in dockerfiles:
        path = (root / relative).resolve()
        if not path.is_file() or root not in path.parents:
            raise CopyContractError(f"missing Dockerfile: {relative}")
        checked.extend(_validate_file(path, root))
    return {
        "contract_version": "npcink.dockerfile-copy-contract.v1",
        "status": "passed",
        "dockerfiles": list(dockerfiles),
        "local_copy_sources": checked,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(ROOT))
    parser.add_argument("--dockerfile", action="append", dest="dockerfiles")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    dockerfiles = tuple(args.dockerfiles or DEFAULT_DOCKERFILES)
    try:
        receipt = check(root, dockerfiles)
    except (OSError, CopyContractError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
