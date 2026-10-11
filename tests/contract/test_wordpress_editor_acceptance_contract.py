from scripts.wordpress_editor_acceptance import classify_result


def test_http_errors_are_failures_even_when_no_write_is_observed() -> None:
    status, reason = classify_result(
        {
            "intent": "related_articles",
            "http_status": 400,
            "direct_wordpress_write": None,
            "error_code": "npcink_toolbox_invalid_editor_support_intent",
        },
        allow_explicit_fallback=False,
    )
    assert status == "failed"
    assert "HTTP 400" in reason


def test_related_content_ready_empty_result_is_valid_cloud_evidence() -> None:
    status, reason = classify_result(
        {
            "intent": "related_articles",
            "http_status": 200,
            "direct_wordpress_write": False,
            "provider": "npcink_cloud",
            "status": "ready",
        },
        allow_explicit_fallback=False,
    )
    assert status == "passed_cloud"
    assert "zero results" in reason


def test_internal_link_fallback_requires_explicit_opt_in_and_ready_knowledge() -> None:
    result = {
        "intent": "internal_links",
        "http_status": 200,
        "direct_wordpress_write": False,
        "candidate_source": "local_fallback",
        "source_knowledge_status": "ready",
        "source_status": "no_cloud_evidence",
    }
    assert classify_result(result, allow_explicit_fallback=False)[0] == "failed"
    assert classify_result(result, allow_explicit_fallback=True)[0] == "passed_explicit_fallback"


def test_cloud_unavailable_fallback_is_never_accepted() -> None:
    status, _ = classify_result(
        {
            "intent": "internal_links",
            "http_status": 200,
            "direct_wordpress_write": False,
            "candidate_source": "cloud_unavailable",
            "source_knowledge_status": "error",
            "source_status": "cloud_unavailable",
        },
        allow_explicit_fallback=True,
    )
    assert status == "failed"
