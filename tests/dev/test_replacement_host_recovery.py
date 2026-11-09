"""Adversarial root-host recovery gates; execute in an isolated Linux container."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tarfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "replacement_recovery", ROOT / "deploy/replacement-host-recovery.py"
)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


def write(path: Path, raw: bytes, mode: int = 0o600, uid: int = 0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    path.chmod(mode)
    os.chown(path, uid, uid)


def as_json(payload: dict) -> bytes:
    return (json.dumps(payload, sort_keys=True) + "\n").encode()


@pytest.fixture
def prepared(tmp_path: Path, monkeypatch):
    if sys.platform != "linux" or os.geteuid() != 0:
        pytest.skip("root-owned Linux recovery fixture requires the isolated M4 container")
    # The host contract forbids writable ancestors such as /tmp. Test roots use
    # a private container-only base with the same parent safety as /opt.
    base = Path("/root") / ("recovery-test-" + tmp_path.name)
    base.mkdir(mode=0o700)
    root = base / "managed"
    root.mkdir(mode=0o755)
    release = root / "release-candidate"
    release.mkdir()
    config = root / "shared/config"
    config.mkdir(parents=True)
    ca = b"fixture-ca"
    original = {
        "database": {
            "host": "pgm-example.pg.rds.aliyuncs.com",
            "port": 5432,
            "password": "fixture",
            "ca_sha256": hashlib.sha256(ca).hexdigest(),
        },
        "security": {"fixture_root": "unchanged"},
    }
    original_raw = as_json(original)
    original_state = {
        "installation_state": "complete",
        "database_contract": "pg18_empty_initialization.v1",
        "config_digest": hashlib.sha256(original_raw).hexdigest(),
    }
    runtime = json.loads(original_raw)
    runtime["database"]["public_host"] = "pgm-example-public.pg.rds.aliyuncs.com"
    runtime_raw = as_json(runtime)
    state = {**original_state, "config_digest": hashlib.sha256(runtime_raw).hexdigest()}
    write(config / "runtime-config.json", runtime_raw, uid=999)
    write(config / "install-state.json", as_json(state), 0o640, 999)
    write(config / "rds-ca.pem", ca, uid=999)
    write(config / "frontend/internal-auth-token", b"fixture-token", 0o640, 999)
    write(config / ".install.lock", b"", uid=999)
    backups = base / "backups"
    backups.mkdir(mode=0o700)
    monkeypatch.setattr(recovery, "BACKUP_ROOT", backups)
    archive_path = backups / "protected.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        for name, raw in (
            ("runtime-config.json", original_raw),
            ("install-state.json", as_json(original_state)),
            ("rds-ca.pem", ca),
            ("frontend/internal-auth-token", b"fixture-token"),
        ):
            member = tarfile.TarInfo("shared/config/" + name)
            member.size = len(raw)
            archive.addfile(member, io.BytesIO(raw))
    archive_path.chmod(0o600)
    dump = backups / "database.dump"
    write(dump, b"fixture-logical-dump")
    manifest = {"source": {"revision": "a" * 40}}
    write(release / "release-bundle-manifest.json", as_json(manifest))
    now = datetime.now(UTC)
    receipt = {
        "contract": recovery.CONTRACT,
        "state": "prepared",
        "operator": "fixture-operator",
        "old_host_fenced": True,
        "candidate_sha": "a" * 40,
        "manifest_sha256": hashlib.sha256(as_json(manifest)).hexdigest(),
        "config_digest": state["config_digest"],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=1)).isoformat(),
        "database_backup_created_at": (now - timedelta(minutes=1)).isoformat(),
        "alembic_head": "20261103_0092",
        "protected_backup": str(archive_path),
        "protected_backup_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "database_backup": str(dump),
        "database_backup_sha256": hashlib.sha256(dump.read_bytes()).hexdigest(),
    }
    write(root / ".replacement-host-recovery.json", as_json(receipt))
    yield root, release, receipt
    import shutil

    shutil.rmtree(base)


def test_valid_recovery_never_invents_current_or_acceptance(prepared):
    root, release, receipt = prepared
    assert recovery.validate(root, release, approval=recovery.APPROVAL) == receipt
    assert not (root / "current").exists()
    assert not (root / ".installation-complete").exists()


@pytest.mark.parametrize(
    "field,value",
    [
        ("candidate_sha", "b" * 40),
        ("manifest_sha256", "0" * 64),
        ("config_digest", "0" * 64),
        ("old_host_fenced", False),
        ("operator", ""),
        ("state", "accepted"),
        ("database_backup_sha256", "0" * 64),
        ("protected_backup_sha256", "0" * 64),
        ("expires_at", "2020-01-01T00:00:00+00:00"),
        ("database_backup_created_at", "2020-01-01T00:00:00+00:00"),
        ("alembic_head", "../../head"),
    ],
)
def test_rejects_mismatched_stale_or_unfenced_receipts(prepared, field, value):
    root, release, receipt = prepared
    receipt[field] = value
    write(root / ".replacement-host-recovery.json", as_json(receipt))
    with pytest.raises(ValueError):
        recovery.validate(root, release, approval=recovery.APPROVAL)
    assert not (root / ".installation-complete").exists()


@pytest.mark.parametrize(
    "marker",
    ["current", ".installation-complete", ".first-install-pending.json", ".cutover-failed"],
)
def test_rejects_existing_lifecycle_even_dangling_links(prepared, marker):
    root, release, _ = prepared
    (root / marker).symlink_to(root / "missing")
    with pytest.raises(ValueError):
        recovery.validate(root, release, approval=recovery.APPROVAL)


def test_preserved_config_digest_cannot_hide_root_rotation(prepared):
    root, release, receipt = prepared
    config = root / "shared/config"
    payload = json.loads((config / "runtime-config.json").read_bytes())
    payload["security"]["fixture_root"] = "changed"
    raw = as_json(payload)
    write(config / "runtime-config.json", raw, uid=999)
    state = json.loads((config / "install-state.json").read_bytes())
    state["config_digest"] = receipt["config_digest"] = hashlib.sha256(raw).hexdigest()
    write(config / "install-state.json", as_json(state), 0o640, 999)
    write(root / ".replacement-host-recovery.json", as_json(receipt))
    with pytest.raises(ValueError, match="runtime roots"):
        recovery.validate(root, release, approval=recovery.APPROVAL)


def test_unsafe_receipt_and_missing_approval_fail(prepared):
    root, release, _ = prepared
    with pytest.raises(ValueError, match="approval"):
        recovery.validate(root, release, approval="yes")
    (root / ".replacement-host-recovery.json").chmod(0o644)
    with pytest.raises(ValueError, match="mode"):
        recovery.validate(root, release, approval=recovery.APPROVAL)


def test_failed_health_never_publishes_acceptance(prepared, monkeypatch):
    root, release, _ = prepared
    (root / "current").symlink_to(release)

    def fail(*args, **kwargs):
        raise RuntimeError("fixture readiness failure")

    monkeypatch.setattr(recovery.subprocess, "run", fail)
    with pytest.raises(RuntimeError):
        recovery.finalize(root, release, approval=recovery.APPROVAL)
    assert not (root / ".installation-complete").exists()
    assert not (root / ".deploy-lock").exists()


def test_finalize_is_separate_exact_target_acceptance(prepared, monkeypatch):
    root, release, receipt = prepared
    (root / "current").symlink_to(release)
    monkeypatch.setattr(recovery.subprocess, "run", lambda *args, **kwargs: None)
    recovery.finalize(root, release, approval=recovery.APPROVAL)
    sentinel = json.loads((root / ".installation-complete").read_bytes())
    assert sentinel["config_digest"] == receipt["config_digest"]
    assert sentinel["release"] == str(release)
    recovery.finalize(root, release, approval=recovery.APPROVAL)


@pytest.mark.parametrize(
    "extra_args,approval",
    [
        (["--stage-only"], recovery.APPROVAL),
        (["--skip-seed", "--skip-smoke", "--with-operational-ready"], "yes"),
        (["--skip-seed", "--skip-smoke"], recovery.APPROVAL),
        (
            [
                "--skip-seed",
                "--skip-smoke",
                "--with-operational-ready",
                "--first-install-pending-repair",
            ],
            recovery.APPROVAL,
        ),
    ],
)
def test_unsafe_recovery_cli_stops_before_ssh(tmp_path, extra_args, approval):
    env = {
        **os.environ,
        "NPCINK_CLOUD_DEPLOY_SSH_HOST": "203.0.113.10",
        "NPCINK_CLOUD_REPLACEMENT_HOST_RECOVERY_APPROVAL": approval,
    }
    env.pop("NPCINK_CLOUD_SECRET", None)
    env["NPCINK_CLOUD_DEPLOY_IDENTITY_FILE"] = ""
    # An executable trap proves that no SSH process reaches the network.
    trap_dir = tmp_path / "bin"
    trap_dir.mkdir()
    trap = trap_dir / "ssh"
    trap.write_text("#!/bin/sh\ntouch '" + str(tmp_path / "ssh-called") + "'\nexit 99\n")
    trap.chmod(0o755)
    env["PATH"] = str(trap_dir) + os.pathsep + env["PATH"]
    result = subprocess.run(
        ["bash", str(ROOT / "deploy/deploy-to-ssh-host.sh"), *extra_args],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0
    assert not (tmp_path / "ssh-called").exists()
    assert "Replacement-host recovery requires" in result.stderr
