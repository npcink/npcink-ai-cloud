from datetime import UTC, datetime

from app.core.models import ProviderCallRecord, RunRecord
from app.domain.runtime.failure_evidence import provider_failure_evidence


def test_failure_evidence_is_bounded_and_excludes_provider_message_and_content():
    run = RunRecord(
        run_id="run-1",
        site_id="site-1",
        profile_id="wp-ai.classification",
        ability_family="text",
        error_message="private content: additionalProperties is required",
        input_json={"private": "input"},
        result_json={"private": "output"},
    )
    call = ProviderCallRecord(
        run_id="run-1",
        provider_id="openai",
        model_id="model-1",
        error_code="provider.invalid_request",
        created_at=datetime.now(UTC),
    )
    evidence = provider_failure_evidence([(call, run), (call, run)], limit=1)
    assert len(evidence) == 1
    assert evidence[0]["reason"] == "output_schema_invalid"
    assert evidence[0]["recovery"] == "unverified"
    assert "private" not in str(evidence)
    call.error_code = None
    assert provider_failure_evidence([(call, run)], limit=1) == []
