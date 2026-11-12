#!/usr/bin/env python3
"""Temporary Linux host incident evidence; counters only, no Docker/API dependency."""

from __future__ import annotations

import argparse
import json
import logging
import os
import resource
import signal
import stat
import time
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, TextIO

MAX_LOG_BYTES = 8 * 1024 * 1024
LOG_BACKUPS = 3
MAX_RECORD_BYTES = 65536
VM_COUNTERS = {
    "pgmajfault",
    "pswpin",
    "pswpout",
    "oom_kill",
    "pgscan_kswapd",
    "pgscan_direct",
    "pgsteal_kswapd",
    "pgsteal_direct",
    "allocstall_normal",
    "allocstall_dma32",
    "workingset_refault_file",
    "workingset_restore_file",
}
MEMORY_STATS = {
    "anon",
    "file",
    "file_dirty",
    "file_writeback",
    "slab",
    "kernel_stack",
    "pagetables",
    "pgfault",
    "pgmajfault",
    "pgscan",
    "pgsteal",
    "workingset_refault_file",
}


def read_text(path: Path) -> str:
    try:
        with path.open() as stream:
            return stream.read(131072)
    except OSError:
        return ""


def numbers(value: str, allowed: set[str]) -> dict[str, int]:
    result = {}
    for line in value.splitlines():
        parts = line.replace(":", " ").split()
        if len(parts) >= 2 and parts[0] in allowed:
            try:
                result[parts[0]] = int(parts[1])
            except ValueError:
                pass
    return result


def counter_delta(current: int | None, previous: int | None) -> int | None:
    if current is None or previous is None or current < previous:
        return None
    return current - previous


def safe_label(value: str, limit: int = 192) -> str:
    return "".join(char if char.isprintable() else "?" for char in value)[:limit]


def process_counters(root: Path) -> tuple[dict[str, dict[str, Any]], bool]:
    result = {}
    truncated = False
    for path in root.iterdir():
        if not path.name.isdigit():
            continue
        if len(result) >= 1024:
            truncated = True
            break
        try:
            raw = read_text(path / "stat")
            fields = raw[raw.rfind(")") + 2 :].split()
            if len(fields) < 22:
                continue
            group = next(
                (
                    line[3:]
                    for line in read_text(path / "cgroup").splitlines()
                    if line.startswith("0::/")
                ),
                "",
            )
            # Do not read cmdline, environ, file descriptors or application files.
            io = numbers(read_text(path / "io"), {"read_bytes", "write_bytes"})
            confirmed = read_text(path / "stat")
            confirmed_fields = confirmed[confirmed.rfind(")") + 2 :].split()
            if len(confirmed_fields) < 22 or confirmed_fields[19] != fields[19]:
                continue
            result[path.name] = {
                "pid": int(path.name),
                "start_ticks": int(fields[19]),
                "comm": safe_label(raw[raw.find("(") + 1 : raw.rfind(")")], 64),
                "cgroup": group,
                "major_faults": int(fields[9]),
                "rss_pages": int(fields[21]),
                **io,
            }
        except (ValueError, IndexError):
            continue
    return result, truncated


def group_counters(root: Path, groups: set[str]) -> dict[str, dict[str, Any]]:
    result = {}
    for name in sorted(groups)[:128]:
        relative = name.lstrip("/")
        if ".." in Path(relative).parts:
            continue
        path = root / relative
        try:
            inode = path.stat().st_ino
        except OSError:
            continue
        io: dict[str, int] = {}
        for line in read_text(path / "io.stat").splitlines():
            for part in line.split()[1:]:
                key, _, value = part.partition("=")
                if key in {"rbytes", "wbytes", "rios", "wios"} and value.isdigit():
                    io[key] = io.get(key, 0) + int(value)
        current = read_text(path / "memory.current").strip()
        record = {
            "inode": inode,
            "io": io,
            "memory_current": int(current) if current.isdigit() else None,
            "memory_stat": numbers(read_text(path / "memory.stat"), MEMORY_STATS),
            "memory_events": numbers(
                read_text(path / "memory.events"), {"low", "high", "max", "oom", "oom_kill"}
            ),
        }
        try:
            if path.stat().st_ino != inode:
                continue
        except OSError:
            continue
        result[name] = record
    return result


def snapshot(proc: Path = Path("/proc"), cgroups: Path = Path("/sys/fs/cgroup")) -> dict:
    started = time.monotonic()
    processes, truncated = process_counters(proc)
    disks = {}
    for line in read_text(proc / "diskstats").splitlines():
        fields = line.split()
        if len(fields) >= 14:
            disks[fields[2]] = {
                key: int(fields[index])
                for key, index in (
                    ("reads", 3),
                    ("read_sectors", 5),
                    ("read_ms", 6),
                    ("write_sectors", 9),
                    ("in_flight", 11),
                    ("io_ms", 12),
                    ("weighted_io_ms", 13),
                )
            }
    cpu = read_text(proc / "stat").splitlines()
    return {
        "type": "sample",
        "at": datetime.now(UTC).isoformat(),
        "monotonic": started,
        "boot_id": read_text(proc / "sys/kernel/random/boot_id").strip(),
        "memory_kib": numbers(
            read_text(proc / "meminfo"),
            {
                "MemTotal",
                "MemAvailable",
                "Cached",
                "SwapTotal",
                "SwapFree",
                "Slab",
                "SReclaimable",
                "Dirty",
                "Writeback",
            },
        ),
        "vmstat": numbers(read_text(proc / "vmstat"), VM_COUNTERS),
        "cpu_ticks": [int(value) for value in cpu[0].split()[1:]] if cpu else [],
        "disks": disks,
        "processes": processes,
        "process_limit_reached": truncated,
        "cgroups": group_counters(
            cgroups, {"/", *[p["cgroup"] for p in processes.values() if p["cgroup"]]}
        ),
        "collection_seconds": time.monotonic() - started,
        "collector_max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
    }


