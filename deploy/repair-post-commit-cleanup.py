#!/usr/bin/env python3
"""Repair one exact post-commit rollback-tag cleanup failure.

This is deliberately not a deployment or rollback entry point. It accepts only
an already-active backend/migration release whose ordinary deploy stopped at
``finalize-rollback-image-tags`` after health and readiness had passed.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import stat
import subprocess
import sys
import urllib.request
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

REVISION_RE = re.compile(r"[0-9a-f]{40}")
IMAGE_ID_RE = re.compile(r"sha256:[0-9a-f]{64}")
REFERENCE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/@:+-]*")
CONFIRMATION = "Approved for production terminalization repair by operator."


class RepairError(RuntimeError):
    """Raised when terminalization cannot be repaired safely."""


DockerRunner = Callable[[Sequence[str]], subprocess.CompletedProcess[str]]


def _default_docker_runner(args: Sequence[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args],
        check=False,
        capture_output=True,
        text=True,
    )


def _protected_file(path: Path, mode: int, uid: int) -> bytes:
    metadata = path.lstat()
    if (
        path.is_symlink()
        or not stat.S_ISREG(metadata.st_mode)
        or stat.S_IMODE(metadata.st_mode) != mode
        or metadata.st_uid != uid
    ):
        raise RepairError(f"unsafe protected file: {path}")
    payload = path.read_bytes()
    if len(payload) > 1024 * 1024:
        raise RepairError(f"protected file exceeds size limit: {path}")
    return payload


def _protected_directory(path: Path, mode: int, uid: int) -> None:
    metadata = path.lstat()
    if (
        path.is_symlink()
        or not stat.S_ISDIR(metadata.st_mode)
        or stat.S_IMODE(metadata.st_mode) != mode
        or metadata.st_uid != uid
    ):
        raise RepairError(f"unsafe protected directory: {path}")


def _read_json(path: Path, mode: int, uid: int) -> dict[str, Any]:
    try:
        value = json.loads(_protected_file(path, mode, uid))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RepairError(f"invalid JSON evidence: {path}") from exc
    if not isinstance(value, dict):
        raise RepairError(f"JSON evidence must be an object: {path}")
    return value


def _run_docker(runner: DockerRunner, *args: str) -> str:
    completed = runner(args)
    if completed.returncode != 0:
        raise RepairError(f"docker command failed: {' '.join(args)}")
    return completed.stdout.strip()


def _inspect_image(runner: DockerRunner, reference: str) -> str | None:
    completed = runner(("image", "inspect", "--format", "{{.Id}}", reference))
    if completed.returncode == 0:
        image_id = completed.stdout.strip()
        if IMAGE_ID_RE.fullmatch(image_id) is None:
            raise RepairError(f"invalid Docker image identity: {reference}")
        return image_id
    _run_docker(runner, "info")
    return None


def _parse_marker(path: Path, uid: int) -> dict[str, str]:
    try:
        lines = _protected_file(path, 0o600, uid).decode("utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise RepairError("failure marker is not UTF-8") from exc
    marker: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not key or key in marker:
            raise RepairError("failure marker is malformed")
        marker[key] = value
    if set(marker) != {"phase", "outcome", "failed_release", "previous_release"}:
        raise RepairError("failure marker has an unexpected schema")
    if marker["phase"] != "finalize-rollback-image-tags":
        raise RepairError("failure is not the supported rollback-tag cleanup phase")
    if marker["outcome"] != "post_commit_cleanup_incomplete":
        raise RepairError("failure is not a committed cleanup-only outcome")
    return marker


def _parse_rollback_map(path: Path, uid: int) -> list[tuple[str, str, str]]:
    try:
        lines = _protected_file(path, 0o600, uid).decode("utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise RepairError("rollback image map is not UTF-8") from exc
    records: list[tuple[str, str, str]] = []
    for line in lines:
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) != 3:
            raise RepairError("rollback image map is malformed")
        target, rollback, previous_image_id = fields
        if (
            REFERENCE_RE.fullmatch(target) is None
            or (rollback != "-" and REFERENCE_RE.fullmatch(rollback) is None)
            or IMAGE_ID_RE.fullmatch(previous_image_id) is None
        ):
            raise RepairError("rollback image map contains an invalid record")
        records.append((target, rollback, previous_image_id))
    if not records:
        raise RepairError("rollback image map is empty")
    return records


def _unlink_and_fsync(path: Path) -> None:
    path.unlink()
    directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _restore_protected_file(path: Path, payload: bytes, mode: int, uid: int) -> None:
    if path.exists() or path.is_symlink():
        return
    temporary = path.with_name(f".{path.name}.restore.{os.getpid()}")
    descriptor = os.open(
        temporary,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
        mode,
    )
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        descriptor = -1
        if os.geteuid() == 0:
            os.chown(temporary, uid, -1, follow_symlinks=False)
        os.chmod(temporary, mode, follow_symlinks=False)
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _require_live_health(url: str) -> None:
    try:
        with urllib.request.urlopen(url, timeout=10) as response:  # noqa: S310
            if response.status != 200:
                raise RepairError(f"live health returned HTTP {response.status}")
    except OSError as exc:
        raise RepairError("live health is unavailable") from exc


def repair(
    managed_root: Path,
    expected_active_revision: str,
    recovery_source_revision: str,
    confirmation: str,
    *,
    expected_uid: int = 0,
    docker_runner: DockerRunner = _default_docker_runner,
    health_check: Callable[[str], None] = _require_live_health,
) -> dict[str, Any]:
    if confirmation != CONFIRMATION:
        raise RepairError("operator confirmation is missing")
    if REVISION_RE.fullmatch(expected_active_revision) is None:
        raise RepairError("expected active production revision is invalid")
    if REVISION_RE.fullmatch(recovery_source_revision) is None:
        raise RepairError("recovery source revision is invalid")
    if not managed_root.is_absolute():
        raise RepairError("managed root must be absolute")
    requested_root = managed_root
    root_metadata = requested_root.lstat()
    if (
        requested_root == Path("/")
        or requested_root.is_symlink()
        or not stat.S_ISDIR(root_metadata.st_mode)
        or root_metadata.st_uid != expected_uid
        or stat.S_IMODE(root_metadata.st_mode) & 0o022
    ):
        raise RepairError("managed root is unsafe")
    managed_root = requested_root.resolve(strict=True)
    if managed_root != requested_root:
        raise RepairError("managed root must be canonical and contain no symlink")

    lock_dir = managed_root / ".deploy-lock"
    _protected_directory(lock_dir, 0o700, expected_uid)
    lock_fd = os.open(
        lock_dir,
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
    )
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RepairError("another deployment or recovery still owns the lock") from exc

        owner_file = lock_dir / "one-off-owner"
        owner_payload = _protected_file(owner_file, 0o600, expected_uid)
        owner = owner_payload.decode("ascii").strip()
        if re.fullmatch(r"[0-9a-f]{64}", owner) is None:
            raise RepairError("deployment lock owner proof is invalid")
        if {entry.name for entry in lock_dir.iterdir()} != {owner_file.name}:
            raise RepairError("deployment lock contains unexpected recovery state")

        marker_path = managed_root / ".cutover-failed"
        marker_payload = _protected_file(marker_path, 0o600, expected_uid)
        marker = _parse_marker(marker_path, expected_uid)
        current_link = managed_root / "current"
        if not current_link.is_symlink():
            raise RepairError("current release pointer is missing")
        current_release = current_link.resolve(strict=True)
        if current_release.parent != managed_root or not current_release.name.startswith(
            "release-"
        ):
            raise RepairError("current release pointer escapes the managed root")
        failed_release = Path(marker["failed_release"])
        if (
            not failed_release.is_absolute()
            or failed_release.parent != managed_root
            or failed_release.resolve(strict=True) != current_release
        ):
            raise RepairError("healthy current release does not match the failed committed release")

        manifest = _read_json(current_release / "release-bundle-manifest.json", 0o644, expected_uid)
        source = manifest.get("source")
        if not isinstance(source, dict) or source.get("revision") != expected_active_revision:
            raise RepairError(
                "current release manifest does not match the expected production revision"
            )
        plan = _read_json(
            current_release / "release/production-release-plan.json", 0o644, expected_uid
        )
        if (
            plan.get("schema") != "npcink.production_release_plan.v1"
            or plan.get("lane") not in {"backend", "migration"}
            or plan.get("frontend_image_required") is not False
        ):
            raise RepairError("current release is not a frontend-preserving release plan")

        state_dir = managed_root / ".release-state" / current_release.name
        _protected_directory(state_dir, 0o700, expected_uid)
        preserved = _read_json(
            state_dir / "preserved-runtime-services.json", 0o600, expected_uid
        )
        frontend = preserved.get("services", {}).get("frontend", {})
        preserved_image_id = frontend.get("target_daemon_image_id")
        if (
            preserved.get("schema") != "npcink.preserved_runtime_services.v1"
            or preserved.get("release_name") != current_release.name
            or preserved.get("release_path") != str(current_release)
            or IMAGE_ID_RE.fullmatch(str(preserved_image_id)) is None
        ):
            raise RepairError("preserved frontend evidence is invalid")

        rollback_map_path = state_dir / "rollback-images.tsv"
        rollback_map_payload = _protected_file(rollback_map_path, 0o600, expected_uid)
        records = _parse_rollback_map(rollback_map_path, expected_uid)
        frontend_ids = _run_docker(
            docker_runner,
            "ps",
            "-q",
            "--filter",
            "label=com.docker.compose.service=frontend",
        ).splitlines()
        if len(frontend_ids) != 1 or not frontend_ids[0]:
            raise RepairError("exactly one running frontend container is required")
        frontend_container = frontend_ids[0]
        running = _run_docker(
            docker_runner, "inspect", "--format", "{{.State.Running}}", frontend_container
        )
        container_image_id = _run_docker(
            docker_runner, "inspect", "--format", "{{.Image}}", frontend_container
        )
        target_reference = _run_docker(
            docker_runner, "inspect", "--format", "{{.Config.Image}}", frontend_container
        )
        if (
            running != "true"
            or container_image_id != preserved_image_id
            or REFERENCE_RE.fullmatch(target_reference) is None
        ):
            raise RepairError("running frontend no longer matches preserved evidence")

        frontend_records = [record for record in records if record[0] == target_reference]
        if len(frontend_records) != 1:
            raise RepairError("preserved frontend rollback binding is missing or ambiguous")
        _, frontend_rollback, previous_image_id = frontend_records[0]
        if frontend_rollback == "-" or previous_image_id != preserved_image_id:
            raise RepairError("preserved frontend rollback binding is invalid")

        target_image_id = _inspect_image(docker_runner, target_reference)
        if target_image_id != preserved_image_id:
            rollback_image_id = _inspect_image(docker_runner, frontend_rollback)
            if rollback_image_id != preserved_image_id:
                raise RepairError("preserved frontend rollback tag identity drifted")
            _run_docker(docker_runner, "tag", frontend_rollback, target_reference)
            if _inspect_image(docker_runner, target_reference) != preserved_image_id:
                raise RepairError("preserved frontend release tag repair did not persist")

        removed_tags = 0
        for _target, rollback, _previous_image_id in records:
            if rollback == "-" or _inspect_image(docker_runner, rollback) is None:
                continue
            _run_docker(docker_runner, "image", "rm", rollback)
            if _inspect_image(docker_runner, rollback) is not None:
                raise RepairError(f"rollback image tag still exists: {rollback}")
            removed_tags += 1

        health_check("http://127.0.0.1:8010/health/live")
        terminal_files = (
            (marker_path, marker_payload),
            (rollback_map_path, rollback_map_payload),
            (owner_file, owner_payload),
        )
        try:
            _unlink_and_fsync(marker_path)
            _unlink_and_fsync(rollback_map_path)
            health_check("http://127.0.0.1:8010/health/live")
            _unlink_and_fsync(owner_file)
            os.rmdir(lock_dir)
            if lock_dir.exists() or lock_dir.is_symlink():
                raise RepairError("deployment lock release could not be proved")
        except (OSError, RepairError):
            if not lock_dir.exists() and not lock_dir.is_symlink():
                lock_dir.mkdir(mode=0o700)
            for path, payload in terminal_files:
                _restore_protected_file(path, payload, 0o600, expected_uid)
            raise
        return {
            "schema": "npcink.production_terminalization_repair.v1",
            "active_production_revision": expected_active_revision,
            "recovery_source_revision": recovery_source_revision,
            "release": current_release.name,
            "lane": plan["lane"],
            "frontend_image_id": preserved_image_id,
            "rollback_tags_removed": removed_tags,
            "migration_attempts": 0,
            "service_switches": 0,
            "provider_calls": 0,
            "status": "complete",
        }
    finally:
        os.close(lock_fd)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--managed-root", required=True, type=Path)
    parser.add_argument("--expected-active-production-sha", required=True)
    parser.add_argument("--recovery-source-sha", required=True)
    parser.add_argument("--confirmation", required=True)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        receipt = repair(
            args.managed_root,
            args.expected_active_production_sha,
            args.recovery_source_sha,
            args.confirmation,
        )
    except (OSError, RepairError, subprocess.SubprocessError) as exc:
        print(f"[terminalization-repair:fail] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    print("terminalization_repair=complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
