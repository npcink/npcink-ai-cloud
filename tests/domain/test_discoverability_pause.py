from __future__ import annotations

import json

import pytest

from app.core.config import Settings
from app.domain.cloud_batch_runtime.service import _score_item
from app.domain.wordpress_ai_connector.contracts import (
    PAUSED_DISCOVERABILITY_TASKS,
    WordPressOperationContractViolation,
    validate_wordpress_operation_contract,
)
from app.domain.wordpress_ai_connector.runtime import WordPressOperationRuntime


@pytest.mark.parametrize("task", sorted(PAUSED_DISCOVERABILITY_TASKS))
@pytest.mark.parametrize("with_contract", [False, True])
def test_specialist_tasks_cannot_enter_either_contract_lane(task: str, with_contract: bool) -> None:
    request: dict = {"source_text": "Existing source content"}
    if with_contract:
        request["task_contract"] = {
            "contract_version": "ai_task_contract.v1",
            "ability_name": "ai/meta-description",
            "task": task,
            "task_family": "generation",
            "context_requirements": ["current_content"],
            "constraints": ["single_value", "source_grounded"],
            "output_schema": {"type": "string"},
            "write_posture": "suggestion_only",
        }
    with pytest.raises(WordPressOperationContractViolation) as error:
        validate_wordpress_operation_contract(
            {"contract_version": "wordpress_operation.v1", "task": task, "request": request}
        )
    assert error.value.error_code == "wordpress_operation.feature_paused"


@pytest.mark.parametrize("specialist_type", ["seo", "aeo", "geo"])
def test_mixed_editorial_review_keeps_general_types_and_removes_specialist_output(
    specialist_type: str,
) -> None:
    operation = validate_wordpress_operation_contract(
        {
            "contract_version": "wordpress_operation.v1",
            "task": "editorial_notes",
            "request": {
                "prompt": "Check a paragraph about SEO",
                "review_types": [specialist_type, "grammar"],
            },
        }
    )
    assert operation["request"]["review_types"] == ["grammar"]
    runtime = WordPressOperationRuntime(settings=Settings(_env_file=None), providers={})
    output = runtime.normalize_provider_output(
        {
            "output_text": json.dumps(
                {
                    "suggestions": [
                        {"review_type": "seo", "text": "Add keywords", "priority": "low"},
                        {"review_type": "grammar", "text": "Fix agreement", "priority": "low"},
                    ]
                }
            )
        },
        input_payload={"metadata": {"task": "editorial_notes"}},
    )
    assert [item["review_type"] for item in json.loads(output["output_text"])["suggestions"]] == [
        "grammar"
    ]
    with pytest.raises(WordPressOperationContractViolation):
        validate_wordpress_operation_contract(
            {
                **operation,
                "request": {"prompt": "Check paragraph", "review_types": [specialist_type]},
            }
        )


def test_new_inspection_scores_ignore_seo_description_without_altering_other_signals() -> None:
    item = {
        "title": "A complete article title with enough context",
        "word_count": 1000,
        "internal_link_count": 2,
        "image_alt_missing": 0,
        "days_since_modified": 0,
    }
    absent = _score_item(item, sequence=1)
    short = _score_item({**item, "meta_description": "short"}, sequence=1)
    complete = _score_item({**item, "meta_description": "description " * 12}, sequence=1)
    assert absent == short == complete
    assert absent["score"] == 100
    missing_alt = _score_item({**item, "image_alt_missing": 2}, sequence=1)
    assert "missing_image_alt_text" in missing_alt["reason_codes"]
