#!/usr/bin/env python3
"""Fail-closed validation of the production PR base/head contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


class ProductionPrBaseError(ValueError):
    pass


def validate(event: dict[str, object], *, repository: str) -> dict[str, str]:
    pull = event.get("pull_request")
    if not isinstance(pull, dict):
        raise ProductionPrBaseError("pull_request event payload is required")
    base = pull.get("base")
    head = pull.get("head")
    if not isinstance(base, dict) or not isinstance(head, dict):
        raise ProductionPrBaseError("pull request base and head metadata are required")
    base_repo = base.get("repo")
    head_repo = head.get("repo")
    if not isinstance(base_repo, dict) or not isinstance(head_repo, dict):
        raise ProductionPrBaseError("pull request base and head repositories are required")
    if base.get("ref") != "production":
        raise ProductionPrBaseError("production release PR must target production")
    if base_repo.get("full_name") != repository:
        raise ProductionPrBaseError(
            "production PR base repository must equal the current repository"
        )
    if head_repo.get("full_name") != repository:
        raise ProductionPrBaseError(
            "production PR head repository must equal the current repository"
        )
    head_ref = str(head.get("ref") or "")
    if head_ref != "master" and not head_ref.startswith("release-fix/"):
        raise ProductionPrBaseError("production PR head must be master or release-fix/*")
    body = str(pull.get("body") or "")
    if "Approved for production validation by operator." not in body:
        raise ProductionPrBaseError("production PR body is missing operator approval")
    return {
        "contract_version": "npcink.production-pr-base.v1",
        "status": "passed",
        "base_ref": "production",
        "base_repository": repository,
        "head_ref": head_ref,
        "head_repository": repository,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True, type=Path)
    parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    try:
        event = json.loads(args.event.read_text(encoding="utf-8"))
        if not isinstance(event, dict):
            raise ProductionPrBaseError("event payload must be an object")
        print(json.dumps(validate(event, repository=args.repository), indent=2, sort_keys=True))
        return 0
    except (OSError, json.JSONDecodeError, ProductionPrBaseError) as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
