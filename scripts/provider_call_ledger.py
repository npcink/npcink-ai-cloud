#!/usr/bin/env python3
"""Atomically govern bounded real-Provider experiment dispatches.

The default state directory lives under Git's common directory so every
worktree of one clone observes the same budget. The ledger is an operator
development guard, not runtime quota, billing, or entitlement truth.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "npcink.provider_call_ledger.v1"
STATE_DIRECTORY_NAME = "npcink-provider-call-ledgers"
IDENTIFIER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
REASON_CODE_RE = re.compile(r"^[a-z][a-z0-9._-]{2,63}$")
MAX_CALLS_LIMIT = 10_000
LEDGER_KEYS = {
    "contract_version",
    "experiment_id",
    "status",
    "max_calls",
    "claimed_calls",
    "remaining_calls",
    "items",
    "claims",
    "created_at",
    "updated_at",
    "closed_at",
    "close_reason_code",
}


class LedgerError(ValueError):
    """Raised when the shared ledger must fail closed."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")  # noqa: UP017


def _validate_identifier(value: str, label: str) -> str:
    normalized = str(value or "").strip().lower()
    if not IDENTIFIER_RE.fullmatch(normalized):
        raise LedgerError(
            f"{label} must be 3-64 lowercase letters, digits, dots, underscores, or hyphens"
        )
    return normalized


