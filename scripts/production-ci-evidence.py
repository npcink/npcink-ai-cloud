#!/usr/bin/env python3
"""Create and verify SHA-bound production PR CI evidence receipts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SCHEMA = "npcink.production_pr_ci_evidence.v1"
CI_WORKFLOW_PATH = ".github/workflows/ci.yml"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
RESULTS = {"success", "skipped"}


class EvidenceError(ValueError):
    """Raised when production CI evidence is incomplete or contradictory."""


def _require_sha(value: object, field: str) -> str:
    if not isinstance(value, str) or SHA_PATTERN.fullmatch(value) is None:
        raise EvidenceError(f"{field} must be a lowercase 40-character Git SHA")
    return value


def _require_positive_int(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise EvidenceError(f"{field} must be a positive integer")
    return value


def _require_result(value: object, field: str) -> str:
    if not isinstance(value, str) or value not in RESULTS:
        raise EvidenceError(f"{field} must be success or skipped")
    return value


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceError(f"unable to read JSON evidence {path}: {exc}") from exc


def validate_receipt(receipt: object) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise EvidenceError("receipt must be a JSON object")
    if receipt.get("schema") != SCHEMA:
        raise EvidenceError(f"receipt schema must be {SCHEMA}")

    repository = receipt.get("repository")
    if not isinstance(repository, str) or repository.count("/") != 1:
        raise EvidenceError("repository must use owner/name form")

    pull_request = receipt.get("pull_request")
    workflow = receipt.get("workflow")
    gates = receipt.get("gates")
    if not isinstance(pull_request, dict):
        raise EvidenceError("pull_request must be an object")
    if not isinstance(workflow, dict):
        raise EvidenceError("workflow must be an object")
    if not isinstance(gates, dict):
        raise EvidenceError("gates must be an object")

    _require_positive_int(pull_request.get("number"), "pull_request.number")
    if pull_request.get("base_ref") != "production":
        raise EvidenceError("pull_request.base_ref must be production")
    _require_sha(pull_request.get("head_sha"), "pull_request.head_sha")

    _require_positive_int(workflow.get("run_id"), "workflow.run_id")
    if workflow.get("path") != CI_WORKFLOW_PATH:
        raise EvidenceError(f"workflow.path must be {CI_WORKFLOW_PATH}")
    _require_sha(workflow.get("tested_sha"), "workflow.tested_sha")
    _require_sha(workflow.get("tested_tree"), "workflow.tested_tree")

    static_terms_only = gates.get("static_terms_only")
    if not isinstance(static_terms_only, bool):
        raise EvidenceError("gates.static_terms_only must be boolean")
    secret_scan = _require_result(gates.get("secret_scan"), "gates.secret_scan")
    backend = _require_result(gates.get("backend"), "gates.backend")
    frontend = _require_result(gates.get("frontend"), "gates.frontend")
    static_terms = _require_result(gates.get("static_terms"), "gates.static_terms")
    if secret_scan != "success":
        raise EvidenceError("production PR secret scan must pass")
    if static_terms_only:
        if (backend, frontend, static_terms) != ("skipped", "skipped", "success"):
            raise EvidenceError(
                "static-terms production PRs require static terms success and skipped "
                "backend/frontend gates"
            )
    elif (backend, frontend, static_terms) != ("success", "success", "skipped"):
        raise EvidenceError(
            "ordinary production PRs require backend/frontend success and a skipped "
            "static terms gate"
        )
    return receipt


def create_receipt(
    *,
    repository: str,
    pr_number: int,
    head_sha: str,
    run_id: int,
    tested_sha: str,
    tested_tree: str,
    static_terms_only: bool,
    secret_scan: str,
    backend: str,
    frontend: str,
    static_terms: str,
) -> dict[str, Any]:
    return validate_receipt(
        {
            "schema": SCHEMA,
            "repository": repository,
            "pull_request": {
                "number": pr_number,
                "base_ref": "production",
                "head_sha": head_sha,
            },
            "workflow": {
                "run_id": run_id,
                "path": CI_WORKFLOW_PATH,
                "tested_sha": tested_sha,
                "tested_tree": tested_tree,
            },
            "gates": {
                "static_terms_only": static_terms_only,
                "secret_scan": secret_scan,
                "backend": backend,
                "frontend": frontend,
                "static_terms": static_terms,
            },
        }
    )


def verify_production_evidence(
    *,
    repository: str,
    production_sha: str,
    production_commit: object,
    associated_pull_requests: object,
    ci_run: object,
    receipt: object,
) -> dict[str, Any]:
    production_sha = _require_sha(production_sha, "production_sha")
    if not isinstance(production_commit, dict):
        raise EvidenceError("production commit metadata must be an object")
    if production_commit.get("sha") != production_sha:
        raise EvidenceError("production commit metadata SHA does not match")
    production_tree = production_commit.get("tree")
    if not isinstance(production_tree, dict):
        raise EvidenceError("production commit tree metadata must be an object")
    production_tree_sha = _require_sha(
        production_tree.get("sha"), "production_commit.tree.sha"
    )

    if not isinstance(associated_pull_requests, list):
        raise EvidenceError("associated pull requests must be a list")
    matches: list[dict[str, Any]] = []
    for candidate in associated_pull_requests:
        if not isinstance(candidate, dict):
            continue
        base = candidate.get("base")
        head = candidate.get("head")
        head_repo = head.get("repo") if isinstance(head, dict) else None
        if (
            isinstance(base, dict)
            and base.get("ref") == "production"
            and candidate.get("merged_at")
            and candidate.get("merge_commit_sha") == production_sha
            and isinstance(head_repo, dict)
            and head_repo.get("full_name") == repository
        ):
            matches.append(candidate)
    if len(matches) != 1:
        raise EvidenceError(
            "production commit must have exactly one merged same-repository production PR"
        )
    pull_request = matches[0]
    pr_number = _require_positive_int(pull_request.get("number"), "PR number")
    head = pull_request.get("head")
    if not isinstance(head, dict):
        raise EvidenceError("production PR head metadata must be an object")
    pr_head_sha = _require_sha(head.get("sha"), "production PR head SHA")

    if not isinstance(ci_run, dict):
        raise EvidenceError("CI run metadata must be an object")
    ci_run_id = _require_positive_int(ci_run.get("id"), "CI run id")
    if ci_run.get("event") != "pull_request":
        raise EvidenceError("CI evidence run must be a pull_request run")
    if ci_run.get("conclusion") != "success":
        raise EvidenceError("CI evidence run must conclude successfully")
    if ci_run.get("path") != CI_WORKFLOW_PATH:
        raise EvidenceError(f"CI evidence run must use {CI_WORKFLOW_PATH}")
    if ci_run.get("head_sha") != pr_head_sha:
        raise EvidenceError("CI evidence run head SHA does not match the production PR")

    validated_receipt = validate_receipt(receipt)
    receipt_pr = validated_receipt["pull_request"]
    receipt_workflow = validated_receipt["workflow"]
    if validated_receipt["repository"] != repository:
        raise EvidenceError("receipt repository does not match")
    if receipt_pr["number"] != pr_number:
        raise EvidenceError("receipt PR number does not match")
    if receipt_pr["head_sha"] != pr_head_sha:
        raise EvidenceError("receipt head SHA does not match")
    if receipt_workflow["run_id"] != ci_run_id:
        raise EvidenceError("receipt workflow run id does not match")
    if receipt_workflow["tested_tree"] != production_tree_sha:
        raise EvidenceError(
            "production commit tree does not match the tree tested by the production PR"
        )

    return {
        "schema": "npcink.production_ci_reuse_verification.v1",
        "repository": repository,
        "production_sha": production_sha,
        "production_tree": production_tree_sha,
        "pull_request_number": pr_number,
        "pull_request_head_sha": pr_head_sha,
        "ci_run_id": ci_run_id,
        "tested_sha": receipt_workflow["tested_sha"],
        "evidence_reused": True,
    }


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _parse_bool(value: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    raise argparse.ArgumentTypeError("expected true or false")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="write a production PR CI receipt")
    create.add_argument("--repository", required=True)
    create.add_argument("--pr-number", required=True, type=int)
    create.add_argument("--head-sha", required=True)
    create.add_argument("--run-id", required=True, type=int)
    create.add_argument("--tested-sha", required=True)
    create.add_argument("--tested-tree", required=True)
    create.add_argument("--static-terms-only", required=True, type=_parse_bool)
    create.add_argument("--secret-scan", required=True)
    create.add_argument("--backend", required=True)
    create.add_argument("--frontend", required=True)
    create.add_argument("--static-terms", required=True)
    create.add_argument("--output", required=True, type=Path)

    verify = subparsers.add_parser("verify", help="verify production CI reuse")
    verify.add_argument("--repository", required=True)
    verify.add_argument("--production-sha", required=True)
    verify.add_argument("--production-commit", required=True, type=Path)
    verify.add_argument("--associated-pulls", required=True, type=Path)
    verify.add_argument("--ci-run", required=True, type=Path)
    verify.add_argument("--receipt", required=True, type=Path)
    verify.add_argument("--output", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "create":
            payload = create_receipt(
                repository=args.repository,
                pr_number=args.pr_number,
                head_sha=args.head_sha,
                run_id=args.run_id,
                tested_sha=args.tested_sha,
                tested_tree=args.tested_tree,
                static_terms_only=args.static_terms_only,
                secret_scan=args.secret_scan,
                backend=args.backend,
                frontend=args.frontend,
                static_terms=args.static_terms,
            )
            _write_json(args.output, payload)
        else:
            payload = verify_production_evidence(
                repository=args.repository,
                production_sha=args.production_sha,
                production_commit=_load_json(args.production_commit),
                associated_pull_requests=_load_json(args.associated_pulls),
                ci_run=_load_json(args.ci_run),
                receipt=_load_json(args.receipt),
            )
            if args.output:
                _write_json(args.output, payload)
        print(f"[ok] production CI evidence {args.command} completed")
        return 0
    except EvidenceError as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
