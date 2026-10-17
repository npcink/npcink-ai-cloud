import pytest

from app.domain.site_knowledge import service


@pytest.mark.parametrize(
    ("source", "target", "expected"),
    [
        ("先检查 PHP 兼容性检查，再升级。", "WordPress 升级前的 PHP 兼容性检查", "PHP 兼容性检查"),
        ("Use Kubernetes safely.", "A KUBERNETES guide", "Kubernetes"),
        ("Use Kubernetes safely.", "A KubernetesPlugin guide", None),
        ("Use KubernetesPlugin safely.", "A Kubernetes guide", None),
        ("学习站点知识检索技术。", "（站点知识检索）", "站点知识检索"),
    ],
)
def test_anchor_prefilter_preserves_exact_source_and_word_boundaries(
    source: str, target: str, expected: str | None
) -> None:
    phrases = service._exact_shared_anchor_phrases(source, target)
    if expected is None:
        assert phrases == []
    else:
        assert expected in phrases
        assert all(phrase in source for phrase in phrases)


def test_unrelated_chunk_windows_skip_expensive_boundary_checks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    boundary_calls = 0
    original = service._splits_ascii_word

    def count_boundary_calls(text: str, start: int, length: int) -> bool:
        nonlocal boundary_calls
        boundary_calls += 1
        return original(text, start, length)

    monkeypatch.setattr(service, "_splits_ascii_word", count_boundary_calls)
    assert (
        service._exact_shared_anchor_phrases(
            "WordPress 插件兼容性检查", "unrelated text " * 60
        )
        == []
    )
    assert boundary_calls == 0


def test_unrelated_windows_are_rejected_before_enumerating_lengths() -> None:
    class CountingText(str):
        slices = 0

        def __getitem__(self, key):
            if isinstance(key, slice):
                self.slices += 1
            return super().__getitem__(key)

    target = CountingText("unrelated technical reference " * 40)
    assert service._exact_shared_anchor_phrases("站点知识检索和插件兼容检查", target) == []
    # Previously every length from 48 down to 4 scanned the entire target.
    assert target.slices <= len(target) * 2


def test_title_evidence_does_not_scan_lower_priority_chunk(monkeypatch) -> None:
    original = service._exact_shared_anchor_phrases

    def title_only(source, target, **kwargs):
        assert target != "unrelated chunk"
        return original(source, target, **kwargs)

    monkeypatch.setattr(service, "_exact_shared_anchor_phrases", title_only)
    evidence = service._source_anchor_evidence(
        ["检查插件兼容性后再继续", "插件兼容性检查完成"],
        title="升级前的插件兼容性检查",
        chunk_text="unrelated chunk",
    )
    assert evidence["target_field"] == "title"
    assert evidence["anchor_or_context"] == "插件兼容性检查"
    assert evidence["source_passage_index"] == 1


@pytest.mark.parametrize(
    ("source", "target"),
    [
        ("Use Kubernetes safely.", "(KUBERNETES) guide"),
        ("先学习站点知识检索再继续。", "!!(站点知识检索)!!"),
        ("ＡＢＣＤ Greek οςαβγδ τέλος", "ΟΣΑΒΓΔ"),
        ("İstanbul Straße tool", "İSTANBUL STRASSE tool"),
        ("插件兼容性检查和运行环境检查", "运行环境检查；插件兼容性检查"),
        ("主题设置需要检查", "x" * 60 + " 主题设置 " + "y" * 60),
    ],
)
def test_prefix_filter_preserves_legacy_window_selection(source, target) -> None:
    assert service._exact_shared_anchor_phrases(source, target) == _legacy_anchor_phrases(
        source, target
    )


def _legacy_anchor_phrases(source: str, target: str) -> list[str]:
    """Frozen pre-optimization matcher for compatibility, including ordering."""
    phrases = []
    source_lower = source.lower()
    for size in range(min(48, len(target)), 3, -1):
        seen = set()
        for start in range(len(target) - size + 1):
            raw = target[start : start + size]
            phrase = raw.strip(" \t\n\r,.;:!?，。；：！？、()[]{}<>\"'")
            if len(phrase) < 4 or phrase in seen or phrase.lower() not in source_lower:
                continue
            phrase_start = start + raw.find(phrase)
            if service._splits_ascii_word(target, phrase_start, len(phrase)):
                continue
            seen.add(phrase)
            offset = service._exact_anchor_offset(source_lower, phrase.lower())
            if offset < 0:
                continue
            exact = source[offset : offset + len(phrase)]
            if service._is_specific_anchor_phrase(exact):
                phrases.append(exact)
        if phrases:
            break
    return phrases


def test_anchor_prefix_index_is_shared_across_candidates(monkeypatch) -> None:
    calls = 0
    original = service._anchor_source_prefixes

    def count_index_builds(passages):
        nonlocal calls
        calls += 1
        return original(passages)

    monkeypatch.setattr(service, "_anchor_source_prefixes", count_index_builds)
    candidates = [
        {"title": "升级前的插件兼容性检查", "chunk": "没有其他共同短语"},
        {"title": "运行环境检查指南", "chunk": "没有其他共同短语"},
    ]
    result = service._attach_source_anchor_evidence(
        candidates,
        intent="internal_links",
        source_passages=["请先做插件兼容性检查", "运行环境检查完成"],
    )
    assert calls == 1
    assert result[0]["anchor_evidence"]["source_passage_index"] == 0
    assert result[1]["anchor_evidence"]["source_passage_index"] == 1
    assert all("anchor_evidence" not in candidate for candidate in candidates)
