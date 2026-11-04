from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "release_retention", Path(__file__).parents[2] / "deploy/prune-release-history.py")
assert SPEC and SPEC.loader
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)


def test_plan_protects_recovery_current_recent_and_mounted_releases(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "managed"
    root.mkdir()
    backups = tmp_path / "backups"
    releases = []
    for n in range(9):
        p = root / f"release-{n}"
        p.mkdir()
        (p / "release-bundle-manifest.json").write_text('{}')
        os.utime(p, (n, n))
        releases.append(p)
    # Newest three, plus a non-newest current, sentinel, backup and mount.
    (root / "current").symlink_to(releases[0])
    (root / ".installation-complete").write_text(json.dumps({"release": str(releases[1])}))
    backup = backups / "verified"
    backup.mkdir(parents=True)
    protected_id = "sha256:" + "a" * 64
    (backup / "receipt.json").write_text(json.dumps({
        "installed_release": "release-2", "containers": [{"image_id": protected_id}],
    }))
    containers = [{"Id": "running", "Image": "sha256:" + "b" * 64,
                   "Config": {"Labels": {}}, "Mounts": [{"Source": str(releases[3] / "site")}]}]
    images = [{"Id": protected_id, "RepoTags": ["npcink-ai-cloud-rollback:4-1"]},
              {"Id": "sha256:" + "c" * 64, "RepoTags": ["npcink-ai-cloud-rollback:4-2"]},
              {"Id": "sha256:" + "d" * 64, "RepoTags": ["another-project:latest"]},
              {"Id": "sha256:" + "e" * 64, "RepoTags": []}]

    def fake_run(*args: str) -> str:
        if args[:3] == ("docker", "ps", "-aq"):
            return "running"
        if args[:2] == ("docker", "inspect"):
            return json.dumps(containers)
        if args[:3] == ("docker", "image", "ls"):
            return "\n".join(i["Id"] for i in images)
        if args[:3] == ("docker", "image", "inspect"):
            return json.dumps(images)
        if args[0] == "findmnt":
            return "/\n"
        raise AssertionError(args)

    monkeypatch.setattr(retention, "run", fake_run)
    plan = retention.plan(root, backups, 3)
    assert plan["remove_releases"] == ["release-4", "release-5"]
    assert plan["remove_image_references"] == [{
        "reference": "npcink-ai-cloud-rollback:4-2", "image_id": "sha256:" + "c" * 64}]
    # Legacy/unrecognized directories fail closed to preservation.
    (releases[4] / "release-bundle-manifest.json").unlink()
    os.utime(releases[4], (4, 4))
    assert retention.plan(root, backups, 3)["remove_releases"] == ["release-5"]
    # A nested mount prevents deleting the candidate, rather than crossing filesystems.
    monkeypatch.setattr(retention, "run", lambda *a: str(releases[5] / "nested")
                        if a[0] == "findmnt" else fake_run(*a))
    with pytest.raises(RuntimeError, match="contains a mount"):
        retention.plan(root, backups, 3)


def test_plan_rejects_unsafe_roots_and_small_retention(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="at least three"):
        retention.plan(tmp_path, tmp_path / "backups", 1)
    alias = tmp_path / "alias"
    alias.symlink_to(tmp_path)
    with pytest.raises(RuntimeError, match="canonical"):
        retention.plan(alias, tmp_path / "backups", 3)


def test_apply_rejects_changed_plan_and_releases_both_locks(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "managed"
    current = root / "release-current"
    (current / "deploy").mkdir(parents=True)
    (root / "current").symlink_to(current)
    (current / "deploy/install-lock.py").write_text(
        "import os\ndef _open_lock(*a, **kw): return os.open('/dev/null', os.O_RDONLY)\n")
    commands = []
    monkeypatch.setattr(retention.os, "geteuid", lambda: 0)
    monkeypatch.setattr(retention, "run", lambda *a: commands.append(a) or "")
    monkeypatch.setattr(retention, "plan", lambda *a: {"keep_count": 3, "changed": True})
    with pytest.raises(RuntimeError, match="plan changed"):
        retention.apply(root, tmp_path / "backups", {"keep_count": 3})
    assert not (root / ".deploy-lock").exists()
    assert current.is_dir()
    assert len(commands) == 2  # Positive installation validation; no Docker removal.
