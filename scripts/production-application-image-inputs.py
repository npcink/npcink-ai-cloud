#!/usr/bin/env python3
"""Create stable, content-addressed production application-image inputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path, PurePosixPath
from typing import Any

SCHEMA = "npcink.production_application_image_inputs.v1"
SUPPORTED_PLATFORMS = {"linux/amd64", "linux/arm64"}
SUPPORTED_PACKAGE_EXTRAS = {"", "[zilliz]"}

IMAGE_DEFINITIONS = {
    "api": (
        ".dockerignore",
        "Dockerfile",
        "README.md",
        "alembic.ini",
        "pyproject.toml",
        "uv.lock",
        "app",
        "migrations",
        "deploy/wait-for-install.sh",
        "scripts/verify-production-python-lock.py",
        "scripts/live-site-addon-rollback.py",
        "scripts/live-site-runtime-execute-smoke.py",
        "scripts/live-site-runtime-smoke.py",
        "scripts/live-site-save-verify-handoff.py",
        "scripts/live-site-stage1.py",
        "scripts/live-site-trial-status.py",
        "scripts/production_performance_baseline.py",
        "scripts/runtime_hot_path_explain.py",
    ),
    "frontend": (
        ".dockerignore",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "frontend/Dockerfile",
        "frontend/package.json",
        "frontend/next-env.d.ts",
        "frontend/next.config.mjs",
        "frontend/postcss.config.mjs",
        "frontend/proxy.ts",
        "frontend/src",
        "frontend/tailwind.config.ts",
        "frontend/tsconfig.json",
    ),
}


class ImageInputError(ValueError):
    """Raised when production image inputs cannot be trusted."""


def _safe_relative(value: str) -> str:
    if not isinstance(value, str):
        raise ImageInputError("image input path must be a string")
    path = PurePosixPath(value)
    if (
        not value
        or value.startswith("/")
        or "\\" in value
        or path.as_posix() != value
        or ".." in path.parts
    ):
        raise ImageInputError(f"image input path is not repository-relative: {value!r}")
    return value


def _tracked_files(root: Path, pathspecs: tuple[str, ...]) -> list[tuple[str, str]]:
    try:
        completed = subprocess.run(
            ["git", "ls-files", "--stage", "-z", "--", *pathspecs],
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ImageInputError("cannot resolve tracked production image inputs") from exc
    try:
        records: list[tuple[str, str]] = []
        for raw in completed.stdout.split(b"\0"):
            if not raw:
                continue
            if b"\t" not in raw:
                raise ImageInputError("tracked production image input record is invalid")
            metadata_raw, path_raw = raw.split(b"\t", 1)
            metadata = metadata_raw.decode("ascii").split()
            if len(metadata) != 3:
                raise ImageInputError("tracked production image input record is invalid")
            mode, _object_id, stage = metadata
            if stage != "0" or mode not in {"100644", "100755"}:
                raise ImageInputError("tracked production image input mode is unsupported")
            records.append((_safe_relative(path_raw.decode("utf-8")), mode))
        paths = sorted(records)
    except UnicodeDecodeError as exc:
        raise ImageInputError("tracked production image input path is not UTF-8") from exc
    if not paths:
        raise ImageInputError("production image input set is empty")
    return paths


def _file_record(root: Path, relative: str, git_mode: str) -> dict[str, Any]:
    path = root.joinpath(*PurePosixPath(relative).parts)
    try:
        path.resolve(strict=True).relative_to(root)
    except (OSError, ValueError) as exc:
        raise ImageInputError(
            f"production image input escapes the source root: {relative}"
        ) from exc
    if path.is_symlink() or not path.is_file():
        raise ImageInputError(f"production image input is not a regular file: {relative}")
    content = path.read_bytes()
    return {
        "path": relative,
        "git_mode": git_mode,
        "sha256": hashlib.sha256(content).hexdigest(),
        "size": len(content),
    }


def _fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def create_inputs(
    root: Path,
    *,
    platform: str,
    package_extras: str,
) -> dict[str, Any]:
    resolved_root = root.resolve()
    if platform not in SUPPORTED_PLATFORMS:
        raise ImageInputError(f"unsupported production image platform: {platform}")
    if package_extras not in SUPPORTED_PACKAGE_EXTRAS:
        raise ImageInputError(f"unsupported production package extras: {package_extras}")

    images: list[dict[str, Any]] = []
    for key, pathspecs in IMAGE_DEFINITIONS.items():
        files = [
            _file_record(resolved_root, path, git_mode)
            for path, git_mode in _tracked_files(resolved_root, pathspecs)
        ]
        build_parameters = {
            "platform": platform,
            "package_extras": package_extras if key == "api" else "",
        }
        subject = {
            "key": key,
            "build_parameters": build_parameters,
            "files": files,
        }
        images.append({**subject, "fingerprint": _fingerprint(subject)})

    return {
        "schema": SCHEMA,
        "images": images,
    }


def validate_inputs(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {"schema", "images"}:
        raise ImageInputError("production application-image input schema is invalid")
    if payload["schema"] != SCHEMA:
        raise ImageInputError("production application-image input version is unsupported")
    images = payload["images"]
    if not isinstance(images, list) or len(images) != len(IMAGE_DEFINITIONS):
        raise ImageInputError("production application-image input set is incomplete")
    seen: set[str] = set()
    for image in images:
        if not isinstance(image, dict) or set(image) != {
            "key",
            "build_parameters",
            "files",
            "fingerprint",
        }:
            raise ImageInputError("production application-image input record is invalid")
        key = image["key"]
        if key not in IMAGE_DEFINITIONS or key in seen:
            raise ImageInputError("production application-image input key is invalid")
        seen.add(key)
        parameters = image["build_parameters"]
        if not isinstance(parameters, dict) or set(parameters) != {"platform", "package_extras"}:
            raise ImageInputError(
                f"production application-image build parameters are invalid: {key}"
            )
        if parameters["platform"] not in SUPPORTED_PLATFORMS:
            raise ImageInputError(f"production application-image platform is invalid: {key}")
        expected_extras = SUPPORTED_PACKAGE_EXTRAS if key == "api" else {""}
        if parameters["package_extras"] not in expected_extras:
            raise ImageInputError(f"production application-image package extras are invalid: {key}")
        files = image["files"]
        if not isinstance(files, list) or not files:
            raise ImageInputError(f"production application-image files are empty: {key}")
        paths: list[str] = []
        for record in files:
            if not isinstance(record, dict) or set(record) != {
                "path",
                "git_mode",
                "sha256",
                "size",
            }:
                raise ImageInputError(f"production application-image file record is invalid: {key}")
            paths.append(_safe_relative(record["path"]))
            if (
                record["git_mode"] not in {"100644", "100755"}
                or not isinstance(record["sha256"], str)
                or len(record["sha256"]) != 64
                or any(char not in "0123456789abcdef" for char in record["sha256"])
                or not isinstance(record["size"], int)
                or record["size"] < 0
            ):
                raise ImageInputError(
                    f"production application-image file identity is invalid: {key}"
                )
        if paths != sorted(set(paths)):
            raise ImageInputError(f"production application-image paths are not canonical: {key}")
        subject = {
            "key": key,
            "build_parameters": parameters,
            "files": files,
        }
        if image["fingerprint"] != _fingerprint(subject):
            raise ImageInputError(f"production application-image fingerprint mismatch: {key}")
    if seen != set(IMAGE_DEFINITIONS):
        raise ImageInputError("production application-image input key set is incomplete")
    return payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    parser.add_argument("--platform", required=True)
    parser.add_argument("--package-extras", default="")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        payload = create_inputs(
            args.source_root,
            platform=args.platform,
            package_extras=args.package_extras,
        )
        validate_inputs(payload)
    except ImageInputError as exc:
        raise SystemExit(f"production application-image inputs failed: {exc}") from exc
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("[ok] production application-image inputs created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