def project(current: dict, previous: dict | None) -> dict:
    same_boot = (
        previous is not None
        and bool(current["boot_id"])
        and current["boot_id"] == previous["boot_id"]
    )
    old = previous if same_boot else {}
    processes = []
    for pid, item in current["processes"].items():
        before = old.get("processes", {}).get(pid, {})
        if item["start_ticks"] != before.get("start_ticks"):
            before = {}
        processes.append(
            {
                **item,
                "cgroup": safe_label(item["cgroup"]),
                "read_bytes_delta": counter_delta(item.get("read_bytes"), before.get("read_bytes")),
                "major_faults_delta": counter_delta(
                    item["major_faults"], before.get("major_faults")
                ),
            }
        )
    ranked = sorted(processes, key=lambda p: p["read_bytes_delta"] or 0, reverse=True)[:8]
    for item in sorted(processes, key=lambda p: p["rss_pages"], reverse=True)[:8]:
        if item not in ranked:
            ranked.append(item)
    groups = []
    for name, item in current["cgroups"].items():
        before = old.get("cgroups", {}).get(name, {})
        if item["inode"] != before.get("inode"):
            before = {}
        groups.append(
            {
                "name": safe_label(name),
                **item,
                "read_bytes_delta": counter_delta(
                    item["io"].get("rbytes"), before.get("io", {}).get("rbytes")
                ),
            }
        )
    selected = sorted(groups, key=lambda g: g["read_bytes_delta"] or 0, reverse=True)[:8]
    for item in sorted(groups, key=lambda g: g["memory_current"] or 0, reverse=True)[:8]:
        if item not in selected:
            selected.append(item)
    return {
        **{key: value for key, value in current.items() if key not in {"processes", "cgroups"}},
        "elapsed_seconds": current["monotonic"] - old["monotonic"] if old else None,
        "vmstat_delta": {
            key: counter_delta(value, old.get("vmstat", {}).get(key))
            for key, value in current["vmstat"].items()
        },
        "processes": ranked,
        "processes_seen": len(processes),
        "cgroups": selected,
        "cgroups_seen": len(groups),
        "cgroup_limit_reached": len(current["cgroups"]) >= 128,
    }


class PrivateEvidenceHandler(RotatingFileHandler):
    def _open(self) -> TextIO:
        descriptor = os.open(
            self.baseFilename, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600
        )
        try:
            os.fchmod(descriptor, 0o600)
            return os.fdopen(descriptor, "a", encoding="utf-8")
        except BaseException:
            os.close(descriptor)
            raise

    def handleError(self, record: logging.LogRecord) -> None:
        raise OSError("evidence write failed")


def file_handler(directory: Path) -> RotatingFileHandler:
    if directory.is_symlink():
        raise ValueError("evidence directory must not be a symlink")
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("evidence directory must be private and owned by the collector")
    target = directory / "samples.jsonl"
    for path in [target, *[directory / f"samples.jsonl.{i}" for i in range(1, LOG_BACKUPS + 1)]]:
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise ValueError("evidence files must be regular files")
        if path.exists() and (path.stat().st_nlink != 1 or path.stat().st_size > MAX_LOG_BYTES):
            raise ValueError(
                "existing evidence files must have one link and stay within the size limit"
            )
    handler = PrivateEvidenceHandler(target, maxBytes=MAX_LOG_BYTES, backupCount=LOG_BACKUPS)
    target.chmod(0o600)
    handler.setFormatter(logging.Formatter("%(message)s"))
    return handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--stdout", action="store_true")
    output.add_argument("--output-dir", type=Path)
    parser.add_argument("--duration-seconds", type=int, default=300)
    parser.add_argument("--interval-seconds", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.duration_seconds <= 172800 or not 5 <= args.interval_seconds <= 60:
        parser.error("duration must be 1..172800 seconds; interval 5..60 seconds")
    if not Path("/proc/diskstats").is_file():
        parser.error("requires Linux procfs")
    os.umask(0o077)
    handler = file_handler(args.output_dir) if args.output_dir else None

    def emit(record: dict) -> None:
        value = json.dumps(record, ensure_ascii=True, separators=(",", ":"))
        if len(value.encode()) > MAX_RECORD_BYTES:
            raise ValueError("evidence record exceeds size limit")
        if handler:
            handler.emit(
                logging.LogRecord("host-io-evidence", logging.INFO, "", 0, value, (), None)
            )
        else:
            print(value, flush=True)

    def stop(_signum: int, _frame: Any) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    deadline = time.monotonic() + args.duration_seconds
    previous = None
    count = 0
    reason = "duration_complete"
    try:
        while True:
            tick = time.monotonic()
            current = snapshot()
            emit(project(current, previous))
            previous = current
            count += 1
            if time.monotonic() >= deadline:
                break
            time.sleep(max(0, min(deadline, tick + args.interval_seconds) - time.monotonic()))
    except KeyboardInterrupt:
        reason = "operator_stopped"
    except (OSError, ValueError):
        reason = "collection_failed"
        emit({"type": "error", "code": "collection_failed"})
        return 1
    finally:
        emit({"type": "end", "reason": reason, "samples": count})
        if handler:
            handler.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
