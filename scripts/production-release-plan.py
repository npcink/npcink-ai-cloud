#!/usr/bin/env python3
"""Create an exact-revision, fail-closed production release plan."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

SCHEMA = "npcink.production_release_plan.v2"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
REPOSITORY_ONLY_PATHS = frozenset(
    {
        "scripts/check-release-policy.sh",
    }
)


class ReleasePlanError(ValueError):
    """Raised when release-plan input cannot be trusted."""


def _application_image_inputs(
    source_root: Path,
    *,
    image_platform: str,
    package_extras: str,
) -> dict[str, object]:
    helper_path = Path(__file__).resolve().with_name("production-application-image-inputs.py")
    spec = importlib.util.spec_from_file_location(
        "npcink_production_application_image_inputs",
        helper_path,
    )
    if spec is None or spec.loader is None:
        raise ReleasePlanError("production application-image input helper cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        payload = module.create_inputs(
            source_root,
            platform=image_platform,
            package_extras=package_extras,
        )
        return module.validate_inputs(payload)
    except Exception as exc:
        raise ReleasePlanError(f"production application-image inputs failed: {exc}") from exc
    finally:
        sys.modules.pop(spec.name, None)


@dataclass(frozen=True)
class Impact:
    backend: bool = False
    frontend: bool = False
    migration: bool = False
    runtime_config: bool = False
    static_payload: bool = False
    full: bool = False


def _require_sha(value: str, label: str) -> str:
    normalized = value.strip().lower()
    if SHA_PATTERN.fullmatch(normalized) is None:
        raise ReleasePlanError(f"{label} must be a full Git SHA")
    return normalized


def _normalize_paths(paths: Iterable[str]) -> tuple[str, ...]:
    normalized: set[str] = set()
    for raw_path in paths:
        path = raw_path.strip()
        pure_path = PurePosixPath(path)
        if (
            not path
            or path.startswith("/")
            or "\\" in path
            or pure_path.as_posix() != path
            or ".." in pure_path.parts
        ):
            raise ReleasePlanError(f"changed path is not repository-relative: {raw_path!r}")
        normalized.add(path)
    return tuple(sorted(normalized))


def _is_no_deploy_path(path: str) -> bool:
    if path in REPOSITORY_ONLY_PATHS:
        return True
    if path.startswith(("docs/", "tests/", ".github/", "frontend/tests/")):
        return True
    if path.startswith("deploy/") and path.lower().endswith((".md", ".mdx")):
        return True
    return "/" not in path and path.lower().endswith((".md", ".mdx", ".rst", ".txt"))


def _path_impact(path: str) -> Impact:
    if _is_no_deploy_path(path):
        return Impact()
    filename = PurePosixPath(path).name
    if (
        filename == "Dockerfile"
        or filename.startswith("Dockerfile.")
        or filename in {"pnpm-lock.yaml", "package-lock.json", "uv.lock", "yarn.lock"}
        or path.startswith("deploy/image-lock/")
    ):
        return Impact(full=True)
    if path.startswith("site/terms/"):
        return Impact(static_payload=True)
    if path.startswith("migrations/"):
        return Impact(backend=True, migration=True)
    if path.startswith("app/"):
        return Impact(backend=True)
    if path.startswith("frontend/"):
        return Impact(frontend=True)
    if path.startswith("deploy/") or path in {
        "docker-compose.prod.yml",
        "docker-compose.runtime.yml",
    }:
        return Impact(runtime_config=True)
    return Impact(full=True)


def classify_release(paths: Iterable[str]) -> tuple[str, dict[str, bool], tuple[str, ...]]:
    changed_files = _normalize_paths(paths)
    impacts = [_path_impact(path) for path in changed_files]

    backend = any(impact.backend for impact in impacts)
    frontend = any(impact.frontend for impact in impacts)
    migration = any(impact.migration for impact in impacts)
    runtime_config = any(impact.runtime_config for impact in impacts)
    static_payload = any(impact.static_payload for impact in impacts)
    full = not changed_files or any(impact.full for impact in impacts)

    deploy_dimensions = sum((backend, frontend, migration, runtime_config, static_payload))
    if full or (backend and frontend) or runtime_config and deploy_dimensions > 1:
        lane = "full"
        backend_image_required = True
        frontend_image_required = True
    elif migration:
        lane = "migration"
        backend_image_required = True
        frontend_image_required = False
    elif backend:
        lane = "backend"
        backend_image_required = True
        frontend_image_required = False
    elif frontend:
        lane = "frontend"
        backend_image_required = False
        frontend_image_required = True
    elif runtime_config:
        lane = "config"
        backend_image_required = False
        frontend_image_required = False
    elif static_payload:
        lane = "static"
        backend_image_required = False
        frontend_image_required = False
    else:
        lane = "no_deploy"
        backend_image_required = False
        frontend_image_required = False

    flags = {
        "deployment_required": lane != "no_deploy",
        "backend_image_required": backend_image_required,
        "frontend_image_required": frontend_image_required,
        "migration_required": migration,
        "runtime_config_required": runtime_config,
        "static_payload_required": static_payload,
    }
    return lane, flags, changed_files


def create_plan(
    *,
    repository: str,
    base_sha: str,
    head_sha: str,
    head_tree: str,
    changed_files: Iterable[str],
    source_root: Path | None = None,
    image_platform: str = "linux/amd64",
    package_extras: str = "[zilliz]",
) -> dict[str, object]:
    normalized_repository = repository.strip()
    repository_parts = normalized_repository.split("/")
    if len(repository_parts) != 2 or not all(repository_parts):
        raise ReleasePlanError("repository must use owner/name format")

    lane, flags, normalized_files = classify_release(changed_files)
    return {
        "schema": SCHEMA,
        "repository": normalized_repository,
        "base_sha": _require_sha(base_sha, "base SHA"),
        "head_sha": _require_sha(head_sha, "head SHA"),
        "head_tree": _require_sha(head_tree, "head tree"),
        "changed_files": list(normalized_files),
        "lane": lane,
        "application_image_inputs": _application_image_inputs(
            source_root or Path.cwd(),
            image_platform=image_platform,
            package_extras=package_extras,
        ),
        **flags,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--head-tree", required=True)
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    parser.add_argument("--image-platform", default="linux/amd64")
    parser.add_argument("--package-extras", default="[zilliz]")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("changed_files", nargs="*")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        plan = create_plan(
            repository=args.repository,
            base_sha=args.base_sha,
            head_sha=args.head_sha,
            head_tree=args.head_tree,
            changed_files=args.changed_files,
            source_root=args.source_root,
            image_platform=args.image_platform,
            package_extras=args.package_extras,
        )
    except ReleasePlanError as exc:
        raise SystemExit(f"production release plan failed: {exc}") from exc

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("[ok] production release plan created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
