"""Export bounded, read-only paragraph restoration cases for external eval-lab."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domain.content_formatting.engine import format_candidate  # noqa: E402
from app.domain.content_formatting.structure import Paragraphs, format_structure  # noqa: E402


def sentences(raw: str) -> list[str]:
    match = re.fullmatch(r"<!-- wp:paragraph -->\s*<p>([^<>]+)</p>\s*<!-- /wp:paragraph -->", raw)
    if not match or re.search(r"[&\[\]`\"'（）()“”‘’「」『』]|https?://|www\.|@", match[1]):
        return []
    body = format_candidate(raw, "html")["candidate"]
    text = re.search(r"<p>(.*?)</p>", body, re.S)[1]
    parts = re.findall(r"[^。！？!?]+[。！？!?]+", text)
    return parts if "".join(parts) == text and 2 <= len(parts) <= 8 else []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=4, choices=range(1, 9))
    args = parser.parse_args()
    cases = []
    for path in sorted(args.corpus.glob("*.md")):
        source = path.read_text()
        blocks = Paragraphs(source)
        blocks.feed(source)
        blocks.close()
        if blocks.invalid or blocks.stack:
            continue
        for (start, end), (next_start, next_end) in zip(
            blocks.spans, blocks.spans[1:], strict=False
        ):
            if source[end:next_start].strip():
                continue
            first, second = sentences(source[start:end]), sentences(source[next_start:next_end])
            if not first or not second or min(len("".join(first)), len("".join(second))) < 40:
                continue
            parts = first + second
            text = "".join(parts)
            if not 200 <= len(text) <= 1200:
                continue
            fixture = f"<!-- wp:paragraph -->\n<p>{text}</p>\n<!-- /wp:paragraph -->"
            before = perf_counter()
            result = format_structure(fixture)
            elapsed = (perf_counter() - before) * 1000
            paragraphs = re.findall(r"<p>(.*?)</p>", result["candidate"], re.S)
            assert "".join(paragraphs) == text
            boundaries = {}
            offset = 0
            for index, sentence in enumerate(parts, 1):
                offset += len(sentence)
                boundaries[offset] = index
            offset = 0
            cuts = []
            for paragraph in paragraphs[:-1]:
                offset += len(paragraph)
                cuts.append(boundaries[offset])
            cases.append(
                {
                    "id": f"blog-{path.stem}",
                    "origin": str(path),
                    "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                    "sentences": parts,
                    "reference_break_after": [len(first)],
                    "rule_break_after": cuts,
                    "rule_latency_ms": round(elapsed, 3),
                    "rule_idempotent": format_structure(result["candidate"])["candidate"]
                    == result["candidate"],
                }
            )
            break
        if len(cases) == args.limit:
            break
    if len(cases) != args.limit:
        raise SystemExit("Not enough eligible original paragraph pairs; no output written.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "contract": "content_paragraph_restoration.v1",
                "reference_kind": "original_author_boundaries_not_gold",
                "write_posture": "eval_only_no_wordpress_write",
                "cases": cases,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(f"Exported {len(cases)} read-only cases; article bodies omitted from console.")


if __name__ == "__main__":
    main()
