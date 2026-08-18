from __future__ import annotations

import importlib.util
import json
import subprocess
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

    assert [Path(selector).name for selector in shards[0].selectors] == [
        "test_a.py",
        "test_d.py",
    ]
    assert [Path(selector).name for selector in shards[1].selectors] == [
        "test_b.py",
        "test_c.py",
    ]


def test_material_file_falls_back_when_new_node_lacks_historic_weight(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "contract"
    tests_root.mkdir(parents=True)
    slow = tests_root / "test_slow.py"
    slow.write_text(
        "def test_one(): pass\ndef test_two(): pass\ndef test_new(): pass\n",
        encoding="utf-8",
    )
    fast = tests_root / "test_fast.py"
    fast.write_text("def test_fast(): pass\n", encoding="utf-8")
    slow_path = slow.as_posix()

    weighted = select_pytest_shard.build_weighted_selectors(
        [fast, slow],
        {fast.as_posix(): 4, slow_path: 20},
        {
            f"{slow_path}::test_one": 9,
            f"{slow_path}::test_two": 8,
        },
        shard_count=2,
        collected_node_loader=lambda _path: [
            f"{slow_path}::test_one",
            f"{slow_path}::test_two",
            f"{slow_path}::test_new",
        ],
    )

    assert weighted == [(4, fast.as_posix()), (20, slow_path)]


def test_material_files_are_split_before_they_can_bind_one_shard(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "api"
    tests_root.mkdir(parents=True)
    files: list[Path] = []
    file_weights: dict[str, float] = {}
    node_weights: dict[str, float] = {}
    collected_nodes: dict[Path, list[str]] = {}
    for index in range(3):
        path = tests_root / f"test_material_{index}.py"
        path.write_text(
            "def test_one(): pass\ndef test_two(): pass\n",
            encoding="utf-8",
        )
        files.append(path)
        file_weights[path.as_posix()] = 100
        collected_nodes[path] = [
            f"{path.as_posix()}::test_one",
            f"{path.as_posix()}::test_two",
        ]
        node_weights.update(
            {
                f"{path.as_posix()}::test_one": 50,
                f"{path.as_posix()}::test_two": 50,
            }
        )

    weighted = select_pytest_shard.build_weighted_selectors(
        files,
        file_weights,
        node_weights,
        shard_count=3,
        collected_node_loader=lambda path: collected_nodes[path],
    )
    shards = select_pytest_shard.assign_weighted_selectors(weighted, shard_count=3)

    assert [shard.total_seconds for shard in shards] == [100, 100, 100]
    assert all(len(shard.selectors) == 2 for shard in shards)


def test_collected_parameterized_items_raise_the_file_and_node_weight_floor(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "api"
    tests_root.mkdir(parents=True)
    material = tests_root / "test_material.py"
    material.write_text(
        "def test_parametrized(): pass\ndef test_other(): pass\n",
        encoding="utf-8",
    )
    material_path = material.as_posix()
    parametrized_node = f"{material_path}::test_parametrized"
    other_node = f"{material_path}::test_other"

    weighted = select_pytest_shard.build_weighted_selectors(
        [material],
        {material_path: 1},
        {parametrized_node: 1, other_node: 1},
        shard_count=3,
        collected_item_counts={parametrized_node: 12, other_node: 1},
        item_floor_seconds=1.0,
    )

    assert weighted == [(12.0, parametrized_node), (1, other_node)]


def test_collected_item_counts_preserve_parameterized_case_cardinality(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        select_pytest_shard.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=(
                "tests/api/test_runtime.py::test_case[first]\n"
                "tests/api/test_runtime.py::test_case[second]\n"
                "tests/contract/test_release.py::test_release\n"
                "unrelated/path.py::test_noise\n"
            ),
            stderr="",
        ),
    )

    counts = select_pytest_shard.discover_collected_test_item_counts(
        [Path("tests/api"), Path("tests/contract/test_release.py")]
    )

    assert counts == {
        "tests/api/test_runtime.py::test_case": 2,
        "tests/contract/test_release.py::test_release": 1,
    }


def test_material_file_without_complete_node_evidence_skips_collection(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "api"
    tests_root.mkdir(parents=True)
    material = tests_root / "test_material.py"
    material.write_text(
        "def test_one(): pass\ndef test_two(): pass\n",
        encoding="utf-8",
    )
    collection_attempted = False

    def collect(_path: Path) -> list[str]:
        nonlocal collection_attempted
        collection_attempted = True
        return []

    weighted = select_pytest_shard.build_weighted_selectors(
        [material],
        {material.as_posix(): 100},
        {},
        shard_count=3,
        collected_node_loader=collect,
    )

    assert weighted == [(100, material.as_posix())]
    assert collection_attempted is False


def test_oversized_file_falls_back_when_historic_nodes_are_not_static(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "contract"
    tests_root.mkdir(parents=True)
    slow = tests_root / "test_slow.py"
    slow.write_text("def test_one(): pass\ndef test_two(): pass\n", encoding="utf-8")
    fast = tests_root / "test_fast.py"
    fast.write_text("def test_fast(): pass\n", encoding="utf-8")

    weighted = select_pytest_shard.build_weighted_selectors(
        [fast, slow],
        {fast.as_posix(): 4, slow.as_posix(): 20},
        {f"{slow.as_posix()}::test_generated": 20},
        shard_count=2,
        collected_node_loader=lambda _path: [
            f"{slow.as_posix()}::test_one",
            f"{slow.as_posix()}::test_two",
            f"{slow.as_posix()}::test_generated",
        ],
    )

    assert weighted == [(4, fast.as_posix()), (20, slow.as_posix())]


def test_oversized_file_falls_back_when_pytest_collects_a_dynamic_test(
    tmp_path: Path,
) -> None:
    tests_root = tmp_path / "tests" / "contract"
    tests_root.mkdir(parents=True)
    slow = tests_root / "test_slow.py"
    slow.write_text("def test_one(): pass\ndef test_two(): pass\n", encoding="utf-8")
    fast = tests_root / "test_fast.py"
    fast.write_text("def test_fast(): pass\n", encoding="utf-8")
    slow_path = slow.as_posix()

    weighted = select_pytest_shard.build_weighted_selectors(
        [fast, slow],
        {fast.as_posix(): 4, slow_path: 20},
        {
            f"{slow_path}::test_one": 9,
            f"{slow_path}::test_two": 8,
        },
        shard_count=2,
        collected_node_loader=lambda _path: [
            f"{slow_path}::test_one",
            f"{slow_path}::test_two",
            f"{slow_path}::test_dynamic",
        ],
    )

    assert weighted == [(4, fast.as_posix()), (20, slow_path)]


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
        "schema": "pytest-duration-weights-v3",
        "source": "fixture",
        "node_weights": {
            "tests/api/test_auth.py::TestDecodePortalBearerToken::test_decode": 0.75,
            "tests/api/test_runtime.py::test_one": 1.25,
            "tests/api/test_runtime.py::test_two": 2.0,
            "tests/contract/test_release.py::test_release": 0.5,
        },
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
    assert payload["node_weights"] == {
        "tests/contract/test_release.py::test_one": 2.0,
        "tests/contract/test_release.py::test_two": 3.0,
        "tests/domain/test_runtime.py::test_three": 1.0,
    }
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
        "schema": "pytest-duration-weights-v3",
        "source": "GitHub Actions runs 101, 102, 103 pytest-backend timing shards",
        "aggregation": "mean-plus-stddev",
        "node_weights": {
            "tests/api/test_auth.py::test_two": 1.0,
            "tests/api/test_runtime.py::test_one": 5.633,
        },
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


def test_shard_balance_report_compares_split_nodes_without_full_file_drift(
    tmp_path: Path,
) -> None:
    artifact_root = tmp_path / "artifacts"
    artifact_root.mkdir()
    node_one = "tests/contract/test_slow.py::test_one"
    node_two = "tests/contract/test_slow.py::test_two"
    (artifact_root / "pytest-files-shard-1.txt").write_text(
        f"{node_one}\n",
        encoding="utf-8",
    )
    (artifact_root / "pytest-files-shard-2.txt").write_text(
        f"{node_two}\n",
        encoding="utf-8",
    )
    for index, name in ((1, "test_one"), (2, "test_two")):
        (artifact_root / f"pytest-backend-shard-{index}.xml").write_text(
            f"""
<testsuite>
  <testcase classname="tests.contract.test_slow" name="{name}" time="10" />
</testsuite>
""",
            encoding="utf-8",
        )
    durations = tmp_path / "durations.json"
    durations.write_text(
        json.dumps(
            {
                "schema": "pytest-duration-weights-v3",
                "source": "fixture runs",
                "aggregation": "mean-plus-stddev",
                "source_run_ids": ["1", "2", "3"],
                "weights": {"tests/contract/test_slow.py": 20},
                "node_weights": {node_one: 10, node_two: 10},
            }
        ),
        encoding="utf-8",
    )

    summary = report_pytest_shard_balance.summarize(
        artifact_root,
        durations,
        ratio_warning=1.30,
        file_drift_seconds=1,
        file_drift_ratio=0.1,
    )

    assert summary["predicted_max_min_ratio"] == 1
    assert summary["actual_max_min_ratio"] == 1
    assert summary["file_drifts"] == []
