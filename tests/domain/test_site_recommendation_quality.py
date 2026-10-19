import pytest

from app.domain.site_knowledge.recommendation_quality import (
    apply_recommendation_quality_controls,
    apply_recommendation_quality_controls_v2,
)


def test_recommendation_controls_collapse_documents_and_suppress_weak_tail() -> None:
    results, metrics = apply_recommendation_quality_controls(
        [
            {
                "source_type": "post",
                "source_id": 10,
                "candidate_relevance": "strong",
            },
            {
                "source_type": "post",
                "source_id": 10,
                "candidate_relevance": "strong",
            },
            {
                "source_type": "post",
                "source_id": 11,
                "candidate_relevance": "weak",
            },
        ],
        max_results=5,
    )

    assert [item["source_id"] for item in results] == [10]
    assert metrics == {
        "document_duplicates_collapsed": 1,
        "weak_candidates_suppressed": 1,
        "strong_or_review_candidates": 1,
    }


def test_recommendation_controls_keep_weak_candidates_when_no_strong_evidence_exists() -> None:
    results, metrics = apply_recommendation_quality_controls(
        [
            {"source_type": "post", "source_id": 11, "candidate_relevance": "weak"},
            {"source_type": "post", "source_id": 12, "candidate_relevance": "weak"},
        ],
        max_results=5,
    )

    assert [item["source_id"] for item in results] == [11, 12]
    assert metrics["weak_candidates_suppressed"] == 0


@pytest.mark.parametrize("score", [0, 0.68, 0.7122, 0.7499, float("nan"), float("inf")])
def test_v2_abstains_below_floor_even_with_anchor_or_taxonomy(score: float) -> None:
    rows, receipt = apply_recommendation_quality_controls_v2(
        [
            {
                "post_id": 1,
                "score": score,
                "title": "奶茶优惠",
                "candidate_relevance": "review",
                "anchor_evidence": {"exact_source_passage_match": True},
                "taxonomies": {"category": ["奶茶"]},
            }
        ],
        query="夏日奶茶促销优惠",
        max_results=6,
    )
    assert rows == []
    assert receipt["abstained"] is True
    assert receipt["below_evidence_floor"] == 1
    assert receipt["policy_version"] == "reading_task_abstention.v2"


@pytest.mark.parametrize(
    ("query", "title", "chunk", "expected"),
    [
        ("夏日奶茶特惠新用户注册APP", "WordPress 用户协议", "用户可以注册使用功能", False),
        ("夏日奶茶特惠仅需1元", "奶茶店 WordPress 商城主题", "展示奶茶商品", False),
        ("夏日奶茶特惠仅需1元", "奶茶限时促销", "新用户买一送一", True),
        ("Weekend coffee happy hour", "Coffee shop website theme", "A coffee menu layout", False),
        ("Weekend coffee happy hour", "Coffee happy hour offer", "Buy one get one", True),
        ("WordPress 性能调试", "WordPress 主题安装教程", "网站开发代码插件", False),
        ("WordPress 性能调试", "Debug Bar – 性能分析工具", "", True),
        ("intro.js 分步引导", "intro.js 实战", "", True),
        ("前端面试手册", "前端面试问题", "", True),
        ("Calibre 书籍管理", "BookCard 个人作品集主题", "电子书籍卡片", False),
        ("Calibre 书籍管理", "Kavita 在线书籍管理", "", True),
        ("Image hosting 图片管理", "Another image hosting solution", "", True),
        ("摄影作品集主题", "Folio Photography", "Portfolio gallery", True),
        ("学习 CSS 灵感", "CSSFX 动画效果", "CSS 动画灵感", True),
        ("JavaScript教程", "JavaScript 快速入门", "语言基础", True),
        ("PHP教程", "PHP 语言参考", "语法与示例", True),
        ("HTML 入门", "HTML 标签手册", "文档标记", True),
        ("JavaScript教程", "Java语言教程", "Java入门", False),
        ("蓝莓种植指南", "高级资源", "蓝莓种植技术", True),
        ("咖啡优惠活动", "主题下载", "很多活动", False),
        ("intro.js 分步指南", "网站引导卡片", "网站导航入口", False),
        ("新手引导 onboarding", "Shepherd 引导工具", "为访客提供分步交互说明", True),
        ("自定义字段 custom fields", "WordPress Customize API", "自定义选项和设置", False),
        ("自定义字段 custom fields", "Meta Box", "自定义字段管理", True),
        ("前端面试手册", "前端开发资源", "提供面试备考和算法材料", True),
        ("前端面试手册", "前端页面布局", "HTML CSS 布局", False),
        ("去除 category 分类链接", "分类展示区块", "按分类展示文章", False),
        ("相关文章推荐", "Yoast SEO", "SEO 搜索优化", False),
        ("相关文章推荐", "Contextual Related Posts", "按正文推荐相关日志", True),
    ],
)
def test_v2_requires_task_evidence_without_exact_product_identity(
    query: str,
    title: str,
    chunk: str,
    expected: bool,
) -> None:
    rows, receipt = apply_recommendation_quality_controls_v2(
        [
            {
                "post_id": 1,
                "score": 0.9,
                "title": title,
                "chunk": chunk,
                "candidate_relevance": "strong",
            }
        ],
        query=query,
        max_results=6,
    )
    assert bool(rows) is expected
    assert receipt["abstained"] is (not expected)


def test_v2_filters_before_topk_preserving_original_scores_and_order() -> None:
    candidates = [
        {
            "source_id": i,
            "source_type": "post",
            "score": score,
            "title": title,
            "candidate_relevance": "strong",
        }
        for i, score, title in [
            (1, 0.9, "WordPress 开发"),
            (2, 0.81, "性能分析"),
            (2, 0.8, "性能调试"),
            (3, 0.85, "性能调试"),
        ]
    ]
    before = [dict(c) for c in candidates]
    rows, _ = apply_recommendation_quality_controls_v2(
        candidates, query="WordPress 性能调试", max_results=2
    )
    assert [r["source_id"] for r in rows] == [2, 3]
    assert [r["score"] for r in rows] == [0.81, 0.85]
    assert candidates == before
