#!/usr/bin/env python3
"""Validate human and trusted Dependabot pull-request contracts."""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

HUMAN_REQUIRED_HEADINGS = {
    "Scope": re.compile(r"(?im)^#{1,6}\s+.*\bscope\b"),
    "Boundary": re.compile(r"(?im)^#{1,6}\s+.*\bboundary\b"),
    "Verification": re.compile(r"(?im)^#{1,6}\s+.*\bverification\b"),
    "Risk": re.compile(r"(?im)^#{1,6}\s+.*\brisk\b"),
}
DEPENDABOT_LOGINS = {"dependabot[bot]", "app/dependabot"}
DEPENDABOT_BUMP = re.compile(
    r"(?im)^Bumps\s+\[[^\]]+\]\([^)]+\)\s+from\s+\S+\s+to\s+\S+\."
)
DEPENDENCY_FILE_NAMES = {
    "composer.json",
    "composer.lock",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "package.json",
    "Pipfile",
    "Pipfile.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "pyproject.toml",
    "uv.lock",
    "yarn.lock",
}


class ContractError(RuntimeError):
    """Raised when a pull request violates its applicable contract."""


def is_allowed_dependency_file(path: str) -> bool:
    normalized = path.strip("/")
    name = Path(normalized).name
    if name in DEPENDENCY_FILE_NAMES:
        return True
    if re.fullmatch(r"requirements(?:-[A-Za-z0-9_.-]+)?\.txt", name):
        return True
    if normalized in {".github/dependabot.yml", ".github/dependabot.yaml"}:
        return True
    return bool(
        re.fullmatch(r"\.github/workflows/[^/]+\.(?:yml|yaml)", normalized)
    )


def validate_contract(payload: dict[str, Any], changed_files: list[str]) -> str:
    pull_request = payload.get("pull_request") or {}
    user = pull_request.get("user") or {}
    author_login = str(user.get("login") or "")
    author_type = str(user.get("type") or "")
    body = str(pull_request.get("body") or "")

    if author_type == "Bot" and author_login in DEPENDABOT_LOGINS:
        head = pull_request.get("head") or {}
        base = pull_request.get("base") or {}
        head_repo = (head.get("repo") or {}).get("full_name")
        base_repo = (base.get("repo") or {}).get("full_name")
        head_ref = str(head.get("ref") or "")
        base_ref = str(base.get("ref") or "")

        failures: list[str] = []
        if not head_repo or head_repo != base_repo:
            failures.append("head repository must equal the base repository")
        if not head_ref.startswith("dependabot/"):
            failures.append("head ref must start with dependabot/")
        if base_ref != "master":
            failures.append("base ref must be master")
        if not changed_files:
            failures.append("changed-file evidence is required")
        disallowed = sorted(
            path for path in changed_files if not is_allowed_dependency_file(path)
        )
        if disallowed:
            failures.append(
                "only dependency manifests, lockfiles, Dependabot config, or "
                "GitHub workflow files are allowed; rejected: " + ", ".join(disallowed)
            )
        if not DEPENDABOT_BUMP.search(body):
            failures.append(
                "body must retain Dependabot's package and from/to version statement"
            )
        if failures:
            raise ContractError("Dependabot PR contract failed: " + "; ".join(failures))
        return "dependabot"

    missing = [
        name
        for name, pattern in HUMAN_REQUIRED_HEADINGS.items()
        if not pattern.search(body)
    ]
    if missing:
        raise ContractError(
            "PR body is missing required section heading(s): " + ", ".join(missing)
        )
    return "human"


def fetch_changed_files(payload: dict[str, Any]) -> list[str]:
    override = os.environ.get("PR_CONTRACT_CHANGED_FILES_JSON")
    if override is not None:
        value = json.loads(override)
        if not isinstance(value, list) or not all(
            isinstance(item, str) for item in value
        ):
            raise ContractError(
                "PR_CONTRACT_CHANGED_FILES_JSON must be a JSON array of paths"
            )
        return value

    repository = os.environ.get("GITHUB_REPOSITORY") or (
        payload.get("repository") or {}
    ).get("full_name")
    number = (payload.get("pull_request") or {}).get("number") or payload.get("number")
    token = os.environ.get("GITHUB_TOKEN")
    if not repository or not number or not token:
        raise ContractError(
            "repository, pull-request number, and GITHUB_TOKEN are required "
            "to inspect changed files"
        )

    files: list[str] = []
    page = 1
    while True:
        query = urllib.parse.urlencode({"per_page": 100, "page": page})
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repository}/pulls/{number}/files?{query}",
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            batch = json.load(response)
        if not isinstance(batch, list):
            raise ContractError("GitHub changed-files response was not a list")
        files.extend(str(item.get("filename") or "") for item in batch)
        if len(batch) < 100:
            break
        page += 1
    return [path for path in files if path]


def main() -> int:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        print("GITHUB_EVENT_PATH is required", file=sys.stderr)
        return 2
    try:
        payload = json.loads(Path(event_path).read_text(encoding="utf-8"))
        changed_files = fetch_changed_files(payload)
        lane = validate_contract(payload, changed_files)
    except (ContractError, json.JSONDecodeError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"PR body contract: ok ({lane} lane)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
