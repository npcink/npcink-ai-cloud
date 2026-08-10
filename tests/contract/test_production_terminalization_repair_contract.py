from __future__ import annotations

import importlib.util
import json
import os
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "deploy/repair-post-commit-cleanup.py"


def _load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("terminalization_repair", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write(path: Path, payload: str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    path.chmod(mode)


def _fixture(tmp_path: Path) -> tuple[Path, str, str, dict[str, str]]:
    root = tmp_path / "managed"
    root.mkdir(mode=0o700)
    release = root / "release-current"
    release.mkdir()
    (root / "current").symlink_to(release)
    revision = "a" * 40
    frontend_image = "sha256:" + "1" * 64
    new_frontend_image = "sha256:" + "2" * 64
    _write(
        release / "release-bundle-manifest.json",
        json.dumps({"source": {"revision": revision}}),
        0o644,
    )
    _write(
        release / "release/production-release-plan.json",
        json.dumps(
            {
                "schema": "npcink.production_release_plan.v1",
                "lane": "backend",
                "frontend_image_required": False,
            }
        ),
        0o644,
    )
    state = root / ".release-state" / release.name
    state.mkdir(parents=True, mode=0o700)
    _write(
        state / "preserved-runtime-services.json",
        json.dumps(
            {
                "schema": "npcink.preserved_runtime_services.v1",
                "release_name": release.name,
                "release_path": str(release),
                "services": {
                    "frontend": {
                        "target_daemon_image_id": frontend_image,
                    }
                },
            }
        ),
        0o600,
    )
    rollback_tags = {
        "npcink-ai-cloud-rollback:test-api": "sha256:" + "3" * 64,
        "npcink-ai-cloud-rollback:test-frontend": frontend_image,
    }
    _write(
        state / "rollback-images.tsv",
        "npcink-ai-cloud-api:prod\tnpcink-ai-cloud-rollback:test-api\t"
        + rollback_tags["npcink-ai-cloud-rollback:test-api"]
        + "\n"
        + "npcink-ai-cloud-frontend:prod\tnpcink-ai-cloud-rollback:test-frontend\t"
        + frontend_image
        + "\n",
        0o600,
    )
    _write(
        root / ".cutover-failed",
        "phase=finalize-rollback-image-tags\n"
        "outcome=post_commit_cleanup_incomplete\n"
        f"failed_release={release}\n"
        f"previous_release={root / 'release-previous'}\n",
        0o600,
    )
    lock = root / ".deploy-lock"
    lock.mkdir(mode=0o700)
    _write(lock / "one-off-owner", "b" * 64 + "\n", 0o600)
    tags = {
        "npcink-ai-cloud-api:prod": "sha256:" + "4" * 64,
        "npcink-ai-cloud-frontend:prod": new_frontend_image,
        **rollback_tags,
    }
    return root, revision, frontend_image, tags


def _docker_fixture(
    frontend_image: str, tags: dict[str, str]
) -> Callable[[Sequence[str]], subprocess.CompletedProcess[str]]:
    def docker(args: Sequence[str]) -> subprocess.CompletedProcess[str]:
        stdout = ""
        returncode = 0
        if args[:3] == ("ps", "-q", "--filter"):
            stdout = "frontend-container\n"
        elif args[:3] == ("inspect", "--format", "{{.State.Running}}"):
            stdout = "true\n"
        elif args[:3] == ("inspect", "--format", "{{.Image}}"):
            stdout = frontend_image + "\n"
        elif args[:3] == ("inspect", "--format", "{{.Config.Image}}"):
            stdout = "npcink-ai-cloud-frontend:prod\n"
        elif args[:3] == ("image", "inspect", "--format"):
            reference = args[-1]
            if reference in tags:
                stdout = tags[reference] + "\n"
            else:
                returncode = 1
        elif args == ("info",):
            pass
        elif args[0] == "tag":
            tags[args[2]] = tags[args[1]]
        elif args[:2] == ("image", "rm"):
            tags.pop(args[2], None)
        else:
            raise AssertionError(args)
        return subprocess.CompletedProcess(args, returncode, stdout, "")

    return docker


def test_cleanup_repair_rebinds_preserved_frontend_and_releases_lock(
    tmp_path: Path,
) -> None:
    module = _load_module()
    root, revision, frontend_image, tags = _fixture(tmp_path)

    receipt = module.repair(
        root,
        revision,
        "c" * 40,
        module.CONFIRMATION,
        expected_uid=os.getuid(),
        docker_runner=_docker_fixture(frontend_image, tags),
        health_check=lambda _url: None,
    )

    assert receipt["status"] == "complete"
    assert receipt["rollback_tags_removed"] == 2
    assert tags["npcink-ai-cloud-frontend:prod"] == frontend_image
    assert not any("rollback" in reference for reference in tags)
    assert not (root / ".cutover-failed").exists()
    assert not (root / ".deploy-lock").exists()
    assert not (
        root / ".release-state/release-current/rollback-images.tsv"
    ).exists()


def test_cleanup_failure_restores_terminal_evidence_and_retains_lock(
    tmp_path: Path,
) -> None:
    module = _load_module()
    root, revision, frontend_image, tags = _fixture(tmp_path)
    original_unlink = module._unlink_and_fsync

    def fail_map_cleanup(path: Path) -> None:
        if path.name == "rollback-images.tsv":
            raise OSError("injected map cleanup failure")
        original_unlink(path)

    module._unlink_and_fsync = fail_map_cleanup
    with pytest.raises(OSError, match="injected map cleanup failure"):
        module.repair(
            root,
            revision,
            "c" * 40,
            module.CONFIRMATION,
            expected_uid=os.getuid(),
            docker_runner=_docker_fixture(frontend_image, tags),
            health_check=lambda _url: None,
        )

    assert (root / ".cutover-failed").is_file()
    assert (
        root / ".release-state/release-current/rollback-images.tsv"
    ).is_file()
    assert (root / ".deploy-lock/one-off-owner").is_file()


def test_cleanup_repair_rejects_non_terminalization_failure(tmp_path: Path) -> None:
    module = _load_module()
    root, revision, _frontend_image, _tags = _fixture(tmp_path)
    marker = root / ".cutover-failed"
    marker.write_text(
        marker.read_text(encoding="utf-8").replace(
            "phase=finalize-rollback-image-tags", "phase=remote-start-new-api"
        ),
        encoding="utf-8",
    )

    with pytest.raises(module.RepairError, match="supported rollback-tag cleanup"):
        module.repair(
            root,
            revision,
            "c" * 40,
            module.CONFIRMATION,
            expected_uid=os.getuid(),
            docker_runner=lambda _args: pytest.fail("docker must not be called"),
            health_check=lambda _url: None,
        )


def test_repair_workflow_is_manual_exact_sha_cleanup_only() -> None:
    workflow = (
        ROOT / ".github/workflows/repair-production-terminalization.yml"
    ).read_text(encoding="utf-8")
    wrapper = (
        ROOT / "deploy/repair-post-commit-cleanup-to-ssh-host.sh"
    ).read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "group: production-host-mutation" in workflow
    assert 'test "${EXPECTED_RECOVERY_SOURCE_SHA}" = "${GITHUB_SHA}"' in workflow
    assert "Require successful CI and CodeQL for recovery source" in workflow
    assert "Approved for production terminalization repair by operator." in workflow
    assert "deploy/repair-post-commit-cleanup-to-ssh-host.sh" in workflow
    assert "deploy/deploy-to-ssh-host.sh" not in workflow
    assert "--expected-active-production-sha" in wrapper
    assert "--recovery-source-sha" in wrapper
    assert "printf -v REMOTE_COMMAND '%q '" in wrapper
    assert "repair-post-commit-cleanup.py" in wrapper
