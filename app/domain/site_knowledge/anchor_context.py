"""Conservative source-text masking for anchor evidence, preserving offsets."""

import re

# Preserve the prose after a URL delimiter, including Chinese punctuation.
_URL = re.compile(r"(?:https?\s*:\s*//|www\.)[^\s<>\"'，。；！？）]+", re.IGNORECASE)
# Possessive CSS quantifiers prevent repartitioning long failing selectors
# (Python >=3.12 is the runtime floor).
_CODE = re.compile(
    r"```[\s\S]*?(?:```|$)|`[^`\n]*`|<(?P<tag>pre|code|script|style)\b[^>]*>"
    r"[\s\S]*?(?:</(?P=tag)\s*>|$)|/\*[\s\S]*?\*/"
    r"|[.#][\w-]++(?:\s++[.#]?[\w:-]++|:[\w-]++)*+\s*+\{[^{}]*+\}",
    re.IGNORECASE,
)
_SHORTCODE = re.compile(r"\[(?:/?[a-z][\w-]*)(?:\s[^\]]*)?\]", re.IGNORECASE)
_SMOKE_TITLE = re.compile(
    r"^Npcink Abilities Toolkit Smoke "
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\s|$)",
    re.IGNORECASE,
)


def source_prose_for_anchor(value: str) -> str:
    """Blank recognized non-prose spans; keep source indices and length intact.

    This is a conservative text guard, not a Markdown/HTML parser. Existing
    editor-side block/range/link checks remain mandatory.
    """
    text = _CODE.sub(lambda match: " " * len(match.group()), value)
    text = _URL.sub(lambda match: " " * len(match.group()), text)
    return _SHORTCODE.sub(lambda match: " " * len(match.group()), text)


def is_reserved_smoke_document(title: str) -> bool:
    """Only the existing internal smoke namespace with a UUID is reserved."""
    return _SMOKE_TITLE.match(title.strip()) is not None
