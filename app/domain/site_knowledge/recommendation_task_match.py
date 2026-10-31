"""Conservative, observable task evidence; not an AI relevance judgement."""

from __future__ import annotations

import re

from app.domain.site_knowledge.text_evidence import shared_text_terms

# Platform, presentation and boilerplate overlap cannot establish a reading task.
# Keep language/subject terms (e.g. CSS) and alternative product names admissible.
_BROAD_TERMS = (
    "wordpress",
    "woocommerce",
    "https",
    "http",
    "plugin",
    "plugins",
    "theme",
    "themes",
    "website",
    "web",
    "app",
    "api",
    "demo",
    "the",
    "and",
    "for",
    "with",
    "your",
    "this",
    "that",
    "from",
    "一个",
    "一款",
    "一种",
    "可以",
    "我们",
    "你们",
    "他们",
    "用户",
    "使用",
    "用于",
    "提供",
    "支持",
    "通过",
    "进行",
    "实现",
    "相关",
    "文章",
    "内容",
    "网站",
    "网页",
    "开发",
    "代码",
    "工具",
    "插件",
    "主题",
    "功能",
    "程序",
    "应用",
    "开源",
    "简单",
    "推荐",
    "教程",
    "学习",
    "介绍",
    "目前",
    "现在",
)
_BROAD = re.compile(
    "|".join(sorted((re.escape(t) for t in _BROAD_TERMS if not t.isascii()), key=len, reverse=True))
    + r"|(?<![a-z0-9])(?:"
    + "|".join(re.escape(t) for t in _BROAD_TERMS if t.isascii())
    + r")(?![a-z0-9])",
    re.IGNORECASE,
)

# Bounded multilingual guards for demonstrated task ambiguities. No article IDs,
# target allowlist or product-name equality: alternative tools may meet the task.
_TASKS = (
    (
        r"分步指南|分步引导|新手引导|intro\.js|onboarding",
        r"分步|步骤|新手引导|intro\.js|onboarding|guided tour",
    ),
    (
        r"自定义字段|custom fields",
        r"字段|custom fields|\bacf\b|选项面板|自定义选项页|元框|metabox|options? (?:framework|panel|page)|optiontree",
    ),
    (
        r"书籍管理|电子书管理|calibre",
        r"书籍管理|电子书管理|图书管理|calibre|ebook management|book management",
    ),
    (
        r"分类链接|去除.*category|remove.*category",
        (
            r"分类链接|分类目录|category base|category.*(?:路径|链接|移除|去除|remove)"
            r"|(?:移除|去除|remove).*category"
        ),
    ),
    (r"面试|interview", r"面试|访谈|interview|算法|数据结构|求职|备考|algorithm|data structure"),
    (r"相关文章|related posts|yarpp", r"相关文章|相关日志|related posts|yarpp"),
    (r"摄影|作品集|portfolio", r"摄影|作品集|投资组合|portfolio|photograph|photo gallery"),
    (r"图床|image hosting", r"图床|图片管理|image hosting|image management"),
    (r"query monitor|性能调试|调试工具", r"调试|性能|debug|performance|query monitor"),
)
# "Only click" describes setup, not a consumer offer. Require a monetary
# amount for the ambiguous Chinese prefixes, on both source and target.
_PROMOTION = re.compile(
    r"特惠|促销|买一送一|(?:仅需|只需)\s*(?:[¥￥$€£]\s*\d+(?:\.\d+)?"
    r"|\d+(?:\.\d+)?\s*(?:元|美元|欧元|英镑|人民币|USD|CNY|RMB|EUR|GBP))"
    r"|special offer|happy hour|buy one get one",
    re.IGNORECASE,
)
_PROMOTION_BOILERPLATE = re.compile(
    r"限时|特惠|促销|优惠|折扣|活动|买一送一|仅需|只需|新用户|注册|即可|享受|夏日|冰爽"
    r"|special offer|happy hour|buy one get one|discount|coupon|register|summer|weekend"
    r"|\d+(?:\.\d+)?\s*(?:元|折|%|off)?",
    re.IGNORECASE,
)


def reading_task_evidence(query: str, candidate: dict[str, object]) -> str:
    """Return bounded evidence kind, without treating taxonomies/anchors as proof.

    Title overlap can support a subject or alternative tool. A body-only match
    needs a longer phrase or named ASCII term to avoid incidental CJK bigrams.
    Scores, sort keys and source text remain untouched.
    """
    target = (
        str(candidate.get("title") or "")
        + " "
        + str(candidate.get("chunk") or candidate.get("match_context") or "")
    )
    if _PROMOTION.search(query):
        # A theme/tool for the same subject is not the advertised consumer offer.
        # Require both the offer action and its subject, rather than a food ban.
        subject = _PROMOTION_BOILERPLATE.sub(" ", _BROAD.sub(" ", query))
        target_subject = _PROMOTION_BOILERPLATE.sub(" ", _BROAD.sub(" ", target))
        matches = shared_text_terms(subject, target_subject, limit=32)
        supported = _PROMOTION.search(target) and any(
            len(t) >= (3 if t.isascii() else 2) for t in matches
        )
        return "functional_task_evidence" if supported else "insufficient_task_evidence"
    active_tasks = [
        target_pattern
        for source_pattern, target_pattern in _TASKS
        if re.search(source_pattern, query, re.IGNORECASE)
    ]
    if active_tasks:
        # Meeting one concrete reader task is enough; broad topic overlap is not.
        return (
            "functional_task_evidence"
            if any(re.search(pattern, target, re.IGNORECASE) for pattern in active_tasks)
            else "insufficient_task_evidence"
        )
    focus = _BROAD.sub(" ", query.lower())
    title = _BROAD.sub(" ", str(candidate.get("title") or "").lower())
    if shared_text_terms(focus, title, limit=1):
        return "title_evidence"
    body = _BROAD.sub(
        " ", str(candidate.get("chunk") or candidate.get("match_context") or "").lower()
    )
    terms = shared_text_terms(focus, body, limit=32)
    if any(len(t) >= (3 if t.isascii() else 4) for t in terms):
        return "body_evidence"
    return "insufficient_task_evidence"
