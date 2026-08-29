from app.domain.site_knowledge.text_evidence import shared_text_terms


def test_shared_text_terms_includes_meaningful_two_character_cjk_terms() -> None:
    assert shared_text_terms("插件 内链", "插件推荐与自然内链", limit=4) == ["插件", "内链"]


def test_shared_text_terms_matches_ascii_tokens_instead_of_substrings() -> None:
    assert shared_text_terms("AI", "Email delivery guide", limit=4) == []
    assert shared_text_terms("AI", "An AI delivery guide", limit=4) == ["ai"]
