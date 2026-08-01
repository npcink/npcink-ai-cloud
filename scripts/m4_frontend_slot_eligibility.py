#!/usr/bin/env python3
"""Evaluate whether an M4 frontend slot can use the current primary backend."""

from __future__ import annotations

import argparse
from pathlib import Path


def read_state(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    state: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key:
            state[key] = value
    return state


def evaluate(
    state: dict[str, str],
    *,
    primary_lock_active: bool,
    api_health: str,
    source_base_revision: str,
    backend_input_sha: str,
    image_input_sha: str,
    config_input_sha: str,
) -> dict[str, str]:
    result = {
        "primary_acceptance_state": state.get("acceptance_state", "missing"),
        "backend_compatibility": "unknown",
        "primary_startable": "false",
        "primary_block_reason": "primary_state_missing",
    }
    if primary_lock_active:
        result["primary_block_reason"] = "primary_operation_active"
        return result
    if not state:
        return result
    if api_health != "healthy":
        result["primary_block_reason"] = "primary_api_unhealthy"
        return result
    if state.get("image_input_sha256") != image_input_sha:
        result["primary_block_reason"] = "dependency_fingerprint_mismatch"
        return result
    if state.get("config_input_sha256") != config_input_sha:
        result["primary_block_reason"] = "config_fingerprint_mismatch"
        return result

    acceptance = state.get("acceptance_state", "")
    primary_backend_sha = state.get("backend_input_sha256", "")
    if not primary_backend_sha:
        result["primary_block_reason"] = "primary_backend_fingerprint_missing"
        return result

    if acceptance == "accepted":
        if not (
            state.get("source_branch") == "master"
            and state.get("source_dirty") == "false"
            and state.get("source_revision") == source_base_revision
        ):
            result["primary_block_reason"] = "accepted_primary_metadata_inconsistent"
            return result
        if backend_input_sha != primary_backend_sha:
            result["backend_compatibility"] = "incompatible"
            result["primary_block_reason"] = "worktree_backend_changed"
            return result
        result.update(
            backend_compatibility="accepted",
            primary_startable="true",
            primary_block_reason="none",
        )
        return result

    if acceptance == "candidate":
        accepted_revision = state.get("accepted_source_revision", "")
        accepted_backend_sha = state.get("accepted_backend_input_sha256", "")
        if not accepted_revision or not accepted_backend_sha:
            result["primary_block_reason"] = "accepted_backend_anchor_missing"
            return result
        if accepted_revision != source_base_revision:
            result["backend_compatibility"] = "incompatible"
            result["primary_block_reason"] = "accepted_base_revision_mismatch"
            return result
        if primary_backend_sha != accepted_backend_sha:
            result["backend_compatibility"] = "incompatible"
            result["primary_block_reason"] = "primary_candidate_backend_changed"
            return result
        if backend_input_sha != accepted_backend_sha:
            result["backend_compatibility"] = "incompatible"
            result["primary_block_reason"] = "worktree_backend_changed"
            return result
        result.update(
            backend_compatibility="candidate_compatible",
            primary_startable="true",
            primary_block_reason="none",
        )
        return result

    result["primary_block_reason"] = "primary_not_accepted_or_compatible"
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--primary-state", type=Path, required=True)
    parser.add_argument("--primary-lock-active", choices=("true", "false"), required=True)
    parser.add_argument("--api-health", required=True)
    parser.add_argument("--source-base-revision", required=True)
    parser.add_argument("--backend-input-sha", required=True)
    parser.add_argument("--image-input-sha", required=True)
    parser.add_argument("--config-input-sha", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = evaluate(
        read_state(args.primary_state),
        primary_lock_active=args.primary_lock_active == "true",
        api_health=args.api_health,
        source_base_revision=args.source_base_revision,
        backend_input_sha=args.backend_input_sha,
        image_input_sha=args.image_input_sha,
        config_input_sha=args.config_input_sha,
    )
    for key, value in result.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
