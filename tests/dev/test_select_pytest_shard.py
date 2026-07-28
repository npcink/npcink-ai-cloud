from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_script(name: str, filename: str):
    module_path = ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, module_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


select_pytest_shard = _load_script("select_pytest_shard", "select-pytest-shard.py")
write_pytest_duration_weights = _load_script(
    "write_pytest_duration_weights",
    "write-pytest-duration-weights.py",
)
report_pytest_shard_balance = _load_script(
    "report_pytest_shard_balance",
    "report-pytest-shard-balance.py",
)


def test_weighted_shards_balance_slowest_files_first(tmp_path: Path) -> None:
    tests_root = tmp_path / "tests" / "api"
    tests_root.mkdir(parents=True)
    for name in ("test_a.py", "test_b.py", "test_c.py", "test_d.py"):
        (tests_root / name).write_text("def test_placeholder(): pass\n", encoding="utf-8")

    files = select_pytest_shard.discover_test_files([tests_root])
    weights = {
        f"{tests_root.as_posix()}/test_a.py": 10,
        f"{tests_root.as_posix()}/test_b.py": 8,
        f"{tests_root.as_posix()}/test_c.py": 2,
        f"{tests_root.as_posix()}/test_d.py": 1,
    }

    shards = select_pytest_shard.assign_files(files, weights, shard_count=2)

    assert [path.name for path in shards[0].files] == ["test_a.py", "test_d.py"]
    assert [path.name for path in shards[1].files] == [
        "test_b.py",
        "test_c.py",
    ]


def test_junit_report_writes_per_file_weights(tmp_path: Path) -> None:
    report = tmp_path / "pytest.xml"
    report.write_text(
        """
<testsuite>
  <testcase classname="tests.api.test_runtime" name="test_one" time="1.25" />
  <testcase classname="tests.api.test_runtime" name="test_two" time="2" />
  <testcase classname="tests.api.test_auth.TestDecodePortalBearerToken"
            name="test_decode" time="0.75" />
  <testcase classname="tests.contract.test_release" name="test_release" time="0.5" />
</testsuite>
""",
        encoding="utf-8",
    )

    payload = write_pytest_duration_weights.build_payload(report, "fixture")

    assert payload == {
        "schema": "pytest-duration-weights-v1",
        "source": "fixture",
        "weights": {
            "tests/api/test_auth.py": 0.75,
            "tests/api/test_runtime.py": 3.25,
            "tests/contract/test_release.py": 0.5,
        },
    }


def test_junit_reports_merge_per_file_weights_across_shards(tmp_path: Path) -> None:
    first = tmp_path / "first.xml"
    second = tmp_path / "second.xml"
    first.write_text(
        """
<testsuite>
  <testcase classname="tests.contract.test_release" name="test_one" time="2" />
</testsuite>
""",
        encoding="utf-8",
    )
    second.write_text(
        """
<testsuite>
  <testcase classname="tests.contract.test_release" name="test_two" time="3" />
  <testcase classname="tests.domain.test_runtime" name="test_three" time="1" />
</testsuite>
""",
        encoding="utf-8",
    )

    payload = write_pytest_duration_weights.build_payload([first, second], "fixture shards")

    assert payload["source"] == "fixture shards"
    assert payload["weights"] == {
        "tests/contract/test_release.py": 5.0,
        "tests/domain/test_runtime.py": 1.0,
    }


def test_junit_run_groups_use_variance_aware_weights_and_preserve_sources(
    tmp_path: Path,
) -> None:
    run_reports: list[list[Path]] = []
    for index, seconds in enumerate((2, 4, 6), start=1):
        report = tmp_path / f"run-{index}.xml"
        report.write_text(
            f"""
<testsuite>
  <testcase classname="tests.api.test_runtime" name="test_one" time="{seconds}" />
  <testcase classname="tests.api.test_auth" name="test_two" time="1" />
</testsuite>
""",
            encoding="utf-8",
        )
        run_reports.append([report])

    payload = write_pytest_duration_weights.build_aggregate_payload(
        run_reports,
        ["101", "102", "103"],
    )

    assert payload == {
        "schema": "pytest-duration-weights-v2",
        "source": "GitHub Actions runs 101, 102, 103 pytest-backend timing shards",
        "aggregation": "mean-plus-stddev",
        "source_run_ids": ["101", "102", "103"],
        "weights": {
            "tests/api/test_auth.py": 1.0,
            "tests/api/test_runtime.py": 5.633,
        },
    }


def test_junit_run_groups_keep_median_available_for_diagnostics(
    tmp_path: Path,
) -> None:
    reports: list[list[Path]] = []
    for index, seconds in enumerate((2, 100, 4), start=1):
        report = tmp_path / f"median-run-{index}.xml"
        report.write_text(
            f"""
<testsuite>
  <testcase classname="tests.api.test_runtime" name="test_one" time="{seconds}" />
</testsuite>
""",
            encoding="utf-8",
        )
        reports.append([report])

    payload = write_pytest_duration_weights.build_aggregate_payload(
        reports,
        ["201", "202", "203"],
        aggregation="median",
    )

    assert payload["aggregation"] == "median"
    assert payload["weights"] == {"tests/api/test_runtime.py": 4.0}


def test_shard_balance_report_compares_predictions_and_actual_drift(
    tmp_path: Path,
) -> None:
    artifact_root = tmp_path / "artifacts"
    artifact_root.mkdir()
    (artifact_root / "pytest-files-shard-1.txt").write_text(
        "tests/api/test_a.py\n",
        encoding="utf-8",
    )
    (artifact_root / "pytest-files-shard-2.txt").write_text(
        "tests/api/test_b.py\n",
        encoding="utf-8",
    )
    (artifact_root / "pytest-backend-shard-1.xml").write_text(
        """
<testsuite>
  <testcase classname="tests.api.test_a" name="test_one" time="20" />
</testsuite>
""",
        encoding="utf-8",
    )
    (artifact_root / "pytest-backend-shard-2.xml").write_text(
        """
<testsuite>
  <testcase classname="tests.api.test_b" name="test_two" time="5" />
</testsuite>
""",
        encoding="utf-8",
    )
    durations = tmp_path / "durations.json"
    durations.write_text(
        json.dumps(
            {
                "schema": "pytest-duration-weights-v2",
                "source": "fixture runs",
                "aggregation": "median",
                "source_run_ids": ["1", "2", "3"],
                "weights": {
                    "tests/api/test_a.py": 5,
                    "tests/api/test_b.py": 5,
                },
            }
        ),
        encoding="utf-8",
    )

    summary = report_pytest_shard_balance.summarize(
        artifact_root,
        durations,
        ratio_warning=1.30,
        file_drift_seconds=10,
        file_drift_ratio=0.25,
    )
    markdown = report_pytest_shard_balance.render_markdown(summary, top_drifts=10)

    assert summary["predicted_max_min_ratio"] == 1
    assert summary["actual_max_min_ratio"] == 4
    assert summary["ratio_warning"] is True
    assert [drift.path for drift in summary["file_drifts"]] == ["tests/api/test_a.py"]
    assert "Actual max/min ratio: `4.00`" in markdown
    assert "tests/api/test_a.py" in markdown
