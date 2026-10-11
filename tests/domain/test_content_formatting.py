from __future__ import annotations

import hashlib

import pytest

from app.domain.content_formatting.engine import format_candidate


@pytest.mark.parametrize(
    "source_format,source,expected",
    [
        (
            "html",
            '<p title="中文AI">中文AI工具2个。</p>',
            '<p title="中文AI">中文 AI 工具 2 个。</p>',
        ),
        (
            "markdown",
            "# 中文AI\r\n\r\n- 使用WordPress工具。\r\n",
            "# 中文 AI\r\n\r\n- 使用 WordPress 工具。\r\n",
        ),
        (
            "html",
            "<!-- wp:paragraph --><p>中文AI。</p><!-- /wp:paragraph -->",
            "<!-- wp:paragraph --><p>中文 AI。</p><!-- /wp:paragraph -->",
        ),
        (
            "html",
            "<p>中文<strong>AI工具</strong>&nbsp;使用WordPress。</p>",
            "<p>中文<strong>AI 工具</strong>&nbsp;使用 WordPress。</p>",
        ),
    ],
)
def test_spacing_preserves_source_bytes_except_insertions(
    source_format: str, source: str, expected: str
) -> None:
    result = format_candidate(source, source_format)
    assert result["candidate"] == expected
    assert result["source_sha256"] == hashlib.sha256(source.encode()).hexdigest()
    assert result["candidate_sha256"] == hashlib.sha256(expected.encode()).hexdigest()
    assert result["visible_characters_preserved"] is True
    assert result["direct_wordpress_write"] is False
    assert format_candidate(expected, source_format)["candidate"] == expected


def test_markdown_unicode_separators_do_not_shift_source_spans() -> None:
    source = "中文AI\u2028正文AI\n\n```\n代码AI\n```\n\n后文AI\n"
    result = format_candidate(source, "markdown")
    assert result["candidate"] == "中文 AI\u2028正文 AI\n\n```\n代码AI\n```\n\n后文 AI\n"


def test_gutenberg_static_attributes_are_preserved_but_bindings_are_protected() -> None:
    source = '<!-- wp:heading {"level":3} --><h3>中文AI</h3><!-- /wp:heading -->'
    assert format_candidate(source, "html")["candidate"] == source.replace("中文AI", "中文 AI")
    bound = '<!-- wp:paragraph {"metadata":{"bindings":{}}} --><p>中文AI</p><!-- /wp:paragraph -->'
    assert format_candidate(bound, "html")["candidate"] == bound


@pytest.mark.parametrize(
    "source_format,source",
    [
        ("html", '<p><a href="https://example.com/中文AI">中文AI</a></p>'),
        ("html", "<pre><code>中文AI\r\n</code></pre>"),
        ("html", "<table><tr><td>中文AI</td></tr></table>"),
        ("html", "<!-- wp:custom/widget --><p>中文AI</p><!-- /wp:custom/widget -->"),
        ("html", '<p>中文AI[gallery ids="1"]</p>'),
        ("html", "<p>中文AI</div>"),
        ("html", "<script>中文AI</script><p>中文AI</p>"),
        ("html", "<p>https://example.com/中文AI</p>"),
        ("markdown", "```php\r\n中文AI\r\n```\r\n"),
        ("markdown", "[中文AI](https://example.com/中文AI)"),
        ("markdown", "| 中文AI |\n| --- |\n| 中文AI |"),
        ("markdown", "中文AI &nbsp;"),
        ("markdown", "中文AI `中文AI`"),
        ("markdown", "$中文AI$"),
        ("markdown", "---\ntitle: 中文AI\n---\n\n中文AI"),
        ("html", "<p>/assets/中文AI.png</p>"),
        ("markdown", "<!-- wp:custom/widget -->\n中文AI\n<!-- /wp:custom/widget -->"),
    ],
)
def test_protected_content_is_byte_identical(source_format: str, source: str) -> None:
    result = format_candidate(source, source_format)
    assert result["candidate"] == source
    assert result["status"] == "REVIEW"


@pytest.mark.parametrize(
    "source,source_format", [("", "html"), ("x", "text"), ("x" * 100001, "html")]
)
def test_invalid_input(source: str, source_format: str) -> None:
    with pytest.raises(ValueError):
        format_candidate(source, source_format)


@pytest.mark.parametrize(
    "protected",
    [
        '<!-- wp:gallery {"columns":2} --><figure><!-- wp:image {"id":7} -->'
        '<figure><img src="/中文AI.jpg" alt="中文AI"/><figcaption>中文AI</figcaption>'
        "</figure><!-- /wp:image --></figure><!-- /wp:gallery -->",
        "<!-- wp:custom/widget --><div><p>中文AI[shortcode]</p></div><!-- /wp:custom/widget -->",
        '<!-- wp:custom/widget {"id":7} /-->',
        '<!-- wp:paragraph {"metadata":{"bindings":{}}} --><p>中文AI</p><!-- /wp:paragraph -->',
        '<a href="https://example.test/中文AI">中文AI</a>',
        "<pre><code>中文AI</code></pre>",
    ],
)
def test_protected_subtrees_do_not_block_safe_siblings(protected: str) -> None:
    source = "<!-- wp:paragraph --><p>前文AI</p><!-- /wp:paragraph -->" + protected
    source += "<!-- wp:paragraph --><p>后文AI</p><!-- /wp:paragraph -->"
    result = format_candidate(source, "html")
    assert result["status"] == "PARTIAL"
    assert result["protected_content_skipped"] is True
    assert result["candidate"] == source.replace("前文AI", "前文 AI").replace("后文AI", "后文 AI")
    assert protected in result["candidate"]
    again = format_candidate(result["candidate"], "html")
    assert again["status"] == "REVIEW"
    assert again["candidate"] == result["candidate"]


def test_mismatched_protected_block_still_rejects_whole_document() -> None:
    source = '<p>中文AI</p><!-- wp:gallery --><img src="x"><!-- /wp:image -->'
    result = format_candidate(source, "html")
    assert result["status"] == "REVIEW"
    assert result["candidate"] == source
