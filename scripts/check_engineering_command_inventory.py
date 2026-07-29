#!/usr/bin/env python3
"""Validate and render the package command governance inventory."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INVENTORY_PATH = ROOT / "config" / "engineering-command-inventory-v1.json"
PACKAGE_PATHS = {
    "root": ROOT / "package.json",
    "frontend": ROOT / "frontend" / "package.json",
}
VALID_ENVIRONMENTS = {
    "authoring_mac",
    "local_docker",
    "local_browser",
    "shared_m4",
    "remote_host",
    "production",
    "github_ci",
    "external_provider",
}
VALID_EFFECTS = {
    "read_only",
    "local_state_mutation",
    "source_tree_mutation",
    "shared_runtime_mutation",
    "remote_state_mutation",
    "production_mutation",
    "external_call_or_quota",
}
VALID_APPROVALS = {
    "none",
    "coordinate_if_occupied",
    "shared_runtime_owner_required",
    "provider_budget_required",
    "operator_target_required",
    "production_approval_required",
}
VALID_USAGE = {"ci", "release", "runbook", "contract", "automation", "manual"}
VALID_STATUSES = {"active", "review_required", "deprecated"}
ROOT_COMMAND_PATTERN = re.compile(r"\b(?:pnpm|npm)\s+run\s+([A-Za-z0-9:_.-]+)")
FRONTEND_COMMAND_PATTERN = re.compile(
    r"\bpnpm\s+(?:--dir|-C)\s+frontend\s+run\s+([A-Za-z0-9:_.-]+)"
)


class InventoryError(ValueError):
    """Raised when command inventory metadata is incomplete or inconsistent."""


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise InventoryError(f"missing required file: {path.relative_to(ROOT)}") from exc
    except json.JSONDecodeError as exc:
        raise InventoryError(
            f"invalid JSON in {path.relative_to(ROOT)}: {exc.msg} at line {exc.lineno}"
        ) from exc


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InventoryError(f"{field} must be a non-empty string")
    return value.strip()


def _require_string_list(value: Any, field: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(item, str) or not item.strip() for item in value)
    ):
        raise InventoryError(f"{field} must be a non-empty string list")
    return [item.strip() for item in value]


def load_inventory() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    document = _read_json(INVENTORY_PATH)
    if document.get("schema_version") != 1:
        raise InventoryError("schema_version must be 1")

    profiles = document.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise InventoryError("profiles must be a non-empty object")

    normalized_profiles: dict[str, dict[str, Any]] = {}
    for profile_name, profile in profiles.items():
        _require_string(profile_name, "profile name")
        if not isinstance(profile, dict):
            raise InventoryError(f"profile {profile_name} must be an object")
        environments = _require_string_list(
            profile.get("environments"), f"profile {profile_name}.environments"
        )
        unknown_environments = sorted(set(environments) - VALID_ENVIRONMENTS)
        if unknown_environments:
            raise InventoryError(
                f"profile {profile_name} has unknown environments: "
                f"{', '.join(unknown_environments)}"
            )
        effect = _require_string(profile.get("effect"), f"profile {profile_name}.effect")
        if effect not in VALID_EFFECTS:
            raise InventoryError(f"profile {profile_name} has unknown effect: {effect}")
        approval = _require_string(
            profile.get("approval"), f"profile {profile_name}.approval"
        )
        if approval not in VALID_APPROVALS:
            raise InventoryError(
                f"profile {profile_name} has unknown approval: {approval}"
            )
        normalized_profiles[profile_name] = {
            "environments": environments,
            "effect": effect,
            "approval": approval,
        }

    groups = document.get("groups")
    if not isinstance(groups, list) or not groups:
        raise InventoryError("groups must be a non-empty list")

    entries: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for index, group in enumerate(groups):
        label = f"groups[{index}]"
        if not isinstance(group, dict):
            raise InventoryError(f"{label} must be an object")
        package = _require_string(group.get("package"), f"{label}.package")
        if package not in PACKAGE_PATHS:
            raise InventoryError(f"{label} has unknown package: {package}")
        profile_name = _require_string(group.get("profile"), f"{label}.profile")
        if profile_name not in normalized_profiles:
            raise InventoryError(f"{label} has unknown profile: {profile_name}")
        owner_doc = _require_string(group.get("owner_doc"), f"{label}.owner_doc")
        owner_path = ROOT / owner_doc
        if not owner_path.is_file():
            raise InventoryError(f"{label} owner_doc does not exist: {owner_doc}")
        usage = _require_string_list(group.get("used_by"), f"{label}.used_by")
        unknown_usage = sorted(set(usage) - VALID_USAGE)
        if unknown_usage:
            raise InventoryError(
                f"{label} has unknown used_by values: {', '.join(unknown_usage)}"
            )
        evidence = _require_string_list(group.get("evidence"), f"{label}.evidence")
        for evidence_path in evidence:
            if not (ROOT / evidence_path).exists():
                raise InventoryError(
                    f"{label} evidence path does not exist: {evidence_path}"
                )
        status = _require_string(group.get("status"), f"{label}.status")
        if status not in VALID_STATUSES:
            raise InventoryError(f"{label} has unknown status: {status}")
        if status == "deprecated":
            _require_string(group.get("replacement"), f"{label}.replacement")
            _require_string(
                group.get("removal_condition"), f"{label}.removal_condition"
            )
        commands = group.get("commands")
        if not isinstance(commands, dict) or not commands:
            raise InventoryError(f"{label}.commands must be a non-empty object")

        for command_name, purpose in commands.items():
            command_name = _require_string(command_name, f"{label} command name")
            purpose = _require_string(
                purpose, f"{label}.commands[{command_name!r}] purpose"
            )
            key = (package, command_name)
            if key in seen:
                raise InventoryError(
                    f"duplicate inventory command: {package}:{command_name}"
                )
            seen.add(key)
            profile = normalized_profiles[profile_name]
            entries.append(
                {
                    "package": package,
                    "name": command_name,
                    "purpose": purpose,
                    "profile": profile_name,
                    "environments": profile["environments"],
                    "effect": profile["effect"],
                    "approval": profile["approval"],
                    "owner_doc": owner_doc,
                    "used_by": usage,
                    "evidence": evidence,
                    "status": status,
                    "replacement": group.get("replacement"),
                    "removal_condition": group.get("removal_condition"),
                }
            )

    return normalized_profiles, entries


def validate_package_coverage(entries: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for package, package_path in PACKAGE_PATHS.items():
        package_document = _read_json(package_path)
        scripts = package_document.get("scripts")
        if not isinstance(scripts, dict):
            raise InventoryError(
                f"{package_path.relative_to(ROOT)} scripts must be an object"
            )
        actual = set(scripts)
        inventoried = {
            entry["name"] for entry in entries if entry["package"] == package
        }
        missing = sorted(actual - inventoried)
        extra = sorted(inventoried - actual)
        if missing or extra:
            details = []
            if missing:
                details.append(f"missing from inventory: {', '.join(missing)}")
            if extra:
                details.append(f"not present in package scripts: {', '.join(extra)}")
            raise InventoryError(f"{package} command coverage mismatch; {'; '.join(details)}")
        counts[package] = len(actual)
    return counts


def _usage_kind(path: str) -> str:
    if path.startswith(".github/workflows/"):
        return "ci"
    if path.startswith("deploy/") and not path.endswith(".md"):
        return "release"
    if (
        path.endswith(".md")
        or path in {"README.md", "AGENTS.md", "CONTRIBUTING.md", "SECURITY.md"}
    ):
        return "runbook"
    if path.startswith("tests/") or path.startswith("frontend/tests/"):
        return "contract"
    return "automation"


def scan_observed_usage() -> dict[tuple[str, str], dict[str, list[str]]]:
    try:
        tracked_output = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        ).stdout
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise InventoryError("git ls-files is required to classify command usage") from exc

    observed: dict[tuple[str, str], set[str]] = {}
    evidence: dict[tuple[str, str], set[str]] = {}
    for raw_path in tracked_output.decode("utf-8").split("\0"):
        if not raw_path:
            continue
        file_path = ROOT / raw_path
        if not file_path.is_file():
            continue
        try:
            source = file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        matches = [
            ("frontend", name)
            for name in FRONTEND_COMMAND_PATTERN.findall(source)
        ]
        matches.extend(("root", name) for name in ROOT_COMMAND_PATTERN.findall(source))
        usage_kind = _usage_kind(raw_path)
        for key in matches:
            observed.setdefault(key, set()).add(usage_kind)
            evidence.setdefault(key, set()).add(raw_path)

    return {
        key: {
            "usage": sorted(kinds),
            "evidence": sorted(evidence.get(key, set())),
        }
        for key, kinds in observed.items()
    }


def inventory_payload() -> dict[str, Any]:
    profiles, entries = load_inventory()
    counts = validate_package_coverage(entries)
    observed = scan_observed_usage()
    for entry in entries:
        observation = observed.get((entry["package"], entry["name"]))
        entry["observed_usage"] = (
            observation["usage"] if observation is not None else ["manual"]
        )
        entry["observed_evidence"] = (
            observation["evidence"] if observation is not None else []
        )
    status_counts = {
        status: sum(entry["status"] == status for entry in entries)
        for status in sorted(VALID_STATUSES)
    }
    return {
        "schema_version": 1,
        "counts": {**counts, "total": sum(counts.values())},
        "status_counts": status_counts,
        "profiles": profiles,
        "commands": sorted(entries, key=lambda item: (item["package"], item["name"])),
    }


def _markdown(payload: dict[str, Any]) -> str:
    lines = [
        (
            "| Package | Command | Status | Purpose | Environment | Effect | "
            "Approval | Observed by | Owner |"
        ),
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for entry in payload["commands"]:
        values = [
            entry["package"],
            f"`{entry['name']}`",
            entry["status"],
            entry["purpose"],
            ", ".join(entry["environments"]),
            entry["effect"],
            entry["approval"],
            ", ".join(entry["observed_usage"]),
            f"`{entry['owner_doc']}`",
        ]
        lines.append("| " + " | ".join(value.replace("|", "\\|") for value in values) + " |")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--format",
        choices=("summary", "json", "markdown"),
        default="summary",
        help="output format after validation (default: summary)",
    )
    args = parser.parse_args()
    try:
        payload = inventory_payload()
    except InventoryError as exc:
        print(f"[fail] engineering command inventory: {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.format == "markdown":
        print(_markdown(payload))
    else:
        counts = payload["counts"]
        statuses = payload["status_counts"]
        print(
            "[pass] engineering command inventory: "
            f"root={counts['root']} frontend={counts['frontend']} "
            f"total={counts['total']} active={statuses['active']} "
            f"review_required={statuses['review_required']} "
            f"deprecated={statuses['deprecated']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
