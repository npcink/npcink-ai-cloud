from __future__ import annotations

from app.domain.runtime.service import RuntimeService


def test_build_analysis_envelope_returns_none_for_non_openclaw():
    service = RuntimeService.__new__(RuntimeService)
    result = service._build_analysis_envelope(
        {"output": {"output_text": "hello"}}, "text"
    )
    assert result is None


def test_build_analysis_envelope_returns_report_for_read_only():
    service = RuntimeService.__new__(RuntimeService)
    result = service._build_analysis_envelope(
        {"output": {"output_text": "Analysis of the site shows 3 issues"}}, "openclaw"
    )
    assert result is not None
    assert result["analysis_type"] == "report"
    assert result["requires_local_approval"] is False
    assert result["proposal_handoff"] is None


def test_build_analysis_envelope_returns_proposal_for_write_like():
    service = RuntimeService.__new__(RuntimeService)
    result = service._build_analysis_envelope(
        {"output": {"output_text": "Recommendation: update the WordPress theme"}}, "openclaw"
    )
    assert result is not None
    assert result["analysis_type"] == "proposal"
    assert result["requires_local_approval"] is True
    assert result["proposal_handoff"] is None


def test_build_analysis_envelope_proposal_handoff_when_provided():
    service = RuntimeService.__new__(RuntimeService)
    result = service._build_analysis_envelope(
        {
            "output": {
                "output_text": "Will create a new post",
                "proposal_handoff": {"artifact_type": "wp_post", "payload": {"title": "Test"}},
            }
        },
        "openclaw",
    )
    assert result is not None
    assert result["requires_local_approval"] is True
    assert result["proposal_handoff"] == {"artifact_type": "wp_post", "payload": {"title": "Test"}}
