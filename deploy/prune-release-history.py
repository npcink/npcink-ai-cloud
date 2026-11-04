#!/usr/bin/env python3
"""Plan scoped release cleanup; apply only an unchanged, reviewed plan."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

RELEASE = re.compile(r"release-[A-Za-z0-9][A-Za-z0-9._-]*")


def run(*args: str) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(f"required command failed: {args[0]}")
    return result.stdout


def read_json(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("missing or unsafe evidence file")
    return json.loads(path.read_text())


def image_ids(value: object) -> set[str]:
    if isinstance(value, str):
        return {value} if re.fullmatch(r"sha256:[0-9a-f]{64}", value) else set()
    if isinstance(value, dict):
        return set().union(*(image_ids(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(image_ids(v) for v in value))
    return set()


def plan(root: Path, backups: Path, keep: int) -> dict:
    if root == Path("/") or root.is_symlink() or root.resolve() != root or keep < 3:
        raise RuntimeError("canonical managed root and at least three releases required")
    if backups.is_symlink() or not backups.is_dir():
        raise RuntimeError("backup inventory root must exist and not be a symlink")
    current = (root / "current").resolve(strict=True)
    if current.parent != root or not RELEASE.fullmatch(current.name):
        raise RuntimeError("current must be a direct managed release")
    def release_order(path: Path) -> tuple[int, str]:
        timestamp = re.search(r"-(\d{14})-\d+$", path.name)
        return (int(timestamp[1]) if timestamp else path.stat().st_mtime_ns, path.name)

    releases = sorted(
        (p for p in root.glob("release-*") if p.is_dir() and not p.is_symlink()),
        key=release_order, reverse=True,
    )
    protected = {p.name for p in releases[:keep]} | {current.name}
    protected.add(Path(read_json(root / ".installation-complete")["release"]).name)
    protected_images: set[str] = set()
    backup_evidence = {}
    for receipt in sorted(backups.glob("*/receipt.json")):
        value = read_json(receipt)
        protected.add(str(value["installed_release"]))
        protected_images |= image_ids(value.get("containers", []))
        protected_images |= image_ids(value.get("client_image"))
        backup_evidence[str(receipt)] = hashlib.sha256(receipt.read_bytes()).hexdigest()
    container_ids = run("docker", "ps", "-aq").split()
    containers = json.loads(run("docker", "inspect", *container_ids)) if container_ids else []
    for item in containers:
        protected_images.add(item["Image"])
        paths = [m["Source"] for m in item.get("Mounts", [])]
        paths.append((item["Config"].get("Labels") or {}).get(
            "com.docker.compose.project.working_dir", ""))
        for raw in paths:
            p = Path(raw)
            if p.is_relative_to(root) and p != root:
                protected.add(p.relative_to(root).parts[0])
    for p in root.iterdir():
        if p.is_symlink():
            target = p.resolve(strict=True)
            if target.is_relative_to(root) and target != root:
                protected.add(target.relative_to(root).parts[0])
    evidence = {}
    candidate_images: set[str] = set()
    removable = []
    for p in releases:
        if not RELEASE.fullmatch(p.name):
            raise RuntimeError("invalid release directory")
        manifest = p / "release-bundle-manifest.json"
        # Unrecognized legacy contents stay untouched.
        if not manifest.is_file() or manifest.is_symlink():
            protected.add(p.name)
        else:
            evidence[p.name] = hashlib.sha256(manifest.read_bytes()).hexdigest()
        mapping = root / ".release-state" / p.name / "target-daemon-images.json"
        ids = image_ids(read_json(mapping)) if mapping.is_file() else set()
        if p.name in protected:
            protected_images |= ids
        else:
            # Never delete a tree containing a mount, including nested mounts.
            mounts = run("findmnt", "-rn", "-o", "TARGET").splitlines()
            if any(Path(m).is_relative_to(p) for m in mounts):
                raise RuntimeError("candidate release contains a mount")
            removable.append(p.name)
            candidate_images |= ids
    all_ids = sorted(set(run("docker", "image", "ls", "-aq", "--no-trunc").split()))
    images = json.loads(run("docker", "image", "inspect", *all_ids)) if all_ids else []
    remove_refs = []
    for item in images:
        if item["Id"] in protected_images:
            continue
        tags = item.get("RepoTags") or []
        removable_tags = [t for t in tags if any(
            t.startswith("npcink-ai-cloud-rollback:" + name.removeprefix("release-") + "-")
            for name in removable
        )]
        # Other projects, unknown dangling images and shared references stay intact.
        if removable_tags and len(removable_tags) == len(tags):
            remove_refs.extend({"reference": t, "image_id": item["Id"]} for t in tags)
        elif not tags and item["Id"] in candidate_images:
            remove_refs.append({"reference": item["Id"], "image_id": item["Id"]})
    result = {
        "contract": "npcink.release_retention_plan.v1", "root": str(root),
        "current": current.name, "keep_count": keep,
        "protected_releases": sorted(protected), "protected_images": sorted(protected_images),
        "remove_releases": sorted(removable), "remove_image_references": sorted(
            remove_refs, key=lambda x: x["reference"]),
        "manifest_hashes": evidence, "backup_receipt_hashes": backup_evidence,
        "container_identity": sorted((i["Id"], i["Image"]) for i in containers),
    }
    return result


def apply(root: Path, backups: Path, approved: dict) -> dict:
    if os.geteuid() != 0:
        raise RuntimeError("root required")
    current = (root / "current").resolve(strict=True)
    validate = ["/usr/bin/python3.11", str(current / "deploy/validate-installation-complete.py"),
                "--managed-root", str(root), "--sentinel", str(root / ".installation-complete"),
                "--state", str(root / "shared/config/install-state.json"),
                "--runtime", str(root / "shared/config/runtime-config.json")]
    run(*validate)
    if any(p.exists() or p.is_symlink() for p in (
        root / ".first-install-pending.json", root / ".cutover-failed")):
        raise RuntimeError("installation or cutover is incomplete")
    lock = root / ".deploy-lock"
    lock.mkdir(mode=0o700)
    try:
        # Match the setup/deploy installation lock, including descriptor/path validation.
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "install_lock", current / "deploy/install-lock.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fd = module._open_lock(root / "shared/config/.install.lock", create=False,
                               uid=999, gid=999, mode=0o600)
        try:
            run(*validate)
            fresh = plan(root, backups, approved["keep_count"])
            # JSON converts tuples to lists; normalize both sides before comparison.
            if json.dumps(fresh, sort_keys=True) != json.dumps(approved, sort_keys=True):
                raise RuntimeError("cleanup plan changed; regenerate and review")
            removed_refs = []
            for item in fresh["remove_image_references"]:
                actual = json.loads(run("docker", "image", "inspect", item["reference"]))[0]
                if actual["Id"] != item["image_id"]:
                    raise RuntimeError("image reference changed")
                run("docker", "image", "rm", item["reference"])
                removed_refs.append(item["reference"])
            for name in fresh["remove_releases"]:
                path = root / name
                if path.is_symlink() or path.parent != root or path == current:
                    raise RuntimeError("release identity changed")
                shutil.rmtree(path)
            return {"removed_releases": fresh["remove_releases"],
                    "removed_image_references": removed_refs,
                    "protected_releases": fresh["protected_releases"]}
        finally:
            os.close(fd)
    finally:
        lock.rmdir()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/opt/npcink-ai-cloud"))
    parser.add_argument("--backups", type=Path, default=Path("/var/backups/npcink-ai-cloud"))
    parser.add_argument("--keep", type=int, default=3)
    parser.add_argument("--apply-plan", type=Path)
    args = parser.parse_args()
    result = (apply(args.root, args.backups, read_json(args.apply_plan)) if args.apply_plan else
              plan(args.root, args.backups, args.keep))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
