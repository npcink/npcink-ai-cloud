#!/usr/bin/env python3
"""Repair one exact post-commit rollback-tag cleanup failure.

This is deliberately not a deployment or rollback entry point. It accepts only
an already-active backend/migration release whose ordinary deploy stopped at
``finalize-rollback-image-tags`` after health and readiness had passed.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
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
FRONTEND_RELEASE_REFERENCE = "npcink-ai-cloud-frontend:prod"
TARGET_DAEMON_MAP_SCHEMA = "npcink.target-daemon-image-map.v1"
ACTIVE_SERVICE_ROLES = {
    "redis": "external_redis",
    "api": "api",
    "worker": "worker",
    "callback-worker": "callback_worker",
    "ops-worker": "ops_worker",
    "proxy": "external_nginx",
}


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


def _require_governed_one_off_absent(managed_root: Path, runner: DockerRunner) -> None:
    one_off_lock = managed_root / ".release-state" / ".release-one-off.lock"
    if one_off_lock.exists() or one_off_lock.is_symlink():
        raise RepairError("governed release one-off lock remains present")
    container_ids = _run_docker(
        runner,
        "ps",
        "-aq",
        "--filter",
        "label=com.docker.compose.service=release-one-off",
    ).splitlines()
    if any(container_id for container_id in container_ids):
        raise RepairError("governed release one-off container remains present")


def _compose_project_name(path: Path, uid: int) -> str:
    try:
        lines = _protected_file(path, 0o600, uid).decode("utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise RepairError("release environment is not UTF-8") from exc
    values: dict[str, str] = {}
    requested = {"NPCINK_CLOUD_COMPOSE_PROJECT_NAME", "COMPOSE_PROJECT_NAME"}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, separator, value = stripped.partition("=")
        key = key.strip()
        if not separator or key not in requested:
            continue
        if key in values:
            raise RepairError(f"duplicate Compose project setting: {key}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    project = values.get("NPCINK_CLOUD_COMPOSE_PROJECT_NAME") or values.get(
        "COMPOSE_PROJECT_NAME", "npcink-ai-cloud"
    )
    if re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project) is None:
        raise RepairError("release Compose project name is invalid")
    return project


def _target_daemon_roles(
    path: Path,
    manifest_path: Path,
    current_release: Path,
    expected_revision: str,
    uid: int,
) -> dict[str, str]:
    payload = _read_json(path, 0o600, uid)
    bundle = payload.get("bundle")
    roles = payload.get("roles")
    manifest_sha256 = hashlib.sha256(
        _protected_file(manifest_path, 0o644, uid)
    ).hexdigest()
    if (
        set(payload) != {"schema_version", "bundle", "roles"}
        or payload.get("schema_version") != TARGET_DAEMON_MAP_SCHEMA
        or not isinstance(bundle, dict)
        or bundle.get("release_name") != current_release.name
        or bundle.get("release_path") != str(current_release)
        or bundle.get("source_revision") != expected_revision
        or bundle.get("manifest_sha256") != manifest_sha256
        or not isinstance(roles, dict)
    ):
        raise RepairError("target-daemon image map is not bound to the active release")
    expected: dict[str, str] = {}
    for service, role in ACTIVE_SERVICE_ROLES.items():
        record = roles.get(role)
        if (
            not isinstance(record, dict)
            or set(record)
            != {
                "reference",
                "portable_config_image_id",
                "target_daemon_image_id",
            }
            or REFERENCE_RE.fullmatch(str(record.get("reference"))) is None
            or IMAGE_ID_RE.fullmatch(str(record.get("portable_config_image_id"))) is None
            or IMAGE_ID_RE.fullmatch(str(record.get("target_daemon_image_id"))) is None
        ):
            raise RepairError(f"target-daemon image proof is invalid for {service}")
        expected[service] = str(record["target_daemon_image_id"])
    return expected


def _require_active_service_images(
    project: str,
    expected_images: dict[str, str],
    runner: DockerRunner,
) -> dict[str, str]:
    containers: dict[str, str] = {}
    for service, expected_image_id in expected_images.items():
        container_ids = _run_docker(
            runner,
            "ps",
            "-q",
            "--filter",
            f"label=com.docker.compose.project={project}",
            "--filter",
            f"label=com.docker.compose.service={service}",
            "--filter",
            "label=com.docker.compose.oneoff=False",
        ).splitlines()
        if len(container_ids) != 1 or not container_ids[0]:
            raise RepairError(f"exactly one active production {service} is required")
        container_id = container_ids[0]
        running = _run_docker(
            runner, "inspect", "--format", "{{.State.Running}}", container_id
        )
        image_id = _run_docker(
            runner, "inspect", "--format", "{{.Image}}", container_id
        )
        if running != "true" or image_id != expected_image_id:
            raise RepairError(f"active {service} image identity drifted")
        containers[service] = container_id
    return containers


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
        absent = rollback == "-" and previous_image_id == "-"
        pinned = (
            rollback != "-"
            and REFERENCE_RE.fullmatch(rollback) is not None
            and IMAGE_ID_RE.fullmatch(previous_image_id) is not None
        )
        if REFERENCE_RE.fullmatch(target) is None or not (absent or pinned):
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

        manifest_path = current_release / "release-bundle-manifest.json"
        manifest = _read_json(manifest_path, 0o644, expected_uid)
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
        compose_project = _compose_project_name(state_dir / "env.deploy", expected_uid)
        expected_images = _target_daemon_roles(
            state_dir / "target-daemon-images.json",
            manifest_path,
            current_release,
            expected_active_revision,
            expected_uid,
        )
        expected_images["frontend"] = preserved_image_id
        active_containers = _require_active_service_images(
            compose_project, expected_images, docker_runner
        )
        frontend_container = active_containers["frontend"]
        configured_reference = _run_docker(
            docker_runner, "inspect", "--format", "{{.Config.Image}}", frontend_container
        )
        if REFERENCE_RE.fullmatch(configured_reference) is None:
            raise RepairError("running frontend no longer matches preserved evidence")

        frontend_records = [
            record for record in records if record[0] == FRONTEND_RELEASE_REFERENCE
        ]
        if len(frontend_records) != 1:
            raise RepairError("preserved frontend rollback binding is missing or ambiguous")
        _, frontend_rollback, previous_image_id = frontend_records[0]
        if frontend_rollback == "-" or previous_image_id != preserved_image_id:
            raise RepairError("preserved frontend rollback binding is invalid")

        target_image_id = _inspect_image(docker_runner, FRONTEND_RELEASE_REFERENCE)
        if target_image_id != preserved_image_id:
            rollback_image_id = _inspect_image(docker_runner, frontend_rollback)
            if rollback_image_id != preserved_image_id:
                raise RepairError("preserved frontend rollback tag identity drifted")
            _run_docker(
                docker_runner, "tag", frontend_rollback, FRONTEND_RELEASE_REFERENCE
            )
            if (
                _inspect_image(docker_runner, FRONTEND_RELEASE_REFERENCE)
                != preserved_image_id
            ):
                raise RepairError("preserved frontend release tag repair did not persist")

        _require_governed_one_off_absent(managed_root, docker_runner)
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
            _require_governed_one_off_absent(managed_root, docker_runner)
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
            "active_services_proved": sorted(active_containers),
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
