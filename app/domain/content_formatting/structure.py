"""Bounded structural repairs, preserving source fragments rather than reserializing HTML."""

from __future__ import annotations

import re
from html import unescape
from html.parser import HTMLParser

from app.domain.content_formatting.engine import format_candidate


class ParagraphText(HTMLParser):
    """Visible text with source offsets; cuts never reopen or duplicate inline tags."""

    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0, *(m.end() for m in re.finditer("\n", source))]
        self.text = ""
        self.ends: dict[int, int] = {}
        self.stack: list[str] = []
        self.invalid = False
        self.feed(source)
        self.close()

    def position(self) -> int:
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in {"a", "strong", "em", "b", "i", "s", "del", "code"}:
            self.invalid = True
        if tag == "a" and "a" in self.stack:
            self.invalid = True
        self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if not self.stack or self.stack.pop() != tag:
            self.invalid = True
        if not self.stack and self.text:
            self.ends[len(self.text)] = self.source.index(">", self.position()) + 1

    def handle_data(self, data: str) -> None:
        if "code" in self.stack:
            self.text += "\ufffc"
            return
        if any(c in data for c in "<>[]`\"'") or re.search(r"https?://|www\.|\S+@\S+", data):
            self.invalid = True
        start = self.position()
        for index, char in enumerate(data):
            self.text += char
            if not self.stack:
                self.ends[len(self.text)] = start + index + 1

    def entity(self, raw: str) -> None:
        if not self.source.startswith(raw, self.position()):
            self.invalid = True
        if "code" in self.stack:
            self.text += "\ufffc"
            return
        decoded = unescape(raw)
        if decoded == raw or any(c in decoded for c in "<>[]`\"'"):
            self.invalid = True
        self.text += decoded
        if not self.stack:
            self.ends[len(self.text)] = self.position() + len(raw)

    def handle_entityref(self, name: str) -> None:
        self.entity(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.entity(f"&#{name};")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.invalid = True

    def handle_comment(self, data: str) -> None:
        self.invalid = True

    def handle_decl(self, decl: str) -> None:
        self.invalid = True

    def handle_pi(self, data: str) -> None:
        self.invalid = True


def split_long_paragraph(raw: str) -> tuple[str, int]:
    match = re.fullmatch(r"<!-- wp:paragraph -->\s*<p>(.*)</p>\s*<!-- /wp:paragraph -->", raw, re.S)
    if not match:
        return raw, 0
    parsed = ParagraphText(match[1])
    text = parsed.text
    if parsed.invalid or parsed.stack:
        return raw, 0
    pairs = {"（": "）", "(": ")", "“": "”", "‘": "’", "「": "」", "『": "』", "【": "】"}
    stack: list[str] = []
    boundaries = []
    sentence_end = False
    for index, char in enumerate(text):
        if char in pairs:
            stack.append(pairs[char])
        elif char in pairs.values():
            if not stack or stack.pop() != char:
                return raw, 0
        else:
            sentence_end = char in "。！？!?"
        if (
            sentence_end
            and not stack
            and (index + 1 == len(text) or text[index + 1] not in "。！？!?")
        ):
            boundaries.append(index + 1)
    if stack:
        return raw, 0

    # Source slices retain every character. Require two complete sentences on
    # each side, and never force a cut merely because a paragraph is long.
    def partition(start: int, end: int) -> list[int]:
        size = len(re.sub(r"\s", "", text[start:end]))
        ends = [pos for pos in boundaries if start < pos <= end]
        if size <= 180 or len(ends) < 4:
            return [end]
        choices = [
            pos
            for pos in ends[1:-2]
            if pos in parsed.ends
            and len(re.sub(r"\s", "", text[start:pos])) >= 40
            and len(re.sub(r"\s", "", text[pos:end])) >= 40
        ]
        if not choices:
            return [end]
        cut = min(choices, key=lambda pos: abs(pos - (start + end) / 2))
        return partition(start, cut) + partition(cut, end)

    cuts = partition(0, len(text))[:-1]
    if not cuts:
        return raw, 0
    offsets = [0, *(parsed.ends[cut] for cut in cuts), len(match[1])]
    parts = [match[1][start:end] for start, end in zip(offsets, offsets[1:], strict=False)]
    return "\n\n".join(
        f"<!-- wp:paragraph -->\n<p>{part}</p>\n<!-- /wp:paragraph -->" for part in parts
    ), len(parts) - 1


class Paragraphs(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0, *(m.end() for m in re.finditer("\n", source))]
        self.stack: list[tuple[str, int, bool]] = []
        self.spans: list[tuple[int, int]] = []
        self.invalid = False

    def handle_comment(self, data: str) -> None:
        if "wp:" not in data:
            return
        match = re.fullmatch(r"\s*(/?)wp:([\w/-]+)(\s+\{.*\})?\s*(/?)\s*", data, re.S)
        if not match:
            self.invalid = True
            return
        closing, name, attrs, single = match.groups()
        line, col = self.getpos()
        offset = self.lines[line - 1] + col
        if closing:
            if not self.stack or self.stack[-1][0] != name or attrs or single:
                self.invalid = True
                return
            _, start, eligible = self.stack.pop()
            if eligible:
                self.spans.append((start, offset + len(data) + 7))
        elif not single and not name.endswith("/"):
            self.stack.append((name, offset, not self.stack and name == "paragraph" and not attrs))


class Inline(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0, *(m.end() for m in re.finditer("\n", source))]
        self.stack: list[str] = []
        self.text: list[tuple[int, str]] = []
        self.links: list[tuple[int, int]] = []
        self.link_start = 0
        self.invalid = False

    def source_position(self) -> int:
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in {"a", "br"}:
            self.invalid = True
        if tag == "a":
            if self.stack:
                self.invalid = True
            self.link_start = self.source_position()
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "br" or attrs:
            self.invalid = True

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or self.stack != ["a"]:
            self.invalid = True
        else:
            self.links.append((self.link_start, self.source_position() + len("</a>")))
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if not self.stack:
            self.text.append((self.source_position(), data))

    def handle_comment(self, data: str) -> None:
        self.invalid = True


def repair_paragraph(raw: str) -> tuple[str, int]:
    match = re.fullmatch(r"<!-- wp:paragraph -->\s*<p>(.*)</p>\s*<!-- /wp:paragraph -->", raw, re.S)
    if not match:
        return raw, 0
    inner = match[1]
    parser = Inline(inner)
    parser.feed(inner)
    parser.close()
    if parser.invalid or parser.stack or any(c in inner for c in "[]`"):
        return raw, 0

    # Only repair inline markers when repeated existing line-start markers
    # establish a list context. Multiplication and code never qualify.
    count = 0
    if len(re.findall(r"<br\s*/?>\s*\* [\u3400-\u9fff]", inner)) >= 2:
        for offset, text in reversed(parser.text):
            changed, added = re.subn(r"(?<=[\u3400-\u9fff])\* (?=[\u3400-\u9fff])", "<br>* ", text)
            inner = inner[:offset] + changed + inner[offset + len(text) :]
            count += added
    if count:
        return raw[: match.start(1)] + inner + raw[match.end(1) :], count

    # A run of two or more labeled links plus a scalar labeled tail is an
    # explicit metadata list, not free-form sentence inference.
    if len(parser.links) < 2 or "<br" in inner or "\n" in inner:
        return raw, 0
    first = parser.links[0][0]
    label = re.search(r"(?:^|[。！？；])([\u3400-\u9fff]{2,16}[：:])$", inner[:first])
    if not label or label.start(1) == 0:
        return raw, 0
    intro = inner[: label.start(1)]
    rows = [inner[label.start(1) : parser.links[0][1]]]
    previous = parser.links[0][1]
    for start, end in parser.links[1:]:
        if not re.fullmatch(r"[\u3400-\u9fff]{2,16}[：:]", inner[previous:start]):
            return raw, 0
        rows.append(inner[previous:end])
        previous = end
    tail = inner[previous:]
    if not re.fullmatch(
        r"[\u3400-\u9fff]{2,16}[：:]\s*[0-9]+(?:\.[0-9]+)?\s*[\u3400-\u9fffA-Za-z%￥¥]{0,4}", tail
    ):
        return raw, 0
    rows.append(tail)
    items = "\n\n".join(
        f"<!-- wp:list-item -->\n<li>{row}</li>\n<!-- /wp:list-item -->" for row in rows
    )
    return (
        f"<!-- wp:paragraph -->\n<p>{intro}</p>\n<!-- /wp:paragraph -->\n\n"
        f'<!-- wp:list -->\n<ul class="wp-block-list">{items}</ul>\n<!-- /wp:list -->',
        1,
    )


def format_structure(source: str) -> dict:
    result = format_candidate(source, "html")
    candidate = result["candidate"]
    parser = Paragraphs(candidate)
    try:
        if "<![" in candidate:
            parser.invalid = True
        else:
            parser.feed(candidate)
            parser.close()
    except (ValueError, AssertionError):
        # HTMLParser rejects malformed declarations before invoking callbacks.
        parser.invalid = True
        result["protected_content_skipped"] = True
    repairs = 0
    if not parser.invalid and not parser.stack:
        for start, end in reversed(parser.spans):
            replacement, count = repair_paragraph(candidate[start:end])
            if not count:
                replacement, count = split_long_paragraph(replacement)
            candidate = candidate[:start] + replacement + candidate[end:]
            repairs += count
    import hashlib

    result.update(
        contract_version="content_format_candidate.v2",
        candidate=candidate,
        candidate_sha256=hashlib.sha256(candidate.encode()).hexdigest(),
        structural_changes=repairs,
    )
    changed = candidate != source
    result["status"] = (
        ("PARTIAL" if changed else "REVIEW")
        if result["protected_content_skipped"]
        else ("CHANGED" if changed else "UNCHANGED")
    )
    return result
