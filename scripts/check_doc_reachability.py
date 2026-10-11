#!/usr/bin/env python3
"""Fail when a tracked document is unreachable from the documentation index.

The 2026-09-11 documentation review established "every tracked document is
reachable from the entry point" as its acceptance result, but nothing re-checked
it afterwards, so the property silently regressed. This guard makes the property
enforceable.

Method (kept identical to the 2026-09-11 review so the numbers stay comparable):

- start from ``docs/README.md`` and walk the link graph;
- recognise inline links, reference links, and backticked repository paths;
  backticked path text is a long-standing convention in this repository
  (roughly 280 occurrences) and is deliberately counted as reachable;
- skip fenced code blocks;
- follow a directory only when it contains a ``README.md``;
- resolve a target relative to the linking file first, then to the repository
  root, so both ``docs/foo.md`` and ``foo.md`` forms work.

A document that exists in ``docs/`` but cannot be reached this way is an orphan:
readers cannot navigate to it, and link checkers that only follow real links
consider it absent. Add an entry to the owning section of ``docs/README.md``
instead of moving or rewriting the document.

The same guard verifies ADR numbering integrity in ``docs/decisions/``: two
decisions must never share a number (the 2026-07 duplicate 028 collision is the
precedent), and unassigned numbers are reported in the success line so a silent
gap stays visible. Renumbering an ADR requires a status note in the renamed
file, as recorded in the ``docs/README.md`` numbering status.

The guard also keeps dated evidence records out of the ``docs/`` root: a
date-stamped root record must either carry a current-month date (live working
state) or appear in the docs README's "Dated Active-document Review" retention
list. Older unlisted records fail the gate so the 2026-09-22 migration of 112
root records into ``docs/history/`` does not silently regrow.

This guard checks reachability and numbering only. It does not check for broken
targets: ``docs/legacy-contracts/magick-ai-root`` intentionally preserves
snapshots whose internal links no longer resolve, and rewriting them is out of
scope.
"""

from __future__ import annotations

import re
import sys
from collections import deque
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ENTRY = DOCS / "README.md"

INLINE_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
REFERENCE_LINK = re.compile(r"^\s*\[[^\]]+\]:\s*(\S+)", re.M)
BACKTICK_PATH = re.compile(r"`([^`]*\.md)`")
EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "#", "thread://")


def strip_code_fences(text: str) -> str:
    """Return the text with fenced code blocks removed."""

    kept: list[str] = []
    in_fence = False
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if not in_fence:
            kept.append(line)
    return "\n".join(kept)


def link_targets(document: Path, text: str) -> list[str]:
    """Return candidate link targets found in ``text``."""

    body = strip_code_fences(text)
    raw = (
        INLINE_LINK.findall(body)
        + REFERENCE_LINK.findall(body)
        + BACKTICK_PATH.findall(body)
    )
    targets: list[str] = []
    for candidate in raw:
        if not candidate or candidate.startswith(EXTERNAL_PREFIXES):
            continue
        without_anchor = candidate.split("#")[0]
        if without_anchor:
            targets.append(without_anchor)
    return targets


def reachable_documents() -> set[Path]:
    """Return every document reachable from the documentation index."""

    tracked = {path.resolve() for path in DOCS.rglob("*.md")}
    if not ENTRY.is_file():
        raise SystemExit(f"[error] documentation entry point is missing: {ENTRY}")

    seen = {ENTRY.resolve()}
    queue: deque[Path] = deque([ENTRY.resolve()])

    while queue:
        current = queue.popleft()
        try:
            text = current.read_text(encoding="utf-8")
        except OSError:
            continue
        for target in link_targets(current, text):
            for base in (current.parent, ROOT):
                resolved = (base / target).resolve()
                if resolved.is_dir():
                    directory_readme = resolved / "README.md"
                    if directory_readme in tracked and directory_readme not in seen:
                        seen.add(directory_readme)
                        queue.append(directory_readme)
                elif resolved in tracked and resolved not in seen:
                    seen.add(resolved)
                    queue.append(resolved)

    return seen & tracked


