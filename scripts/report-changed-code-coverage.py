#!/usr/bin/env python3
"""Report advisory coverage for changed Python lines under app/.

The report intentionally has no coverage threshold. A low percentage is an
observation for review, while malformed or incomplete coverage evidence fails
closed so CI does not publish a misleading result.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


class CoverageReportError(RuntimeError):
    """Raised when changed-code coverage evidence is incomplete or invalid."""


@dataclass(frozen=True)
class FileCoverage:
    path: str
    changed_lines: tuple[int, ...]
    executable_lines: tuple[int, ...]
    covered_lines: tuple[int, ...]
    missing_lines: tuple[int, ...]
    branch_arcs: tuple[tuple[int, int], ...]
    covered_branches: tuple[tuple[int, int], ...]
    missing_branches: tuple[tuple[int, int], ...]


def _git_diff(repo: Path, base: str, head: str) -> str:
    completed = subprocess.run(
        [
            "git",
            "diff",
            "--unified=0",
            "--no-ext-diff",
            "--find-renames",
            "--diff-filter=ACMR",
            f"{base}...{head}",
            "--",
            "app",
        ],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "git diff failed"
        raise CoverageReportError(detail)
    return completed.stdout


def parse_changed_python_lines(diff_text: str) -> dict[str, set[int]]:
    """Return added or modified line numbers for Python files under app/."""

    changed: dict[str, set[int]] = {}
    current_path: str | None = None
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            candidate = line[4:]
            if candidate == "/dev/null":
                current_path = None
                continue
            if candidate.startswith("b/"):
                candidate = candidate[2:]
            current_path = (
                candidate
                if candidate.startswith("app/") and candidate.endswith(".py")
                else None
            )
            continue

        match = HUNK_HEADER.match(line)
        if match is None or current_path is None:
            continue
        start = int(match.group(1))
        count = int(match.group(2) or "1")
        if count > 0:
            changed.setdefault(current_path, set()).update(range(start, start + count))
    return changed


def _as_int_set(value: Any, *, field: str, path: str) -> set[int]:
    if not isinstance(value, list) or any(not isinstance(item, int) for item in value):
        raise CoverageReportError(f"{path}: {field} must be a list of integers")
    return set(value)


def _as_arc_set(value: Any, *, field: str, path: str) -> set[tuple[int, int]]:
    if not isinstance(value, list):
        raise CoverageReportError(f"{path}: {field} must be a list")
    arcs: set[tuple[int, int]] = set()
    for item in value:
        if (
            not isinstance(item, list)
            or len(item) != 2
            or any(not isinstance(part, int) for part in item)
        ):
            raise CoverageReportError(f"{path}: {field} contains an invalid branch arc")
        arcs.add((item[0], item[1]))
    return arcs


def build_report(
    coverage_payload: dict[str, Any],
    changed: dict[str, set[int]],
    *,
    base: str,
    head: str,
) -> dict[str, Any]:
    files_payload = coverage_payload.get("files")
    if not isinstance(files_payload, dict):
        raise CoverageReportError("coverage JSON must contain a files object")

    file_reports: list[FileCoverage] = []
    for path in sorted(changed):
        record = files_payload.get(path)
        if not isinstance(record, dict):
            raise CoverageReportError(
                f"coverage JSON has no record for changed Python file {path}"
            )

        executed_lines = _as_int_set(
            record.get("executed_lines"), field="executed_lines", path=path
        )
        missing_lines = _as_int_set(record.get("missing_lines"), field="missing_lines", path=path)
        executed_branches = _as_arc_set(
            record.get("executed_branches"), field="executed_branches", path=path
        )
        missing_branches = _as_arc_set(
            record.get("missing_branches"), field="missing_branches", path=path
        )

        changed_lines = changed[path]
        executable = changed_lines & (executed_lines | missing_lines)
        covered = executable & executed_lines
        missing = executable & missing_lines
        all_branches = {
            arc for arc in executed_branches | missing_branches if arc[0] in changed_lines
        }
        covered_branch_arcs = all_branches & executed_branches
        missing_branch_arcs = all_branches & missing_branches

        file_reports.append(
            FileCoverage(
                path=path,
                changed_lines=tuple(sorted(changed_lines)),
                executable_lines=tuple(sorted(executable)),
                covered_lines=tuple(sorted(covered)),
                missing_lines=tuple(sorted(missing)),
                branch_arcs=tuple(sorted(all_branches)),
                covered_branches=tuple(sorted(covered_branch_arcs)),
                missing_branches=tuple(sorted(missing_branch_arcs)),
            )
        )

    total_changed = sum(len(item.changed_lines) for item in file_reports)
    total_executable = sum(len(item.executable_lines) for item in file_reports)
    total_covered = sum(len(item.covered_lines) for item in file_reports)
    total_branches = sum(len(item.branch_arcs) for item in file_reports)
    total_covered_branches = sum(len(item.covered_branches) for item in file_reports)

    return {
        "schema_version": "npcink-changed-code-coverage-v1",
        "scope": "app/**/*.py",
        "advisory": True,
        "threshold": None,
        "base": base,
        "head": head,
        "totals": {
            "files": len(file_reports),
            "changed_lines": total_changed,
            "executable_lines": total_executable,
            "covered_lines": total_covered,
            "line_rate": _rate(total_covered, total_executable),
            "branches": total_branches,
            "covered_branches": total_covered_branches,
            "branch_rate": _rate(total_covered_branches, total_branches),
        },
        "files": [
            {
                "path": item.path,
                "changed_lines": list(item.changed_lines),
                "executable_lines": len(item.executable_lines),
                "covered_lines": len(item.covered_lines),
                "missing_lines": list(item.missing_lines),
                "line_rate": _rate(len(item.covered_lines), len(item.executable_lines)),
                "branches": len(item.branch_arcs),
                "covered_branches": len(item.covered_branches),
                "missing_branches": [list(arc) for arc in item.missing_branches],
                "branch_rate": _rate(len(item.covered_branches), len(item.branch_arcs)),
            }
            for item in file_reports
        ],
    }


def coverage_payload_from_data(data_path: Path, changed: dict[str, set[int]]) -> dict[str, Any]:
    try:
        from coverage import Coverage
    except ImportError as error:
        raise CoverageReportError("coverage.py is required to read coverage data") from error

    coverage = Coverage(data_file=str(data_path), branch=True)
    coverage.load()
    files: dict[str, dict[str, Any]] = {}
    for path in changed:
        analysis = coverage._analyze(path)
        executed_branches = [
            [source, destination]
            for source, destinations in analysis.executed_branch_arcs().items()
            for destination in destinations
        ]
        missing_branches = [
            [source, destination]
            for source, destinations in analysis.missing_branch_arcs().items()
            for destination in destinations
        ]
        files[path] = {
            "executed_lines": sorted(analysis.statements - analysis.missing),
            "missing_lines": sorted(analysis.missing),
            "executed_branches": executed_branches,
            "missing_branches": missing_branches,
        }
    return {"files": files}


def _rate(covered: int, total: int) -> float | None:
    if total == 0:
        return None
    return round(covered / total, 4)


def _percentage(rate: float | None) -> str:
    return "n/a" if rate is None else f"{rate * 100:.1f}%"


def _compact_lines(lines: list[int]) -> str:
    if not lines:
        return "—"
    ranges: list[str] = []
    start = previous = lines[0]
    for line in lines[1:]:
        if line == previous + 1:
            previous = line
            continue
        ranges.append(str(start) if start == previous else f"{start}-{previous}")
        start = previous = line
    ranges.append(str(start) if start == previous else f"{start}-{previous}")
    return ", ".join(ranges)


def render_markdown(report: dict[str, Any]) -> str:
    totals = report["totals"]
    lines = [
        "## Changed-code coverage (advisory)",
        "",
        "This report covers executable Python lines changed under `app/**`. "
        "It has no threshold and does not block merging because of a low percentage.",
        "",
    ]
    if totals["files"] == 0:
        lines.append("No changed Python lines under `app/**` were found in this pull request.")
        lines.append("")
        return "\n".join(lines)

    lines.extend(
        [
            f"- Line coverage: **{totals['covered_lines']} / {totals['executable_lines']} "
            f"({_percentage(totals['line_rate'])})**",
            f"- Branch coverage: **{totals['covered_branches']} / {totals['branches']} "
            f"({_percentage(totals['branch_rate'])})**",
            f"- Changed source lines: {totals['changed_lines']} across {totals['files']} file(s); "
            "comments, blank lines, and other non-executable lines are excluded "
            "from the line denominator.",
            "",
            "| File | Changed line coverage | Changed branch coverage | Uncovered changed lines |",
            "| --- | ---: | ---: | --- |",
        ]
    )
    for item in report["files"]:
        lines.append(
            f"| `{item['path']}` | {item['covered_lines']} / {item['executable_lines']} "
            f"({_percentage(item['line_rate'])}) | {item['covered_branches']} / "
            f"{item['branches']} ({_percentage(item['branch_rate'])}) | "
            f"{_compact_lines(item['missing_lines'])} |"
        )
    lines.extend(
        [
            "",
            "Branch opportunities are coverage.py arcs whose source line was changed. "
            "Use the JSON artifact for missing branch destinations.",
            "",
        ]
    )
    return "\n".join(lines)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coverage-json", type=Path)
    parser.add_argument("--coverage-data", type=Path)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--markdown-output", type=Path)
    parser.add_argument("--json-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        changed = parse_changed_python_lines(_git_diff(args.repo, args.base, args.head))
        if changed:
            if args.coverage_data is not None:
                payload = coverage_payload_from_data(args.coverage_data, changed)
            elif args.coverage_json is not None:
                payload = json.loads(args.coverage_json.read_text(encoding="utf-8"))
                if not isinstance(payload, dict):
                    raise CoverageReportError("coverage JSON root must be an object")
            else:
                raise CoverageReportError(
                    "--coverage-json or --coverage-data is required when app Python lines changed"
                )
        else:
            payload = {"files": {}}
        report = build_report(payload, changed, base=args.base, head=args.head)
        markdown = render_markdown(report)
    except (CoverageReportError, OSError, json.JSONDecodeError) as error:
        print(f"changed-code coverage report failed: {error}", file=sys.stderr)
        return 2

    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(markdown, encoding="utf-8")
    else:
        print(markdown)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
