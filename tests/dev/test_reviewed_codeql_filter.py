from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[2]
    / ".github/scripts/filter-reviewed-codeql-false-positives.py"
)
spec = importlib.util.spec_from_file_location("reviewed_codeql_filter", SCRIPT)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def finding(
    rule: str = "py/clear-text-storage-sensitive-data",
    start: int = 195,
    end: int = 195,
    uri: str | None = None,
) -> dict:
    return {
        "ruleId": rule,
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": uri or module.SOURCE},
                    "region": {"startLine": start, "endLine": end},
                }
            }
        ],
    }


@pytest.mark.parametrize(("rule", "start", "end"), sorted(module.REVIEWED_LOCATIONS))
def test_exact_reviewed_report_findings_are_filtered(rule: str, start: int, end: int) -> None:
    assert module.is_reviewed(finding(rule, start, end), module.ROOT)


@pytest.mark.parametrize(
    "result",
    [
        finding(start=194),
        finding(end=196),
        finding(uri="app/api/auth.py"),
        finding(rule="py/sql-injection"),
        {"ruleId": "py/clear-text-storage-sensitive-data"},
    ],
)
def test_other_security_results_are_retained(result: dict) -> None:
    assert not module.is_reviewed(result, module.ROOT)


def test_source_change_reenables_findings(tmp_path: Path) -> None:
    source = tmp_path / module.SOURCE
    source.parent.mkdir(parents=True)
    source.write_bytes((module.ROOT / module.SOURCE).read_bytes() + b"\n")
    assert not module.is_reviewed(finding(), tmp_path)


def test_upload_keeps_unrelated_runs_and_metadata(tmp_path: Path) -> None:
    unrelated = finding(uri="app/api/auth.py")
    payload = {
        "version": "2.1.0",
        "runs": [
            {"tool": {"driver": {"name": "CodeQL"}}, "results": [finding(), unrelated]},
            {"tool": {"driver": {"name": "CodeQL JS"}}, "results": [finding(rule="js/xss")]},
        ],
    }
    expected = copy.deepcopy(payload)
    expected["runs"][0]["results"] = [unrelated]
    sarif = tmp_path / "python.sarif"
    sarif.write_text(json.dumps(payload))
    assert module.filter_sarif(sarif, module.ROOT) == 1
    assert json.loads(sarif.read_text()) == expected
