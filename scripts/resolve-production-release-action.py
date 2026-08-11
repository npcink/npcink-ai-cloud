#!/usr/bin/env python3
"""Validate an exact production release plan and resolve its deploy action."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class ResolutionError(ValueError):
    """Raised when a release plan cannot authorize an execution action."""


@dataclass(frozen=True)
class Resolution:
    lane: str
    action: str
    health_profile: str


def _load_release_plan_module() -> Any:
    module_path = Path(__file__).resolve().with_name("production-release-plan.py")
    spec = importlib.util.spec_from_file_location("npcink_production_release_plan", module_path)
    if spec is None or spec.loader is None:
        raise ResolutionError("production release-plan module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise ResolutionError(f"production release-plan module failed: {exc}") from exc
    return module


def _require_sha(value: object, label: str) -> str:
    normalized = str(value or "").strip().lower()
    if SHA_PATTERN.fullmatch(normalized) is None:
        raise ResolutionError(f"{label} must be a full Git SHA")
    return normalized


def resolve_plan(
    payload: object,
    *,
    expected_repository: str,
    expected_head_sha: str,
    expected_head_tree: str,
) -> Resolution:
    if not isinstance(payload, dict):
        raise ResolutionError("production release plan must be a JSON object")
    module = _load_release_plan_module()
    if payload.get("schema") != module.SCHEMA:
        raise ResolutionError("production release plan schema is unsupported")
    if payload.get("repository") != expected_repository:
        raise ResolutionError("production release plan repository does not match")
    if _require_sha(payload.get("head_sha"), "plan head SHA") != _require_sha(
        expected_head_sha, "expected head SHA"
    ):
        raise ResolutionError("production release plan head SHA does not match")
    if _require_sha(payload.get("head_tree"), "plan head tree") != _require_sha(
        expected_head_tree, "expected head tree"
    ):
        raise ResolutionError("production release plan head tree does not match")
    _require_sha(payload.get("base_sha"), "plan base SHA")

    changed_files = payload.get("changed_files")
    if not isinstance(changed_files, list) or not all(
        isinstance(path, str) for path in changed_files
    ):
        raise ResolutionError("production release plan changed files are invalid")
    try:
        expected_lane, expected_flags, normalized_files = module.classify_release(
            changed_files
        )
    except Exception as exc:
        raise ResolutionError(f"production release plan paths are invalid: {exc}") from exc
    if changed_files != list(normalized_files):
        raise ResolutionError("production release plan changed files are not canonical")
    if payload.get("lane") != expected_lane:
        raise ResolutionError("production release plan lane does not match changed files")
    for key, expected_value in expected_flags.items():
        value = payload.get(key)
        if type(value) is not bool or value is not expected_value:
            raise ResolutionError(f"production release plan flag is inconsistent: {key}")

    inputs = payload.get("application_image_inputs")
    if not isinstance(inputs, dict) or inputs.get("schema") != (
        "npcink.production_application_image_inputs.v1"
    ):
        raise ResolutionError("production application-image inputs are invalid")
    images = inputs.get("images")
    if (
        not isinstance(images, list)
        or len(images) != 2
        or {record.get("key") for record in images if isinstance(record, dict)}
        != {"api", "frontend"}
    ):
        raise ResolutionError("production application-image roles are invalid")
    for record in images:
        if not isinstance(record, dict) or re.fullmatch(
            r"[0-9a-f]{64}", str(record.get("fingerprint") or "")
        ) is None:
            raise ResolutionError("production application-image fingerprint is invalid")

    lane = expected_lane
    if lane == "no_deploy":
        return Resolution(lane=lane, action="no_deploy", health_profile="none")
    if lane == "static":
        return Resolution(lane=lane, action="static", health_profile="static")
    if lane in {"frontend", "backend", "migration", "config", "full"}:
        return Resolution(lane=lane, action="runtime", health_profile="runtime")
    raise ResolutionError(f"unsupported production release lane: {lane}")


def _append_lines(path: Path, lines: list[str]) -> None:
    with path.open("a", encoding="utf-8") as stream:
        stream.write("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--head-tree", required=True)
    parser.add_argument("--github-output", type=Path)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.plan.read_text(encoding="utf-8"))
        resolution = resolve_plan(
            payload,
            expected_repository=args.repository,
            expected_head_sha=args.head_sha,
            expected_head_tree=args.head_tree,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ResolutionError) as exc:
        raise SystemExit(f"production release action resolution failed: {exc}") from exc

    output_lines = [
        f"lane={resolution.lane}",
        f"action={resolution.action}",
        f"health_profile={resolution.health_profile}",
    ]
    if args.github_output is not None:
        _append_lines(args.github_output, output_lines)
    if args.summary is not None:
        _append_lines(
            args.summary,
            [
                "## Production Release Execution",
                "",
                *[f"- {line}" for line in output_lines],
            ],
        )
    print("\n".join(output_lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
