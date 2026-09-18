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

This guard checks reachability only. It does not check for broken targets:
``docs/legacy-contracts/magick-ai-root`` intentionally preserves snapshots whose
internal links no longer resolve, and rewriting them is out of scope.
"""

from __future__ import annotations

import re
import sys
from collections import deque
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


def main() -> int:
    tracked = {path.resolve() for path in DOCS.rglob("*.md")}
    reachable = reachable_documents()
    orphans = sorted(tracked - reachable)

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

    print(
        "[ok] documentation reachability: "
        f"{len(reachable)}/{len(tracked)} documents reachable from docs/README.md"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
