from __future__ import annotations

import copy
import json
import logging
import os
import sys
from pathlib import Path

import pytest

from scripts import capture_host_io_evidence as evidence


def fixture_host(tmp_path: Path) -> tuple[Path, Path]:
    proc = tmp_path / "proc"
    group = tmp_path / "cgroups"
    (proc / "123").mkdir(parents=True)
    (group / "system.slice/example.scope").mkdir(parents=True)
    # Fields 3..24: state, ... majflt, ... starttime, vsize, rss.
    fields = ["S", *["0"] * 21]
    fields[9], fields[19], fields[21] = "5", "100", "400"
    (proc / "123/stat").write_text("123 (process (name)) " + " ".join(fields))
    (proc / "123/io").write_text("read_bytes: 100\nwrite_bytes: 20\n")
    (proc / "123/cgroup").write_text("0::/system.slice/example.scope\n")
    (proc / "123/cmdline").write_text("password=must-never-be-read")
    (proc / "123/environ").write_text("TOKEN=must-never-be-read")
    (proc / "meminfo").write_text("MemTotal: 1000 kB\nMemAvailable: 300 kB\nSwapTotal: 0 kB\n")
    (proc / "vmstat").write_text("pgmajfault 10\npgscan_direct 25\npswpin 0\n")
    (proc / "stat").write_text("cpu 1 2 3 4 5 6 7 8\n")
    (proc / "diskstats").write_text("253 0 vda 10 0 100 20 5 0 30 7 0 25 30\n")
    (proc / "sys/kernel/random").mkdir(parents=True)
    (proc / "sys/kernel/random/boot_id").write_text("test-boot")
    unit = group / "system.slice/example.scope"
    (unit / "io.stat").write_text("253:0 rbytes=120 wbytes=20 rios=3 wios=2\n")
    (unit / "memory.current").write_text("4096")
    (unit / "memory.stat").write_text("anon 3000\nfile 1096\nworkingset_refault_file 7\n")
    (unit / "memory.events").write_text("high 0\noom 0\noom_kill 0\n")
    return proc, group


def test_host_capture_preserves_disk_reclaim_and_process_attribution_without_secrets(
    tmp_path: Path,
) -> None:
    proc, groups = fixture_host(tmp_path)
    first = evidence.snapshot(proc, groups)
    (proc / "123/io").write_text("read_bytes: 200\nwrite_bytes: 20\n")
    (proc / "vmstat").write_text("pgmajfault 14\npgscan_direct 45\npswpin 0\n")
    (groups / "system.slice/example.scope/io.stat").write_text(
        "253:0 rbytes=920 wbytes=20 rios=13 wios=2\n"
    )
    result = evidence.project(evidence.snapshot(proc, groups), first)
    assert result["vmstat_delta"] == {"pgmajfault": 4, "pgscan_direct": 20, "pswpin": 0}
    assert result["processes"][0]["read_bytes_delta"] == 100
    assert result["processes"][0]["comm"] == "process (name)"
    assert result["disks"]["vda"]["read_sectors"] == 100
    group = next(g for g in result["cgroups"] if g["name"].endswith("example.scope"))
    assert group["read_bytes_delta"] == 800
    assert group["memory_stat"]["workingset_refault_file"] == 7
    assert "must-never-be-read" not in json.dumps(result)
    assert "cmdline" not in json.dumps(result)


def test_pid_reuse_and_new_boot_do_not_invent_counter_deltas(tmp_path: Path) -> None:
    proc, groups = fixture_host(tmp_path)
    first = evidence.snapshot(proc, groups)
    later = copy.deepcopy(first)
    later["processes"]["123"]["start_ticks"] += 1
    later["processes"]["123"]["read_bytes"] = 900
    result = evidence.project(later, first)
    assert result["processes"][0]["read_bytes_delta"] is None
    later["boot_id"] = "another-boot"
    result = evidence.project(later, first)
    assert result["elapsed_seconds"] is None
    assert all(v is None for v in result["vmstat_delta"].values())


def test_counter_reset_and_recreated_cgroup_are_unknown(tmp_path: Path) -> None:
    proc, groups = fixture_host(tmp_path)
    first = evidence.snapshot(proc, groups)
    later = copy.deepcopy(first)
    later["vmstat"]["pgmajfault"] = 1
    later["cgroups"]["/system.slice/example.scope"]["inode"] += 1
    result = evidence.project(later, first)
    assert result["vmstat_delta"]["pgmajfault"] is None
    assert (
        next(g for g in result["cgroups"] if g["name"].endswith("example.scope"))[
            "read_bytes_delta"
        ]
        is None
    )


def test_exited_or_unreadable_process_and_missing_io_are_not_reported_as_zero(
    tmp_path: Path,
) -> None:
    proc, groups = fixture_host(tmp_path)
    (proc / "456").mkdir()
    (proc / "123/io").unlink()
    current = evidence.snapshot(proc, groups)
    assert list(current["processes"]) == ["123"]
    result = evidence.project(current, current)
    assert result["processes"][0]["read_bytes_delta"] is None


