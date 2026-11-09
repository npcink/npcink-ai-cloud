#!/usr/bin/env python3
"""Validate a separately approved, same-database recovery onto an empty host."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import io
import json
import os
import re
import runpy
import stat
import subprocess
import tarfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

APPROVAL = "Approved for replacement-host recovery by operator."
CONTRACT = "npcink.replacement_host_recovery.v1"
BACKUP_ROOT = Path("/var/backups/npcink-ai-cloud")
VALIDATOR = runpy.run_path(str(Path(__file__).with_name("validate-installation-complete.py")))


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ValueError(reason)


def protected_json(path: Path, *, uid: int = 0, mode: int = 0o600) -> dict:
    return VALIDATOR["_load_protected_json"](
        path, label="recovery input", uid=uid, gid=uid, mode=mode
    )[0]


def protected_bytes(path: Path, *, uid: int = 0, mode: int = 0o600) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        metadata = os.fstat(fd)
        require(
            stat.S_ISREG(metadata.st_mode)
            and (metadata.st_uid, metadata.st_gid) == (uid, uid)
            and stat.S_IMODE(metadata.st_mode) == mode,
            "recovery file protection is invalid",
        )
        with os.fdopen(fd, "rb", closefd=False) as stream:
            raw = stream.read()
        after = os.fstat(fd)
        require(
            (metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns)
            == (after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            "recovery file changed while reading",
        )
        return raw
    finally:
        os.close(fd)


def backup_file(raw_path: object, expected_digest: object) -> bytes:
    path = Path(str(raw_path or ""))
    require(
        path.is_absolute() and BACKUP_ROOT in path.parents and path.resolve(strict=True) == path,
        "recovery backup is outside the managed backup root",
    )
    for parent in path.parents:
        metadata = parent.lstat()
        require(
            stat.S_ISDIR(metadata.st_mode)
            and metadata.st_uid == 0
            and not stat.S_IMODE(metadata.st_mode) & 0o022,
            "recovery backup parent is unsafe",
        )
    raw = protected_bytes(path)
    require(hashlib.sha256(raw).hexdigest() == expected_digest, "recovery backup digest mismatch")
    return raw


def managed_paths(root: Path, release: Path) -> None:
    require(root.is_absolute() and root != Path("/"), "invalid managed recovery root")
    require(root.resolve(strict=True) == root, "managed recovery root is aliased")
    require(
        release.parent == root
        and re.fullmatch(r"release-[A-Za-z0-9][A-Za-z0-9._-]*", release.name) is not None
        and release.resolve(strict=True) == release,
        "recovery release is not a direct managed directory",
    )
    for path in (release, *release.parents):
        metadata = path.lstat()
        require(
            stat.S_ISDIR(metadata.st_mode)
            and metadata.st_uid == 0
            and not stat.S_IMODE(metadata.st_mode) & 0o022,
            "managed recovery parent is unsafe",
        )


def validate(root: Path, release: Path, *, approval: str, active: bool = False) -> dict:
    require(approval == APPROVAL, "exact replacement-host approval is required")
    managed_paths(root, release)
    current = root / "current"
    if active:
        require(
            current.is_symlink() and current.resolve(strict=True) == release,
            "recovery active release changed",
        )
    else:
        require(not os.path.lexists(current), "recovery requires an absent current pointer")
    for marker in (".installation-complete", ".first-install-pending.json", ".cutover-failed"):
        require(not os.path.lexists(root / marker), "recovery lifecycle already exists")
    receipt = protected_json(root / ".replacement-host-recovery.json")
    require(receipt.get("contract") == CONTRACT, "invalid recovery receipt contract")
    require(receipt.get("old_host_fenced") is True, "old-host writer fence is unconfirmed")
    require(receipt.get("state") == "prepared", "recovery receipt is already consumed")
    require(bool(str(receipt.get("operator") or "").strip()), "recovery operator is missing")
    now = datetime.now(UTC)
    created = datetime.fromisoformat(str(receipt.get("created_at") or ""))
    expires = datetime.fromisoformat(str(receipt.get("expires_at") or ""))
    backup_created = datetime.fromisoformat(str(receipt.get("database_backup_created_at") or ""))
    require(
        created.tzinfo is not None
        and expires.tzinfo is not None
        and created <= now < expires <= created + timedelta(hours=24),
        "recovery receipt is expired or has invalid dates",
    )
    require(
        backup_created.tzinfo is not None
        and backup_created <= created
        and now - backup_created <= timedelta(hours=24),
        "recovery database backup is stale",
    )
    manifest = json.loads((release / "release-bundle-manifest.json").read_text())
    require(
        manifest["source"]["revision"] == receipt.get("candidate_sha"),
        "recovery candidate mismatch",
    )
    require(
        hashlib.sha256((release / "release-bundle-manifest.json").read_bytes()).hexdigest()
        == receipt.get("manifest_sha256"),
        "recovery manifest mismatch",
    )
    config = root / "shared/config"
    VALIDATOR["validate_current_runtime"](
        config / "install-state.json", config / "runtime-config.json"
    )
    runtime_raw = protected_bytes(config / "runtime-config.json", uid=999)
    require(
        hashlib.sha256(runtime_raw).hexdigest() == receipt.get("config_digest"),
        "recovery configuration mismatch",
    )
    runtime = json.loads(runtime_raw)
    archive_raw = backup_file(
        receipt.get("protected_backup"), receipt.get("protected_backup_sha256")
    )
    with tarfile.open(fileobj=io.BytesIO(archive_raw), mode="r:gz") as archive:
        original_raw = archive.extractfile("shared/config/runtime-config.json").read()
        original = json.loads(original_raw)
        original_state = json.load(archive.extractfile("shared/config/install-state.json"))
        original_ca = archive.extractfile("shared/config/rds-ca.pem").read()
        original_token = archive.extractfile("shared/config/frontend/internal-auth-token").read()
    require(
        original_state.get("installation_state") == "complete"
        and original_state.get("database_contract") == "pg18_empty_initialization.v1"
        and original_state.get("config_digest") == hashlib.sha256(original_raw).hexdigest()
        and not original_state.get("config_transition")
        and not original_state.get("previous_config_digest"),
        "original completed installation evidence is invalid",
    )
    # Only the explicitly approved public transport/port can differ. All roots,
    # credentials, database identity, origin and unrelated configuration survive.
    comparable = json.loads(runtime_raw)
    comparable["database"].pop("public_host", None)
    comparable["database"]["port"] = original["database"]["port"]
    original_comparable = json.loads(original_raw)
    original_comparable["database"].pop("public_host", None)
    require(
        comparable == original_comparable, "recovery changed protected identity or runtime roots"
    )
    require(
        protected_bytes(config / "rds-ca.pem", uid=999) == original_ca
        and protected_bytes(config / "frontend/internal-auth-token", uid=999, mode=0o640)
        == original_token
        and hashlib.sha256(original_ca).hexdigest() == runtime["database"]["ca_sha256"],
        "recovery CA or internal-token projection changed",
    )
    backup_file(receipt.get("database_backup"), receipt.get("database_backup_sha256"))
    require(
        bool(re.fullmatch(r"[A-Za-z0-9_]+", str(receipt.get("alembic_head") or ""))),
        "recovery schema head is missing",
    )
    return receipt


def finalize(root: Path, release: Path, *, approval: str) -> None:
    """Publish new-target acceptance only after separate exact operator approval."""
    require(approval == APPROVAL, "exact replacement-host approval is required")
    managed_paths(root, release)
    lock = root / ".deploy-lock"
    lock.mkdir(mode=0o700)
    descriptor = -1
    try:
        install_lock = root / "shared/config/.install.lock"
        descriptor = os.open(install_lock, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
        metadata = os.fstat(descriptor)
        require(
            stat.S_ISREG(metadata.st_mode)
            and (metadata.st_uid, metadata.st_gid) == (999, 999)
            and stat.S_IMODE(metadata.st_mode) == 0o600,
            "recovery installation lock is unsafe",
        )
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sentinel = root / ".installation-complete"
        if os.path.lexists(sentinel):
            require(
                (root / "current").is_symlink()
                and (root / "current").resolve(strict=True) == release,
                "active recovery release changed",
            )
            VALIDATOR["validate_sentinel"](root, sentinel, expected_release=release)
            VALIDATOR["validate_current_runtime"](
                root / "shared/config/install-state.json",
                root / "shared/config/runtime-config.json",
            )
            return
        receipt = validate(root, release, approval=approval, active=True)
        # Both endpoints are internal and read-only. No provider call or public
        # traffic switch is performed by target acceptance.
        subprocess.run(
            [
                "bash",
                "-ceu",
                """root="$1"
