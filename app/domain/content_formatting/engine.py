from __future__ import annotations

import hashlib
import json
import re
from html.parser import HTMLParser
from typing import Any

from markdown_it import MarkdownIt

MAX_CONTENT_BYTES = 100_000
RESULT_CONTRACT = "content_format_candidate.v1"
_CJK = r"\u3400-\u4dbf\u4e00-\u9fff"
_SPACING = re.compile(rf"(?<=[{_CJK}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[{_CJK}])")
_URL_OR_EMAIL = re.compile(r"(?:[A-Za-z][A-Za-z0-9+.-]*://|www\.|[@/\\])")
_TAGS = frozenset("p h1 h2 h3 h4 h5 h6 ul ol li blockquote strong em b i s del br".split())
_PROTECTED = frozenset("a code pre table thead tbody tfoot tr th td".split())


class _HTMLRanges(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer("\n", source))
        self.stack: list[str] = []
        self.blocks: list[str] = []
        self.block_protection: list[bool] = []
        self.ranges: list[tuple[int, int]] = []
        self.review = False
        self.invalid = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if any(self.block_protection):
            return
        if tag not in _TAGS | _PROTECTED:
            self.invalid = True
        if tag in _PROTECTED:
            self.review = True
        if tag != "br":
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if any(self.block_protection):
            return
        if tag != "br":
            self.invalid = True

    def handle_endtag(self, tag: str) -> None:
        if any(self.block_protection):
            return
        if not self.stack or self.stack[-1] != tag:
            self.invalid = True
        else:
            self.stack.pop()

    def handle_comment(self, data: str) -> None:
        if "wp:" not in data:
            return
        match = re.fullmatch(
            r"\s*(/?)wp:([a-z][a-z0-9_-]*(?:/[a-z][a-z0-9_-]*)?)(\s+\{.*\})?\s*(/?)\s*",
            data,
            re.DOTALL,
        )
        if not match:
            self.invalid = True
            return
        protected = match[2] not in {
            "paragraph",
            "heading",
            "list",
            "list-item",
            "quote",
            "code",
            "preformatted",
        }
        if match[3]:
            try:
                attributes = json.loads(match[3])
            except ValueError:
                self.invalid = True
                return
            allowed = {
                "level",
                "ordered",
                "start",
                "className",
                "style",
                "anchor",
                "textAlign",
                "align",
                "fontSize",
                "backgroundColor",
                "textColor",
                "dropCap",
            }
            if match[1] or not isinstance(attributes, dict):
                self.invalid = True
                return
            protected = protected or bool(set(attributes) - allowed)
        if match[1]:
            if match[4] or not self.blocks or self.blocks[-1] != match[2]:
                self.invalid = True
            else:
                self.blocks.pop()
                self.block_protection.pop()
        else:
            self.review = self.review or protected
            if not match[4]:
                self.blocks.append(match[2])
                self.block_protection.append(protected)

    def handle_data(self, data: str) -> None:
        if any(self.block_protection):
            return
        if "<" in data or "[" in data or "]" in data:
            self.invalid = True
        if not self.stack or any(tag in _PROTECTED for tag in self.stack):
            return
        if _URL_OR_EMAIL.search(data):
            self.review = True
            return
        line, column = self.getpos()
        start = self.line_offsets[line - 1] + column
        self.ranges.append((start, start + len(data)))

    def handle_decl(self, decl: str) -> None:
        self.invalid = True

    def handle_pi(self, data: str) -> None:
        self.invalid = True

    def unknown_decl(self, data: str) -> None:
        self.invalid = True


def _html_ranges(source: str) -> tuple[list[tuple[int, int]], bool]:
    # Marked declarations have different parser behavior across Python versions.
    if "<![" in source:
        return [], True
    parser = _HTMLRanges(source)
    try:
        parser.feed(source)
        parser.close()
    except (ValueError, AssertionError):
        return [], True
    if parser.invalid or parser.stack or parser.blocks:
        return [], True
    return parser.ranges, parser.review


def _markdown_ranges(source: str) -> tuple[list[tuple[int, int]], bool]:
    if (
        "wp:" in source
        or "[" in source
        or "]" in source
        or source.startswith(("---\n", "---\r\n", "+++\n", "+++\r\n"))
    ):
        return [], True
    tokens = MarkdownIt("commonmark").parse(source)
    # CommonMark normalizes CRLF/CR/LF only, not Unicode line separators.
    lines = re.split(r"(?<=\n)|(?<=\r)(?!\n)", source)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    ranges = []
    review = False
    for token in tokens:
        if token.type in {"fence", "code_block", "html_block"}:
            review = True
        if token.type != "inline" or token.map is None:
            continue
        start, end = token.map
        raw = "".join(lines[start:end])
        # Source spans, not rendered token text, are edited. Protect constructs
        # whose inline offsets are not supplied by the parser, including GFM.
        if (
            any(
                child.type not in {"text", "softbreak", "hardbreak"}
                for child in token.children or []
            )
            or any(char in raw for char in "[]|&\\<>`~$*_{}")
            or _URL_OR_EMAIL.search(raw)
        ):
            review = True
            continue
        ranges.append((offsets[start], offsets[end]))
    return ranges, review


def format_candidate(source: str, source_format: str) -> dict[str, Any]:
    if source_format not in {"html", "markdown"}:
        raise ValueError("format must be html or markdown")
    if not source or len(source.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise ValueError("content must contain 1 to 100000 UTF-8 bytes")
    ranges, review = _html_ranges(source) if source_format == "html" else _markdown_ranges(source)
    pieces = []
    cursor = 0
    inserted = 0
    for start, end in sorted(set(ranges)):
        if start < cursor:
            raise ValueError("overlapping source spans")
        pieces.append(source[cursor:start])
        changed, count = _SPACING.subn(" ", source[start:end])
        pieces.append(changed)
        inserted += count
        cursor = end
    pieces.append(source[cursor:])
    candidate = "".join(pieces)
    invariant = re.sub(r"\s", "", source) == re.sub(r"\s", "", candidate)
    return {
        "contract_version": RESULT_CONTRACT,
        "format": source_format,
        "source_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "candidate_sha256": hashlib.sha256(candidate.encode("utf-8")).hexdigest()
        if invariant
        else None,
        "candidate": candidate if invariant else None,
        "status": (
            "REVIEW"
            if not invariant or (review and not inserted)
            else "PARTIAL"
            if review
            else "CHANGED"
            if inserted
            else "UNCHANGED"
        ),
        "inserted_spaces": inserted,
        "visible_characters_preserved": invariant,
        "protected_content_skipped": review,
        "direct_wordpress_write": False,
    }
