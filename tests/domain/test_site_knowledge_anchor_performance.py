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