def test_pid_reuse_during_a_snapshot_discards_mixed_identity_counters(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    proc, _ = fixture_host(tmp_path)
    original = evidence.read_text
    reads = [0]

    def read(path: Path) -> str:
        value = original(path)
        if path == proc / "123/stat":
            reads[0] += 1
            if reads[0] == 2:
                return value.replace("100", "101")
        return value

    monkeypatch.setattr(evidence, "read_text", read)
    assert evidence.process_counters(proc)[0] == {}


def test_local_rotation_is_private_and_bounded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(evidence, "MAX_LOG_BYTES", 256)
    handler = evidence.file_handler(tmp_path / "evidence")
    try:
        for number in range(100):
            handler.emit(
                logging.LogRecord(
                    "test", 20, "", 0, json.dumps({"sample": number, "counter": "0" * 70}), (), None
                )
            )
    finally:
        handler.close()
    files = list((tmp_path / "evidence").iterdir())
    assert len(files) == evidence.LOG_BACKUPS + 1
    assert sum(p.stat().st_size for p in files) <= 256 * (evidence.LOG_BACKUPS + 1)
    assert all(p.stat().st_mode & 0o077 == 0 for p in files)
    assert (tmp_path / "evidence").stat().st_mode & 0o077 == 0
    assert (
        json.loads((tmp_path / "evidence/samples.jsonl").read_text().splitlines()[-1])["sample"]
        == 99
    )


@pytest.mark.parametrize("target", ["directory", "log", "backup"])
def test_symlinks_cannot_redirect_root_owned_evidence_writes(tmp_path: Path, target: str) -> None:
    private = tmp_path / "evidence"
    outside = tmp_path / "outside"
    outside.mkdir(mode=0o700)
    if target == "directory":
        private.symlink_to(outside, target_is_directory=True)
    else:
        private.mkdir(mode=0o700)
        (private / ("samples.jsonl" if target == "log" else "samples.jsonl.1")).symlink_to(
            outside / "keep"
        )
    with pytest.raises(ValueError):
        evidence.file_handler(private)
    assert not list(outside.iterdir())


def test_existing_shared_directory_is_rejected(tmp_path: Path) -> None:
    target = tmp_path / "shared"
    target.mkdir()
    target.chmod(0o755)
    with pytest.raises(ValueError):
        evidence.file_handler(target)


def test_hardlinks_and_oversized_previous_files_are_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "evidence"
    target.mkdir(mode=0o700)
    outside = tmp_path / "original"
    outside.write_text("keep")
    os.link(outside, target / "samples.jsonl")
    with pytest.raises(ValueError):
        evidence.file_handler(target)
    assert outside.read_text() == "keep"
    (target / "samples.jsonl").unlink()
    (target / "samples.jsonl").write_text("oversized")
    monkeypatch.setattr(evidence, "MAX_LOG_BYTES", 3)
    with pytest.raises(ValueError):
        evidence.file_handler(target)


def test_disk_write_failures_are_not_silently_reported_as_success(tmp_path: Path) -> None:
    handler = evidence.file_handler(tmp_path / "evidence")
    original = handler.stream

    class FullDisk:
        def write(self, _value: str) -> None:
            raise OSError("injected disk full")

    handler.stream = FullDisk()
    handler.shouldRollover = lambda _: False
    try:
        with pytest.raises(OSError, match="evidence write failed"):
            handler.emit(logging.LogRecord("test", 20, "", 0, "sample", (), None))
    finally:
        handler.stream = original
        handler.close()


@pytest.mark.parametrize("duration", ["0", "172801"])
def test_capture_duration_has_a_hard_configuration_bound(
    monkeypatch: pytest.MonkeyPatch, duration: str
) -> None:
    monkeypatch.setattr(sys, "argv", ["capture", "--stdout", "--duration-seconds", duration])
    with pytest.raises(SystemExit) as error:
        evidence.main()
    assert error.value.code == 2


@pytest.mark.parametrize("oversized", [False, True])
def test_capture_stops_at_deadline_or_record_limit_with_a_terminal_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    oversized: bool,
) -> None:
    proc, groups = fixture_host(tmp_path)
    sample = evidence.snapshot(proc, groups)
    now = [0.0]

    def capture() -> dict:
        result = copy.deepcopy(sample)
        result["monotonic"] = now[0]
        return result

    original_is_file = Path.is_file
    monkeypatch.setattr(
        Path, "is_file", lambda p: str(p) == "/proc/diskstats" or original_is_file(p)
    )
    monkeypatch.setattr(evidence.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(
        evidence.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds)
    )
    monkeypatch.setattr(evidence.signal, "signal", lambda *_: None)
    monkeypatch.setattr(evidence.os, "umask", lambda _: None)
    monkeypatch.setattr(evidence, "snapshot", capture)
    if oversized:
        monkeypatch.setattr(evidence, "MAX_RECORD_BYTES", 128)
    monkeypatch.setattr(
        sys, "argv", ["capture", "--stdout", "--duration-seconds", "5", "--interval-seconds", "5"]
    )
    assert evidence.main() == (1 if oversized else 0)
    rows = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    if oversized:
        assert rows == [
            {"type": "error", "code": "collection_failed"},
            {"type": "end", "reason": "collection_failed", "samples": 0},
        ]
        return
    assert rows[-1] == {"type": "end", "reason": "duration_complete", "samples": 2}
    assert rows[-2]["elapsed_seconds"] == 5
