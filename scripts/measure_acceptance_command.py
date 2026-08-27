#!/usr/bin/env python3
"""Measure one bounded acceptance command and append a timing event."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

UTC = dt.UTC


def now() -> str:
    return dt.datetime.now(UTC).isoformat(timespec="seconds")


def main() -> int:
    # pnpm forwards its argument separator; accept it before the script options.
    if len(sys.argv) > 1 and sys.argv[1] == "--":
        del sys.argv[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--stage", required=True, help="bounded phase name")
    parser.add_argument("--question", default="", help="risk question answered by this command")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = list(args.command)
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        parser.error("a command is required after --")

    started_at = now()
    started = time.monotonic()
    completed = subprocess.run(command, check=False)
    duration = round(time.monotonic() - started, 3)
    event: dict[str, Any] = {
        "stage": args.stage,
        "question": args.question,
        "started_at": started_at,
        "finished_at": now(),
        "duration_seconds": duration,
        "exit_code": completed.returncode,
        "status": "passed" if completed.returncode == 0 else "failed",
        "command": command,
    }

    receipt = {"schema": "npcink.acceptance_timing.v1", "events": []}
    if args.receipt.exists():
        try:
            receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(f"[fail] unable to read timing receipt: {exc}") from exc
        valid_schema = receipt.get("schema") == "npcink.acceptance_timing.v1"
        valid_events = isinstance(receipt.get("events"), list)
        if not valid_schema or not valid_events:
            raise SystemExit("[fail] timing receipt schema is invalid")
    receipt["events"].append(event)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.receipt.with_suffix(args.receipt.suffix + ".tmp")
    temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.receipt)
    print(json.dumps(event, ensure_ascii=False, sort_keys=True))
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