. "$root/deploy/common.sh"
npcink_ai_cloud_load_env_file "$root"
npcink_ai_cloud_wait_for_internal_endpoint "$root" /health/ready ready
npcink_ai_cloud_wait_for_internal_endpoint "$root" /health/operational-ready operational
""",
                "recovery-acceptance",
                str(release),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=180,
        )
        receipt = validate(root, release, approval=approval, active=True)
        payload = {
            "contract": "installation_complete.v1",
            "accepted_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "config_digest": receipt["config_digest"],
            "release": str(release),
        }
        temporary = root / f".replacement-acceptance-{os.getpid()}.tmp"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(payload, stream, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.link(temporary, sentinel, follow_symlinks=False)
            parent = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(parent)
            finally:
                os.close(parent)
        finally:
            temporary.unlink()
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        lock.rmdir()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--managed-root", required=True, type=Path)
    parser.add_argument("--release", required=True, type=Path)
    parser.add_argument("--finalize", action="store_true")
    parser.add_argument("--expected-sha", default="")
    args = parser.parse_args()
    require(os.geteuid() == 0, "recovery validation requires root")
    approval = os.environ.get("NPCINK_CLOUD_REPLACEMENT_HOST_RECOVERY_APPROVAL", "")
    if args.finalize:
        require(
            re.fullmatch(r"[0-9a-f]{40}", args.expected_sha) is not None,
            "finalization requires exact source SHA",
        )
        manifest = json.loads((args.release / "release-bundle-manifest.json").read_text())
        require(manifest["source"]["revision"] == args.expected_sha, "finalization source mismatch")
        finalize(args.managed_root, args.release, approval=approval)
        print("replacement_host_acceptance_finalized.v1")
        return 0
    require(not args.expected_sha, "source argument is only valid for explicit finalization")
    receipt = validate(args.managed_root, args.release, approval=approval)
    print(receipt["alembic_head"])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        raise SystemExit("[fail] Protected replacement-host recovery validation failed.") from None