def adr_numbering_errors() -> list[str]:
    """Return duplicate-numbering defects in ``docs/decisions/``."""

    by_number: dict[str, list[str]] = {}
    for path in sorted((DOCS / "decisions").glob("*.md")):
        match = re.match(r"^(\d+)-", path.name)
        number = match.group(1) if match else "<unnumbered>"
        by_number.setdefault(number, []).append(path.name)
    return [
        f"duplicate ADR number {number}: {', '.join(names)}"
        for number, names in sorted(by_number.items())
        if len(names) > 1
    ]


def adr_gap_summary() -> str:
    """Return the unassigned-number summary for ``docs/decisions/``."""

    numbers = sorted(
        int(match.group(1))
        for path in (DOCS / "decisions").glob("*.md")
        if (match := re.match(r"^(\d+)-", path.name))
    )
    if not numbers:
        return "no numbered ADRs found"
    highest = numbers[-1]
    gaps = sorted(set(range(1, highest + 1)) - set(numbers))
    return (
        f"ADR numbering: {len(numbers)} decisions, 001-{highest:03d}, "
        f"unassigned: {gaps if gaps else 'none'}"
    )


ROOT_DATED_NAME = re.compile(r"-(\d{4})-(\d{2})(?:-\d{2})?\.md$")
RETENTION_HEADING = "## Dated Active-document Review"


def retained_root_records() -> set[str]:
    """Return filenames the docs README explicitly retains at the root."""

    if not ENTRY.is_file():
        return set()
    section: list[str] = []
    in_section = False
    for line in ENTRY.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_section = line.startswith(RETENTION_HEADING)
            continue
        if in_section:
            section.append(line)
    return set(re.findall(r"([\w.-]+\.md)", "\n".join(section)))


def root_dated_violations(now: tuple[int, int]) -> list[Path]:
    """Return dated root records needing migration or explicit retention."""

    retained = retained_root_records()
    violations: list[Path] = []
    for path in sorted(DOCS.glob("*.md")):
        match = ROOT_DATED_NAME.search(path.name)
        if not match or path.name in retained:
            continue
        year_month = (int(match.group(1)), int(match.group(2)))
        if year_month >= now:
            continue  # current-month records are live working state
        violations.append(path)
    return violations


def main() -> int:
    tracked = {path.resolve() for path in DOCS.rglob("*.md")}
    reachable = reachable_documents()
    orphans = sorted(tracked - reachable)

    numbering_errors = adr_numbering_errors()
    if numbering_errors:
        print("[error] ADR numbering defects in docs/decisions/:", file=sys.stderr)
        for error in numbering_errors:
            print(f"  {error}", file=sys.stderr)
        print(
            "Renumber the newer decision to the next free number and add a "
            "status note, as recorded in the docs/README.md numbering status.",
            file=sys.stderr,
        )
        return 1

    if orphans:
        print(
            "[error] documents unreachable from docs/README.md: "
            f"{len(orphans)} of {len(tracked)}",
            file=sys.stderr,
        )
        for path in orphans:
            print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
        print(
            "Add an entry to the owning section of docs/README.md. Keep the "
            "document where it is and do not change its status.",
            file=sys.stderr,
        )
        return 1

    dated_violations = root_dated_violations((date.today().year, date.today().month))
    if dated_violations:
        print(
            "[error] dated evidence records at the docs/ root without a "
            "retention entry:",
            file=sys.stderr,
        )
        for path in dated_violations:
            print(f"  {path.name}", file=sys.stderr)
        print(
            "Move the record into docs/history/<topic>/ with index entries, or "
            "add an explicit entry under 'Dated Active-document Review' in "
            "docs/README.md. Records dated within the current month are "
            "treated as live working state.",
            file=sys.stderr,
        )
        return 1

    root_dated = [
        path
        for path in DOCS.glob("*.md")
        if ROOT_DATED_NAME.search(path.name)
    ]
    print(
        "[ok] documentation reachability: "
        f"{len(reachable)}/{len(tracked)} documents reachable from docs/README.md; "
        f"{adr_gap_summary()}; "
        f"dated root records: {len(root_dated)} (retained or current-month)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
