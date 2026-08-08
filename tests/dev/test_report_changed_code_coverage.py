from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "scripts" / "report-changed-code-coverage.py"


def _git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout.strip()


def _init_repo(tmp_path: Path) -> tuple[Path, str]:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "coverage-test@example.invalid")
    _git(repo, "config", "user.name", "Coverage Test")
    (repo / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "baseline")
    return repo, _git(repo, "rev-parse", "HEAD")


def _run_report(
    repo: Path,
    base: str,
    coverage_payload: dict[str, object] | None,
) -> subprocess.CompletedProcess[str]:
    markdown = repo / "changed-coverage.md"
    report_json = repo / "changed-coverage.json"
    command = [
        sys.executable,
        str(REPORT),
    ]
    if coverage_payload is not None:
        coverage_json = repo / "coverage.json"
        coverage_json.write_text(json.dumps(coverage_payload), encoding="utf-8")
        command.extend(["--coverage-json", str(coverage_json)])
    command.extend(
        [
            "--base",
            base,
            "--head",
            "HEAD",
            "--repo",
            str(repo),
            "--markdown-output",
            str(markdown),
            "--json-output",
            str(report_json),
        ]
    )
    return subprocess.run(
        command,
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )


def test_report_is_advisory_and_counts_changed_line_and_branch_arcs(
    tmp_path: Path,
) -> None:
    repo, base = _init_repo(tmp_path)
    module = repo / "app" / "sample.py"
    module.parent.mkdir()
    module.write_text(
        "def choose(flag: bool) -> int:\n"
        "    if flag:\n"
        "        return 1\n"
        "    return 0\n"
        "\n"
        "def reached() -> int:\n"
        "    return 2\n",
        encoding="utf-8",
    )
    _git(repo, "add", "app/sample.py")
    _git(repo, "commit", "-m", "add sample")

    completed = _run_report(
        repo,
        base,
        {
            "files": {
                "app/sample.py": {
                    "executed_lines": [1, 2, 3, 6, 7],
                    "missing_lines": [4],
                    "executed_branches": [[2, 3]],
                    "missing_branches": [[2, 4]],
                }
            }
        },
    )

    assert completed.returncode == 0, completed.stderr
    report = json.loads((repo / "changed-coverage.json").read_text(encoding="utf-8"))
    assert report["advisory"] is True
    assert report["threshold"] is None
    assert report["totals"] == {
        "files": 1,
        "changed_lines": 7,
        "executable_lines": 6,
        "covered_lines": 5,
        "line_rate": 0.8333,
        "branches": 2,
        "covered_branches": 1,
        "branch_rate": 0.5,
    }
    assert report["files"][0]["missing_lines"] == [4]
    assert report["files"][0]["missing_branches"] == [[2, 4]]
    markdown = (repo / "changed-coverage.md").read_text(encoding="utf-8")
    assert "has no threshold and does not block merging" in markdown
    assert "5 / 6 (83.3%)" in markdown
    assert "1 / 2 (50.0%)" in markdown


def test_report_ignores_changes_outside_app_python(tmp_path: Path) -> None:
    repo, base = _init_repo(tmp_path)
    docs = repo / "docs" / "note.md"
    docs.parent.mkdir()
    docs.write_text("documentation\n", encoding="utf-8")
    _git(repo, "add", "docs/note.md")
    _git(repo, "commit", "-m", "add docs")

    completed = _run_report(repo, base, None)

    assert completed.returncode == 0, completed.stderr
    report = json.loads((repo / "changed-coverage.json").read_text(encoding="utf-8"))
    assert report["totals"]["files"] == 0
    assert report["totals"]["line_rate"] is None
    assert "No changed Python lines" in (repo / "changed-coverage.md").read_text(
        encoding="utf-8"
    )


def test_report_counts_only_modified_lines_in_existing_python_file(tmp_path: Path) -> None:
    repo, _ = _init_repo(tmp_path)
    module = repo / "app" / "existing.py"
    module.parent.mkdir()
    module.write_text("def value() -> int:\n    return 1\n", encoding="utf-8")
    _git(repo, "add", "app/existing.py")
    _git(repo, "commit", "-m", "add existing module")
    base = _git(repo, "rev-parse", "HEAD")
    module.write_text("def value() -> int:\n    return 2\n", encoding="utf-8")
    _git(repo, "add", "app/existing.py")
    _git(repo, "commit", "-m", "change return value")

    completed = _run_report(
        repo,
        base,
        {
            "files": {
                "app/existing.py": {
                    "executed_lines": [1],
                    "missing_lines": [2],
                    "executed_branches": [],
                    "missing_branches": [],
                }
            }
        },
    )

    assert completed.returncode == 0, completed.stderr
    report = json.loads((repo / "changed-coverage.json").read_text(encoding="utf-8"))
    assert report["totals"]["changed_lines"] == 1
    assert report["totals"]["executable_lines"] == 1
    assert report["totals"]["covered_lines"] == 0
    assert report["files"][0]["missing_lines"] == [2]


def test_report_requires_coverage_evidence_when_app_python_changed(
    tmp_path: Path,
) -> None:
    repo, base = _init_repo(tmp_path)
    module = repo / "app" / "missing.py"
    module.parent.mkdir()
    module.write_text("VALUE = 1\n", encoding="utf-8")
    _git(repo, "add", "app/missing.py")
    _git(repo, "commit", "-m", "add missing module")

    completed = _run_report(repo, base, None)

    assert completed.returncode == 2
    assert (
        "--coverage-json or --coverage-data is required when app Python lines changed"
        in completed.stderr
    )