def _validate_reason_code(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not REASON_CODE_RE.fullmatch(normalized):
        raise LedgerError(
            "reason_code must be 3-64 lowercase letters, digits, dots, underscores, or hyphens"
        )
    return normalized


def _validate_call_limit(value: int, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise LedgerError(f"{label} must be an integer")
    if value < 1 or value > MAX_CALLS_LIMIT:
        raise LedgerError(f"{label} must be between 1 and {MAX_CALLS_LIMIT}")
    return value


def resolve_state_directory(root: Path, override: Path | None = None) -> Path:
    if override is not None:
        return override.expanduser().resolve()
    result = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    raw = result.stdout.strip()
    if not raw:
        raise LedgerError("Git common directory could not be resolved")
    common_dir = Path(raw)
    if not common_dir.is_absolute():
        common_dir = root / common_dir
    return common_dir.resolve() / STATE_DIRECTORY_NAME


def _prepare_state_directory(state_dir: Path) -> None:
    state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    if state_dir.is_symlink() or not state_dir.is_dir():
        raise LedgerError("ledger state directory must be a real directory")
    os.chmod(state_dir, 0o700)


@contextmanager
def _experiment_lock(state_dir: Path, experiment_id: str) -> Iterator[Path]:
    _prepare_state_directory(state_dir)
    ledger_path = state_dir / f"{experiment_id}.json"
    lock_path = state_dir / f"{experiment_id}.lock"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as error:
        raise LedgerError("experiment lock is unsafe or unavailable") from error
    try:
        os.chmod(lock_path, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        if ledger_path.is_symlink():
            raise LedgerError("experiment ledger must not be a symbolic link")
        yield ledger_path
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _read_ledger(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text())
    except FileNotFoundError as error:
        raise LedgerError("experiment ledger does not exist; initialize it first") from error
    except (OSError, json.JSONDecodeError) as error:
        raise LedgerError("experiment ledger is unreadable; refusing Provider dispatch") from error
    if not isinstance(payload, dict):
        raise LedgerError("experiment ledger must be a JSON object")
    _validate_ledger(payload)
    if payload["experiment_id"] != path.stem:
        raise LedgerError("experiment ledger identity does not match its filename")
    return payload


def _validate_ledger(payload: dict[str, Any]) -> None:
    if set(payload) != LEDGER_KEYS:
        raise LedgerError("experiment ledger has unknown or missing fields")
    if payload.get("contract_version") != CONTRACT_VERSION:
        raise LedgerError("experiment ledger contract_version is invalid")
    _validate_identifier(str(payload.get("experiment_id", "")), "experiment_id")
    if payload.get("status") not in {"open", "closed"}:
        raise LedgerError("experiment ledger status is invalid")
    max_calls = _validate_call_limit(payload.get("max_calls"), "max_calls")
    items = payload.get("items")
    if not isinstance(items, dict) or not items:
        raise LedgerError("experiment ledger items must be a non-empty object")
    item_total = 0
    for item_id, item in items.items():
        _validate_identifier(str(item_id), "item_id")
        if not isinstance(item, dict) or set(item) != {
            "max_calls",
            "claimed_calls",
            "remaining_calls",
        }:
            raise LedgerError("experiment ledger item shape is invalid")
        item_max = _validate_call_limit(item.get("max_calls"), "item.max_calls")
        item_claimed = item.get("claimed_calls")
        item_remaining = item.get("remaining_calls")
        if (
            isinstance(item_claimed, bool)
            or not isinstance(item_claimed, int)
            or item_claimed < 0
            or item_claimed > item_max
            or item_remaining != item_max - item_claimed
        ):
            raise LedgerError("experiment ledger item counters are inconsistent")
        item_total += item_max
    if item_total != max_calls:
        raise LedgerError("experiment ledger item budgets must equal max_calls")
    claims = payload.get("claims")
    if not isinstance(claims, list):
        raise LedgerError("experiment ledger claims must be an array")
    seen_dispatch_ids: set[str] = set()
    counted_items = {item_id: 0 for item_id in items}
    for claim in claims:
        if not isinstance(claim, dict) or set(claim) != {
            "dispatch_id",
            "item_id",
            "claimed_at",
        }:
            raise LedgerError("experiment ledger claim shape is invalid")
        dispatch_id = _validate_identifier(str(claim.get("dispatch_id", "")), "dispatch_id")
        item_id = _validate_identifier(str(claim.get("item_id", "")), "item_id")
        if dispatch_id in seen_dispatch_ids:
            raise LedgerError("experiment ledger contains a duplicate dispatch_id")
        if item_id not in counted_items:
            raise LedgerError("experiment ledger claim references an unknown item")
        if not isinstance(claim.get("claimed_at"), str) or not claim["claimed_at"]:
            raise LedgerError("experiment ledger claim timestamp is invalid")
        seen_dispatch_ids.add(dispatch_id)
        counted_items[item_id] += 1
    claimed_calls = payload.get("claimed_calls")
    remaining_calls = payload.get("remaining_calls")
    if claimed_calls != len(claims) or remaining_calls != max_calls - len(claims):
        raise LedgerError("experiment ledger aggregate counters are inconsistent")
    for item_id, counted in counted_items.items():
        if items[item_id]["claimed_calls"] != counted:
            raise LedgerError("experiment ledger item claim count is inconsistent")
    for timestamp_key in ("created_at", "updated_at"):
        if not isinstance(payload.get(timestamp_key), str) or not payload[timestamp_key]:
            raise LedgerError(f"experiment ledger {timestamp_key} is invalid")
    if payload["status"] == "open":
        if payload.get("closed_at") is not None or payload.get("close_reason_code") != "":
            raise LedgerError("open experiment ledger has closed-state fields")
    else:
        if not isinstance(payload.get("closed_at"), str) or not payload["closed_at"]:
            raise LedgerError("closed experiment ledger has no closed_at")
        _validate_reason_code(str(payload.get("close_reason_code", "")))


def _write_ledger(path: Path, payload: dict[str, Any]) -> None:
    _validate_ledger(payload)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.stem}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, path)
        os.chmod(path, 0o600)
        directory_descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def initialize_ledger(
    state_dir: Path,
    *,
    experiment_id: str,
    max_calls: int,
    item_budgets: dict[str, int],
) -> dict[str, Any]:
    experiment_id = _validate_identifier(experiment_id, "experiment_id")
    max_calls = _validate_call_limit(max_calls, "max_calls")
    normalized_items: dict[str, int] = {}
    for item_id, item_max in item_budgets.items():
        normalized_id = _validate_identifier(item_id, "item_id")
        if normalized_id in normalized_items:
            raise LedgerError(f"duplicate item_id: {normalized_id}")
        normalized_items[normalized_id] = _validate_call_limit(item_max, "item.max_calls")
    if not normalized_items:
        raise LedgerError("at least one item budget is required")
    if sum(normalized_items.values()) != max_calls:
        raise LedgerError("item budgets must add up exactly to max_calls")
    with _experiment_lock(state_dir, experiment_id) as path:
        if path.exists():
            existing = _read_ledger(path)
            expected = {
                item_id: item["max_calls"] for item_id, item in existing["items"].items()
            }
            if existing["max_calls"] == max_calls and expected == normalized_items:
                return {**existing, "idempotent_replay": True}
            raise LedgerError("experiment ledger already exists with a different budget")
        now = _utc_now()
        payload: dict[str, Any] = {
            "contract_version": CONTRACT_VERSION,
            "experiment_id": experiment_id,
            "status": "open",
            "max_calls": max_calls,
            "claimed_calls": 0,
            "remaining_calls": max_calls,
            "items": {
                item_id: {
                    "max_calls": item_max,
                    "claimed_calls": 0,
                    "remaining_calls": item_max,
                }
                for item_id, item_max in sorted(normalized_items.items())
            },
            "claims": [],
            "created_at": now,
            "updated_at": now,
            "closed_at": None,
            "close_reason_code": "",
        }
        _write_ledger(path, payload)
        return {**payload, "idempotent_replay": False}


def claim_dispatch(
    state_dir: Path,
    *,
    experiment_id: str,
    item_id: str,
    dispatch_id: str,
) -> dict[str, Any]:
    experiment_id = _validate_identifier(experiment_id, "experiment_id")
    item_id = _validate_identifier(item_id, "item_id")
    dispatch_id = _validate_identifier(dispatch_id, "dispatch_id")
    with _experiment_lock(state_dir, experiment_id) as path:
        payload = _read_ledger(path)
        for claim in payload["claims"]:
            if claim["dispatch_id"] != dispatch_id:
                continue
            if claim["item_id"] != item_id:
                raise LedgerError("dispatch_id already belongs to a different item")
            return _claim_receipt(payload, claim, idempotent_replay=True)
        if payload["status"] != "open":
            raise LedgerError("experiment ledger is closed; refusing Provider dispatch")
        item = payload["items"].get(item_id)
        if item is None:
            raise LedgerError("item_id is not reserved in this experiment")
        if payload["remaining_calls"] < 1:
            raise LedgerError("experiment call budget exhausted; refusing Provider dispatch")
        if item["remaining_calls"] < 1:
            raise LedgerError("item call budget exhausted; refusing Provider dispatch")
        claimed_at = _utc_now()
        claim = {
            "dispatch_id": dispatch_id,
            "item_id": item_id,
            "claimed_at": claimed_at,
        }
        payload["claims"].append(claim)
        payload["claimed_calls"] += 1
        payload["remaining_calls"] -= 1
        item["claimed_calls"] += 1
        item["remaining_calls"] -= 1
        payload["updated_at"] = claimed_at
        _write_ledger(path, payload)
        return _claim_receipt(payload, claim, idempotent_replay=False)


def _claim_receipt(
    payload: dict[str, Any],
    claim: dict[str, Any],
    *,
    idempotent_replay: bool,
) -> dict[str, Any]:
    item = payload["items"][claim["item_id"]]
    return {
        "contract_version": CONTRACT_VERSION,
        "status": "claimed",
        "experiment_id": payload["experiment_id"],
        "item_id": claim["item_id"],
        "dispatch_id": claim["dispatch_id"],
        "claimed_at": claim["claimed_at"],
        "idempotent_replay": idempotent_replay,
        "experiment_claimed_calls": payload["claimed_calls"],
        "experiment_remaining_calls": payload["remaining_calls"],
        "item_claimed_calls": item["claimed_calls"],
        "item_remaining_calls": item["remaining_calls"],
        "provider_dispatch_allowed": True,
    }


def read_status(state_dir: Path, *, experiment_id: str) -> dict[str, Any]:
    experiment_id = _validate_identifier(experiment_id, "experiment_id")
    with _experiment_lock(state_dir, experiment_id) as path:
        return _read_ledger(path)


def close_ledger(
    state_dir: Path,
    *,
    experiment_id: str,
    reason_code: str,
) -> dict[str, Any]:
    experiment_id = _validate_identifier(experiment_id, "experiment_id")
    reason_code = _validate_reason_code(reason_code)
    with _experiment_lock(state_dir, experiment_id) as path:
        payload = _read_ledger(path)
        if payload["status"] == "closed":
            if payload["close_reason_code"] != reason_code:
                raise LedgerError("experiment ledger is already closed with another reason_code")
            return {**payload, "idempotent_replay": True}
        now = _utc_now()
        payload["status"] = "closed"
        payload["closed_at"] = now
        payload["close_reason_code"] = reason_code
        payload["updated_at"] = now
        _write_ledger(path, payload)
        return {**payload, "idempotent_replay": False}


def _parse_item_budget(value: str) -> tuple[str, int]:
    item_id, separator, raw_limit = value.partition("=")
    if not separator:
        raise argparse.ArgumentTypeError("item budget must use item_id=max_calls")
    try:
        limit = int(raw_limit)
    except ValueError as error:
        raise argparse.ArgumentTypeError("item max_calls must be an integer") from error
    return item_id, limit


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state-dir",
        type=Path,
        help="Override the shared state directory; intended for isolated tests only.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Initialize one shared experiment budget.")
    init_parser.add_argument("--experiment-id", required=True)
    init_parser.add_argument("--max-calls", required=True, type=int)
    init_parser.add_argument(
        "--item",
        action="append",
        type=_parse_item_budget,
        required=True,
        metavar="ITEM_ID=MAX_CALLS",
    )

    claim_parser = subparsers.add_parser(
        "claim",
        help="Atomically claim exactly one dispatch before a real Provider call.",
    )
    claim_parser.add_argument("--experiment-id", required=True)
    claim_parser.add_argument("--item-id", required=True)
    claim_parser.add_argument("--dispatch-id", required=True)

    status_parser = subparsers.add_parser("status", help="Read the current shared budget.")
    status_parser.add_argument("--experiment-id", required=True)

    close_parser = subparsers.add_parser("close", help="Close the experiment and block new claims.")
    close_parser.add_argument("--experiment-id", required=True)
    close_parser.add_argument("--reason-code", required=True)
    return parser


def _item_budget_map(entries: Sequence[tuple[str, int]]) -> dict[str, int]:
    budgets: dict[str, int] = {}
    for item_id, limit in entries:
        normalized_id = _validate_identifier(item_id, "item_id")
        if normalized_id in budgets:
            raise LedgerError(f"duplicate item_id: {normalized_id}")
        budgets[normalized_id] = limit
    return budgets


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    try:
        state_dir = resolve_state_directory(root, args.state_dir)
        if args.command == "init":
            result = initialize_ledger(
                state_dir,
                experiment_id=args.experiment_id,
                max_calls=args.max_calls,
                item_budgets=_item_budget_map(args.item),
            )
        elif args.command == "claim":
            result = claim_dispatch(
                state_dir,
                experiment_id=args.experiment_id,
                item_id=args.item_id,
                dispatch_id=args.dispatch_id,
            )
        elif args.command == "status":
            result = read_status(state_dir, experiment_id=args.experiment_id)
        else:
            result = close_ledger(
                state_dir,
                experiment_id=args.experiment_id,
                reason_code=args.reason_code,
            )
    except (LedgerError, OSError, subprocess.CalledProcessError) as error:
        print(f"[provider-call-ledger] {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
