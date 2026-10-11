import pytest

from app.domain.content_formatting.structure import format_structure, split_long_paragraph


def paragraph(text: str) -> str:
    return f"<!-- wp:paragraph -->\n<p>{text}</p>\n<!-- /wp:paragraph -->"


def test_metadata_list_and_missing_breaks() -> None:
    source = paragraph(
        '产品介绍。购买地址：<a href="/buy">详情</a>功能演示：<a href="/demo">详情</a>售价：229 原'
    )
    source += "\n\n" + paragraph("功能介绍<br>* 第一项功能<br>* 第二项功能* 第三项功能")
    result = format_structure(source)
    assert result["contract_version"] == "content_format_candidate.v2"
    assert result["structural_changes"] == 2
    assert result["candidate"].count("<!-- wp:list-item -->") == 3
    assert "第二项功能<br>* 第三项功能" in result["candidate"]
    assert format_structure(result["candidate"])["candidate"] == result["candidate"]


@pytest.mark.parametrize(
    "body",
    [
        "公式2* 3<br>* 第一项<br>* 第二项",
        "只有一个* 标记",
        "<code>中文* 测试</code>",
        '正文。购买：<a href="/a">链接</a>下一句不是标签<a href="/b">链接</a>金额：12',
        '<a href="/a">内部* 标记</a><br>* 第一项<br>* 第二项',
    ],
)
def test_ambiguous_markers_are_not_split(body: str) -> None:
    result = format_structure(paragraph(body))
    assert result["structural_changes"] == 0


def test_protected_gallery_and_nested_paragraph_stay_exact() -> None:
    protected = (
        "<!-- wp:group -->"
        + paragraph("功能<br>* 第一项<br>* 第二项* 第三项")
        + "<!-- /wp:group -->"
    )
    source = protected + paragraph("功能<br>* 第一项<br>* 第二项* 第三项")
    result = format_structure(source)
    assert result["candidate"].startswith(protected)
    assert result["structural_changes"] == 1


def test_malformed_blocks_do_not_repair() -> None:
    source = paragraph("功能<br>* 第一项<br>* 第二项* 第三项").replace("/wp:paragraph", "/wp:list")
    assert format_structure(source)["candidate"] == source


def test_malformed_declaration_preserves_original_without_parser_exception() -> None:
    source = paragraph("<![foo]>原文AI。")
    result = format_structure(source)
    assert result["candidate"] == source
    assert result["status"] == "REVIEW"
    assert result["structural_changes"] == 0


def test_long_paragraph_preserves_text_and_is_idempotent() -> None:
    text = ("这是需要保持原有文字及语序的完整句子" * 3 + "。") * 8
    result = format_structure(paragraph(text))
    assert result["structural_changes"] > 0
    import re

    assert "".join(re.findall(r"<p>(.*?)</p>", result["candidate"], re.S)) == text
    assert format_structure(result["candidate"])["candidate"] == result["candidate"]


@pytest.mark.parametrize(
    "text",
    [
        "短句。另一句。",
        "长句" * 200 + "。",
        "长句，" * 200,
        "“" + "引文。" * 100 + "”",
        "（" + "括号内。" * 100 + "）",
        '<a href="/a">' + "链接。" * 100 + "</a>",
        "未闭合（" + "正文。" * 100,
    ],
)
def test_unsafe_or_short_paragraph_is_not_split(text: str) -> None:
    assert format_structure(paragraph(text))["candidate"] == paragraph(text)


def test_closing_quotes_follow_sentence_and_protected_blocks_stay_exact() -> None:
    sentence = "他说：“" + "保留这段原文" * 8 + "。”"
    text = sentence * 8
    protected = (
        '<!-- wp:image --><figure class="wp-block-image">'
        '<img src="/a.png" alt="原图"/></figure><!-- /wp:image -->'
        '<!-- wp:table --><figure class="wp-block-table"><table><tbody><tr>'
        "<td>中文AI</td><td>1.20</td></tr></tbody></table></figure><!-- /wp:table -->"
        '<!-- wp:code --><pre class="wp-block-code">'
        "<code>中文AI &lt;x&gt;</code></pre><!-- /wp:code -->"
    )
    result = format_structure(paragraph(text) + protected)
    assert result["structural_changes"] > 0
    assert result["candidate"].endswith(protected)
    assert "。”</p>" in result["candidate"]
    assert format_structure(result["candidate"])["candidate"] == result["candidate"]


@pytest.mark.parametrize(
    "inline",
    [
        "<strong>重点<em>保持完整</em></strong>",
        '<a href="/buy?x=1&amp;y=2" title="原属性">原链接</a>',
        '<code>const x = ["中文AI。", "保留！"];</code>',
        "字符&amp;以及&#160;空格",
    ],
)
def test_rich_paragraph_cuts_only_outside_inline(inline: str) -> None:
    import re

    sentence = "这段完整的原始介绍用于验证富文本没有丢失或被重新生成" * 2 + inline + "。"
    text = sentence * 8
    candidate, changes = split_long_paragraph(paragraph(text))
    assert changes > 0
    assert "".join(re.findall(r"<p>(.*?)</p>", candidate, re.S)) == text
    assert candidate.count(inline) == 8
    assert split_long_paragraph(candidate)[1] == 0
    assert format_structure(candidate)["structural_changes"] == 0


def test_sentence_ending_inside_emphasis_attaches_closing_tag() -> None:
    sentence = "普通介绍" * 15 + "<strong>这个句子到此结束。</strong>"
    candidate, changes = split_long_paragraph(paragraph(sentence * 8))
    assert changes > 0
    assert "。</strong></p>" in candidate
    assert "<p></strong>" not in candidate


@pytest.mark.parametrize(
    "inline",
    [
        "<strong>" + "正文。" * 100 + "</strong>",
        "<strong><em>错误。</strong></em>",
        "<span>未知结构。</span>",
        "原文<br>换行。",
        "<!-- 注释 -->",
        "&amp没有分号。",
    ],
)
def test_unsupported_rich_structures_do_not_split(inline: str) -> None:
    source = paragraph(inline)
    assert split_long_paragraph(source) == (source, 0)
